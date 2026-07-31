# Chequeo de confianza v2 — P&L real + compuesto

**Modelo:** comprar el contrato del flujo (long), sostener 10 sesiones o hasta vencer, salida por Black-Scholes (IV de entrada). Long-only, IV constante, cierre diario — supuestos simplificadores.

**Muestra:** AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, AMD, NFLX, QQQ, SPY, HOOD · 180d · prima ≥ $1.0M · **339 flujos resueltos**.

## Global
- Todos los flujos (long): win 40% · media -1.3% · mediana 0% (n=339)

## Por agresor
- **Compra al ask** (imitar al comprador): win 29% · media -5.8% · mediana -4.5% (n=56)
- Venta al bid (fadear al vendedor comprando): win 40% · media 0.4% · mediana 0% (n=35)

## Por compuesto (unusualTradeScore, suma de 6 params)
- Compuesto ALTO (≥7): win 55% · media 6% · mediana 10.5% (n=29)
- Compuesto bajo (<7): win 39% · media -2% · mediana -0.3% (n=310)

## EL CRUCE — «todas juntas» (agresor × compuesto)
- **ask + compuesto ALTO**: win 100% · media 11% · mediana 11% (n=4)
- ask + compuesto bajo: win 23% · media -7% · mediana -5.4% (n=52)
- bid + compuesto alto: win 100% · media 16.7% · mediana 16.7% (n=1)

## Cómo leerlo
Si «ask + compuesto ALTO» supera claramente a las demás celdas, la CONFLUENCIA sí agrega valor (las señales juntas dicen algo que solas no). Si es parecido o peor, el compuesto no rescata a las partes.

## Caveats
- **Long-only, IV constante**: no modela venta de opciones ni cambios de IV (una caída de IV puede volver perdedor un acierto direccional).
- **Salida a horizonte fijo** (no stop ni toma de ganancia): un trader real gestiona la posición.
- **Skew**: el P&L de opciones long es asimétrico (pocos aciertos grandes). Por eso se reporta media Y mediana Y win-rate — la mediana y el win% son más honestos que la media.
- **Cobertura**: solo flujos con barras suficientes adelante; el flujo más reciente (TSLA/QQQ) puede no resolver.
