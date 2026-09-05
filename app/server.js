import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchProduct, productFromPaste } from './lib/fetchProduct.js';
import { scoreAd, hasKey } from './lib/scorer.js';
import { generateAndScore } from './lib/generator.js';
import { RULES, scorerSystemPrompt } from './lib/rules.js';
import { generatorSystemPrompt } from './lib/generator.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(here, 'public')));

app.get('/api/health', (_req, res) => res.json({ ok: true, model_layer: hasKey(), rules_version: RULES.version, model: process.env.MODEL || 'claude-opus-5' }));
app.get('/api/rules', (_req, res) => res.json(RULES));
app.get('/api/prompts', (_req, res) => res.json({ scorer_any: scorerSystemPrompt('any'), scorer_generator: scorerSystemPrompt('generator'), generator: generatorSystemPrompt() }));

app.get('/api/img', async (req, res) => {
  try {
    const u = new URL(req.query.u);
    if (!/(^|\.)cdn\.shopify\.com$/.test(u.hostname) && !/(^|\.)beminimalist\.co$/.test(u.hostname)) return res.status(400).end('host not allowed');
    const r = await fetch(u); if (!r.ok) return res.status(r.status).end();
    res.set('Content-Type', r.headers.get('content-type') || 'image/png'); res.set('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(await r.arrayBuffer()));
  } catch (e) { res.status(400).end(e.message); }
});

app.post('/api/fetch-product', async (req, res) => {
  try { res.json(await fetchProduct(req.body.url)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/generate', async (req, res) => {
  try {
    const product = req.body.product || (req.body.paste ? productFromPaste(req.body.paste) : await fetchProduct(req.body.url));
    res.json(await generateAndScore(product));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/score', async (req, res) => {
  try {
    const { ad, product = null, mode = 'any' } = req.body;
    if (!ad || !(ad.headline || ad.body)) return res.status(400).json({ error: 'Provide at least a headline or body.' });
    res.json(await scoreAd(ad, { product, mode }));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Minimalist Ad Studio → http://localhost:${port}  (model layer: ${hasKey() ? 'on' : 'OFF — set ANTHROPIC_API_KEY'})`));
