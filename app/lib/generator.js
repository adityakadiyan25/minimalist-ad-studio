import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { RULES, renderRulebook } from './rules.js';
import { scoreAd, hasKey } from './scorer.js';

const MODEL = process.env.MODEL || 'claude-opus-5';
const client = new Anthropic();

export const CopySchema = z.object({
  headline: z.string().describe('Max 8 words. Active + concentration + what it does.'),
  body: z.string().describe('Max 30 words. One mechanism sentence, one hedged outcome sentence with timeframe if the page has one.'),
  cta: z.string().describe('2-4 words, plain. e.g. "Shop now", "See the study".'),
  disclaimer: z.string().describe('One line carrying the page\'s age / pregnancy / skin-type guidance, or empty string if the page has none.'),
  facts_used: z.array(z.string()).describe('Verbatim lines from the source facts that every claim in the copy traces to.'),
});

export function generatorSystemPrompt() {
  return `You write ad copy for Minimalist (beminimalist.co). You are not a copywriter who makes things sound exciting. You are the brand's own product page, compressed to fit a 1080×1080 ad.

## Hard constraints
1. Use ONLY facts in the SOURCE FACTS block. No number, ingredient, study, supplier, benefit or adjective that is not there. If the page has no study statistic, the ad has no statistic.
2. Name the active with its exact concentration, in the product's own form (e.g. "Niacinamide 10%").
3. One sentence of mechanism (what the ingredient does), one of hedged outcome ("helps reduce", "reduces the appearance of"). Add the timeframe if the page states one.
4. No emoji, no exclamation marks, no ALL CAPS, no offers or discounts, no superlatives, no "clinically proven" unless the specific result and timeframe follow in the same sentence.
5. Do not use: cure, treat, heal, prevent, eliminate, remove, erase, 100%, guaranteed, instant, permanent, fair, whiten, chemical-free, natural, miracle, glow (unless the page's study caption uses it), transform, flawless, perfect.
6. If the source facts contain a claim that is itself over the line (e.g. "reverse the signs of aging", "suitable for all skin types"), do not carry it into the ad. Prefer the page's hedged formulation.
7. Disclaimer: if the page gives an age or pregnancy guidance, carry it in one short line.

## Voice reference (from the brand's own pages)
- "Pure 10% Niacinamide ... reduces the sebum level of the skin, improves the barrier & evens out skin tone"
- "A daily gentle exfoliant with 2% salicylic acid that wards off acne"
- "clinically proven to reduce number of blackheads by 50% after 28 days"
- "Suitable for: 18+ years of age · pregnant, and breastfeeding, women should consult their doctor"

## The scorer that will review your copy applies these rules. Write to pass them.
${renderRulebook('generator')}`;
}

export async function generateCopy(product) {
  if (!hasKey()) {
    // Deterministic fallback so the layout still renders. Marked as such.
    return {
      headline: `${product.title}`,
      body: (product.claims[0] || '').slice(0, 160),
      cta: 'Learn more',
      disclaimer: product.labelled_fields?.['Suitable for'] ? `Suitable for: ${product.labelled_fields['Suitable for']}` : '',
      facts_used: product.claims.slice(0, 1),
      generated_by: 'fallback (no API key) — copy is the product title and first page claim, unedited',
    };
  }
  const facts = [
    `Title: ${product.title}`, `Active: ${product.active_ingredient || '?'} · Concentration: ${product.concentration || '?'}`,
    `Price: ${product.price || '?'}${product.mrp ? ` (MRP ${product.mrp})` : ''} · Size: ${product.size || '?'}`,
    `Tags: ${product.tags.join(', ')}`,
    `Claims:\n${product.claims.map(c => '- ' + c).join('\n')}`,
    `Study stats:\n${product.study_stats.map(c => '- ' + c).join('\n') || '- (none on page)'}`,
    `Safety / suitability:\n${product.safety.map(c => '- ' + c).join('\n')}`,
    `Provenance:\n${product.ingredients_provenance.map(c => '- ' + c).join('\n')}`,
    `Labelled fields: ${JSON.stringify(product.labelled_fields)}`,
  ].join('\n\n');

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system: [{ type: 'text', text: generatorSystemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `## SOURCE FACTS\n${facts}\n\nWrite the ad.` }],
    output_config: { format: zodOutputFormat(CopySchema), effort: 'high' },
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) throw new Error('Model did not return copy.');
  return { ...response.parsed_output, generated_by: MODEL };
}

/** Generate copy, then self-score in generator mode (G1 applies). */
export async function generateAndScore(product) {
  const copy = await generateCopy(product);
  const score = await scoreAd(copy, { product, mode: 'generator' });
  return { product, copy, score, rules_version: RULES.version };
}
