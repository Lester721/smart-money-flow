"""Subagente de Time & Sales — tape EXACTO de Databento (OPRA) + scoring del scorecard.

Fuente del tape: Databento OPRA, esquema `tcbbo` (cada operación + el mejor bid/oferta
sincronizado → agresor exacto por comparación de precio vs BBO). NADA de aproximados.

Protección de presupuesto:
- `estimate_cost()` usa metadata.get_cost (GRATIS) para cotizar antes de bajar.
- `fetch_tape()` cachea en data/tape/ (no se paga dos veces por el mismo contrato-día) y
  NO descarga si el costo supera `max_spend` (devuelve el costo para que el usuario confirme).
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import greeks

try:
    from zoneinfo import ZoneInfo
    _NY = ZoneInfo("America/New_York")
except Exception:  # sin tzdata: EDT fijo (correcto en verano)
    _NY = dt.timezone(dt.timedelta(hours=-4))

ENV_PATH = Path(__file__).resolve().parents[2] / "API" / ".env"
TAPE_DIR = Path(__file__).resolve().parent / "data" / "tape"


class DatabentoError(RuntimeError):
    pass


class BudgetError(DatabentoError):
    """Se lanza cuando una descarga costaría más que el tope permitido."""
    def __init__(self, cost: float, cap: float):
        self.cost = cost
        self.cap = cap
        super().__init__(f"Costo ${cost:.4f} supera el tope ${cap:.2f}; requiere confirmación.")


def _load_key() -> str:
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("DATABENTO_API_KEY="):
            return line.split("=", 1)[1].strip()
    return ""


def _parse_ns(ts: str) -> dt.datetime | None:
    """ISO con nanosegundos ('...Z') -> datetime UTC (truncado a microsegundos)."""
    if not ts:
        return None
    ts = ts.replace("Z", "")
    if "." in ts:
        head, frac = ts.split(".", 1)
        frac = frac[:6]
        ts = f"{head}.{frac}"
    try:
        return dt.datetime.fromisoformat(ts).replace(tzinfo=dt.timezone.utc)
    except ValueError:
        return None


class DatabentoClient:
    BASE = "https://hist.databento.com/v0"
    DATASET = "OPRA.PILLAR"

    def __init__(self) -> None:
        key = _load_key()
        if not key:
            raise DatabentoError("Falta DATABENTO_API_KEY en API/.env.")
        self._auth = "Basic " + base64.b64encode(f"{key}:".encode()).decode()

    def _req(self, path: str, params: dict) -> str:
        url = f"{self.BASE}{path}?{urllib.parse.urlencode(params)}"
        req = urllib.request.Request(url, headers={"Authorization": self._auth})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            raise DatabentoError(f"Databento HTTP {e.code}: {e.read().decode('utf-8')[:200]}") from e

    def estimate_cost(self, symbol: str, day: str, schema: str = "tcbbo") -> float:
        """Costo en USD de bajar un contrato-día. GRATIS (no descarga datos)."""
        start = f"{day}T00:00:00"
        end = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat() + "T00:00:00"
        body = self._req("/metadata.get_cost", {
            "dataset": self.DATASET, "symbols": symbol, "stype_in": "raw_symbol",
            "schema": schema, "start": start, "end": end, "mode": "historical",
        })
        return float(body)

    def _download(self, symbol: str, day: str, schema: str = "tcbbo") -> str:
        start = f"{day}T00:00:00"
        end = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat() + "T00:00:00"
        return self._req("/timeseries.get_range", {
            "dataset": self.DATASET, "symbols": symbol, "stype_in": "raw_symbol",
            "schema": schema, "start": start, "end": end,
            "encoding": "json", "pretty_px": "true", "pretty_ts": "true",
        })

    @staticmethod
    def _cache_path(symbol: str, day: str, schema: str) -> Path:
        safe = symbol.replace(" ", "_")
        return TAPE_DIR / f"{safe}_{day}_{schema}.jsonl"

    def fetch_tape(self, symbol: str, day: str, schema: str = "tcbbo",
                   max_spend: float = 0.25) -> list[dict]:
        """Devuelve los prints crudos del contrato-día. Cachea; cotiza antes de gastar."""
        cache = self._cache_path(symbol, day, schema)
        if cache.exists():
            return [json.loads(l) for l in cache.read_text(encoding="utf-8").splitlines() if l.strip()]
        cost = self.estimate_cost(symbol, day, schema)
        if cost > max_spend:
            raise BudgetError(cost, max_spend)
        data = self._download(symbol, day, schema)
        TAPE_DIR.mkdir(parents=True, exist_ok=True)
        cache.write_text(data, encoding="utf-8")
        return [json.loads(l) for l in data.splitlines() if l.strip()]


# ---------------------------------------------------------------------------
# Delta EXACTA en el momento de cada operación (A1)
# ---------------------------------------------------------------------------

def parse_osi(symbol: str) -> dict:
    """'AAPL  260724C00320000' -> underlying, expiry, tipo y strike."""
    s = symbol.strip() if " " not in symbol[:6] else symbol
    root = symbol[:6].strip()
    tail = symbol[6:]
    yy, mm, dd = int(tail[0:2]), int(tail[2:4]), int(tail[4:6])
    is_call = tail[6].upper() == "C"
    strike = int(tail[7:15]) / 1000.0
    return {
        "underlying": root,
        "expiry": dt.date(2000 + yy, mm, dd),
        "is_call": is_call,
        "strike": strike,
    }


def _price_at(bars: list[tuple[int, float]], ts: dt.datetime | None) -> float | None:
    """Precio del subyacente en el minuto de la operación (última barra <= ts)."""
    if ts is None or not bars:
        return None
    target = int(ts.timestamp() * 1000)
    lo, hi = 0, len(bars) - 1
    if target < bars[0][0]:
        return bars[0][1]
    best = None
    while lo <= hi:
        mid = (lo + hi) // 2
        if bars[mid][0] <= target:
            best = bars[mid][1]
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def enrich_with_delta(trades: list[dict], symbol: str,
                      bars: list[tuple[int, float]], rate: float,
                      q: float = 0.0) -> None:
    """Añade a cada operación su IV implícita y su delta EN ESE INSTANTE (in-place)."""
    info = parse_osi(symbol)
    # Vencimiento: cierre de mercado (16:00 ET) del día de expiración
    expiry_dt = dt.datetime.combine(info["expiry"], dt.time(16, 0), tzinfo=_NY)
    for t in trades:
        S = _price_at(bars, t["ts"])
        t["underlying"] = S
        t["iv"] = t["delta"] = None
        if S is None or t["ts"] is None:
            continue
        T = (expiry_dt - t["ts"]).total_seconds() / (365.0 * 24 * 3600)
        if T <= 0:
            continue
        iv = greeks.implied_vol(t["price"], S, info["strike"], T, rate, info["is_call"], q)
        if iv is None:
            continue
        t["iv"] = iv
        t["delta"] = greeks.bs_delta(S, info["strike"], T, rate, iv, info["is_call"], q)


# ---------------------------------------------------------------------------
# Clasificación de agresor + scoring del scorecard
# ---------------------------------------------------------------------------

def classify_trades(records: list[dict]) -> list[dict]:
    """Cada print -> agresor exacto (precio vs BBO del mismo instante). Descarta el Mid luego."""
    out = []
    for r in records:
        try:
            price = float(r.get("price"))
            size = int(r.get("size") or 0)
        except (TypeError, ValueError):
            continue
        if size <= 0:
            continue
        lv = (r.get("levels") or [{}])[0]
        bid = float(lv["bid_px"]) if lv.get("bid_px") not in (None, "") else None
        ask = float(lv["ask_px"]) if lv.get("ask_px") not in (None, "") else None
        if bid is not None and ask is not None:
            if price >= ask:
                side = "buy"     # Above/At Ask -> comprador agresivo
            elif price <= bid:
                side = "sell"    # Below/At Bid -> vendedor agresivo
            else:
                side = "mid"
        else:
            side = "unknown"
        ts = _parse_ns((r.get("hd") or {}).get("ts_event"))
        out.append({
            "ts": ts, "price": price, "size": size, "bid": bid, "ask": ask,
            "side": side, "notional": price * size * 100,
        })
    return out


def _volume_points(size: int, notional: float) -> int:
    if size >= 150: return 10
    if size >= 100: return 8
    if size >= 50: return 6
    if size >= 20: return 4
    if size < 20 and notional > 500_000: return 1
    return 0


def _time_points(ts: dt.datetime | None) -> int:
    if ts is None:
        return 0
    t = ts.astimezone(_NY).time()
    def between(a, b):
        return dt.time(*a) <= t <= dt.time(*b)
    if between((11, 0), (13, 0)): return 10   # mediodía
    if between((9, 30), (10, 30)): return 7    # apertura
    if between((15, 0), (16, 0)): return 6     # cierre
    return 3


REPEAT_WINDOW_S = 300  # "transacciones repetidas en un intervalo de 5 minutos"


def _rep_points(count: int) -> int:
    """count = operaciones direccionales del mismo strike dentro de la ventana de 5 min."""
    if count >= 3: return 10
    if count == 2: return 7
    if count == 1: return 4
    return 1  # sin patrón claro (p. ej. sin marca de tiempo)


def _cluster_counts(trades: list[dict], window_s: int = REPEAT_WINDOW_S) -> list[int]:
    """Por cada operación, cuántas operaciones direccionales hay a ±`window_s` (incluida ella)."""
    counts = []
    for t in trades:
        if t["ts"] is None:
            counts.append(0)
            continue
        n = sum(
            1 for o in trades
            if o["ts"] is not None and abs((o["ts"] - t["ts"]).total_seconds()) <= window_s
        )
        counts.append(n)
    return counts


def score_contract(records: list[dict], *, delta: float | None = None,
                   dte: int | None = None, symbol: str | None = None,
                   bars: list[tuple[int, float]] | None = None,
                   rate: float | None = None, q: float = 0.0) -> dict:
    """Aplica el scorecard a un contrato: filtra interés (descarta Mid) y puntúa cada trade.

    Si se pasan `symbol`, `bars` (minuto del subyacente) y `rate`, calcula la **delta exacta
    en el momento de cada operación** (A1) en vez de usar un snapshot.
    """
    trades = classify_trades(records)
    if symbol and bars and rate is not None:
        enrich_with_delta(trades, symbol, bars, rate, q)
    directional = sorted(
        [t for t in trades if t["side"] in ("buy", "sell")],
        key=lambda t: t["ts"] or dt.datetime.min.replace(tzinfo=dt.timezone.utc),
    )
    clusters = _cluster_counts(directional)  # repeticiones en ventana de 5 min
    is_leap = dte is not None and dte >= 90
    # Delta en magnitud: una put con delta -0.75 también es "delta alta"
    delta_mag = abs(delta) if delta is not None else None

    scored = []
    for t, n_rep in zip(directional, clusters):
        reasons = []
        if t["notional"] >= 1_000_000:
            reasons.append(">$1M")
        # Delta del PROPIO trade si está calculada (A1); si no, la de referencia
        d_trade = t.get("delta")
        d_mag = abs(d_trade) if d_trade is not None else delta_mag
        if t["notional"] >= 100_000 and (d_mag is not None and d_mag > 0.60):
            reasons.append(">$100k & Δ>0.60")
        reasons.append("Above Ask" if t["side"] == "buy" else "Below Bid")
        if n_rep >= 3:
            reasons.append(f"repetida x{n_rep}/5min")
        if is_leap:
            reasons.append("LEAP")
        vp = _volume_points(t["size"], t["notional"])
        tp = _time_points(t["ts"])
        rp = _rep_points(n_rep)
        total = vp + tp + rp
        scored.append({
            **t,
            "vol_pts": vp, "time_pts": tp, "rep_pts": rp, "cluster": n_rep,
            "total": total, "reasons": reasons,
        })
    scored.sort(key=lambda x: x["total"], reverse=True)

    total_vol = sum(t["size"] for t in trades)
    return {
        "prints": len(trades),
        "directional": len(directional),
        "mid_discarded": sum(1 for t in trades if t["side"] == "mid"),
        "buy_ctr": sum(t["size"] for t in trades if t["side"] == "buy"),
        "sell_ctr": sum(t["size"] for t in trades if t["side"] == "sell"),
        "total_volume": total_vol,
        "is_leap": is_leap,
        "delta": delta,
        "trades": scored,
    }
