"""Almacenamiento simple de snapshots diarios de volumen/OI por vencimiento.

Cumple la Tarea 2 del proceso: guardar >= 5 dias de historico de todas las
expiraciones para detectar patrones de volumen recurrentes.

Un snapshot por (ticker, fecha). Se sobreescribe si se corre varias veces el mismo dia.
Formato en disco: JSON en webapp/backend/data/history.json
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"
PROFILE_FILE = DATA_DIR / "ticker_profiles.json"

# Las "7 Magníficas" — benchmark de mercado (contexto).
MAGNIFICENT_7 = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA"]


def _load_all() -> dict:
    if not HISTORY_FILE.exists():
        return {}
    try:
        return json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_all(data: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    HISTORY_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")


def save_snapshot(ticker: str, rows: list[dict], date: str | None = None) -> str:
    """Guarda el snapshot del dia. `rows` = filas por expiracion (de la agregacion)."""
    date = date or dt.date.today().isoformat()
    data = _load_all()
    by_exp = {
        r["expiration"]: {"volume": r["volume"], "oi": r["total_oi"]}
        for r in rows
    }
    data.setdefault(ticker.upper(), {})[date] = {
        "by_exp": by_exp,
        "total_volume": sum(r["volume"] for r in rows),
        "total_oi": sum(r["total_oi"] for r in rows),
    }
    _save_all(data)
    return date


def _load_profiles() -> dict:
    if not PROFILE_FILE.exists():
        return {}
    try:
        return json.loads(PROFILE_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def missing_profiles_today(tickers: list[str], date: str | None = None) -> list[str]:
    """Tickers cuyo perfil de liquidez aún no está en caché para hoy."""
    date = date or dt.date.today().isoformat()
    today = _load_profiles().get(date, {})
    return [t for t in tickers if t.upper() not in today]


def save_profile(ticker: str, profile: dict, date: str | None = None) -> None:
    """Guarda el perfil de liquidez del día (spread ponderado, volumen, OI, nocional)."""
    date = date or dt.date.today().isoformat()
    data = _load_profiles()
    data.setdefault(date, {})[ticker.upper()] = profile
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    PROFILE_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=0), encoding="utf-8")


def get_profiles_today(tickers: list[str], date: str | None = None) -> dict:
    """Perfiles de HOY por ticker (para la comparación sectorial por líder)."""
    date = date or dt.date.today().isoformat()
    today = _load_profiles().get(date, {})
    return {t.upper(): today[t.upper()] for t in tickers if t.upper() in today}


def load_profiles(tickers: list[str], days: int = 5) -> list[dict]:
    """Perfiles de `tickers` en los últimos `days` días (para promediar un benchmark)."""
    data = _load_profiles()
    dates = sorted(data.keys(), reverse=True)[:days]
    wanted = {t.upper() for t in tickers}
    out: list[dict] = []
    for d in dates:
        for t, prof in data[d].items():
            if t in wanted:
                out.append(prof)
    return out


def load_history(ticker: str, days: int = 5) -> list[dict]:
    """Devuelve hasta `days` snapshots mas recientes (mas nuevo primero)."""
    data = _load_all().get(ticker.upper(), {})
    out = []
    for date in sorted(data.keys(), reverse=True)[:days]:
        snap = data[date]
        by_exp = snap.get("by_exp", {})
        max_exp, max_vol = None, 0
        for exp, v in by_exp.items():
            if (v.get("volume") or 0) > max_vol:
                max_vol, max_exp = v["volume"], exp
        out.append(
            {
                "date": date,
                "total_volume": snap.get("total_volume", 0),
                "total_oi": snap.get("total_oi", 0),
                "max_vol_exp": max_exp,
                "max_vol_value": max_vol,
            }
        )
    return out
