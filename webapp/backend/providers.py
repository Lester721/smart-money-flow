"""Proveedores de datos para el Agente Tito Metralleta.

Por ahora:
- Schwab  -> cadena de opciones (Open Interest, volumen, bid/ask).  [SOLO LECTURA]
- Massive -> (reservado para datos del subyacente / estado de mercado).

Las llaves se leen de API/.env. Nunca se imprimen ni se devuelven al frontend.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import time
import urllib.parse
import urllib.request
import urllib.error
from pathlib import Path

# API/.env en la raiz del proyecto (backend/ -> webapp/ -> raiz/)
ENV_PATH = Path(__file__).resolve().parents[2] / "API" / ".env"


def _load_env() -> dict[str, str]:
    cfg: dict[str, str] = {}
    if not ENV_PATH.exists():
        return cfg
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        cfg[k.strip()] = v.strip()
    return cfg


class SchwabError(RuntimeError):
    pass


class SchwabClient:
    TOKEN_URL = "https://api.schwabapi.com/v1/oauth/token"
    CHAINS_URL = "https://api.schwabapi.com/marketdata/v1/chains"

    def __init__(self) -> None:
        cfg = _load_env()
        self.app_key = cfg.get("SCHWAB_APP_KEY", "")
        self.app_secret = cfg.get("SCHWAB_APP_SECRET", "")
        self.refresh_token = cfg.get("SCHWAB_REFRESH_TOKEN", "")
        self._access_token: str | None = None
        self._expires_at: float = 0.0

    def _ensure_config(self) -> None:
        if not (self.app_key and self.app_secret and self.refresh_token):
            raise SchwabError(
                "Faltan credenciales de Schwab en API/.env "
                "(SCHWAB_APP_KEY / SCHWAB_APP_SECRET / SCHWAB_REFRESH_TOKEN)."
            )

    def _get_access_token(self) -> str:
        # Reutiliza el token si aun quedan >60s de vida.
        if self._access_token and time.time() < self._expires_at - 60:
            return self._access_token
        self._ensure_config()
        basic = base64.b64encode(f"{self.app_key}:{self.app_secret}".encode()).decode()
        body = urllib.parse.urlencode(
            {"grant_type": "refresh_token", "refresh_token": self.refresh_token}
        ).encode()
        req = urllib.request.Request(
            self.TOKEN_URL,
            data=body,
            headers={
                "Authorization": f"Basic {basic}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8")[:200]
            if e.code in (400, 401):
                raise SchwabError(
                    "El refresh token de Schwab caduco o es invalido. "
                    "Regeneralo (caduca cada ~7 dias) y pegalo en API/.env."
                ) from e
            raise SchwabError(f"Schwab token HTTP {e.code}: {detail}") from e
        token = d.get("access_token")
        if not token:
            raise SchwabError("Schwab no devolvio access_token.")
        self._access_token = token
        self._expires_at = time.time() + int(d.get("expires_in", 1800))
        return token

    def get_option_chain(self, symbol: str, strike_count: int | None = None) -> list[dict]:
        """Devuelve una lista plana de contratos con los campos que usamos.

        `strike_count`: si se indica, Schwab devuelve solo N strikes alrededor del precio
        (near-the-money). Útil para perfiles de liquidez de referencia: payload ~10x menor
        y más rápido, y NTM es justo donde se concentra la liquidez.
        """
        token = self._get_access_token()
        params = {"symbol": symbol.upper(), "contractType": "ALL"}
        if strike_count:
            params["strikeCount"] = strike_count
        qs = urllib.parse.urlencode(params)
        req = urllib.request.Request(
            f"{self.CHAINS_URL}?{qs}", headers={"Authorization": f"Bearer {token}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                d = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8")[:200]
            raise SchwabError(f"Schwab chains HTTP {e.code}: {detail}") from e

        if d.get("status") not in ("SUCCESS", None):
            raise SchwabError(f"Schwab devolvio status={d.get('status')} para {symbol}.")

        contracts: list[dict] = []
        for side, map_key in (("CALL", "callExpDateMap"), ("PUT", "putExpDateMap")):
            exp_map = d.get(map_key) or {}
            for exp_key, strikes in exp_map.items():
                # exp_key viene como "2026-07-24:2" (fecha:dias-al-vencimiento)
                exp_date = exp_key.split(":", 1)[0]
                for _strike, arr in strikes.items():
                    for c in arr:
                        contracts.append(
                            {
                                "side": side,
                                "expiration": exp_date,
                                "strike": c.get("strikePrice"),
                                "open_interest": c.get("openInterest") or 0,
                                "volume": c.get("totalVolume") or 0,
                                "bid": c.get("bid"),
                                "ask": c.get("ask"),
                                "last": c.get("last"),
                                "mark": c.get("mark"),
                                "delta": c.get("delta"),
                                "volatility": c.get("volatility"),
                                "dte": c.get("daysToExpiration"),
                                "symbol": (c.get("symbol") or "").strip(),
                            }
                        )
        underlying = d.get("underlying") or {}
        # adjunta el precio del subyacente al primer elemento via atributo del listado
        for c in contracts:
            c["_underlying_price"] = d.get("underlyingPrice") or underlying.get("last")
        return contracts


def get_risk_free_rate(day: str, default: float = 0.04) -> float:
    """Tasa libre de riesgo (T-Bill 3 meses, FRED DGS3MO) del día, en decimal.

    Usa la observación más reciente en o antes de `day`. Gratis con FRED_API_KEY.
    """
    key = _load_env().get("FRED_API_KEY", "")
    if not key:
        return default
    start = (dt.date.fromisoformat(day) - dt.timedelta(days=10)).isoformat()
    qs = urllib.parse.urlencode({
        "series_id": "DGS3MO", "api_key": key, "file_type": "json",
        "observation_start": start, "observation_end": day,
    })
    try:
        with urllib.request.urlopen(
            f"https://api.stlouisfed.org/fred/series/observations?{qs}", timeout=20
        ) as r:
            obs = json.loads(r.read().decode("utf-8")).get("observations", [])
    except Exception:
        return default
    for o in reversed(obs):                 # la más reciente con valor válido
        try:
            return float(o["value"]) / 100.0
        except (TypeError, ValueError):
            continue
    return default


class MassiveError(RuntimeError):
    pass


class MassiveClient:
    """Datos del subyacente (histórico de velas) desde Massive (compat. Polygon)."""

    BASE = "https://api.massive.com"

    def __init__(self) -> None:
        self.api_key = _load_env().get("MASSIVE_API_KEY", "")

    def get_sic_description(self, symbol: str) -> str | None:
        """Descripción SIC del ticker (para deducir el sector). None si no disponible."""
        if not self.api_key:
            return None
        req = urllib.request.Request(
            self.BASE + f"/v3/reference/tickers/{symbol.upper()}",
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.loads(r.read().decode("utf-8"))
            return (d.get("results") or {}).get("sic_description")
        except Exception:
            return None

    def get_ticker_name(self, symbol: str) -> str | None:
        """Nombre de la empresa (para casar noticias). None si no disponible."""
        if not self.api_key:
            return None
        req = urllib.request.Request(
            self.BASE + f"/v3/reference/tickers/{symbol.upper()}",
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.loads(r.read().decode("utf-8"))
            return (d.get("results") or {}).get("name")
        except Exception:
            return None

    def get_market_status(self) -> bool | None:
        """True si el mercado de acciones está abierto ahora, False si cerrado, None si falla."""
        if not self.api_key:
            return None
        req = urllib.request.Request(
            self.BASE + "/v1/marketstatus/now",
            headers={"Authorization": f"Bearer {self.api_key}"},
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                d = json.loads(r.read().decode("utf-8"))
            return str(d.get("market", "")).lower() == "open"
        except Exception:
            return None

    def get_minute_bars(self, symbol: str, day: str) -> list[tuple[int, float]]:
        """Barras de 1 minuto del subyacente para `day` (YYYY-MM-DD).

        Devuelve [(timestamp_ms, close), ...] ordenado. Sirve para saber el precio real
        del subyacente en el instante de cada operación del tape.
        """
        if not self.api_key:
            raise MassiveError("Falta MASSIVE_API_KEY en API/.env.")
        path = (f"/v2/aggs/ticker/{symbol.upper()}/range/1/minute/{day}/{day}"
                "?adjusted=true&sort=asc&limit=50000")
        req = urllib.request.Request(
            self.BASE + path, headers={"Authorization": f"Bearer {self.api_key}"})
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                d = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise MassiveError(f"Massive minute HTTP {e.code}: {e.read().decode('utf-8')[:150]}") from e
        return sorted((int(row["t"]), float(row["c"])) for row in (d.get("results") or []))

    def get_daily_candles(self, symbol: str, days: int = 180) -> list[dict]:
        if not self.api_key:
            raise MassiveError("Falta MASSIVE_API_KEY en API/.env.")
        to = dt.date.today()
        frm = to - dt.timedelta(days=days)
        path = (
            f"/v2/aggs/ticker/{symbol.upper()}/range/1/day/"
            f"{frm.isoformat()}/{to.isoformat()}?adjusted=true&sort=asc&limit=400"
        )
        req = urllib.request.Request(
            self.BASE + path, headers={"Authorization": f"Bearer {self.api_key}"}
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            raise MassiveError(f"Massive aggs HTTP {e.code}: {e.read().decode('utf-8')[:150]}") from e
        candles = []
        for row in d.get("results") or []:
            day = dt.datetime.utcfromtimestamp(row["t"] / 1000).strftime("%Y-%m-%d")
            candles.append(
                {
                    "time": day,
                    "open": row.get("o"),
                    "high": row.get("h"),
                    "low": row.get("l"),
                    "close": row.get("c"),
                }
            )
        return candles
