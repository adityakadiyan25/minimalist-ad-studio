# Decision doc — Minimalist Ad Studio

**What it is.** A generator that writes a 1080×1080 ad from a beminimalist.co product URL using only that page's facts, and a scorer that reviews any ad text against a 21-rule rulebook. The generator self-scores; a BLOCK finding or a cropped disclaimer disables export. Python/FastAPI, Claude Opus 5, real product photo, no generated imagery.

## The brand rules and how I derived them

Sources, cited per rule in `rules/brand-rules.json`: five product pages, founder interviews, the homepage, and the Indian instruments for cosmetic claims (Drugs & Cosmetics Act, Cosmetics Rules 2020, DMR Act, Schedule J, ASCI Chapter I, CCPA 2022).

From the pages, patterns: claims carry a number and timeframe; verbs are hedged; mechanism precedes outcome; the concentration is in the name. From the founder, refusals: "flashy ads", "fear-based marketing", the "chemical-free" myth. Each became a rule with a severity. **Only policy rules can block.** Tone and language cap at WARN, because the expensive failure is publishing a bad claim, not a bland one.

The rules fire on the brand's own copy — the Retinol page's "helps reverse the signs of aging" is flagged. The page is the generator's source boundary, not the scorer's pass condition.

After the first runs I cut two rules that only fired alongside another, and added one: a page-stated qualifier the ad drops (usage ramp, purging note, timeframe) now warns. For a brand whose slogan is "Hide Nothing," keeping the claim and losing the caveat is the most on-brand failure there is.

**Finding about the brief.** It describes a calm clinical brand. The product pages match; the homepage and paid ads run emoji, freebies, and influencer voice. The brief's brand and the brand's media are not the same thing. I enforce the page/founder register and treat promo as WARN — a rule the brand breaks daily cannot be a BLOCK.

## What I cut, and why

- **Image analysis.** Claims are words; every statute is about statements; text is testable with a golden set. Cost: before/after and skin-tone visuals pass unseen. A "what the visual shows" field is a partial mitigation.
- **Generated imagery.** A fabricated picture of a real product, on a brand built on not misrepresenting things.
- **Multiple sizes.** One correct 1:1 beats three that need checking. Even one size cropped the disclaimer once; type now scales to fit or export is refused.
- **International law.** India only. Stated gap.
- **Study verification.** The tool cannot know if "50% in 28 days" is real, and says so in every result.

## The decision I was least sure about

**Should the scorer defer to the product page?** Deferring never contradicts the client's site. Not deferring flags copy legal has presumably cleared, and marketers may read that as the tool being wrong.

The tool is the second pair of eyes before spend; if it inherits the first pair's mistakes it adds cost and no safety. The first live runs settled it — the scorer let "Pregnancy/lactation: safe" through because the page said it, while my own rule said warn. That reflex was wrong. It now flags and marks it page-sourced, so the human sees both facts and decides. The tool surfaces the tension; it does not resolve it in the brand's favour.

*Full trail with rejected alternatives: `docs/decision-log.md` D1–D13.*
