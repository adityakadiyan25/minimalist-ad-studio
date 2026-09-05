"""Loads rules/brand-rules.json, runs the deterministic pre-pass, renders the scorer prompt."""
from __future__ import annotations
import json
import re
from pathlib import Path

RULES_PATH = Path(__file__).resolve().parent.parent / "rules" / "brand-rules.json"
RULES: dict = json.loads(RULES_PATH.read_text(encoding="utf-8"))
RULE_BY_ID: dict[str, dict] = {r["id"]: r for r in RULES["rules"]}
SEV_RANK = {"BLOCK": 3, "WARN": 2, "NOTE": 1}
_COMPILED = {r["id"]: re.compile(r["regex"], re.I) for r in RULES["rules"] if r.get("regex")}


def ad_to_text(ad: dict) -> str:
    """Flatten a structured ad into one labelled text block. Spans are quoted from this text."""
    parts = []
    if ad.get("headline"): parts.append(f"HEADLINE: {ad['headline']}")
    if ad.get("body"): parts.append(f"BODY: {ad['body']}")
    if ad.get("cta"): parts.append(f"CTA: {ad['cta']}")
    if ad.get("disclaimer"): parts.append(f"DISCLAIMER: {ad['disclaimer']}")
    if ad.get("visual_notes"): parts.append(f"VISUAL (described by the marketer, not seen by the scorer): {ad['visual_notes']}")
    return "\n".join(parts)


def pre_pass(text: str, mode: str = "any") -> list[dict]:
    """Deterministic layer. Every rule with a regex. Cannot be talked out of a hit by the model."""
    hits = []; seen = set()
    for r in RULES["rules"]:
        rx = _COMPILED.get(r["id"])
        if not rx or (r.get("mode") and r["mode"] != mode): continue
        for m in rx.finditer(text):
            key = (r["id"], m.group(0).lower())
            if key in seen or not m.group(0): continue
            seen.add(key)
            hits.append({"rule_id": r["id"], "dimension": r["dimension"], "severity": r["severity"], "span": m.group(0), "index": m.start(), "source": "regex"})
    return hits


def verdict_from(findings: list[dict]) -> str:
    worst = max((SEV_RANK.get(f["severity"], 0) for f in findings), default=0)
    return "BLOCKED" if worst == 3 else "PASS_WITH_WARNINGS" if worst == 2 else "PASS"


def merge_findings(model_findings: list[dict], pre_hits: list[dict]) -> list[dict]:
    """Merge model findings with pre-pass hits. Severity always comes from the rules file, never the model."""
    out: list[dict] = []
    for f in model_findings or []:
        rule = RULE_BY_ID.get(f.get("rule_id"))
        if not rule: continue  # model invented a rule id — drop it
        out.append({**f, "dimension": rule["dimension"], "severity": rule["severity"], "rule_name": rule["name"], "source": "model"})
    for h in pre_hits:
        covered = next((f for f in out if f["rule_id"] == h["rule_id"] and h["span"].lower().strip() in (f.get("span") or "").lower()), None)
        if covered:
            covered["source"] = "regex+model"; continue
        rule = RULE_BY_ID[h["rule_id"]]
        out.append({"rule_id": h["rule_id"], "dimension": rule["dimension"], "severity": rule["severity"], "rule_name": rule["name"], "span": h["span"],
                    "explanation": f"Matched the deterministic pattern for \"{rule['name']}\". {rule['why'].split('. ')[0]}.",
                    "fix": rule["fix"], "on_source_page": None, "source": "regex"})
    out.sort(key=lambda f: (-SEV_RANK[f["severity"]], f["rule_id"]))
    return out


# ---------- Prompt rendering ----------
def render_rulebook(mode: str = "any") -> str:
    lines = []
    for r in RULES["rules"]:
        if r.get("mode") and r["mode"] != mode: continue
        lines += [f"### {r['id']} — {r['name']}  [{r['dimension'].upper()} · {r['severity']}]",
                  f"Catches: {r['catches']}", f"Why: {r['why']}",
                  f"What Minimalist does instead: {r['brand_does_instead']}", f"Fix pattern: {r['fix']}"]
        if r.get("note_for_model"): lines.append(f"Note: {r['note_for_model']}")
        lines.append("")
    return "\n".join(lines)


def scorer_system_prompt(mode: str = "any") -> str:
    return f"""You are the pre-spend reviewer for Minimalist (beminimalist.co), an Indian science-led skincare brand. Your job is to find every place an ad is legally exposed, off-brand, or off-language, quote the exact span, and give a fix a marketer can paste in.

You apply ONLY the rulebook below. Do not invent rules. Do not soften a rule because the copy is persuasive. Do not flag things the rulebook does not cover — if something worries you and no rule fits, put it in "not_checked" rather than forcing a rule id.

## Who this brand is (derived from its product pages and founder statements — see the rulebook's evidence)
- Positioning: radical ingredient transparency. Active concentration is in every product name ("Niacinamide 10% Face Serum"). Brand pillar: "Full disclosure of ingredients used & their concentration."
- Voice: clinical, educational, calm. Explains mechanism ("dissolving dead skin cells and sebum from inner walls of pores"). Uses hedged verbs ("helps", "reduces", "reduces the appearance of"). Binds every strong claim to a number and timeframe ("reduce number of blackheads by 50% after 28 days").
- Authority: dermatologists, studies, supplier provenance. Not celebrities or influencers.
- What the founder says the brand refuses: "flashy ads", "fear-based marketing", the "chemical-free" / "100% natural means safe" myth, "marketing gimmicks".
- Register the brand tolerates but does not aspire to: plain offers ("Buy 2, Get 3rd Free"). Promo copy is a WARN, never a BLOCK.

## Severity is fixed per rule. You choose WHICH rules fire and WHERE; you do not choose severity.
BLOCK = must not run as written. WARN = a reviewer would push back; can run if a human accepts it. NOTE = advisory.

## How to read the ad
- The ad arrives as labelled sections (HEADLINE, BODY, CTA, DISCLAIMER, VISUAL). "span" must be an exact substring of one of those sections — copy it character for character. Never quote the label itself.
- A claim on the brand's own product page is NOT automatically safe. If source page facts are provided and the flagged span matches them, set on_source_page=true and still flag it.
- P3 exception: "clinically proven"/"dermatologist tested" followed in the same sentence by a specific result + timeframe or a named test is the brand's own compliant pattern. Do not flag it.
- Do not flag the same span under two rules unless they are genuinely different problems (e.g. P1 and L2 on the same verb is a duplicate — pick P1).
- T4 (outcome asserted without explanation) fires only if the WHOLE ad names no active ingredient and no mechanism.
- L1 fires only if a hero active is named somewhere and its % is absent everywhere in the ad.
- If the ad is clean, return an empty findings list and a null rewrite. Do not manufacture findings.

## Deterministic pre-pass
Some rules also run as regex before you see the ad. Those hits are listed in the user message. Keep every one of them (you may improve the explanation and fix). If you believe a pre-pass hit is a false positive, keep it and say why in its explanation — a human decides.

## Rewrite
If verdict would be BLOCKED or PASS_WITH_WARNINGS, provide a full rewrite of headline and body that clears every finding while keeping every fact that was legitimately sourced. The rewrite must itself satisfy the rulebook. Use the brand's patterns: active + %, mechanism, hedged verb, timeframe if available.

## Rulebook (version {RULES['version']}, {RULES['updated']})
{render_rulebook(mode)}"""


def scorer_user_message(ad_text: str, pre_hits: list[dict], product: dict | None, mode: str) -> str:
    msg = "MODE: " + ("generator — the source product page facts are provided; rule G1 applies (any fact not in the source is a BLOCK)" if mode == "generator"
                      else "arbitrary ad — no source page; G1 does not apply") + "\n\n"
    msg += f"## AD\n{ad_text}\n\n"
    if product:
        bl = lambda xs: "\n".join("- " + x for x in xs) or "- (none on page)"
        msg += ("## SOURCE PRODUCT PAGE FACTS (the only facts the generator was allowed to use)\n"
                f"Title: {product.get('title')}\nActive: {product.get('active_ingredient') or '?'} {product.get('concentration') or ''}\nPrice: {product.get('price') or '?'}\n"
                f"Claims:\n{bl(product.get('claims', []))}\nStudy stats:\n{bl(product.get('study_stats', []))}\n"
                f"Safety / suitability:\n{bl(product.get('safety', []))}\nLabelled fields: {json.dumps(product.get('labelled_fields', {}), ensure_ascii=False)}\n\n")
    msg += "## DETERMINISTIC PRE-PASS HITS (keep all of these)\n"
    msg += "\n".join(f"- {h['rule_id']} \"{h['span']}\"" for h in pre_hits) if pre_hits else "- (none)"
    return msg
