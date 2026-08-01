# Validación EVA-tuned vs Victor — CON costo de ejecución (salida al bid)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · **1274 flujos**. Ahora la salida paga media horquilla (spread). Solo cambia el scoring.

## 1. PESOS solos, sin vetos: ¿re-pesar rankea mejor? (top⅓ vs bottom⅓)
- **Victor** (20/20/20/10) — top⅓: win 45% · media 5.7% · mediana -0.6% (n=424) · bottom⅓: win 30% · media 8.2% · mediana -2.5% (n=424) · **sep media -2.5 · win 15**
- **EVA pesos** (Conv30/Inus20/IV15/Agr10) — top⅓: win 50% · media 5.7% · mediana 0% (n=424) · bottom⅓: win 29% · media 12.3% · mediana -2.9% (n=424) · **sep media -6.6 · win 21**

## 2. VETOS solos, YA con costo de ejecución: ¿los ilíquidos pierden ahora?
- **Vetados por EVA** (spread>15% / OI<250 / vol<100): win 52% · media -1.9% · mediana 0.2% (n=218)
- No vetados: win 39% · media 8.8% · mediana -1.1% (n=1056)

Con el costo del spread, si los vetados ahora rinden PEOR, el veto está justificado.

## 3. EVA-tuned completo (pesos+vetos) vs Victor — lo que operaría (≥70)
- **Victor** (≥70): win 45% · media 5.5% · mediana -0.6% (n=435)
- **EVA-tuned** (≥70, sin veto): win 47% · media 8.4% · mediana -0.5% (n=193)

## Caveats
- Costo de ejecución = media horquilla en la SALIDA (entrada = precio real del trade). Aproximación honesta, no exacta.
- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).
- Vetos spread/OI/volumen aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).
- Long-only, IV constante, horizonte fijo. P&L de opciones asimétrico → win% y mediana > media.
