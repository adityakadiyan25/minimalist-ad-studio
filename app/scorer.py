from __future__ import annotations
import os
from typing import Optional
import anthropic
from pydantic import BaseModel
from .rules import RULES, ad_to_text, pre_pass, merge_findings, verdict_from, scorer_system_prompt, scorer_user_message

MODEL = os.environ.get("MODEL", "claude-opus-5")
_client: anthropic.Anthropic | None = None


def client() -> anthropic.Anthropic:
    global _client
    if _client is None: _client = anthropic.Anthropic()
    return _client


def has_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"))


class Finding(BaseModel):
    rule_id: str
    span: str
    explanation: str
    fix: str
    on_source_page: Optional[bool]


class DimensionSummary(BaseModel):
    policy: str
    tone: str
    language: str


class Rewrite(BaseModel):
    headline: str
    body: str


class ScoreOutput(BaseModel):
    findings: list[Finding]
    dimension_summary: DimensionSummary
    rewrite: Optional[Rewrite]
    not_checked: list[str]


def score_ad(ad: dict, product: dict | None = None, mode: str = "any") -> dict:
    """Score an ad. mode: 'any' (pasted ad) | 'generator' (product facts available; G1 applies).
    Always returns a result. If the model layer is unavailable, returns the deterministic layer only and says so."""
    ad_text = ad_to_text(ad)
    pre = pre_pass(ad_text, mode)
    base = {"rules_version": RULES["version"], "mode": mode, "ad_text": ad_text, "pre_pass": pre}

    def degraded(reason: str) -> dict:
        findings = merge_findings([], pre)
        return {**base, "model_ran": False, "model_error": f"{reason} Only the deterministic layer ran; judgement-based rules (P3, P4, P10, T4–T6, L1, L3–L6, G1) were NOT checked.",
                "findings": findings, "verdict": verdict_from(findings), "dimension_summary": None, "rewrite": None,
                "not_checked": ["All judgement-based rules (model layer did not run)", "Visual content"]}

    if not has_key():
        return degraded("No ANTHROPIC_API_KEY set.")
    try:
        resp = client().messages.parse(
            model=MODEL, max_tokens=8000,
            system=[{"type": "text", "text": scorer_system_prompt(mode), "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": scorer_user_message(ad_text, pre, product, mode)}],
            output_format=ScoreOutput,
            output_config={"effort": "high"},
        )
        if resp.stop_reason == "refusal": return degraded("Model declined to review this ad.")
        parsed: ScoreOutput | None = resp.parsed_output
        if parsed is None: return degraded("Model returned an unparseable review.")
        lower = ad_text.lower()
        clean = [f.model_dump() for f in parsed.findings if f.span and f.span.lower() in lower]  # drop hallucinated spans
        findings = merge_findings(clean, pre)
        return {**base, "model_ran": True, "model": MODEL, "findings": findings, "verdict": verdict_from(findings),
                "dimension_summary": parsed.dimension_summary.model_dump(), "rewrite": parsed.rewrite.model_dump() if parsed.rewrite else None,
                "not_checked": [*parsed.not_checked, "Visual content (image not analysed)", "Whether cited studies exist or say what is claimed"],
                "dropped_unverifiable_spans": len(parsed.findings) - len(clean),
                "usage": {"input": resp.usage.input_tokens, "output": resp.usage.output_tokens, "cache_read": getattr(resp.usage, "cache_read_input_tokens", None)}}
    except anthropic.AuthenticationError: return degraded("Invalid ANTHROPIC_API_KEY.")
    except anthropic.RateLimitError: return degraded("Rate limited by the API.")
    except anthropic.APIStatusError as e: return degraded(f"API error {e.status_code}: {e.message}")
    except anthropic.APIConnectionError: return degraded("Could not reach the API.")
