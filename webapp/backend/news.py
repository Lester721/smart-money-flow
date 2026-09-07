"""Noticias RSS del activo — Tarea 7 del proceso.

Lee los feeds de docs/RSS-Feed.md (CNBC, Investing.com), y filtra las noticias
relevantes al ticker (por nombre de empresa o símbolo). Si no hay específicas,
muestra titulares generales de mercado como contexto.
"""
from __future__ import annotations

import datetime as dt
import re
import urllib.request
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from html import unescape

FEEDS = [
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114"),
    ("CNBC", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258"),
    ("Investing.com", "https://www.investing.com/rss/news_1062.rss"),
    ("Investing.com", "https://www.investing.com/rss/news_14.rss"),
]

# Nombres de empresa para casar noticias (ticker -> término de búsqueda).
COMPANY_NAMES = {
    "AAPL": "Apple", "MSFT": "Microsoft", "GOOGL": "Alphabet", "GOOG": "Alphabet",
    "AMZN": "Amazon", "NVDA": "Nvidia", "META": "Meta", "TSLA": "Tesla",
    "F": "Ford", "GM": "General Motors", "TM": "Toyota", "RIVN": "Rivian",
    "JPM": "JPMorgan", "BAC": "Bank of America", "WFC": "Wells Fargo",
    "GS": "Goldman Sachs", "MS": "Morgan Stanley", "C": "Citigroup", "SCHW": "Schwab",
    "XOM": "Exxon", "CVX": "Chevron", "COP": "ConocoPhillips", "SLB": "Schlumberger",
    "OXY": "Occidental", "UNH": "UnitedHealth", "JNJ": "Johnson & Johnson",
    "LLY": "Eli Lilly", "PFE": "Pfizer", "ABBV": "AbbVie", "MRK": "Merck",
    "WMT": "Walmart", "HD": "Home Depot", "MCD": "McDonald", "NKE": "Nike",
    "COST": "Costco", "SBUX": "Starbucks", "NFLX": "Netflix", "DIS": "Disney",
    "T": "AT&T", "VZ": "Verizon", "CMCSA": "Comcast", "CAT": "Caterpillar",
    "BA": "Boeing", "GE": "GE", "HON": "Honeywell", "UPS": "UPS",
    "DAL": "Delta", "UAL": "United Airlines", "AAL": "American Airlines",
    "LUV": "Southwest", "INTC": "Intel", "AMD": "AMD", "QCOM": "Qualcomm",
    "TXN": "Texas Instruments", "AVGO": "Broadcom", "MU": "Micron", "ARM": "Arm",
    "COIN": "Coinbase", "PYPL": "PayPal", "SOFI": "SoFi", "PLTR": "Palantir",
    "CRM": "Salesforce", "ORCL": "Oracle",
}


def _parse_date(s: str):
    if not s:
        return None
    try:
        d = parsedate_to_datetime(s)
        return d.replace(tzinfo=None) if d.tzinfo else d
    except Exception:
        pass
    try:
        return dt.datetime.strptime(s.strip(), "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


def _fetch_feed(source: str, url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (TitoMetralleta)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        root = ET.fromstring(r.read())
    out = []
    for item in root.iter("item"):
        def txt(tag):
            el = item.find(tag)
            return unescape(el.text.strip()) if el is not None and el.text else ""
        title = txt("title")
        if not title:
            continue
        pub = txt("pubDate")
        out.append({
            "title": title,
            "link": txt("link"),
            "pubDate": pub,
            "date": _parse_date(pub),
            "description": re.sub(r"<[^>]+>", "", txt("description"))[:180],
            "source": source,
        })
    return out


def get_news(ticker: str, company_name: str | None, max_items: int = 6) -> dict:
    items: list[dict] = []
    seen = set()
    feeds_ok = 0
    for source, url in FEEDS:
        try:
            for it in _fetch_feed(source, url):
                key = it["link"] or it["title"]
                if key in seen:
                    continue
                seen.add(key)
                items.append(it)
            feeds_ok += 1
        except Exception:
            continue

    # Términos de relevancia: nombre de empresa + símbolo (si tiene >=2 letras).
    terms = []
    if company_name:
        terms.append(company_name.lower())
    if len(ticker) >= 2:
        terms.append(ticker.lower())

    def relevant(it):
        text = (it["title"] + " " + it["description"]).lower()
        for term in terms:
            if len(term) <= 4:  # término corto -> exige límites de palabra
                if re.search(r"\b" + re.escape(term) + r"\b", text):
                    return True
            elif term in text:
                return True
        return False

    matched = [it for it in items if relevant(it)]
    _sort_recent(matched)
    _sort_recent(items)

    def clean(lst):
        return [{k: it[k] for k in ("title", "link", "pubDate", "description", "source")}
                for it in lst]

    return {
        "matched": clean(matched[:max_items]),
        "general": clean(items[:4]) if not matched else [],
        "found": len(matched),
        "feeds_ok": feeds_ok,
        "company_name": company_name,
    }


def _sort_recent(lst: list[dict]) -> None:
    lst.sort(key=lambda it: it["date"] or dt.datetime.min, reverse=True)
