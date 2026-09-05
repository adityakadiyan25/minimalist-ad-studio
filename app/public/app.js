const $ = (s) => document.querySelector(s);
const api = async (path, body) => { const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.statusText); return j; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- tabs
document.querySelectorAll('nav button').forEach(b => b.onclick = () => { document.querySelectorAll('nav button,.tab').forEach(x => x.classList.remove('active')); b.classList.add('active'); $('#tab-' + b.dataset.tab).classList.add('active'); });

// ---- status
let RULES = null;
(async () => {
  const h = await api('/api/health');
  $('#status').innerHTML = `rules v${h.rules_version} · model layer <b class="${h.model_layer ? '' : 'off'}">${h.model_layer ? h.model + ' on' : 'OFF — deterministic checks only'}</b>`;
  RULES = await api('/api/rules'); renderRules(RULES);
  const p = await api('/api/prompts'); $('#prompt-scorer').textContent = p.scorer_any; $('#prompt-generator').textContent = p.generator;
})();

// ---- deep links: ?demo=<handle> auto-generates; ?demo_score=1 loads and scores the bad example
const Q = new URLSearchParams(location.search);
if (Q.get('demo')) { $('#url').value = 'https://beminimalist.co/products/' + Q.get('demo'); setTimeout(() => $('#btn-generate').click(), 50); }
if (Q.get('demo_score')) { document.querySelector('[data-tab="score"]').click(); setTimeout(() => { $('#btn-example').click(); $('#btn-score').click(); }, 50); }

// ---- generate
let STATE = { product: null, copy: null, score: null };
$('#btn-paste-toggle').onclick = () => $('#paste-box').classList.toggle('hidden');
$('#btn-generate').onclick = () => runGenerate({ url: $('#url').value.trim() });
$('#btn-generate-paste').onclick = () => runGenerate({ paste: { title: $('#paste-title').value, text: $('#paste-text').value, image: $('#paste-image').value, price: $('#paste-price').value } });

async function runGenerate(body) {
  $('#gen-progress').classList.remove('hidden'); $('#gen-progress').textContent = 'Fetching product → writing copy from page facts only → self-scoring against the rulebook…';
  $('#gen-result').classList.add('hidden');
  try {
    const r = await api('/api/generate', body);
    STATE = { product: r.product, copy: r.copy, score: r.score };
    $('#g-headline').value = r.copy.headline; $('#g-body').value = r.copy.body; $('#g-cta').value = r.copy.cta; $('#g-disclaimer').value = r.copy.disclaimer || '';
    $('#g-facts').textContent = (r.copy.facts_used || []).join('\n') || '(none listed)';
    $('#g-product').textContent = JSON.stringify(r.product, null, 2);
    $('#gen-meta').textContent = `copy by ${r.copy.generated_by}`;
    renderAd(); renderScore(r.score, $('#gen-score'), { allowUseRewrite: true }); gateExport(r.score);
    $('#gen-result').classList.remove('hidden');
  } catch (e) { $('#gen-progress').textContent = 'Failed: ' + e.message + (body.url ? ' — try "Paste product instead".' : ''); return; }
  $('#gen-progress').classList.add('hidden');
}
function currentCopy() { return { headline: $('#g-headline').value, body: $('#g-body').value, cta: $('#g-cta').value, disclaimer: $('#g-disclaimer').value }; }
$('#btn-rescore').onclick = async () => { STATE.copy = { ...STATE.copy, ...currentCopy() }; renderAd(); $('#gen-score').innerHTML = '<p class="hint">Scoring…</p>'; STATE.score = await api('/api/score', { ad: STATE.copy, product: STATE.product, mode: 'generator' }); renderScore(STATE.score, $('#gen-score'), { allowUseRewrite: true }); gateExport(STATE.score); };
['g-headline', 'g-body', 'g-cta', 'g-disclaimer'].forEach(id => $('#' + id).addEventListener('input', () => { STATE.copy = { ...STATE.copy, ...currentCopy() }; renderAd(); $('#export-note').textContent = 'Copy edited — re-score before export.'; $('#btn-export').disabled = true; }));

function renderAd() {
  const p = STATE.product, c = STATE.copy;
  const img = p.image ? `/api/img?u=${encodeURIComponent(p.image)}` : '';
  $('#ad').innerHTML = `
    <div class="img">${img ? `<img src="${img}" alt="${esc(p.title)}">` : ''}</div>
    <div class="txt">
      <div class="wordmark">minimalist</div>
      ${p.concentration ? `<div class="badge"><b>${esc(p.concentration)}</b>${esc(p.active_ingredient || '')}</div>` : ''}
      <h1>${esc(c.headline)}</h1>
      <p>${esc(c.body)}</p>
      <div class="foot"><span class="cta">${esc(c.cta || 'Learn more')}</span>${c.disclaimer ? `<div class="disc">${esc(c.disclaimer)}</div>` : ''}</div>
    </div>`;
  // The canvas is fixed at 1080px. If the text column is taller than that, the footer — and the
  // disclaimer with it — is cropped. That must never export silently.
  // First try to fit: shrink headline, body and badge together, down to a floor. The disclaimer
  // and CTA never shrink — they are the parts that must stay legible.
  const ad = $('#ad'), txt = $('#ad .txt');
  const fits = () => txt.scrollHeight <= txt.clientHeight + 1;
  let fit = 1;
  ad.style.setProperty('--fit', fit);
  while (!fits() && fit > 0.7) { fit = Math.round((fit - 0.05) * 100) / 100; ad.style.setProperty('--fit', fit); }
  STATE.fit = fit;
  STATE.overflow = !fits();
  ad.parentElement.classList.toggle('overflow', STATE.overflow);
}
function gateExport(score) {
  const blocked = score.verdict === 'BLOCKED';
  $('#btn-export').disabled = blocked || !!STATE.overflow;
  $('#export-note').textContent = blocked ? 'Export disabled: a BLOCK finding must be fixed first (edit the copy or use the rewrite, then re-score).'
    : STATE.overflow ? 'Export disabled: the copy does not fit the 1080×1080 canvas even at the smallest type size, so the disclaimer would be cut off. Shorten the body, then re-score.'
    : score.verdict === 'PASS_WITH_WARNINGS' && STATE.fit < 1 ? `Exportable. Warnings shown — a reviewer should accept them. Type scaled to ${Math.round(STATE.fit*100)}% to fit.`
    : score.verdict === 'PASS' && STATE.fit < 1 ? `Clean. Type scaled to ${Math.round(STATE.fit*100)}% to fit.`
    : score.verdict === 'PASS_WITH_WARNINGS' ? 'Exportable. Warnings shown — a reviewer should accept them.' : score.model_ran ? 'Clean.' : 'Deterministic layer only — model did not run.';
}
$('#btn-export').onclick = async () => {
  const node = $('#ad'); const prev = node.style.transform; node.style.transform = 'none';
  const canvas = await html2canvas(node, { width: 1080, height: 1080, scale: 1, useCORS: true, backgroundColor: '#fff' });
  node.style.transform = prev;
  const a = document.createElement('a'); a.download = `${STATE.product.handle || 'ad'}-1080x1080.png`; a.href = canvas.toDataURL('image/png'); a.click();
};
$('#btn-copy-json').onclick = () => navigator.clipboard.writeText(JSON.stringify({ product: STATE.product.title, source_url: STATE.product.source_url, copy: STATE.copy, verdict: STATE.score.verdict, findings: STATE.score.findings, rules_version: STATE.score.rules_version }, null, 2));

// ---- score any ad
$('#btn-example').onclick = () => { $('#s-headline').value = 'Say goodbye to acne forever! 🎉'; $('#s-body').value = 'Our chemical-free niacinamide serum is clinically proven and dermatologist recommended. Removes dark spots, gives you fair, flawless skin in just 3 days. India\'s #1 serum — 100% results guaranteed.'; $('#s-cta').value = 'HURRY, grab the FREEBIE'; $('#s-visual').value = 'Before/after split of a woman\'s face, right side visibly lighter.'; };
$('#btn-score').onclick = async () => {
  const ad = { headline: $('#s-headline').value, body: $('#s-body').value, cta: $('#s-cta').value, disclaimer: $('#s-disclaimer').value, visual_notes: $('#s-visual').value };
  $('#score-result').innerHTML = '<p class="hint">Scoring…</p>';
  try { renderScore(await api('/api/score', { ad, mode: 'any' }), $('#score-result'), {}); } catch (e) { $('#score-result').innerHTML = `<div class="modelerr">${esc(e.message)}</div>`; }
};

// ---- shared score renderer
function renderScore(s, el, { allowUseRewrite }) {
  const counts = { BLOCK: 0, WARN: 0, NOTE: 0 }; s.findings.forEach(f => counts[f.severity]++);
  const label = { BLOCKED: 'BLOCKED — do not run', PASS_WITH_WARNINGS: 'PASS with warnings', PASS: 'PASS' }[s.verdict];
  let h = `<div class="verdict ${s.verdict}"><span>${label}</span><small>${counts.BLOCK} block · ${counts.WARN} warn · ${counts.NOTE} note</small></div>`;
  if (!s.model_ran) h += `<div class="modelerr"><b>Model layer did not run.</b> ${esc(s.model_error || '')}</div>`;
  if (s.dimension_summary) h += `<div class="dims"><div><b>Policy & claims</b>${esc(s.dimension_summary.policy)}</div><div><b>Brand tone</b>${esc(s.dimension_summary.tone)}</div><div><b>Brand language</b>${esc(s.dimension_summary.language)}</div></div>`;
  if (!s.findings.length) h += `<p class="hint">No findings.</p>`;
  for (const f of s.findings) {
    const rule = RULES?.rules.find(r => r.id === f.rule_id);
    h += `<div class="finding ${f.severity}"><div class="top"><span class="sev ${f.severity}">${f.severity}</span><b>${f.rule_id}</b> ${esc(f.rule_name || rule?.name || '')}<span class="tag">${f.dimension}</span><span class="tag">${f.source}</span>${f.on_source_page ? '<span class="tag">also on product page</span>' : ''}</div>
      <span class="span">“${esc(f.span)}”</span><div>${esc(f.explanation)}</div><div class="fix"><b>Fix →</b> ${esc(f.fix)}</div>
      ${rule ? `<details><summary>Why this rule exists</summary><div class="hint">${esc(rule.why)}<br><i>Evidence: ${rule.evidence.map(esc).join(', ')}</i></div></details>` : ''}</div>`;
  }
  if (s.rewrite) h += `<div class="rewrite"><b>Suggested rewrite</b><div><b>Headline:</b> ${esc(s.rewrite.headline)}</div><div><b>Body:</b> ${esc(s.rewrite.body)}</div>${allowUseRewrite ? '<div class="row"><button class="ghost" id="btn-use-rewrite">Use rewrite & re-score</button></div>' : ''}</div>`;
  if (s.not_checked?.length) h += `<div class="notchecked"><b>Not checked:</b> ${s.not_checked.map(esc).join(' · ')}</div>`;
  el.innerHTML = h;
  if (allowUseRewrite && s.rewrite) $('#btn-use-rewrite').onclick = () => { $('#g-headline').value = s.rewrite.headline; $('#g-body').value = s.rewrite.body; $('#btn-rescore').click(); };
}

// ---- rules tab
function renderRules(R) {
  $('#rules-list').innerHTML = R.rules.map(r => `<div class="rule"><div class="top"><span class="sev ${r.severity}">${r.severity}</span><b>${r.id}</b> ${esc(r.name)}<span class="tag">${r.dimension}</span>${r.regex ? '<span class="tag">regex + model</span>' : '<span class="tag">model</span>'}${r.mode ? `<span class="tag">${r.mode} mode</span>` : ''}</div>
    <dl><dt>Catches</dt><dd>${esc(r.catches)}</dd><dt>Why</dt><dd>${esc(r.why)}</dd><dt>Brand does instead</dt><dd>${esc(r.brand_does_instead)}</dd><dt>Fix</dt><dd>${esc(r.fix)}</dd><dt>Evidence</dt><dd>${r.evidence.map(esc).join('<br>')}</dd></dl></div>`).join('');
}
