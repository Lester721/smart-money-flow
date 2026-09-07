"""Métricas de liquidez REALES (spread bid/ask, volumen, OI) — Tarea 6 afinada.

- Por contrato (B): clasifica cada opción ok/media/baja.
- Por cadena  (A): perfil ponderado por OI (spread representativo) + volumen.
- Comparación (C/D): perfil de la cadena vs. promedio de un benchmark (sector o M7).

El spread es independiente del precio del subyacente (a diferencia del nocional), así que
sirve para comparar tickers distintos de forma justa. Con el mercado cerrado el spread es
solo indicativo (cotizaciones de cierre anchas): en ese caso se degrada la confianza.
"""
from __future__ import annotations


def _spread_pct(bid, ask) -> float | None:
    if bid is None or ask is None:
        return None
    if ask <= 0 or (bid + ask) <= 0:
        return None
    mid = (bid + ask) / 2
    if mid <= 0:
        return None
    return (ask - bid) / mid


def contract_liquidity(c: dict, market_open: bool) -> dict:
    """Clasifica un contrato individual (B)."""
    bid = c.get("bid")
    sp = _spread_pct(bid, c.get("ask"))
    vol = c.get("volume") or 0
    oi = c.get("open_interest") or 0
    # Umbrales; si el mercado está cerrado el spread pesa menos (se apoya en vol/OI).
    if sp is None:
        level = "sin_datos"
    elif (bid or 0) < MIN_BID:      # contrato casi sin valor -> ilíquido para operar
        level = "baja"
    elif market_open:
        if sp <= 0.05 and vol >= 50:
            level = "ok"
        elif sp <= 0.15 and (vol >= 10 or oi >= 500):
            level = "media"
        else:
            level = "baja"
    else:  # mercado cerrado -> apóyate en volumen/OI, spread indicativo
        if vol >= 500 or oi >= 2000:
            level = "ok"
        elif vol >= 50 or oi >= 500:
            level = "media"
        else:
            level = "baja"
    return {
        "level": level,
        "spread_pct": round(sp * 100, 1) if sp is not None else None,
        "volume": vol,
        "open_interest": oi,
    }


MIN_BID = 0.10  # contratos con bid < esto se consideran "wings" sin valor (spread irreal)


def chain_profile(contracts: list[dict]) -> dict:
    """Perfil de liquidez de la cadena (A): spread representativo + totales.

    Calibrado: excluye contratos casi sin valor (bid < 0.10) cuyo spread es irreal, y
    pondera por VOLUMEN (dónde se opera de verdad); si hay poco volumen, cae a OI.
    """
    v_num = v_den = 0.0
    o_num = o_den = 0.0
    total_volume = 0
    total_oi = 0
    n_valid = 0
    for c in contracts:
        oi = c.get("open_interest") or 0
        vol = c.get("volume") or 0
        total_oi += oi
        total_volume += vol
        bid = c.get("bid")
        sp = _spread_pct(bid, c.get("ask"))
        if sp is None or (bid or 0) < MIN_BID:   # descarta wings sin valor
            continue
        n_valid += 1
        if vol > 0:
            v_num += sp * vol
            v_den += vol
        if oi > 0:
            o_num += sp * oi
            o_den += oi
    if v_den >= 1000:                 # volumen suficiente -> ponderar por volumen
        spread, method = v_num / v_den, "volumen"
    elif o_den > 0:                   # si no, por OI (excluyendo wings)
        spread, method = o_num / o_den, "OI"
    else:
        spread, method = None, None
    return {
        "spread_pct": round(spread * 100, 2) if spread is not None else None,
        "spread_method": method,
        "total_volume": total_volume,
        "total_oi": total_oi,
        "n_valid": n_valid,
    }


def classify_chain(profile: dict, market_open: bool) -> dict:
    """Nivel de liquidez de la cadena por su propia métrica real (A)."""
    sp = profile.get("spread_pct")
    vol = profile.get("total_volume") or 0
    if sp is None:
        return {"level": "sin_datos",
                "headline": "Liquidez sin datos suficientes (sin bid/ask válidos)."}
    if not market_open:
        # Con mercado cerrado el spread es indicativo: usa volumen como señal principal.
        if vol >= 50000:
            level = "ok"
        elif vol >= 5000:
            level = "media"
        else:
            level = "baja"
        note = " (mercado cerrado: spread indicativo, señal basada en volumen)"
    else:
        if sp <= 8 and vol >= 5000:
            level = "ok"
        elif sp <= 20:
            level = "media"
        else:
            level = "baja"
        note = ""
    labels = {"ok": "Liquidez buena", "media": "Liquidez media", "baja": "Liquidez baja"}
    return {"level": level, "headline": labels[level] + note}


def compare_to_benchmark(profile: dict, benchmark_profiles: list[dict], label: str) -> dict | None:
    """Compara spread y volumen de la cadena vs. el promedio de un benchmark (C/D)."""
    spreads = [p["spread_pct"] for p in benchmark_profiles
               if p.get("spread_pct") is not None]
    vols = [p["total_volume"] for p in benchmark_profiles if p.get("total_volume") is not None]
    if not spreads or not vols:
        return None
    avg_spread = sum(spreads) / len(spreads)
    avg_vol = sum(vols) / len(vols)
    my_spread = profile.get("spread_pct")
    my_vol = profile.get("total_volume") or 0
    spread_ratio = (my_spread / avg_spread) if (my_spread and avg_spread) else None
    vol_ratio = (my_vol / avg_vol) if avg_vol else None
    # "más ancho" = peor liquidez; "menos volumen" = peor liquidez
    flag = "ok"
    if (spread_ratio and spread_ratio >= 2) or (vol_ratio is not None and vol_ratio < 0.2):
        flag = "baja"
    elif (spread_ratio and spread_ratio >= 1.3) or (vol_ratio is not None and vol_ratio < 0.5):
        flag = "media"
    return {
        "label": label,
        "n": len(spreads),
        "avg_spread_pct": round(avg_spread, 2),
        "avg_volume": round(avg_vol),
        "spread_ratio": round(spread_ratio, 2) if spread_ratio else None,
        "vol_ratio": round(vol_ratio, 2) if vol_ratio is not None else None,
        "flag": flag,
    }
