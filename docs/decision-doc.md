# Decision doc — Minimalist Ad Studio

**What it is.** A generator that writes a 1080×1080 ad from a beminimalist.co product URL using only that page's facts, and a scorer that reviews any ad text against a 23-rule brand and compliance rulebook. The generator self-scores; a BLOCK finding disables export. Python/FastAPI, Claude Opus 5, real product photo, no generated imagery.

## The brand rules and how I derived them

Three sources, all verbatim and cited per rule in `rules/brand-rules.json`: five product pages across categories (serum, sunscreen, retinol), founder statements from press interviews, and the homepage. Plus the Indian instruments that govern cosmetic claims: Drugs & Cosmetics Act, Cosmetics Rules 2020 r.36, DMR Act 1954, Schedule J, ASCI Code Chapter I (clauses 1.1, 1.2, 1.4 verbatim), and the CCPA 2022 guidelines.

From the pages I extracted patterns, not vibes: every strong claim carries a number and timeframe; verbs are hedged ("helps reduce"); mechanism precedes outcome; the concentration is in the product name; safety is a labelled field on every page. From the founder: the brand defines itself by refusals — "flashy ads", "fear-based marketing", the "chemical-free" myth. Each of those became a rule with a severity. **Only policy rules can block.** Tone and language cap at WARN, because the expensive failure is publishing a bad claim, not a bland one.

The rules also fire on the brand's own copy. The Retinol page says "helps reverse the signs of aging"; three pages say "suitable for all skin types." Both are flagged. "It's on the product page" is the generator's source boundary, not the scorer's pass condition.

**Finding about the brief.** It describes a calm clinical brand. The product pages match. The homepage runs "Upto 33% OFF + Freebies" banners with emoji, and the paid ads include promo and influencer registers. The brief's brand and the brand's media are not the same thing. I enforce the page/founder register and treat promo as a WARN, since a rule the brand breaks daily cannot be a BLOCK.

## What I cut, and why

- **Image analysis.** Claims are words; every statute is about statements; text is testable with a golden set. Cost: before/after photos and skin-tone visuals pass unseen. A free-text "what the visual shows" field is a partial mitigation.
- **Generated imagery of any kind.** A fabricated depiction of a real product, on a brand whose position is not misrepresenting things. Backgrounds were defensible but not what the brand looks like.
- **Multiple placement sizes.** One 1:1 that is correct beats three that need checking. Extra sizes multiply text-overflow risk on the disclaimer and the percentage.
- **International law.** India only. The brand sells abroad; that is a stated gap.
- **Study verification.** The tool cannot know if "50% in 28 days" is real. It says so in every result.

## The decision I was least sure about

**Should the scorer defer to the product page?** Deferring is safe for the brand relationship: the tool never contradicts the client's own site. Not deferring means the tool flags copy legal has presumably already cleared, and marketers may read that as the tool being wrong.

I resolved it by asking what the tool is for. It exists to be the second pair of eyes before spend. If it inherits the first pair's mistakes, it adds cost and no safety. The first live runs settled it: the scorer let "Pregnancy/lactation: safe" through on a niacinamide ad because the page said it, while my own rule P7 said it should warn. That was the page-deference reflex in action, and it was wrong. The rule now says flag it and mark it as page-sourced, so the human sees both facts and decides. The tool's job is to surface the tension, not to resolve it in the brand's favour.

*Full reasoning trail with rejected alternatives: `docs/decision-log.md` D1–D10.*
