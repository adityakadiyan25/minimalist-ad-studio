# Failure modes

The top three ways a correctly working version of this tool still leads to a bad outcome. Not bugs. For each: what happens, why the tool as built does not prevent it, what I would do, and whether before or after launch.

---

## 1. PASS gets read as legal clearance

**What happens.** A creative comes back PASS. The marketer, under weekly volume pressure, treats that as sign-off and ships. Six weeks later ASCI upholds a complaint because the "clinically proven to reduce blackheads by 50% after 28 days" study was a 20-person supplier study with no independent review, or because the ad's image showed a before/after that the scorer never saw.

**Why the tool allows it.** The scorer checks claim *structure* against a rulebook. It cannot verify that a study exists, was sound, or says what the page says. It does not see the image at all. Both gaps are stated in every result's "not checked" list, but a green banner outweighs grey small print.

**What I would do.**
- *Before launch:* rename the verdict. "PASS" becomes "No rule fired." The banner carries the not-checked list inline, not below the fold. Add a required human sign-off field ("Reviewed by") that is part of the exported JSON, so the audit trail names a person, not a tool.
- *Before launch:* make the "what the visual shows" field required for export, so at minimum a human has looked at the image and written down what it depicts.
- *After launch:* sample 5% of exported creatives monthly for a human legal review; measure the gap between tool verdict and human verdict; feed misses back into the rules file as new cases.

## 2. Warning fatigue leads to a BLOCK being shipped anyway

**What happens.** The brand runs promo ads. Every promo ad gets WARN findings for emoji, offers, and exclamation marks. Marketers learn that WARN is noise and click through. One day a WARN ad also carries a BLOCK, or a marketer copies the text out of the "Copy JSON" button or the unscored rewrite box and retypes it into Meta Ads Manager, bypassing the export gate entirely. The tool did its job; the human routed around it.

**Why the tool allows it.** The export gate only controls the PNG button. Text is copyable everywhere. And the WARN volume on promo copy is a direct consequence of D5: the brand's own media does not match the standard I enforce, so the standard produces friction on real work.

**What I would do.**
- *Before launch:* separate the promo register into a declared mode. A marketer building an offer ad ticks "promotional," and T1 stops firing on emoji and offers while every policy rule still applies. This cuts noise without loosening the rules that matter.
- *Before launch:* watermark unscored text. The rewrite box and JSON export carry a visible "UNSCORED — re-score before use" line inside the copied text itself.
- *After launch:* log verdicts against what actually went live (Meta Ad Library is public). The metric that matters is "BLOCK verdicts that ran anyway." If it is above zero in month one, the gate moves from the tool into the ad-account approval flow.

## 3. The generator launders the product page into paid media at scale

**What happens.** The generator uses only page facts. That is the safety property. It is also the risk: whatever is wrong on the page gets reproduced across dozens of creatives a week, with the brand's own voice, past a scorer that shares the same rulebook. Today the Retinol page says "helps reverse the signs of aging" and the SPF page says "no white cast" while customer reviews on the same page say it leaves one. The scorer catches the first (P6). It has no rule for the second, because "the page contradicts its own reviews" is not a claim-structure problem.

**Why the tool allows it.** The rulebook encodes the claim patterns I could derive in a day from five pages. The pages themselves were never the audit target. A tool that turns page copy into ads makes every page defect a paid-media defect, and paid media is where ASCI complaints originate.

**What I would do.**
- *Before launch:* run the scorer over every product page on the site as a batch. The output is a list of page claims that would fail in an ad. That list goes to brand and legal before the generator touches those products. This is the cheapest high-value thing the tool can do and it needs no new code.
- *Before launch:* add a "contested on page" signal to the fetcher: when review text on the page contradicts a claim (white cast, irritation, purging), the generator is told not to use that claim, and the scorer notes it.
- *After launch:* version the rules file against the site. When a product page changes, re-derive its facts and diff them. A new claim that no rule covers is a rule-writing task, not a generator task. Quarterly, re-read the top ten pages and the founder's latest interviews and revise the rulebook; the standard is a snapshot dated 2026-09-05 and will drift.
