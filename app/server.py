from __future__ import annotations
import os
from pathlib import Path
from urllib.parse import urlparse
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()  # .env in the repo root, if present
from .fetch_product import fetch_product, product_from_paste  # noqa: E402
from .scorer import score_ad, has_key, MODEL  # noqa: E402
from .generator import generate_and_score, generator_system_prompt  # noqa: E402
from .rules import RULES, scorer_system_prompt  # noqa: E402

HERE = Path(__file__).resolve().parent
app = FastAPI(title="Minimalist Ad Studio")


class Paste(BaseModel):
    title: str = ""; text: str = ""; image: str = ""; price: str = ""

class FetchReq(BaseModel):
    url: str

class GenerateReq(BaseModel):
    url: str | None = None; paste: Paste | None = None; product: dict | None = None

class ScoreReq(BaseModel):
    ad: dict; product: dict | None = None; mode: str = "any"


@app.get("/api/health")
def health(): return {"ok": True, "model_layer": has_key(), "rules_version": RULES["version"], "model": MODEL}

@app.get("/api/rules")
def rules(): return RULES

@app.get("/api/prompts")
def prompts(): return {"scorer_any": scorer_system_prompt("any"), "scorer_generator": scorer_system_prompt("generator"), "generator": generator_system_prompt()}

@app.get("/api/img")
def img(u: str = Query(...)):
    """Same-origin image proxy so the PNG export can draw the product photo. Shopify CDN only."""
    host = urlparse(u).hostname or ""
    if not (host == "cdn.shopify.com" or host.endswith(".cdn.shopify.com") or host.endswith("beminimalist.co")):
        raise HTTPException(400, "host not allowed")
    r = httpx.get(u, timeout=20, follow_redirects=True)
    if r.status_code != 200: raise HTTPException(r.status_code, "upstream error")
    return Response(r.content, media_type=r.headers.get("content-type", "image/png"), headers={"Cache-Control": "public, max-age=86400"})

@app.post("/api/fetch-product")
def api_fetch(req: FetchReq):
    try: return fetch_product(req.url)
    except Exception as e: raise HTTPException(400, str(e))

@app.post("/api/generate")
def api_generate(req: GenerateReq):
    try:
        product = req.product or (product_from_paste(**req.paste.model_dump()) if req.paste else fetch_product(req.url or ""))
        return generate_and_score(product)
    except Exception as e: raise HTTPException(400, str(e))

@app.post("/api/score")
def api_score(req: ScoreReq):
    if not (req.ad.get("headline") or req.ad.get("body")): raise HTTPException(400, "Provide at least a headline or body.")
    return score_ad(req.ad, product=req.product, mode=req.mode)


@app.get("/")
def index(): return FileResponse(HERE / "public" / "index.html")
app.mount("/", StaticFiles(directory=HERE / "public"), name="static")


def main():
    import uvicorn
    port = int(os.environ.get("PORT", "3000"))
    print(f"Minimalist Ad Studio → http://localhost:{port}  (model layer: {'on' if has_key() else 'OFF — set ANTHROPIC_API_KEY in .env'})")
    uvicorn.run("app.server:app", host="127.0.0.1", port=port, log_level="warning")

if __name__ == "__main__": main()
