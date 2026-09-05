// Golden set. Each case: an ad, the rule ids that MUST fire, rule ids that must NOT fire, expected verdict.
// Cases marked needs_model are only fully checked when the model layer is on; without a key we check the regex layer only.
import { scoreAd, hasKey } from '../app/lib/scorer.js';

const CASES = [
  { name: 'Brand-voice clean ad (from product page copy)', verdict: 'PASS', must: [], mustNot: ['P1','P2','P3','P5','P9','L1','T1','T2'],
    ad: { headline: 'Salicylic Acid 2% Face Serum', body: 'A daily gentle exfoliant with 2% salicylic acid. It dissolves dead skin cells and sebum inside pores, and helps reduce blackheads and excess oil. In a 4-week study, 90% of subjects noticed visible skin clarity.', cta: 'See the study', disclaimer: 'For 18+. Recommended for combination and oily skin.' } },
  { name: 'Cure claim', verdict: 'BLOCKED', must: ['P1'], mustNot: [],
    ad: { headline: 'Cures acne in 7 days', body: 'Niacinamide 10% Face Serum treats acne at the root.' } },
  { name: 'Bare "clinically proven" (no result attached)', verdict: 'BLOCKED', must: ['P3'], mustNot: [], needs_model: true,
    ad: { headline: 'Clinically proven Niacinamide 10%', body: 'Dermatologist recommended for oily skin.' } },
  { name: 'Bound "clinically proven" — brand pattern, must NOT fire P3', verdict: 'PASS', must: [], mustNot: ['P3','P4'], needs_model: true,
    ad: { headline: 'Salicylic Acid 2% Face Serum', body: 'White Horehound Extract is clinically proven to reduce the number of blackheads by 50% after 28 days.', disclaimer: 'For 18+.' } },
  { name: 'Fairness', verdict: 'BLOCKED', must: ['P5'], mustNot: [],
    ad: { headline: 'Get fairer skin in 2 weeks', body: 'Vitamin C + E + Ferulic 16% Face Serum brightens and whitens.' } },
  { name: 'Chemical-free', verdict: 'BLOCKED', must: ['P9'], mustNot: [],
    ad: { headline: 'Chemical-free skincare that works', body: 'No harsh chemicals. Just Niacinamide 10%.' } },
  { name: 'Reverse aging (also on the brand\'s own Retinol page)', verdict: 'BLOCKED', must: ['P6'], mustNot: [],
    ad: { headline: 'Retinol 0.6% Face Serum', body: 'Coenzyme Q10 helps reverse the signs of aging.' } },
  { name: 'Promo register — WARN not BLOCK', verdict: 'PASS_WITH_WARNINGS', must: ['T1'], mustNot: ['P1','P2','P3','P5','P9'],
    ad: { headline: '🎁 FREEBIE alert!!', body: 'Buy Niacinamide 10% Face Serum, get a free sunscreen. It helps reduce excess oil and the appearance of pores.', cta: 'Shop now' } },
  { name: 'Influencer register — WARN not BLOCK', verdict: 'PASS_WITH_WARNINGS', must: ['T2'], mustNot: ['P1','P2','P3','P5','P9'],
    ad: { headline: 'Seriously shocking WOW', body: 'I am obsessed with the Niacinamide 10% Face Serum. It helps reduce oiliness.' } },
  { name: 'Hero active without concentration', verdict: 'PASS_WITH_WARNINGS', must: ['L1'], mustNot: ['P1','P2','P3'], needs_model: true,
    ad: { headline: 'Our niacinamide serum', body: 'Niacinamide helps reduce sebum and the appearance of pores.' } },
  { name: 'Universal suitability', verdict: 'PASS_WITH_WARNINGS', must: ['P7'], mustNot: ['P1','P2'],
    ad: { headline: 'Vitamin C + E + Ferulic 16% Face Serum', body: 'Suitable for all skin types. Brightens dull skin and helps fade dark spots.' } },
  { name: 'Generic competitor ad', verdict: 'BLOCKED', must: ['P2','T2','T3'], mustNot: [],
    ad: { headline: 'Glow like never before!', body: 'Get flawless, radiant skin overnight with our miracle serum. 100% results.', cta: 'Buy now' } },
  { name: 'Unhedged cosmetic verb', verdict: 'PASS_WITH_WARNINGS', must: ['L2'], mustNot: ['P1'],
    ad: { headline: 'Niacinamide 10% Face Serum', body: 'Removes dark spots and helps regulate oiliness.' } },
];

const modelOn = hasKey();
console.log(`Model layer: ${modelOn ? 'ON' : 'OFF (regex layer only — needs_model cases are skipped)'}\n`);
let pass = 0, fail = 0, skipped = 0;
for (const c of CASES) {
  if (c.needs_model && !modelOn) { skipped++; console.log(`SKIP  ${c.name}`); continue; }
  const s = await scoreAd(c.ad, { mode: 'any' });
  const ids = new Set(s.findings.map(f => f.rule_id));
  const missing = c.must.filter(id => !ids.has(id));
  const wrong = c.mustNot.filter(id => ids.has(id));
  // Without the model, verdict can only be checked when the expectation is driven by regex rules
  const verdictOk = modelOn ? s.verdict === c.verdict : (c.verdict === 'PASS' ? true : s.verdict === c.verdict);
  const ok = !missing.length && !wrong.length && verdictOk;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS ' : 'FAIL '} ${c.name}\n       verdict=${s.verdict} (want ${c.verdict}) fired=[${[...ids].join(',')}]${missing.length ? ' MISSING=' + missing : ''}${wrong.length ? ' WRONG=' + wrong : ''}`);
  if (modelOn) for (const f of s.findings) console.log(`         ${f.severity} ${f.rule_id} "${f.span}" ← ${f.source}`);
}
console.log(`\n${pass} pass, ${fail} fail, ${skipped} skipped`);
process.exit(fail ? 1 : 0);
