# Validación EVA-tuned vs Victor — CON costo de ejecución (salida al bid)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · **933 flujos**. Ahora la salida paga media horquilla (spread). Solo cambia el scoring.

## 1. PESOS solos, sin vetos: ¿re-pesar rankea mejor? (top⅓ vs bottom⅓)
- **Victor** (20/20/20/10) — top⅓: win 31% · media -6.6% · mediana -10.7% (n=311) · bottom⅓: win 11% · media -9.5% · mediana -8.6% (n=311) · **sep media 2.9 · win 20**
- **EVA pesos** (Conv30/Inus20/IV15/Agr10) — top⅓: win 29% · media -5.2% · mediana -10% (n=311) · bottom⅓: win 12% · media -7.1% · mediana -8.3% (n=311) · **sep media 1.9 · win 17**

## 2. VETOS (ya solo OI<250 / vol<100 — spread pasó a penalización): ¿los inoperables pierden?
- **Vetados por EVA** (OI<250 / vol<100): win 22% · media -6% · mediana -4.5% (n=282)
- No vetados: win 21% · media -7.4% · mediana -11% (n=651)

Con el costo del spread, si los vetados ahora rinden PEOR, el veto está justificado.

## 3. EVA-tuned completo (pesos+vetos) vs Victor — lo que operaría (≥70)
- **Victor** (≥70): win 25% · media -10.2% · mediana -13.3% (n=204)
- **EVA-tuned** (≥70, sin veto): win 19% · media -21.8% · mediana -21.5% (n=90)

## Caveats
- Costo de ejecución = media horquilla en la SALIDA (entrada = precio real del trade). Aproximación honesta, no exacta.
- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).
- Vetos spread/OI/volumen aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).
- Long-only, IV constante, horizonte fijo. P&L de opciones asimétrico → win% y mediana > media.
