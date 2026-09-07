"""Desglose de flujo Call/Put — Tarea 4 del proceso.

Interpretación según la tabla del proceso:
  Buy Call  = direccional (alcista)
  Sell Call = resistencia; OI grande = "muro"
  Buy Put   = hedge o direccional (validar)
  Sell Put  = soporte

LÍMITE DE DATOS (honesto): sin tape de trades no se puede saber con certeza el agresor
(buy/sell). Por eso:
  - Muros de OI (Call arriba del precio = resistencia, Put abajo = soporte) -> SÓLIDO.
  - Sesgo comprador/vendedor por `last` vs punto medio bid/ask -> HEURÍSTICA (inferencia).
"""
from __future__ import annotations

from collections import defaultdict


def flow_metrics(contracts: list[dict], spot: float | None, ntm_pct: float = 0.15) -> dict:
    """Métricas de flujo comparables entre tickers (Tarea 3), sobre strikes cerca del
    precio (±ntm_pct) para que la comparación sea justa (mismo alcance en todos).

    - pcr_oi / pcr_vol : sentimiento (put/call).
    - turnover         : volumen / OI = intensidad de actividad (lo "inusual").
    """
    call_oi = put_oi = call_vol = put_vol = 0
    for c in contracts:
        strike = c.get("strike")
        if spot and strike and abs(strike - spot) / spot > ntm_pct:
            continue
        oi = c.get("open_interest") or 0
        vol = c.get("volume") or 0
        if c.get("side") == "CALL":
            call_oi += oi; call_vol += vol
        else:
            put_oi += oi; put_vol += vol
    total_oi = call_oi + put_oi
    total_vol = call_vol + put_vol
    return {
        "pcr_oi": round(put_oi / call_oi, 2) if call_oi else None,
        "pcr_vol": round(put_vol / call_vol, 2) if call_vol else None,
        "turnover": round(total_vol / total_oi, 3) if total_oi else None,
        "ntm_volume": total_vol,
        "ntm_oi": total_oi,
    }


def sector_analysis(my_flow: dict, leaders_profiles: dict, sector: str) -> dict | None:
    """Compara el flujo del activo vs. sus líderes y etiqueta sectorial/individual (Tarea 3)."""
    rows, turnovers, pcrs = [], [], []
    for t, prof in leaders_profiles.items():
        fm = prof.get("flow") or {}
        rows.append({"ticker": t, "pcr_oi": fm.get("pcr_oi"),
                     "turnover": fm.get("turnover"), "volume": prof.get("total_volume")})
        if fm.get("turnover") is not None:
            turnovers.append(fm["turnover"])
        if fm.get("pcr_oi") is not None:
            pcrs.append(fm["pcr_oi"])
    if not rows:
        return None
    rows.sort(key=lambda r: (r["turnover"] or 0), reverse=True)
    avg_turnover = sum(turnovers) / len(turnovers) if turnovers else None
    avg_pcr = sum(pcrs) / len(pcrs) if pcrs else None
    my_turn = my_flow.get("turnover")
    my_pcr = my_flow.get("pcr_oi")
    turnover_ratio = round(my_turn / avg_turnover, 2) if (my_turn and avg_turnover) else None

    label, reasons = "sectorial", []
    # Actividad: turnover muy por encima del sector -> concentrada en este nombre
    if turnover_ratio is not None:
        if turnover_ratio >= 1.6:
            label = "individual"
            reasons.append(f"turnover {turnover_ratio}× el del sector (actividad concentrada aquí)")
        elif turnover_ratio <= 0.6:
            reasons.append(f"turnover {turnover_ratio}× el del sector (menos activo que sus pares)")
        else:
            reasons.append(f"turnover en línea con el sector ({turnover_ratio}×)")
    # Sentimiento: PCR vs. el sector
    if my_pcr is not None and avg_pcr is not None:
        bull = lambda x: x < 0.8
        bear = lambda x: x > 1.2
        same_side = (my_pcr < 1) == (avg_pcr < 1)
        avg_r = round(avg_pcr, 2)
        if (bull(my_pcr) and bear(avg_pcr)) or (bear(my_pcr) and bull(avg_pcr)):
            label = "individual"
            reasons.append(f"PCR {my_pcr} vs sector {avg_r} (sentimiento OPUESTO al sector)")
        elif not same_side:
            reasons.append(f"PCR {my_pcr} vs sector {avg_r} (sesgo distinto al sector)")
        else:
            reasons.append(f"PCR {my_pcr} vs sector {avg_r} (mismo sesgo que el sector)")

    return {
        "label": label,
        "sector": sector,
        "reasons": reasons,
        "my_pcr_oi": my_pcr,
        "my_turnover": my_turn,
        "avg_pcr_oi": round(avg_pcr, 2) if avg_pcr is not None else None,
        "avg_turnover": round(avg_turnover, 3) if avg_turnover is not None else None,
        "turnover_ratio": turnover_ratio,
        "leaders": rows,
    }


def _lean(bid, ask, last) -> float | None:
    """Posición del último trade dentro del bid/ask: -1 (en bid) a +1 (en ask)."""
    if bid is None or ask is None or last is None or ask <= bid:
        return None
    mid = (bid + ask) / 2
    half = (ask - bid) / 2
    if half <= 0:
        return None
    return max(-1.5, min(1.5, (last - mid) / half))


def analyze_flow(contracts: list[dict], spot: float | None) -> dict:
    per_strike: dict[float, dict] = defaultdict(
        lambda: {"call_oi": 0, "put_oi": 0, "call_vol": 0, "put_vol": 0})
    tot = {"call_oi": 0, "put_oi": 0, "call_vol": 0, "put_vol": 0}
    agg = {"call_buy": 0, "call_sell": 0, "put_buy": 0, "put_sell": 0, "classified_vol": 0}

    for c in contracts:
        strike = c.get("strike")
        if strike is None:
            continue
        oi = c.get("open_interest") or 0
        vol = c.get("volume") or 0
        is_call = c.get("side") == "CALL"
        s = per_strike[strike]
        if is_call:
            s["call_oi"] += oi; s["call_vol"] += vol
            tot["call_oi"] += oi; tot["call_vol"] += vol
        else:
            s["put_oi"] += oi; s["put_vol"] += vol
            tot["put_oi"] += oi; tot["put_vol"] += vol
        # Heurística de agresor (solo con volumen del día)
        if vol > 0:
            lean = _lean(c.get("bid"), c.get("ask"), c.get("last"))
            if lean is not None and abs(lean) >= 0.25:
                agg["classified_vol"] += vol
                if is_call:
                    agg["call_buy" if lean > 0 else "call_sell"] += vol
                else:
                    agg["put_buy" if lean > 0 else "put_sell"] += vol

    # Muros: Call OI por encima del precio (resistencia); Put OI por debajo (soporte)
    resistance, support = [], []
    if spot:
        calls_above = [(k, v) for k, v in per_strike.items() if k >= spot and v["call_oi"] > 0]
        puts_below = [(k, v) for k, v in per_strike.items() if k <= spot and v["put_oi"] > 0]
        calls_above.sort(key=lambda kv: kv[1]["call_oi"], reverse=True)
        puts_below.sort(key=lambda kv: kv[1]["put_oi"], reverse=True)
        resistance = [{"strike": k, "call_oi": v["call_oi"], "call_vol": v["call_vol"]}
                      for k, v in calls_above[:5]]
        support = [{"strike": k, "put_oi": v["put_oi"], "put_vol": v["put_vol"]}
                   for k, v in puts_below[:5]]

    pcr_oi = round(tot["put_oi"] / tot["call_oi"], 2) if tot["call_oi"] else None
    pcr_vol = round(tot["put_vol"] / tot["call_vol"], 2) if tot["call_vol"] else None

    # Señales interpretativas (tabla del proceso)
    signals = []
    if resistance:
        w = resistance[0]
        signals.append({"cat": "Sell Call → resistencia",
                        "text": f"Mayor muro de Call OI en ${w['strike']:g} "
                                f"({w['call_oi']:,} OI) — posible resistencia/\"muro\"."})
    if support:
        w = support[0]
        signals.append({"cat": "Sell Put → soporte",
                        "text": f"Mayor muro de Put OI en ${w['strike']:g} "
                                f"({w['put_oi']:,} OI) — posible soporte."})
    if pcr_oi is not None:
        if pcr_oi < 0.7:
            signals.append({"cat": "Sesgo", "text": f"Put/Call OI = {pcr_oi} (dominan calls → sesgo alcista)."})
        elif pcr_oi > 1.3:
            signals.append({"cat": "Sesgo", "text": f"Put/Call OI = {pcr_oi} (dominan puts → sesgo bajista/cobertura)."})
        else:
            signals.append({"cat": "Sesgo", "text": f"Put/Call OI = {pcr_oi} (equilibrado)."})

    # Heurística de agresor -> Buy Call / Buy Put
    if agg["classified_vol"] > 0:
        if agg["call_buy"] > agg["call_sell"] and agg["call_buy"] > 0:
            signals.append({"cat": "Buy Call → direccional (inferido)",
                            "text": "Presión compradora neta en calls (posible apuesta direccional alcista)."})
        if agg["put_buy"] > agg["put_sell"] and agg["put_buy"] > 0:
            signals.append({"cat": "Buy Put → hedge/direccional (inferido)",
                            "text": "Presión compradora neta en puts (cobertura o apuesta bajista — validar)."})

    coverage = round(agg["classified_vol"] / (tot["call_vol"] + tot["put_vol"]) * 100, 1) \
        if (tot["call_vol"] + tot["put_vol"]) else 0

    return {
        "spot": spot,
        "resistance": resistance,
        "support": support,
        "totals": {**tot, "pcr_oi": pcr_oi, "pcr_vol": pcr_vol},
        "aggressor": {**agg, "coverage_pct": coverage},
        "signals": signals,
    }
