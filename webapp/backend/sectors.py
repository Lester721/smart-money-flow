"""Sectores y sus 5 líderes (para el benchmark de liquidez sectorial — Tarea 3/6).

Mapa curado y heurístico de líderes por sector, más un lookup ticker -> sector para
los nombres más comunes. Si un ticker no está mapeado, se intenta deducir el sector
por la descripción SIC de Massive; si aun así no se sabe, se cae al benchmark de mercado
(7 Magníficas).
"""
from __future__ import annotations

# Sector -> 5 líderes (large caps representativas)
SECTOR_LEADERS: dict[str, list[str]] = {
    "Tecnología": ["AAPL", "MSFT", "NVDA", "GOOGL", "META"],
    "Semiconductores": ["NVDA", "AVGO", "AMD", "QCOM", "TXN"],
    "Autos": ["TSLA", "F", "GM", "TM", "RIVN"],
    "Financieras": ["JPM", "BAC", "WFC", "GS", "MS"],
    "Energía": ["XOM", "CVX", "COP", "SLB", "EOG"],
    "Salud": ["UNH", "JNJ", "LLY", "PFE", "ABBV"],
    "Consumo": ["AMZN", "WMT", "HD", "MCD", "NKE"],
    "Comunicaciones": ["NFLX", "DIS", "T", "VZ", "CMCSA"],
    "Industriales": ["CAT", "BA", "GE", "HON", "UPS"],
    "Aerolíneas": ["DAL", "UAL", "AAL", "LUV", "ALK"],
}

# Lookup directo ticker -> sector (cubre líderes + nombres frecuentes)
TICKER_SECTOR: dict[str, str] = {}
for _sec, _tickers in SECTOR_LEADERS.items():
    for _t in _tickers:
        TICKER_SECTOR.setdefault(_t, _sec)
# Alias/extra frecuentes
TICKER_SECTOR.update({
    "GOOG": "Tecnología", "AMZN": "Consumo", "TSLA": "Autos",
    "INTC": "Semiconductores", "MU": "Semiconductores", "ARM": "Semiconductores",
    "C": "Financieras", "SCHW": "Financieras", "COIN": "Financieras",
    "OXY": "Energía", "MRK": "Salud", "COST": "Consumo", "SBUX": "Consumo",
    "PYPL": "Financieras", "SQ": "Financieras", "SOFI": "Financieras",
    "PLTR": "Tecnología", "CRM": "Tecnología", "ORCL": "Tecnología",
})

# Palabras clave de la descripción SIC de Massive -> sector (fallback)
SIC_KEYWORDS: list[tuple[str, str]] = [
    ("semiconductor", "Semiconductores"),
    ("motor vehicle", "Autos"), ("automobile", "Autos"),
    ("bank", "Financieras"), ("finance", "Financieras"), ("insurance", "Financieras"),
    ("petroleum", "Energía"), ("oil", "Energía"), ("gas", "Energía"),
    ("pharmaceutical", "Salud"), ("health", "Salud"), ("medical", "Salud"),
    ("retail", "Consumo"), ("food", "Consumo"), ("beverage", "Consumo"),
    ("air transportation", "Aerolíneas"), ("airline", "Aerolíneas"),
    ("communication", "Comunicaciones"), ("television", "Comunicaciones"),
    ("computer", "Tecnología"), ("software", "Tecnología"), ("technology", "Tecnología"),
    ("aircraft", "Industriales"), ("machinery", "Industriales"),
]


def sector_from_sic(sic_description: str | None) -> str | None:
    if not sic_description:
        return None
    low = sic_description.lower()
    for kw, sec in SIC_KEYWORDS:
        if kw in low:
            return sec
    return None


def leaders_of(sector: str, exclude: str | None = None) -> list[str]:
    leaders = SECTOR_LEADERS.get(sector, [])
    if exclude:
        return [t for t in leaders if t != exclude.upper()]
    return list(leaders)
