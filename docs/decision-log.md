# Decision log

Running log of design decisions, in the order they were made. Each entry: the decision, the reason, what I considered and rejected, and what would change my mind. The one-page decision doc is distilled from this at the end. Evidence citations point into `evidence/`.

---

## D1 — Real product photograph only. No generated imagery anywhere in the creative.
**Decision:** Compose the ad as an HTML/CSS layout using the product image from the Shopify CDN (`images[0].src` from the product JSON). No image-generation model for the product, the background, or lifestyle elements.
**Why:** The brand's stated philosophy is "Hide Nothing" and "full disclosure of ingredients used & their concentration" (evidence/brand-voice.md). A generated depiction of the product is a fabrication of the one thing the brand promises not to misrepresent. Generated *backgrounds* are defensible, but the brand's actual visual register is clinical and plain (white/off-white, black type, the pack itself) — a generated environment adds nothing the brand would use, and adds a fabrication risk for zero upside.
**Rejected:** Generated lifestyle backgrounds around a real pack. Not wrong; just not what this brand looks like, and one more thing to explain.
**Would change my mind:** If the brand's paid ads (evidence/ads/) turn out to use lifestyle photography heavily. Even then, generation would be for environment only, with the pack composited in.

## D2 — The scorer reads text, not pixels.
**Decision:** The scorer's input is structured ad text: headline, body/supporting copy, CTA, disclaimer, and optional notes about what the visual shows. It does not analyse the image.
**Why:** The failure that costs money is a claim, and claims are words. Every legal instrument in evidence/regulatory.md is about statements. Text scoring is also what makes the tool testable: I can write ads with known-correct answers and check the scorer against them. Image scoring can't be tested that way in the time available.
**Known gap this creates:** a before/after photo, a fabricated "dermatologist" in a lab coat, or a fairness-implying visual passes untouched. The free-text "what the visual shows" field is a partial mitigation; a human still has to look at the picture. This goes in the failure-modes list.
**Would change my mind:** Evidence that the team's actual rejections are mostly visual rather than copy. I don't have that evidence.

## D3 — Three severities, and only policy can block.
**Decision:** Every finding is `BLOCK`, `WARN`, or `NOTE`. The verdict is the worst finding. Policy & claims findings can be any severity. Brand tone and brand language findings cap at `WARN`.
**Why:** The brief says the expensive failure is publishing something wrong, not writing something bland. Off-brand copy is a quality problem; an unsubstantiated cure claim is a legal and reputational problem. If tone could block, the tool would block the brand's own promo ads (evidence/brand-voice.md, homepage banners) and marketers would route around it within a week.
**Rejected:** A 0–100 score. The brief rejects it too, but the real reason is that a number hides *which* problem, and the marketer needs to fix a specific span.

## D4 — Generator self-scores. BLOCK stops export. WARN exports with flags visible. Marketer sees everything.
**Decision:** After generating, the tool runs its own copy through the same scorer used for pasted ads. If any BLOCK finding exists, the export button is disabled and the finding is shown with a suggested fix. WARN and NOTE findings are displayed but do not stop export. The score is never hidden.
**Why:** Hiding the score means the marketer never learns the rules and the tool becomes a black box that says no. Blocking on WARN would block the brand's real promo register. Letting BLOCK through with a warning means the one thing the tool exists to prevent gets published anyway when someone is in a hurry.
**Rejected:** "Regenerate until it passes, show only the winner." Cheaper UX, but it hides *why* the earlier drafts failed, and that "why" is the education the brand claims to value.
**Would change my mind:** If review is done by a separate brand/legal team rather than the marketer, the reviewer view should expose more (rule IDs, evidence) and the marketer view less.

## D5 — The standard is the product-page/education register. Promo and influencer registers are WARN, not BLOCK.
**Decision:** Brand tone and language rules are derived from product pages and founder statements, which are consistently clinical, mechanism-first, hedged, and percentage-led. Copy in the promo register (offers, emoji, "FREEBIE", urgency) gets a WARN "reads as promotional, not educational." Copy in the influencer register (superlatives, "shocking", "obsessed", first-person gush) gets a WARN.
**Why:** The brief describes the brand as calm and clinical, the founder's own words say "not relying on flashy ads," and the product pages match. But the homepage runs "Upto 33% OFF + Freebies" and "🎁" banners, so promo voice is demonstrably tolerated by the brand. A rule the brand itself breaks daily cannot be a BLOCK. It is worth a WARN because the assignment is about ads *before spend*, and promo copy is where hype creeps in.
**This is a finding about the brief:** the brief's description of the brand and the brand's paid media are not the same thing. Stated in the decision doc.

## D6 — "It's on the product page" is the generator's source boundary, not the scorer's pass condition.
**Decision:** The generator may only use facts present on the fetched product page; it is told not to invent numbers, ingredients, or studies. The scorer, however, flags risky claims regardless of whether they appear on the page. When a flagged claim does match page copy, the finding says so ("appears on the product page; still legally exposed").
**Why:** Pages 3–5 in evidence/product-pages.md contain "helps reverse the signs of aging" and "suitable for all skin types." Both are on the brand's own site, and both would be flagged by ASCI clause 1.1/1.4 and are adjacent to Schedule J. If the scorer deferred to the page, it would wave through exactly the claims a legal reviewer would catch. The tool exists to be the second pair of eyes; it should not inherit the first pair's mistakes.
**Cost:** The generator can produce copy that the scorer then flags, because the source page itself is over the line. That is the correct behaviour, and the marketer sees why.

## D7 — One placement: 1080×1080.
**Decision:** Output a single 1:1 creative at 1080×1080, exportable as PNG.
**Why:** 1:1 runs on Meta feed, Instagram feed, and Google's responsive display accepts it. Adding 4:5 or 9:16 is layout work the brief says it does not grade, and every extra size multiplies the surface where text can overflow and misrender the % or the disclaimer. One size that is correct beats three that need checking.
**Would change my mind:** If the team's spend is predominantly Stories/Reels (9:16). Then 9:16 should be the *only* size, not an addition.

## D8 — Rules live in a versioned file with evidence citations. The prompt is built from the file. A deterministic pre-pass runs before the model.
**Decision:** `rules/brand-rules.json` holds every rule: id, dimension, severity, what it catches, evidence citation, detection guidance, fix guidance. The scorer prompt is generated from this file at runtime. Before the model runs, a regex layer catches the hard-ban vocabulary (cure/treat/heal + condition, "100%", "guaranteed", "chemical-free", "miracle", "permanent") and pre-populates findings. The model then adds judgement-based findings and fills in spans and fixes.
**Why:** The brief says "be explicit about where the standard comes from" and "the scorer's judgments are only as good as the rules behind them." A prompt paragraph can't be audited; a rules file with citations can. The regex layer exists because a model *can* miss "cures acne" in a long ad, and the cost of that miss is the whole point of the tool. Belt and braces for the BLOCK tier only.
**Rejected:** Pure LLM judgement ("does this sound like Minimalist?"). That is exactly what the brief calls "asking a model to have opinions and reporting them back unexamined."

## D9 — Stack: Python + FastAPI, single static page, Anthropic Python SDK. Fetching is server-side.
**Decision:** One `pip install -r requirements.txt` and one command to run. Server fetches `beminimalist.co/products/<handle>.json` (title, price, images, tags) plus the page HTML (claims, study stats, suitability), so browser CORS never applies. Manual paste fallback exists for when the site changes or blocks. Front end is plain HTML/JS because the 1080×1080 creative is an HTML/CSS layout regardless of backend.
**Why:** Two-minute setup limit. No build step, no framework on the front end. The Shopify JSON endpoint was verified working on 2026-09-05.
**History:** First built in Node/Express without asking. The owner pointed out that no language had been specified and chose Python. Ported the same day; API contract and front end unchanged, golden tests identical. Recorded here because "the agent picked a stack silently" is exactly the kind of unflagged decision the brief says to watch for.
**Known limitation:** Requires an `ANTHROPIC_API_KEY`. That is a setup step and is stated first in the README. Without it the app runs in a degraded mode (deterministic rules only) and says so in the UI.
