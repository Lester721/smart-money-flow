# Validación EVA-tuned vs Victor — CON costo de ejecución (salida al bid)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD, COIN, PLTR, SOFI, AFRM, MU, AVGO, INTC, CRM, UBER, BABA, DIS, XOM, JPM, IWM, SMCI, MARA · 365d · **1523 flujos**. Ahora la salida paga media horquilla (spread). Solo cambia el scoring.

## 1. PESOS solos, sin vetos: ¿re-pesar rankea mejor? (top⅓ vs bottom⅓)
- **Victor** (20/20/20/10) — top⅓: win 34% · media -6.9% · mediana -10.1% (n=507) · bottom⅓: win 17% · media -7.6% · mediana -8.3% (n=507) · **sep media 0.7 · win 17**
- **EVA pesos** (Conv30/Inus20/IV15/Agr10) — top⅓: win 35% · media -5.6% · mediana -9.6% (n=507) · bottom⅓: win 18% · media -8.4% · mediana -8.3% (n=507) · **sep media 2.8 · win 17**

## 2. VETOS (ya solo OI<250 / vol<100 — spread pasó a penalización): ¿los inoperables pierden?
- **Vetados por EVA** (OI<250 / vol<100): win 31% · media -5.2% · mediana -3.7% (n=440)
- No vetados: win 28% · media -6.8% · mediana -10.2% (n=1083)

Con el costo del spread, si los vetados ahora rinden PEOR, el veto está justificado.

## 3. EVA-tuned completo (pesos+vetos) vs Victor — lo que operaría (≥70)
- **Victor** (≥70): win 31% · media -9.8% · mediana -12.3% (n=366)
- **EVA-tuned** (≥70, sin veto): win 26% · media -21.1% · mediana -21.8% (n=141)

## Caveats
- Costo de ejecución = media horquilla en la SALIDA (entrada = precio real del trade). Aproximación honesta, no exacta.
- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).
- Vetos spread/OI/volumen aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).
- Long-only, IV constante, horizonte fijo. P&L de opciones asimétrico → win% y mediana > media.
