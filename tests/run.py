"""Golden set. Each case: an ad, rule ids that MUST fire, rule ids that must NOT fire, expected verdict.
Cases marked needs_model are only fully checked when the model layer is on; without a key we check the regex layer only."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv; load_dotenv()
from app.scorer import score_ad, has_key  # noqa: E402

CASES = [
  dict(name="Brand-voice clean ad (from product page copy)", verdict="PASS", must=[], must_not=["P1","P2","P3","P5","P9","L1","T1","T2"],
       ad=dict(headline="Salicylic Acid 2% Face Serum", body="A daily gentle exfoliant with 2% salicylic acid. It dissolves dead skin cells and sebum inside pores, and helps reduce blackheads and excess oil. In a 4-week study, 90% of subjects noticed visible skin clarity.", cta="See the study", disclaimer="For 18+. Recommended for combination and oily skin.")),
  dict(name="Cure claim", verdict="BLOCKED", must=["P1"], must_not=[], ad=dict(headline="Cures acne in 7 days", body="Niacinamide 10% Face Serum treats acne at the root.")),
  dict(name='Bare "clinically proven" (no result attached)', verdict="BLOCKED", must=["P3"], must_not=[], needs_model=True,
       ad=dict(headline="Clinically proven Niacinamide 10%", body="Dermatologist recommended for oily skin.")),
  dict(name='Bound "clinically proven" — brand pattern, must NOT fire P3', verdict="PASS", must=[], must_not=["P3","P4"], needs_model=True,
       ad=dict(headline="Salicylic Acid 2% Face Serum", body="White Horehound Extract is clinically proven to reduce the number of blackheads by 50% after 28 days.", disclaimer="For 18+.")),
  dict(name="Fairness", verdict="BLOCKED", must=["P5"], must_not=[], ad=dict(headline="Get fairer skin in 2 weeks", body="Vitamin C + E + Ferulic 16% Face Serum brightens and whitens.")),
  dict(name="Chemical-free", verdict="BLOCKED", must=["P9"], must_not=[], ad=dict(headline="Chemical-free skincare that works", body="No harsh chemicals. Just Niacinamide 10%.")),
  dict(name="Reverse aging (also on the brand's own Retinol page)", verdict="BLOCKED", must=["P6"], must_not=[], ad=dict(headline="Retinol 0.6% Face Serum", body="Coenzyme Q10 helps reverse the signs of aging.")),
  dict(name="Promo register — WARN not BLOCK", verdict="PASS_WITH_WARNINGS", must=["T1"], must_not=["P1","P2","P3","P5","P9"],
       ad=dict(headline="🎁 FREEBIE alert!!", body="Buy Niacinamide 10% Face Serum, get a free sunscreen. It helps reduce excess oil and the appearance of pores.", cta="Shop now")),
  dict(name="Influencer register — WARN not BLOCK", verdict="PASS_WITH_WARNINGS", must=["T2"], must_not=["P1","P2","P3","P5","P9"],
       ad=dict(headline="Seriously shocking WOW", body="I am obsessed with the Niacinamide 10% Face Serum. It helps reduce oiliness.")),
  dict(name="Hero active without concentration", verdict="PASS_WITH_WARNINGS", must=["L1"], must_not=["P1","P2","P3"], needs_model=True,
       ad=dict(headline="Our niacinamide serum", body="Niacinamide helps reduce sebum and the appearance of pores.")),
  dict(name="Universal suitability", verdict="PASS_WITH_WARNINGS", must=["P7"], must_not=["P1","P2"],
       ad=dict(headline="Vitamin C + E + Ferulic 16% Face Serum", body="Suitable for all skin types. Brightens dull skin and helps fade dark spots.")),
  dict(name="Generic competitor ad", verdict="BLOCKED", must=["P2","T2","T3"], must_not=[],
       ad=dict(headline="Glow like never before!", body="Get flawless, radiant skin overnight with our miracle serum. 100% results.", cta="Buy now")),
  dict(name="Unhedged cosmetic verb", verdict="PASS_WITH_WARNINGS", must=["L2"], must_not=["P1"], ad=dict(headline="Niacinamide 10% Face Serum", body="Removes dark spots and helps regulate oiliness.")),
]

model_on = has_key()
print(f"Model layer: {'ON' if model_on else 'OFF (regex layer only — needs_model cases are skipped)'}\n")
passed = failed = skipped = 0
for c in CASES:
    if c.get("needs_model") and not model_on:
        skipped += 1; print(f"SKIP  {c['name']}"); continue
    s = score_ad(c["ad"], mode="any")
    if model_on and not s.get("model_ran"):
        print(f"ERROR model layer did not run: {s.get('model_error')}"); sys.exit(2)
    ids = {f["rule_id"] for f in s["findings"]}
    missing = [i for i in c["must"] if i not in ids]; wrong = [i for i in c["must_not"] if i in ids]
    verdict_ok = s["verdict"] == c["verdict"] if model_on else (c["verdict"] == "PASS" or s["verdict"] == c["verdict"])
    ok = not missing and not wrong and verdict_ok
    passed += ok; failed += (not ok)
    print(f"{'PASS ' if ok else 'FAIL '} {c['name']}\n       verdict={s['verdict']} (want {c['verdict']}) fired=[{','.join(sorted(ids))}]"
          + (f" MISSING={missing}" if missing else "") + (f" WRONG={wrong}" if wrong else ""))
    if model_on:
        for f in s["findings"]: print(f"         {f['severity']} {f['rule_id']} \"{f['span']}\" ← {f['source']}")
print(f"\n{passed} pass, {failed} fail, {skipped} skipped")
sys.exit(1 if failed else 0)
