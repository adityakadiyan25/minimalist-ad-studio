// Loads rules/brand-rules.json, runs the deterministic pre-pass, and renders the scorer prompt.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
export const RULES = JSON.parse(readFileSync(path.join(here, '../../rules/brand-rules.json'), 'utf8'));
export const RULE_BY_ID = Object.fromEntries(RULES.rules.map(r => [r.id, r]));
const SEV_RANK = { BLOCK: 3, WARN: 2, NOTE: 1 };

// Flatten a structured ad into one labelled text block. Spans are quoted from this text.
export function adToText(ad) {
  const parts = [];
  if (ad.headline) parts.push(`HEADLINE: ${ad.headline}`);
  if (ad.body) parts.push(`BODY: ${ad.body}`);
  if (ad.cta) parts.push(`CTA: ${ad.cta}`);
  if (ad.disclaimer) parts.push(`DISCLAIMER: ${ad.disclaimer}`);
  if (ad.visual_notes) parts.push(`VISUAL (described by the marketer, not seen by the scorer): ${ad.visual_notes}`);
  return parts.join('\n');
}

// Deterministic layer. Runs every rule that has a regex. Cannot be talked out of a hit by the model.
export function prePass(text, mode = 'any') {
  const hits = [];
  for (const r of RULES.rules) {
    if (!r.regex) continue;
    if (r.mode && r.mode !== mode) continue;
    const re = new RegExp(r.regex, 'giu');
    let m;
    while ((m = re.exec(text)) !== null) {
      // Don't flag inside the VISUAL description label itself or the field labels
      hits.push({ rule_id: r.id, dimension: r.dimension, severity: r.severity, span: m[0], index: m.index, source: 'regex' });
      if (m[0].length === 0) re.lastIndex++;
    }
  }
  // de-dupe identical (rule, span)
  const seen = new Set();
  return hits.filter(h => { const k = h.rule_id + '|' + h.span.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

export function verdictFrom(findings) {
  let worst = 0;
  for (const f of findings) worst = Math.max(worst, SEV_RANK[f.severity] || 0);
  return worst === 3 ? 'BLOCKED' : worst === 2 ? 'PASS_WITH_WARNINGS' : 'PASS';
}

// Merge model findings with pre-pass hits. Rule severity always comes from the rules file, never the model.
export function mergeFindings(modelFindings, preHits) {
  const out = [];
  for (const f of modelFindings || []) {
    const rule = RULE_BY_ID[f.rule_id];
    if (!rule) continue; // model invented a rule id — drop it
    out.push({ ...f, dimension: rule.dimension, severity: rule.severity, rule_name: rule.name, source: 'model' });
  }
  for (const h of preHits) {
    const covered = out.some(f => f.rule_id === h.rule_id && f.span && h.span && f.span.toLowerCase().includes(h.span.toLowerCase().trim()));
    if (covered) { const f = out.find(f => f.rule_id === h.rule_id); f.source = 'regex+model'; continue; }
    const rule = RULE_BY_ID[h.rule_id];
    out.push({ rule_id: h.rule_id, dimension: rule.dimension, severity: rule.severity, rule_name: rule.name, span: h.span,
      explanation: `Matched the deterministic pattern for "${rule.name}". ${rule.why.split('. ')[0]}.`,
      fix: rule.fix, on_source_page: null, source: 'regex' });
  }
  out.sort((a, b) => (SEV_RANK[b.severity] - SEV_RANK[a.severity]) || a.rule_id.localeCompare(b.rule_id));
  return out;
}

// ---------- Prompt rendering ----------
export function renderRulebook(mode = 'any') {
  const lines = [];
  for (const r of RULES.rules) {
    if (r.mode && r.mode !== mode) continue;
    lines.push(`### ${r.id} — ${r.name}  [${r.dimension.toUpperCase()} · ${r.severity}]`);
    lines.push(`Catches: ${r.catches}`);
    lines.push(`Why: ${r.why}`);
    lines.push(`What Minimalist does instead: ${r.brand_does_instead}`);
    lines.push(`Fix pattern: ${r.fix}`);
    if (r.note_for_model) lines.push(`Note: ${r.note_for_model}`);
    lines.push('');
  }
  return lines.join('\n');
}

export function scorerSystemPrompt(mode = 'any') {
  return `You are the pre-spend reviewer for Minimalist (beminimalist.co), an Indian science-led skincare brand. Your job is to find every place an ad is legally exposed, off-brand, or off-language, quote the exact span, and give a fix a marketer can paste in.

You apply ONLY the rulebook below. Do not invent rules. Do not soften a rule because the copy is persuasive. Do not flag things the rulebook does not cover — if something worries you and no rule fits, put it in "not_checked" rather than forcing a rule id.

## Who this brand is (derived from its product pages and founder statements — see the rulebook's evidence)
- Positioning: radical ingredient transparency. Active concentration is in every product name ("Niacinamide 10% Face Serum"). Brand pillar: "Full disclosure of ingredients used & their concentration."
- Voice: clinical, educational, calm. Explains mechanism ("dissolving dead skin cells and sebum from inner walls of pores"). Uses hedged verbs ("helps", "reduces", "reduces the appearance of"). Binds every strong claim to a number and timeframe ("reduce number of blackheads by 50% after 28 days").
- Authority: dermatologists, studies, supplier provenance. Not celebrities or influencers.
- What the founder says the brand refuses: "flashy ads", "fear-based marketing", the "chemical-free" / "100% natural means safe" myth, "marketing gimmicks".
- Register the brand tolerates but does not aspire to: plain offers ("Buy 2, Get 3rd Free"). Promo copy is a WARN, never a BLOCK.

## Severity is fixed per rule. You choose WHICH rules fire and WHERE; you do not choose severity.
BLOCK = must not run as written. WARN = a reviewer would push back; can run if a human accepts it. NOTE = advisory.

## How to read the ad
- The ad arrives as labelled sections (HEADLINE, BODY, CTA, DISCLAIMER, VISUAL). "span" must be an exact substring of one of those sections — copy it character for character. Never quote the label itself.
- A claim on the brand's own product page is NOT automatically safe. If source page facts are provided and the flagged span matches them, set on_source_page=true and still flag it.
- P3 exception: "clinically proven"/"dermatologist tested" followed in the same sentence by a specific result + timeframe or a named test is the brand's own compliant pattern. Do not flag it.
- Do not flag the same span under two rules unless they are genuinely different problems (e.g. P1 and L2 on the same verb is a duplicate — pick P1).
- T4 (outcome asserted without explanation) fires only if the WHOLE ad names no active ingredient and no mechanism.
- L1 fires only if a hero active is named somewhere and its % is absent everywhere in the ad.
- If the ad is clean, return an empty findings list and a null rewrite. Do not manufacture findings.

## Deterministic pre-pass
Some rules also run as regex before you see the ad. Those hits are listed in the user message. Keep every one of them (you may improve the explanation and fix). If you believe a pre-pass hit is a false positive, keep it and say why in its explanation — a human decides.

## Rewrite
If verdict would be BLOCKED or PASS_WITH_WARNINGS, provide a full rewrite of headline and body that clears every finding while keeping every fact that was legitimately sourced. The rewrite must itself satisfy the rulebook. Use the brand's patterns: active + %, mechanism, hedged verb, timeframe if available.

## Rulebook (version ${RULES.version}, ${RULES.updated})
${renderRulebook(mode)}`;
}

export function scorerUserMessage({ adText, preHits, product, mode }) {
  let msg = `MODE: ${mode === 'generator' ? 'generator — the source product page facts are provided; rule G1 applies (any fact not in the source is a BLOCK)' : 'arbitrary ad — no source page; G1 does not apply'}\n\n`;
  msg += `## AD\n${adText}\n\n`;
  if (product) {
    msg += `## SOURCE PRODUCT PAGE FACTS (the only facts the generator was allowed to use)\n`;
    msg += `Title: ${product.title}\nActive: ${product.active_ingredient || '?'} ${product.concentration || ''}\nPrice: ${product.price || '?'}\n`;
    msg += `Claims:\n${(product.claims || []).map(c => '- ' + c).join('\n')}\n`;
    msg += `Study stats:\n${(product.study_stats || []).map(c => '- ' + c).join('\n') || '- (none on page)'}\n`;
    msg += `Safety / suitability:\n${(product.safety || []).map(c => '- ' + c).join('\n')}\n`;
    msg += `Labelled fields: ${JSON.stringify(product.labelled_fields || {})}\n\n`;
  }
  msg += `## DETERMINISTIC PRE-PASS HITS (keep all of these)\n`;
  msg += preHits.length ? preHits.map(h => `- ${h.rule_id} "${h.span}"`).join('\n') : '- (none)';
  return msg;
}
