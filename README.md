# Minimalist Ad Studio

Internal prototype for [Minimalist](https://beminimalist.co): paste a product URL, get a 1080×1080 ad creative built only from that page's facts, self-scored against a brand + compliance rulebook. Paste any other ad and score it against the same rulebook.

**PM assignment.** Read in this order: [docs/decision-doc.md](docs/decision-doc.md) (one page) → [docs/failure-modes.md](docs/failure-modes.md) → [rules/brand-rules.json](rules/brand-rules.json) (the standard) → [docs/decision-log.md](docs/decision-log.md) (the reasoning trail) → [evidence/](evidence/) (what the rules are derived from) → [docs/prompts.md](docs/prompts.md) (the prompts the app runs) → [transcript/](transcript/) (the agent sessions).

## Run it (under two minutes)

Requires Python 3.10+.

```bash
git clone https://github.com/adityakadiyan25/minimalist-ad-studio.git
cd minimalist-ad-studio
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # then put your Anthropic API key in .env
.venv/bin/python -m app.server    # → http://localhost:3000
```

Without an API key the app still runs: product fetch, layout, export, and the deterministic rule layer all work. Judgement-based rules and copy generation are skipped and the UI says so.

`.venv/bin/python tests/run.py` runs the golden ad set.

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
app/          server.py (FastAPI) · fetch_product.py · rules.py · scorer.py · generator.py · public/ (vanilla HTML/JS)
rules/        brand-rules.json — the standard; the scorer prompt is rendered from this
evidence/     product-pages.md · brand-voice.md · regulatory.md · ads/ (real ad screenshots)
docs/         decision-doc.md · failure-modes.md · decision-log.md · prompts.md (generated)
tests/        run.py — golden ad set
scripts/      dump_prompts.py — regenerates docs/prompts.md from the live prompt code · transcript_to_md.py — renders a Claude Code .jsonl session
transcript/   01-claude-code-build-session.md (the build, Claude Code) · 02-claude-ai-review-session.md (review and iteration, claude.ai)
```

## Tooling

Python + FastAPI backend, vanilla HTML/JS front end. Built with Claude Code (Claude Fable 5.1) as the coding agent; the app itself calls Claude Opus 5 via the Anthropic Python SDK.

## Build record

The agent sessions are in [`transcript/`](transcript/), and the commit history is intact and unsquashed.

- [`transcript/01-claude-code-build-session.md`](transcript/01-claude-code-build-session.md) — the Claude Code session that built this repo, 5–6 Sep. Rendered from the raw `.jsonl` by `scripts/transcript_to_md.py`; nothing dropped or reworded, two pasted credentials redacted (the header says which).
- [`transcript/02-claude-ai-review-session.md`](transcript/02-claude-ai-review-session.md) — the claude.ai review session, 5–6 Sep, in which the fresh-clone testing, the layout fix, D11–D13 and the rulebook cut were worked out. The claude.ai data export was not available in time, so this is a reconstruction by the assistant from the thread, with tool calls summarised; the header says exactly how.

The prompts the app runs are in [`docs/prompts.md`](docs/prompts.md), generated from the live code.
