// Pulls product facts from a beminimalist.co product URL.
// Two sources, both server-side (no browser CORS):
//   1. Shopify's public JSON at /products/<handle>.json  -> title, price, images, tags
//   2. The product page HTML                              -> claims, study stats, suitability, ingredients
// Verified working 2026-09-05. If the site changes, the UI falls back to manual paste.

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MinimalistAdStudio/0.1)' };

export function parseHandle(url) {
  const m = String(url).trim().match(/beminimalist\.co\/(?:[a-z]{2}\/)?products\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

// Lines that appear on every page (nav, promo banners, cross-sell) — not facts about this product.
const NOISE = [
  /Build Your Own Bundle/i, /Buy 2/i, /SHOP FOR/i, /New Launch/i, /Get Additional/i, /FREE SUNSCREEN/i,
  /OFF\b/, /Freebies/i, /MCash/i, /Trust Circle/i, /Add to cart/i, /Sold out/i, /removeAttribute/, /^\[/,
  /^"/, /^“/, /^'/,                       // quoted customer reviews — never a source fact
  /praised for|appreciated for|customers? (appreciated|highlighted|noted)|opinions vary|mixed feelings|some users/i, // review summaries
  /^\{/, /window\./, /function\s*\(/,
];

function htmlToLines(raw) {
  let t = raw.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, '');
  t = t.replace(/<[^>]+>/g, '\n');
  t = t.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
       .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  const seen = new Set(); const out = [];
  for (let l of t.split('\n')) {
    l = l.replace(/\s+/g, ' ').trim();
    if (l.length < 3 || seen.has(l)) continue;
    seen.add(l); out.push(l);
  }
  return out;
}

const CLAIM_KW = /clinic|proven|reduc|improv|helps?|fight|brighten|glow|protect|spf|pa\+|repair|visibl|weeks|days|subjects|source|free|non-comedogenic|derma|acne|pores?|oil|barrier|hydrat|wrinkle|fine lines|dark spots|even|tone|exfoliat|sebum|blackhead/i;
const LABELS = ['Suitable for:', 'Pregnancy/Lactation:', 'Recommended for', 'When to use:', 'Frequency:', 'Skin type', 'Age'];

let CATALOGUE = null; // titles of every product, used to drop cross-sell lines
async function otherTitles(handle) {
  try {
    if (!CATALOGUE) { const r = await fetch('https://beminimalist.co/products.json?limit=250', { headers: UA }); CATALOGUE = (await r.json()).products.map(p => ({ handle: p.handle, title: p.title })); }
    return new Set(CATALOGUE.filter(p => p.handle !== handle).map(p => p.title));
  } catch { return new Set(); }
}

export async function fetchProduct(url) {
  const handle = parseHandle(url);
  if (!handle) throw new Error('Not a beminimalist.co product URL. Expected https://beminimalist.co/products/<handle>');

  const [jr, hr] = await Promise.all([
    fetch(`https://beminimalist.co/products/${handle}.json`, { headers: UA }),
    fetch(`https://beminimalist.co/products/${handle}`, { headers: UA }),
  ]);
  if (!jr.ok) throw new Error(`Product JSON returned HTTP ${jr.status}. The handle may be wrong, or the site changed.`);
  const p = (await jr.json()).product;
  const html = hr.ok ? await hr.text() : '';
  const others = await otherTitles(handle);
  const lines = (hr.ok ? htmlToLines(html) : []).filter(l => !others.has(l) && !/^New Launch/i.test(l));

  // Concentration + active from the title, e.g. "Niacinamide 10% Face Serum" -> 10%, "Niacinamide"
  let conc = (p.title.match(/(\d+(?:\.\d+)?)\s?%/) || [])[0] || null;
  let active = conc ? p.title.split(conc)[0].trim() : null;
  if (!conc) { const spf = p.title.match(/SPF\s?\d+/i); if (spf) { conc = spf[0].toUpperCase().replace(/\s+/, ' '); active = p.title.replace(spf[0], '').trim(); } }

  const claims = []; const safety = []; const ingredients = []; const stats = []; const labelled = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (NOISE.some(r => r.test(l))) continue;
    if (l.length > 320) continue;
    const lab = LABELS.find(x => l.startsWith(x));
    if (lab) { labelled[lab.replace(/:$/, '')] = l.length > lab.length + 2 ? l.slice(lab.length).trim() : (lines[i + 1] || ''); continue; }
    if (/patch test|pregnan|breastfeed|lactat|years of age|\b1[68]\+|consult (a|your) (doctor|dermatologist|healthcare)|non-comedogenic|fragrance free|essential oil free|start (with|slow)|alternate day|purg/i.test(l)) { safety.push(l); continue; }
    if (/sourced from|comes from|\bfrom (lonza|merck|basf|selco|lipotec|dsm|evonik)\b|switzerland|germany|usa|france|japan/i.test(l) && l.length < 200) { ingredients.push(l); continue; }
    if (/\d+\s?%|\d+ (out of|in) \d+|subjects|after \d+ (days|weeks)|in \d+ (days|weeks)/i.test(l) && CLAIM_KW.test(l)) { stats.push(l); continue; }
    if (l.length >= 25 && CLAIM_KW.test(l)) claims.push(l);
  }

  const v = p.variants?.[0] || {};
  return {
    source_url: `https://beminimalist.co/products/${handle}`,
    handle,
    title: p.title,
    active_ingredient: active,
    concentration: conc,
    product_type: p.product_type,
    tags: (p.tags || '').split(',').map(s => s.trim()).filter(s => s && !/^score:/.test(s)),
    price: v.price ? `₹${Math.round(Number(v.price))}` : null,
    mrp: v.compare_at_price ? `₹${Math.round(Number(v.compare_at_price))}` : null,
    size: v.title || null,
    image: p.images?.[0]?.src || p.image?.src || null,
    images: (p.images || []).map(i => i.src).slice(0, 6),
    claims: claims.slice(0, 40),
    study_stats: stats.slice(0, 15),
    safety: safety.slice(0, 15),
    ingredients_provenance: ingredients.slice(0, 10),
    labelled_fields: labelled,
    fetched_at: new Date().toISOString(),
    html_ok: hr.ok,
  };
}

// Manual fallback: marketer pastes page text. Same shape, fewer fields.
export function productFromPaste({ title, text, image, price }) {
  const lines = htmlToLines(text || '');
  const conc = (String(title || '').match(/(\d+(?:\.\d+)?)\s?%/) || [])[0] || null;
  return {
    source_url: null, handle: null, title: title || 'Untitled product',
    active_ingredient: conc ? title.split(conc)[0].trim() : null, concentration: conc,
    product_type: null, tags: [], price: price || null, mrp: null, size: null,
    image: image || null, images: image ? [image] : [],
    claims: lines.filter(l => l.length >= 25 && CLAIM_KW.test(l) && !NOISE.some(r => r.test(l))).slice(0, 40),
    study_stats: lines.filter(l => /\d+\s?%|subjects|weeks|days/i.test(l)).slice(0, 15),
    safety: lines.filter(l => /patch|pregnan|years of age|consult/i.test(l)).slice(0, 15),
    ingredients_provenance: [], labelled_fields: {}, fetched_at: new Date().toISOString(), html_ok: false, manual: true,
  };
}
