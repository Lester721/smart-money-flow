# Validación EVA-tuned vs Victor (mismos flujos, mismo P&L)

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · **847 flujos resueltos**. Solo cambia el scoring.

## 1. Poder de ranking (top⅓ vs bottom⅓ por score, misma n)
- **Victor** — top⅓: win 46% · media -0.2% · mediana 0% (n=282) · bottom⅓: win 41% · media 6.1% · mediana 0% (n=282) · **separación media: -6.3 pts · win: 5 pts**
- **EVA-tuned** — top⅓: win 48% · media 0.2% · mediana 0% (n=282) · bottom⅓: win 52% · media 7.1% · mediana 0% (n=282) · **separación media: -6.9 pts · win: -4 pts**

El que tenga MÁS separación (media y win) rankea mejor ganadores de perdedores.

## 2. Valor de los vetos (¿los flujos vetados de verdad pierden?)
- **Vetados por EVA** (spread>15% / OI<250 / vol<100): win 66% · media 1.5% · mediana 2.7% (n=149)
- No vetados: win 43% · media 1.5% · mediana 0% (n=698)

Si los vetados rinden peor, el veto está justificado (te ahorra malas entradas).

## 3. Lo que cada método OPERARÍA (score ≥ 70)
- **Victor** (≥70): win 45% · media -0.5% · mediana 0% (n=288)
- **EVA-tuned** (≥70, sin veto): win 41% · media -4.3% · mediana 0% (n=122)

## Caveats
- Solo 4 de 6 categorías (faltan Estructura y Confirmación → forward-test).
- Vetos de spread/OI/volumen SÍ aplicados; IV Rank y modificadores earnings/GEX NO (sin dato histórico).
- Long-only, IV constante, horizonte fijo. El P&L de opciones es asimétrico → win% y mediana > media.
