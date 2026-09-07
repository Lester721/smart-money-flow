"""Black-Scholes: IV implícita y delta EN EL MOMENTO DE CADA OPERACIÓN.

Por qué así: la delta no es un dato observable del mercado, es una cantidad de modelo.
La forma correcta de obtener "la delta de ese trade" es:
  1) tomar el precio REAL al que se operó (del tape exacto de Databento),
  2) el precio REAL del subyacente en ese minuto (Massive),
  3) la tasa libre de riesgo de ese día (FRED),
  4) despejar la IV implícita de ese precio, y con ella calcular la delta.

Así la delta corresponde al instante del trade, no a un snapshot de hoy.

Supuestos declarados: Black-Scholes europeo, sin rendimiento por dividendos (q=0 por
defecto, configurable). Para opciones de corto plazo el efecto es mínimo.
"""
from __future__ import annotations

import math

SQRT2 = math.sqrt(2.0)


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / SQRT2))


def _d1(S: float, K: float, T: float, r: float, sigma: float, q: float = 0.0) -> float:
    return (math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * math.sqrt(T))


def bs_price(S: float, K: float, T: float, r: float, sigma: float,
             is_call: bool, q: float = 0.0) -> float:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        # valor intrínseco en el límite
        intrinsic = (S - K) if is_call else (K - S)
        return max(intrinsic, 0.0)
    d1 = _d1(S, K, T, r, sigma, q)
    d2 = d1 - sigma * math.sqrt(T)
    if is_call:
        return S * math.exp(-q * T) * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)
    return K * math.exp(-r * T) * _norm_cdf(-d2) - S * math.exp(-q * T) * _norm_cdf(-d1)


def bs_delta(S: float, K: float, T: float, r: float, sigma: float,
             is_call: bool, q: float = 0.0) -> float | None:
    if T <= 0 or sigma <= 0 or S <= 0 or K <= 0:
        return None
    d1 = _d1(S, K, T, r, sigma, q)
    disc = math.exp(-q * T)
    return disc * _norm_cdf(d1) if is_call else disc * (_norm_cdf(d1) - 1.0)


def implied_vol(price: float, S: float, K: float, T: float, r: float,
                is_call: bool, q: float = 0.0,
                lo: float = 1e-4, hi: float = 5.0, tol: float = 1e-6) -> float | None:
    """Despeja la IV por bisección a partir del precio real de la operación."""
    if price is None or price <= 0 or T <= 0 or S <= 0 or K <= 0:
        return None
    intrinsic = max((S - K) if is_call else (K - S), 0.0)
    if price < intrinsic - 1e-6:      # precio por debajo del intrínseco -> sin solución
        return None
    p_hi = bs_price(S, K, T, r, hi, is_call, q)
    if price > p_hi:                   # fuera del rango de vol alcanzable
        return None
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        p = bs_price(S, K, T, r, mid, is_call, q)
        if abs(p - price) < tol:
            return mid
        if p > price:
            hi = mid
        else:
            lo = mid
    return 0.5 * (lo + hi)
