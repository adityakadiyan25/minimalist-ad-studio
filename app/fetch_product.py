"""Pull product facts from a beminimalist.co product URL.

Two sources, both server-side (no browser CORS):
  1. Shopify's public JSON at /products/<handle>.json  -> title, price, images, tags
  2. The product page HTML                              -> claims, study stats, suitability, provenance
Verified working 2026-09-05. If the site changes, the UI falls back to manual paste.
"""
from __future__ import annotations
import html as htmllib
import re
from datetime import datetime, timezone
import httpx

UA = {"User-Agent": "Mozilla/5.0 (compatible; MinimalistAdStudio/0.1)"}
_CATALOGUE: list[dict] | None = None

# Lines that appear on every page (nav, promo banners, cross-sell, reviews) — not facts about this product.
NOISE = [re.compile(p, re.I) for p in [
    r"Build Your Own Bundle", r"Buy 2", r"SHOP FOR", r"New Launch", r"Get Additional", r"FREE SUNSCREEN",
    r"\bOFF\b", r"Freebies", r"MCash", r"Trust Circle", r"Add to cart", r"Sold out", r"removeAttribute", r"^\[",
    r"^[\"“']",  # quoted customer reviews — never a source fact
    r"praised for|appreciated for|customers? (appreciated|highlighted|noted)|opinions vary|mixed feelings|some users",
    r"^\{", r"window\.", r"function\s*\(",
]]
CLAIM_KW = re.compile(r"clinic|proven|reduc|improv|helps?|fight|brighten|glow|protect|spf|pa\+|repair|visibl|weeks|days|subjects|source|free|non-comedogenic|derma|acne|pores?|oil|barrier|hydrat|wrinkle|fine lines|dark spots|even|tone|exfoliat|sebum|blackhead", re.I)
SAFETY = re.compile(r"patch test|pregnan|breastfeed|lactat|years of age|\b1[68]\+|consult (a|your) (doctor|dermatologist|healthcare)|non-comedogenic|fragrance free|essential oil free|start (with|slow)|alternate day|purg", re.I)
PROVENANCE = re.compile(r"sourced from|comes from|\bfrom (lonza|merck|basf|selco|lipotec|dsm|evonik)\b|switzerland|germany|usa|france|japan", re.I)
STAT = re.compile(r"\d+\s?%|\d+ (out of|in) \d+|subjects|after \d+ (days|weeks)|in \d+ (days|weeks)", re.I)
LABELS = ["Suitable for:", "Pregnancy/Lactation:", "Recommended for", "When to use:", "Frequency:", "Skin type", "Age"]


def parse_handle(url: str) -> str | None:
    m = re.search(r"beminimalist\.co/(?:[a-z]{2}/)?products/([^/?#]+)", str(url).strip(), re.I)
    return m.group(1) if m else None


def html_to_lines(raw: str) -> list[str]:
    t = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", "", raw, flags=re.S | re.I)
    t = re.sub(r"<[^>]+>", "\n", t)
    t = htmllib.unescape(t)
    seen: set[str] = set(); out: list[str] = []
    for l in t.split("\n"):
        l = re.sub(r"\s+", " ", l).strip()
        if len(l) < 3 or l in seen: continue
        seen.add(l); out.append(l)
    return out


def _other_titles(client: httpx.Client, handle: str) -> set[str]:
    global _CATALOGUE
    try:
        if _CATALOGUE is None:
            r = client.get("https://beminimalist.co/products.json?limit=250")
            _CATALOGUE = [{"handle": p["handle"], "title": p["title"]} for p in r.json()["products"]]
        return {p["title"] for p in _CATALOGUE if p["handle"] != handle}
    except Exception:
        return set()


def _active_and_conc(title: str) -> tuple[str | None, str | None]:
    m = re.search(r"(\d+(?:\.\d+)?)\s?%", title)
    if m:
        return title.split(m.group(0))[0].strip(), m.group(0)
    spf = re.search(r"SPF\s?\d+", title, re.I)
    if spf:
        return title.replace(spf.group(0), "").strip(), re.sub(r"\s+", " ", spf.group(0).upper())
    return None, None


def fetch_product(url: str) -> dict:
    handle = parse_handle(url)
    if not handle:
        raise ValueError("Not a beminimalist.co product URL. Expected https://beminimalist.co/products/<handle>")
    with httpx.Client(headers=UA, timeout=20, follow_redirects=True) as c:
        jr = c.get(f"https://beminimalist.co/products/{handle}.json")
        if jr.status_code != 200:
            raise ValueError(f"Product JSON returned HTTP {jr.status_code}. The handle may be wrong, or the site changed.")
        p = jr.json()["product"]
        hr = c.get(f"https://beminimalist.co/products/{handle}")
        html_ok = hr.status_code == 200
        others = _other_titles(c, handle)

    lines = [l for l in (html_to_lines(hr.text) if html_ok else []) if l not in others and not l.startswith("New Launch")]
    active, conc = _active_and_conc(p["title"])

    claims: list[str] = []; safety: list[str] = []; prov: list[str] = []; stats: list[str] = []; labelled: dict[str, str] = {}
    for i, l in enumerate(lines):
        if any(n.search(l) for n in NOISE) or len(l) > 320: continue
        lab = next((x for x in LABELS if l.startswith(x)), None)
        if lab:
            labelled[lab.rstrip(":")] = l[len(lab):].strip() if len(l) > len(lab) + 2 else (lines[i + 1] if i + 1 < len(lines) else "")
            continue
        if SAFETY.search(l): safety.append(l); continue
        if PROVENANCE.search(l) and len(l) < 200: prov.append(l); continue
        if STAT.search(l) and CLAIM_KW.search(l): stats.append(l); continue
        if len(l) >= 25 and CLAIM_KW.search(l): claims.append(l)

    v = (p.get("variants") or [{}])[0]
    def rupee(x): return f"₹{round(float(x))}" if x else None
    return {
        "source_url": f"https://beminimalist.co/products/{handle}", "handle": handle, "title": p["title"],
        "active_ingredient": active, "concentration": conc, "product_type": p.get("product_type"),
        "tags": [t.strip() for t in (p.get("tags") or "").split(",") if t.strip() and not t.strip().startswith("score:")],
        "price": rupee(v.get("price")), "mrp": rupee(v.get("compare_at_price")), "size": v.get("title"),
        "image": (p.get("images") or [{}])[0].get("src") or (p.get("image") or {}).get("src"),
        "images": [i["src"] for i in (p.get("images") or [])][:6],
        "claims": claims[:40], "study_stats": stats[:15], "safety": safety[:15], "ingredients_provenance": prov[:10],
        "labelled_fields": labelled, "fetched_at": datetime.now(timezone.utc).isoformat(), "html_ok": html_ok,
    }


def product_from_paste(title: str = "", text: str = "", image: str = "", price: str = "") -> dict:
    """Manual fallback: marketer pastes page text. Same shape, fewer fields."""
    lines = html_to_lines(text or "")
    active, conc = _active_and_conc(title or "")
    return {
        "source_url": None, "handle": None, "title": title or "Untitled product", "active_ingredient": active, "concentration": conc,
        "product_type": None, "tags": [], "price": price or None, "mrp": None, "size": None, "image": image or None, "images": [image] if image else [],
        "claims": [l for l in lines if len(l) >= 25 and CLAIM_KW.search(l) and not any(n.search(l) for n in NOISE)][:40],
        "study_stats": [l for l in lines if STAT.search(l)][:15], "safety": [l for l in lines if SAFETY.search(l)][:15],
        "ingredients_provenance": [], "labelled_fields": {}, "fetched_at": datetime.now(timezone.utc).isoformat(), "html_ok": False, "manual": True,
    }
