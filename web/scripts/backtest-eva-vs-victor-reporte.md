# Validación EVA-tuned vs Victor — CON costo de ejecución (salida al bid)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · **1327 flujos**. Ahora la salida paga media horquilla (spread). Solo cambia el scoring.

## 1. PESOS solos, sin vetos: ¿re-pesar rankea mejor? (top⅓ vs bottom⅓)
- **Victor** (20/20/20/10) — top⅓: win 45% · media 7.2% · mediana -0.6% (n=442) · bottom⅓: win 34% · media 6.6% · mediana -2.5% (n=442) · **sep media 0.6 · win 11**
- **EVA pesos** (Conv30/Inus20/IV15/Agr10) — top⅓: win 47% · media 6.4% · mediana -0.6% (n=442) · bottom⅓: win 33% · media 10.5% · mediana -2.9% (n=442) · **sep media -4.1 · win 14**

## 2. VETOS (ya solo OI<250 / vol<100 — spread pasó a penalización): ¿los inoperables pierden?
- **Vetados por EVA** (OI<250 / vol<100): win 54% · media -1.2% · mediana 0.4% (n=213)
- No vetados: win 41% · media 8.7% · mediana -1.1% (n=1114)

Con el costo del spread, si los vetados ahora rinden PEOR, el veto está justificado.

## 3. EVA-tuned completo (pesos+vetos) vs Victor — lo que operaría (≥70)
- **Victor** (≥70): win 46% · media 7.6% · mediana -0.6% (n=452)
- **EVA-tuned** (≥70, sin veto): win 49% · media 11.3% · mediana -0.3% (n=192)

## Caveats
- Costo de ejecución = media horquilla en la SALIDA (entrada = precio real del trade). Aproximación honesta, no exacta.
- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).
- Vetos spread/OI/volumen aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).
- Long-only, IV constante, horizonte fijo. P&L de opciones asimétrico → win% y mediana > media.
