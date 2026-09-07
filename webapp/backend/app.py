"""Agente Tito Metralleta - backend (FastAPI).

Primer trozo: Open Interest por vencimiento.
- GET /                -> sirve el frontend.
- GET /api/analyze    -> stream SSE con los PASOS del loading y el resultado final.

El frontend abre un EventSource y va mostrando "en que paso estoy" en vivo.
"""
from __future__ import annotations

import asyncio
import json
from collections import defaultdict
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse

import flow
import liquidity
import news
import sectors
import storage
from providers import SchwabClient, SchwabError, MassiveClient, MassiveError

FRONTEND = Path(__file__).resolve().parents[1] / "frontend"

app = FastAPI(title="Agente Tito Metralleta")
schwab = SchwabClient()
massive = MassiveClient()


@app.get("/")
def index() -> FileResponse:
    return FileResponse(FRONTEND / "index.html")


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _aggregate_open_interest(contracts: list[dict]) -> dict:
    """Agrupa por vencimiento y ordena de mayor a menor Open Interest (Tarea 1)."""
    by_exp: dict[str, dict] = defaultdict(
        lambda: {
            "call_oi": 0, "put_oi": 0, "volume": 0,
            "contracts": 0, "spread_sum": 0.0, "spread_n": 0,
        }
    )
    for c in contracts:
        e = by_exp[c["expiration"]]
        oi = c["open_interest"] or 0
        if c["side"] == "CALL":
            e["call_oi"] += oi
        else:
            e["put_oi"] += oi
        e["volume"] += c["volume"] or 0
        e["contracts"] += 1
        bid, ask = c.get("bid"), c.get("ask")
        if bid is not None and ask is not None and ask > 0 and (bid + ask) > 0:
            mid = (bid + ask) / 2
            if mid > 0:
                e["spread_sum"] += (ask - bid) / mid
                e["spread_n"] += 1

    rows = []
    for exp, e in by_exp.items():
        total_oi = e["call_oi"] + e["put_oi"]
        avg_spread = (e["spread_sum"] / e["spread_n"]) if e["spread_n"] else None
        # Heuristica de liquidez para el primer trozo: spread medio ancho => poco liquido.
        if avg_spread is None:
            liq = "sin_datos"
        elif avg_spread <= 0.10:
            liq = "ok"
        elif avg_spread <= 0.25:
            liq = "media"
        else:
            liq = "baja"
        rows.append(
            {
                "expiration": exp,
                "total_oi": total_oi,
                "call_oi": e["call_oi"],
                "put_oi": e["put_oi"],
                "volume": e["volume"],
                "contracts": e["contracts"],
                "avg_spread_pct": round(avg_spread * 100, 1) if avg_spread is not None else None,
                "liquidity": liq,
            }
        )
    rows.sort(key=lambda r: r["total_oi"], reverse=True)
    return {"rows": rows}


def _top_notional(contracts: list[dict], n: int = 5, market_open: bool = True) -> list[dict]:
    """Top N contratos por Notional Value (Tarea 5) + liquidez por contrato (B).

    Notional Value = Open Interest x 100 x Strike
    Open Premium   = Open Interest x Bid   (precio del contrato = Bid)
    """
    scored = []
    for c in contracts:
        oi = c.get("open_interest") or 0
        strike = c.get("strike")
        if not oi or not strike:
            continue
        bid = c.get("bid") or 0
        liq = liquidity.contract_liquidity(c, market_open)
        scored.append(
            {
                "symbol": c.get("symbol"),
                "side": c.get("side"),
                "strike": strike,
                "expiration": c.get("expiration"),
                "open_interest": oi,
                "bid": bid,
                "notional": oi * 100 * strike,
                "open_premium": oi * bid,
                "liquidity": liq["level"],
                "spread_pct": liq["spread_pct"],
                "volume": liq["volume"],
            }
        )
    scored.sort(key=lambda r: r["notional"], reverse=True)
    return scored[:n]


def _build_profile(contracts: list[dict]) -> dict:
    """Perfil de una cadena: liquidez (spread/vol/OI) + nocional + flujo (PCR/turnover)."""
    prof = liquidity.chain_profile(contracts)
    prof["notional"] = _chain_notional(contracts)
    spot = contracts[0].get("_underlying_price") if contracts else None
    prof["flow"] = flow.flow_metrics(contracts, spot)
    return prof


def _chain_notional(contracts: list[dict]) -> float:
    """Valor nocional total de una cadena = Σ (OI × 100 × Strike)."""
    total = 0.0
    for c in contracts:
        oi = c.get("open_interest") or 0
        strike = c.get("strike") or 0
        total += oi * 100 * strike
    return total


def _resolve_sector(ticker: str) -> str | None:
    """Sector del ticker: primero el mapa estático, luego SIC de Massive."""
    sec = sectors.TICKER_SECTOR.get(ticker.upper())
    if sec:
        return sec
    sic = massive.get_sic_description(ticker)
    return sectors.sector_from_sic(sic)


async def _analyze_stream(ticker: str):
    ticker = (ticker or "").strip().upper()
    steps = [
        "Validando ticker",
        "Autenticando con Schwab (solo lectura)",
        "Descargando cadena de opciones",
        "Agregando Open Interest por vencimiento",
        "Midiendo liquidez real de la cadena (spread/volumen)",
        "Comparando con líderes del sector y mercado",
        "Registrando volumen (histórico 5 días)",
        "Interpretando flujo Call/Put (soporte/resistencia)",
        "Calculando Notional Value (Top 5 contratos)",
        "Cargando gráfico del subyacente (Massive)",
        "Buscando noticias del activo (RSS)",
        "Ordenando de mayor a menor",
    ]
    total = len(steps)

    async def step(i: int):
        yield _sse("step", {"n": i + 1, "total": total, "label": steps[i], "state": "run"})
        await asyncio.sleep(0)  # fuerza el flush al navegador

    try:
        # Paso 1
        async for m in step(0):
            yield m
        if not ticker or not ticker.isalnum():
            yield _sse("error", {"message": f"Ticker invalido: '{ticker}'."})
            return
        await asyncio.sleep(0.15)

        # Paso 2 + 3: token + cadena (trabajo bloqueante en un hilo)
        async for m in step(1):
            yield m
        async for m in step(2):
            yield m
        try:
            contracts = await asyncio.to_thread(schwab.get_option_chain, ticker)
        except SchwabError as e:
            yield _sse("error", {"message": str(e)})
            return

        if not contracts:
            yield _sse("error", {"message": f"Sin contratos de opciones para {ticker}."})
            return
        underlying_price = contracts[0].get("_underlying_price")

        # Paso 4: agregacion
        async for m in step(3):
            yield m
        result = await asyncio.to_thread(_aggregate_open_interest, contracts)
        await asyncio.sleep(0.1)

        # Paso 5: liquidez REAL de la cadena (A) — spread ponderado por OI + volumen
        async for m in step(4):
            yield m
        market_open = await asyncio.to_thread(massive.get_market_status)
        my_profile = await asyncio.to_thread(_build_profile, contracts)
        await asyncio.to_thread(storage.save_profile, ticker, my_profile)
        headline = liquidity.classify_chain(my_profile, bool(market_open))
        await asyncio.sleep(0.05)

        # Paso 6: benchmark sector (C) + mercado 7 Magníficas (D, contexto)
        async for m in step(5):
            yield m
        sector = await asyncio.to_thread(_resolve_sector, ticker)
        leaders = sectors.leaders_of(sector, exclude=ticker) if sector else []
        bench_tickers = list(dict.fromkeys(leaders + storage.MAGNIFICENT_7))
        missing = await asyncio.to_thread(storage.missing_profiles_today, bench_tickers)
        if missing:
            def _fetch_profile(t):
                # Benchmark: solo strikes cerca del precio (payload menor -> paralelismo real)
                t_contracts = contracts if t == ticker else schwab.get_option_chain(t, strike_count=40)
                return t, _build_profile(t_contracts)
            # Bajar las cadenas del benchmark EN PARALELO (el token de Schwab ya está caliente)
            tasks = [asyncio.create_task(asyncio.to_thread(_fetch_profile, t)) for t in missing]
            n_missing = len(missing)
            done_n = 0
            for fut in asyncio.as_completed(tasks):
                try:
                    t, prof = await fut
                    await asyncio.to_thread(storage.save_profile, t, prof)
                except Exception:
                    pass  # se omite ese ticker del promedio
                done_n += 1
                yield _sse("step", {"n": 6, "total": total, "state": "run",
                                    "label": f"Perfiles de liquidez de referencia: {done_n}/{n_missing} listos"})
                await asyncio.sleep(0)
        sector_profiles = (await asyncio.to_thread(storage.load_profiles, leaders, 5)
                           if leaders else [])
        m7_profiles = await asyncio.to_thread(storage.load_profiles, storage.MAGNIFICENT_7, 5)
        sector_cmp = (liquidity.compare_to_benchmark(my_profile, sector_profiles,
                      f"Líderes de {sector}") if sector_profiles else None)
        m7_cmp = liquidity.compare_to_benchmark(my_profile, m7_profiles, "7 Magníficas (mercado)")
        # Contexto de nocional vs M7 (regla original del proceso, ahora secundaria)
        m7_notionals = [p.get("notional") for p in m7_profiles if p.get("notional")]
        notional_context = None
        if m7_notionals:
            avg_notional = sum(m7_notionals) / len(m7_notionals)
            my_notional = my_profile.get("notional") or 0
            notional_context = {
                "my_notional": my_notional, "avg_notional": avg_notional,
                "ratio_pct": round(my_notional / avg_notional * 100, 1) if avg_notional else None,
            }
        liquidity_check = {
            "market_open": bool(market_open),
            "market_status_known": market_open is not None,
            "sector": sector,
            "headline": headline,
            "chain": {
                "spread_pct": my_profile.get("spread_pct"),
                "spread_method": my_profile.get("spread_method"),
                "total_volume": my_profile.get("total_volume"),
                "total_oi": my_profile.get("total_oi"),
            },
            "sector_cmp": sector_cmp,
            "m7_cmp": m7_cmp,
            "notional_context": notional_context,
        }
        # Tarea 3: sectorial vs. individual (reaprovecha los perfiles de líderes ya bajados)
        sector_flow = None
        if leaders:
            leaders_today = await asyncio.to_thread(storage.get_profiles_today, leaders)
            if leaders_today:
                sector_flow = flow.sector_analysis(
                    my_profile.get("flow") or {}, leaders_today, sector)
        await asyncio.sleep(0.05)

        # Paso 7: registrar volumen del dia y cargar historico (Tarea 2)
        async for m in step(6):
            yield m
        await asyncio.to_thread(storage.save_snapshot, ticker, result["rows"])
        history = await asyncio.to_thread(storage.load_history, ticker, 5)
        max_vol_exp = None
        if result["rows"]:
            mv = max(result["rows"], key=lambda r: r["volume"])
            if mv["volume"] > 0:
                max_vol_exp = mv["expiration"]
        await asyncio.sleep(0.05)

        # Paso 8: flujo Call/Put — soporte/resistencia + agresor heurístico (Tarea 4)
        async for m in step(7):
            yield m
        flow_analysis = await asyncio.to_thread(flow.analyze_flow, contracts, underlying_price)
        await asyncio.sleep(0.05)

        # Paso 9: Top 5 por Notional Value + liquidez por contrato (B)
        async for m in step(8):
            yield m
        top5 = await asyncio.to_thread(_top_notional, contracts, 5, bool(market_open))
        await asyncio.sleep(0.05)

        # Paso 10: histórico del subyacente (Massive) para el gráfico
        async for m in step(9):
            yield m
        candles: list[dict] = []
        chart_warning = None
        try:
            candles = await asyncio.to_thread(massive.get_daily_candles, ticker, 180)
        except MassiveError as e:
            chart_warning = str(e)

        # Paso 11: noticias RSS del activo (Tarea 7)
        async for m in step(10):
            yield m
        company = news.COMPANY_NAMES.get(ticker) or await asyncio.to_thread(
            massive.get_ticker_name, ticker)
        news_data = await asyncio.to_thread(news.get_news, ticker, company)
        await asyncio.sleep(0.05)

        # Paso 12: orden
        async for m in step(11):
            yield m
        await asyncio.sleep(0.05)

        yield _sse(
            "result",
            {
                "ticker": ticker,
                "underlying_price": underlying_price,
                "expirations": len(result["rows"]),
                "total_contracts": len(contracts),
                "rows": result["rows"],
                "liquidity_check": liquidity_check,
                "sector_flow": sector_flow,
                "flow": flow_analysis,
                "max_vol_exp": max_vol_exp,
                "history": history,
                "top5": top5,
                "candles": candles,
                "chart_warning": chart_warning,
                "news": news_data,
            },
        )
    except Exception as e:  # red de seguridad
        yield _sse("error", {"message": f"Error inesperado: {type(e).__name__}: {e}"})


@app.get("/api/analyze")
async def analyze(ticker: str = ""):
    return StreamingResponse(
        _analyze_stream(ticker),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
