import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { RULES, adToText, prePass, mergeFindings, verdictFrom, scorerSystemPrompt, scorerUserMessage } from './rules.js';

const MODEL = process.env.MODEL || 'claude-opus-5';
const client = new Anthropic();

const Finding = z.object({
  rule_id: z.string(),
  span: z.string(),
  explanation: z.string(),
  fix: z.string(),
  on_source_page: z.boolean().nullable(),
});
export const ScoreSchema = z.object({
  findings: z.array(Finding),
  dimension_summary: z.object({ policy: z.string(), tone: z.string(), language: z.string() }),
  rewrite: z.object({ headline: z.string(), body: z.string() }).nullable(),
  not_checked: z.array(z.string()),
});

export function hasKey() { return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN); }

/**
 * Score an ad. mode: 'any' (pasted ad) | 'generator' (product facts available; G1 applies).
 * Always returns a result. If the model layer is unavailable, returns the deterministic layer only and says so.
 */
export async function scoreAd(ad, { product = null, mode = 'any' } = {}) {
  const adText = adToText(ad);
  const preHits = prePass(adText, mode);
  const base = { rules_version: RULES.version, mode, ad_text: adText, pre_pass: preHits };

  if (!hasKey()) {
    const findings = mergeFindings([], preHits);
    return { ...base, model_ran: false, model_error: 'No ANTHROPIC_API_KEY set. Only the deterministic layer ran; judgement-based rules (P3, P4, T4, L1, L3–L6…) were NOT checked.',
      findings, verdict: verdictFrom(findings), dimension_summary: null, rewrite: null,
      not_checked: ['All judgement-based rules (model layer did not run)', 'Visual content'] };
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      system: [{ type: 'text', text: scorerSystemPrompt(mode), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: scorerUserMessage({ adText, preHits, product, mode }) }],
      output_config: { format: zodOutputFormat(ScoreSchema), effort: 'high' },
    });
    if (response.stop_reason === 'refusal') throw new Error('Model declined to review this ad.');
    const parsed = response.parsed_output;
    if (!parsed) throw new Error('Model returned an unparseable review.');
    // Drop model spans that are not actually in the ad (hallucinated quotes)
    const lower = adText.toLowerCase();
    const clean = parsed.findings.filter(f => f.span && lower.includes(f.span.toLowerCase()));
    const dropped = parsed.findings.length - clean.length;
    const findings = mergeFindings(clean, preHits);
    return { ...base, model_ran: true, model: MODEL, findings, verdict: verdictFrom(findings),
      dimension_summary: parsed.dimension_summary, rewrite: parsed.rewrite,
      not_checked: [...parsed.not_checked, 'Visual content (image not analysed)', 'Whether cited studies exist or say what is claimed'],
      dropped_unverifiable_spans: dropped,
      usage: { input: response.usage.input_tokens, output: response.usage.output_tokens, cache_read: response.usage.cache_read_input_tokens } };
  } catch (err) {
    const findings = mergeFindings([], preHits);
    const reason = err instanceof Anthropic.AuthenticationError ? 'Invalid ANTHROPIC_API_KEY.'
      : err instanceof Anthropic.RateLimitError ? 'Rate limited by the API.'
      : err instanceof Anthropic.APIConnectionError ? 'Could not reach the API.'
      : err.message;
    return { ...base, model_ran: false, model_error: `${reason} Only the deterministic layer ran.`, findings, verdict: verdictFrom(findings),
      dimension_summary: null, rewrite: null, not_checked: ['All judgement-based rules (model layer failed)', 'Visual content'] };
  }
}
