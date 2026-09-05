from __future__ import annotations
import json
import os
import anthropic
from pydantic import BaseModel, Field
from .rules import RULES, render_rulebook
from .scorer import score_ad, has_key, client

MODEL = os.environ.get("MODEL", "claude-opus-5")


class Copy(BaseModel):
    headline: str = Field(description="Max 8 words. Active + concentration + what it does.")
    body: str = Field(description="Max 30 words. One mechanism sentence, one hedged outcome sentence with timeframe if the page has one.")
    cta: str = Field(description='2-4 words, plain. e.g. "Shop now", "See the study".')
    disclaimer: str = Field(description="One line carrying the page's age / pregnancy / skin-type guidance, or empty string if the page has none.")
    facts_used: list[str] = Field(description="Verbatim lines from the source facts that every claim in the copy traces to.")


def generator_system_prompt() -> str:
    return f"""You write ad copy for Minimalist (beminimalist.co). You are not a copywriter who makes things sound exciting. You are the brand's own product page, compressed to fit a 1080×1080 ad.

## Hard constraints
1. Use ONLY facts in the SOURCE FACTS block. No number, ingredient, study, supplier, benefit or adjective that is not there. If the page has no study statistic, the ad has no statistic.
2. Name the active with its exact concentration, in the product's own form (e.g. "Niacinamide 10%").
3. One sentence of mechanism (what the ingredient does), one of hedged outcome ("helps reduce", "reduces the appearance of"). Add the timeframe if the page states one.
4. No emoji, no exclamation marks, no ALL CAPS, no offers or discounts, no superlatives, no "clinically proven" unless the specific result and timeframe follow in the same sentence.
5. Do not use: cure, treat, heal, prevent, eliminate, remove, erase, 100%, guaranteed, instant, permanent, fair, whiten, chemical-free, natural, miracle, glow (unless the page's study caption uses it), transform, flawless, perfect.
6. If the source facts contain a claim that is itself over the line (e.g. "reverse the signs of aging", "suitable for all skin types"), do not carry it into the ad. Prefer the page's hedged formulation.
7. Disclaimer: if the page gives an age or pregnancy guidance, carry it in one short line.

## Voice reference (from the brand's own pages)
- "Pure 10% Niacinamide ... reduces the sebum level of the skin, improves the barrier & evens out skin tone"
- "A daily gentle exfoliant with 2% salicylic acid that wards off acne"
- "clinically proven to reduce number of blackheads by 50% after 28 days"
- "Suitable for: 18+ years of age · pregnant, and breastfeeding, women should consult their doctor"

## The scorer that will review your copy applies these rules. Write to pass them.
{render_rulebook('generator')}"""


def _facts(p: dict) -> str:
    bl = lambda xs: "\n".join("- " + x for x in xs) or "- (none on page)"
    return "\n\n".join([
        f"Title: {p['title']}", f"Active: {p.get('active_ingredient') or '?'} · Concentration: {p.get('concentration') or '?'}",
        f"Price: {p.get('price') or '?'}" + (f" (MRP {p['mrp']})" if p.get('mrp') else "") + f" · Size: {p.get('size') or '?'}",
        f"Tags: {', '.join(p.get('tags', []))}", f"Claims:\n{bl(p.get('claims', []))}", f"Study stats:\n{bl(p.get('study_stats', []))}",
        f"Safety / suitability:\n{bl(p.get('safety', []))}", f"Provenance:\n{bl(p.get('ingredients_provenance', []))}",
        f"Labelled fields: {json.dumps(p.get('labelled_fields', {}), ensure_ascii=False)}"])


def generate_copy(product: dict) -> dict:
    if not has_key():
        # Deterministic fallback so the layout still renders. Marked as such.
        lf = product.get("labelled_fields", {})
        return {"headline": product["title"], "body": (product.get("claims") or [""])[0][:160], "cta": "Learn more",
                "disclaimer": f"Suitable for: {lf['Suitable for']}" if lf.get("Suitable for") else "",
                "facts_used": (product.get("claims") or [])[:1],
                "generated_by": "fallback (no API key) — copy is the product title and first page claim, unedited"}
    resp = client().messages.parse(
        model=MODEL, max_tokens=4000,
        system=[{"type": "text", "text": generator_system_prompt(), "cache_control": {"type": "ephemeral"}}],
        messages=[{"role": "user", "content": f"## SOURCE FACTS\n{_facts(product)}\n\nWrite the ad."}],
        output_format=Copy, output_config={"effort": "high"},
    )
    if resp.stop_reason == "refusal" or resp.parsed_output is None:
        raise RuntimeError("Model did not return copy.")
    return {**resp.parsed_output.model_dump(), "generated_by": MODEL}


def generate_and_score(product: dict) -> dict:
    """Generate copy, then self-score in generator mode (G1 applies)."""
    copy = generate_copy(product)
    score = score_ad(copy, product=product, mode="generator")
    return {"product": product, "copy": copy, "score": score, "rules_version": RULES["version"]}
