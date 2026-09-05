# Minimalist Ad Studio

Internal prototype for [Minimalist](https://beminimalist.co): paste a product URL, get a 1080×1080 ad creative built only from that page's facts, self-scored against a brand + compliance rulebook. Paste any other ad and score it against the same rulebook.

**PM assignment.** Read in this order: [docs/decision-doc.md](docs/decision-doc.md) (one page) → [docs/failure-modes.md](docs/failure-modes.md) → [rules/brand-rules.json](rules/brand-rules.json) (the standard) → [docs/decision-log.md](docs/decision-log.md) (the reasoning trail) → [evidence/](evidence/) (what the rules are derived from) → [docs/prompts.md](docs/prompts.md) (the prompts the app runs).

## Run it (under two minutes)

Requires Node 20.6+.

```bash
git clone https://github.com/adityakadiyan25/minimalist-ad-studio.git
cd minimalist-ad-studio
npm install
cp .env.example .env        # then put your Anthropic API key in .env
npm start                   # → http://localhost:3000
```

Without an API key the app still runs: product fetch, layout, export, and the deterministic rule layer all work. Judgement-based rules and copy generation are skipped and the UI says so.

`npm test` runs the golden ad set in `tests/run.js`.

## What it does

**Generate.** Server fetches the product's public Shopify JSON (title, price, images) and the page HTML (claims, study stats, suitability). The model writes headline, body, CTA, and disclaimer using only those facts. The copy is then run through the scorer in generator mode, where any fact not on the source page is a BLOCK. The creative renders as HTML/CSS with the real product photograph. Export is PNG; it is disabled while any BLOCK finding stands.

**Score.** Any ad, as text. Two layers: regexes for the hard-ban vocabulary (cannot be argued out of by the model), then the model applying the full rulebook. Each finding has a severity fixed by the rulebook, the exact span, an explanation, a fix, and the evidence the rule rests on. Verdict is the worst finding: BLOCKED, PASS_WITH_WARNINGS, or PASS.

**Rules.** Every rule with its evidence, plus the live prompts.

## What it does not do

- Does not look at images. A before/after photo passes unless the marketer describes it in the visual-notes field.
- Does not verify that a cited study exists. "The product page says it" is the source boundary for the generator, not a pass condition for the scorer.
- India only (Drugs & Cosmetics Act, Cosmetics Rules 2020, DMR Act, ASCI Code, CCPA guidelines). No EU/US rules.
- One placement size. See decision log D7.
- No auth, no persistence, no multi-user. It is a prototype.

## Layout

```
app/          server.js (Express) · lib/{fetchProduct,rules,scorer,generator}.js · public/ (vanilla HTML/JS)
rules/        brand-rules.json — the standard; the scorer prompt is rendered from this
evidence/     product-pages.md · brand-voice.md · regulatory.md · ads/ (real ad screenshots)
docs/         decision-doc.md · failure-modes.md · decision-log.md · prompts.md (generated)
tests/        run.js — golden ad set
```

## Tooling

Built with Claude Code (Claude Fable 5.1) as the coding agent; the app itself calls Claude Opus 5 via the Anthropic SDK. The full unedited session transcript is included in the submission.
