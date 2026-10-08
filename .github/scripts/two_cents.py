"""Daily "my two cents" pipeline.

Computes what two US cents from March 1926 (the earliest known print use of
"my two cents' worth", Olean Evening Times) are worth today, in Indian rupees:

    value_inr = 0.02 USD x (CPI-U latest / CPI-U March 1926) x USD/INR

Sources (free, no API key):
  - CPI-U, U.S. city average, all items, NSA (series CUUR0000SA0): BLS public API v1
  - USD/INR: Frankfurter (ECB reference rates), falling back to open.er-api.com

The result becomes the blog's name, "My ₹X", in blog.html's heading and
browser title. The nav tab stays "Blog".
If CPI can't be fetched, the last stored CPI is reused (it only changes monthly).
If no exchange rate can be fetched, nothing is changed.
"""

import datetime as dt
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
RECORD = ROOT / "data" / "two-cents.json"

BASE_USD = 0.02
BASE_PERIOD = "March 1926"
BASE_CPI = 17.8  # BLS historical CPI-U table, March 1926 (1982-84 = 100)
UA = {"User-Agent": "annay-de.github.io two-cents pipeline"}


def get_json(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def fetch_cpi():
    data = get_json("https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0")
    if data.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS: {data.get('status')} {data.get('message')}")
    rows = [r for r in data["Results"]["series"][0]["data"] if r["period"].startswith("M") and r["period"] != "M13"]
    latest = max(rows, key=lambda r: (int(r["year"]), int(r["period"][1:])))
    month = dt.date(int(latest["year"]), int(latest["period"][1:]), 1).strftime("%B %Y")
    return float(latest["value"]), month, "BLS CPI-U CUUR0000SA0 (api.bls.gov)"


def fetch_fx():
    attempts = [
        ("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR", lambda d: (d["rates"]["INR"], d["date"]), "Frankfurter / ECB reference rate"),
        ("https://api.frankfurter.app/latest?from=USD&to=INR", lambda d: (d["rates"]["INR"], d["date"]), "Frankfurter / ECB reference rate"),
        ("https://open.er-api.com/v6/latest/USD", lambda d: (d["rates"]["INR"], d["time_last_update_utc"][:16]), "open.er-api.com"),
    ]
    errors = []
    for url, parse, name in attempts:
        try:
            rate, as_of = parse(get_json(url))
            return float(rate), as_of, name
        except Exception as exc:  # try the next source
            errors.append(f"{url}: {exc}")
    raise RuntimeError("all FX sources failed:\n  " + "\n  ".join(errors))


def compute(cpi, fx):
    usd = BASE_USD * cpi / BASE_CPI
    return usd, usd * fx


def label_for(inr):
    return f"₹{inr:,.2f}"


def update_html(label):
    name = f"My {label}"
    page = ROOT / "blog.html"
    text = page.read_text(encoding="utf-8")
    new = re.sub(r"<title>[^<]*</title>", f"<title>{name} | Annay De</title>", text)
    new = re.sub(r'(<meta property="og:title" content=")[^"]*(")', lambda m: m.group(1) + name + " | Annay De" + m.group(2), new)
    new = re.sub(r'(<h1 id="blog-title">)[^<]*(</h1>)', lambda m: m.group(1) + name + m.group(2), new)
    if new != text:
        page.write_text(new, encoding="utf-8")


def main():
    previous = json.loads(RECORD.read_text(encoding="utf-8")) if RECORD.exists() else {}

    try:
        cpi, cpi_month, cpi_source = fetch_cpi()
    except Exception as exc:
        if "cpi" not in previous:
            sys.exit(f"CPI fetch failed and no stored CPI to fall back on: {exc}")
        print(f"CPI fetch failed ({exc}); reusing stored CPI", file=sys.stderr)
        cpi, cpi_month, cpi_source = previous["cpi"], previous["cpi_month"], previous["cpi_source"]

    fx, fx_date, fx_source = fetch_fx()
    usd, inr = compute(cpi, fx)
    label = label_for(inr)

    record = {
        "label": label,
        "inr": round(inr, 4),
        "usd": round(usd, 6),
        "base_usd": BASE_USD,
        "base_period": BASE_PERIOD,
        "base_cpi": BASE_CPI,
        "cpi": cpi,
        "cpi_month": cpi_month,
        "cpi_source": cpi_source,
        "usd_inr": fx,
        "fx_date": fx_date,
        "fx_source": fx_source,
        "formula": "0.02 x (CPI_latest / CPI_March1926) x USD/INR",
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    RECORD.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    update_html(label)
    print(f"{label}  (CPI {cpi} for {cpi_month}; USD/INR {fx} on {fx_date} via {fx_source})")


if __name__ == "__main__":
    main()
