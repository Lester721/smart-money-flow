# Backtest de GESTIÓN — credit spreads (tomar ganancia / cortar pérdida)

**Muestra:** 1540 señales de la caché (8 tickers). Short a 1σ, ancho 0.5σ, filtro **Top⅓ de convicción EVA**.

**Por qué este test:** en credit spreads ganas poco muchas veces y pierdes mucho pocas veces.
En vivo, el 5d va **win 65% pero media −14%** → cada perdedor pierde ~5× lo que gana un ganador.
La pregunta: ¿una regla de salida arregla eso, o solo mata los ganadores?

_TG = tomar ganancia (% del crédito cobrado) · Stop = pérdida máxima en múltiplos del crédito._

## 5 días @ 1σ — Top⅓ EVA (n≈513)

| Regla de salida | Resultado |
|---|---|
| Sostener a vencimiento (baseline) | win 87% · media 0.9% · mediana 11.5% · peor -100% |
| Tomar ganancia 25% | win 91% · media 1% · mediana 8.2% · peor -100% |
| Tomar ganancia 50% | win 90% · media 1% · mediana 9.9% · peor -100% |
| Tomar ganancia 75% | win 89% · media 1.3% · mediana 11.4% · peor -100% |
| Stop a 1× el crédito | win 74% · media 1.6% · mediana 11.5% · peor -100% |
| Stop a 2× el crédito | win 82% · media 1.5% · mediana 11.5% · peor -100% |
| TG 50% + stop 2× | win 85% · media 1.7% · mediana 9.4% · peor -100% |
| TG 50% + stop 1× | win 78% · media 1.8% · mediana 8.9% · peor -100% |
| TG 25% + stop 1× | win 81% · media 2.2% · mediana 7.3% · peor -81.5% |

## 60 días @ 1σ — Top⅓ EVA (n≈512)

| Regla de salida | Resultado |
|---|---|
| Sostener a vencimiento (baseline) | win 89% · media 2.5% · mediana 10% · peor -100% |
| Tomar ganancia 25% | win 95% · media -0.5% · mediana 4% · peor -100% |
| Tomar ganancia 50% | win 92% · media 0.8% · mediana 6.6% · peor -100% |
| Tomar ganancia 75% | win 91% · media 1.8% · mediana 8.6% · peor -100% |
| Stop a 1× el crédito | win 62% · media 1.1% · mediana 9.7% · peor -100% |
| Stop a 2× el crédito | win 78% · media 2.4% · mediana 9.9% · peor -100% |
| TG 50% + stop 2× | win 82% · media 0.5% · mediana 6.1% · peor -48.7% |
| TG 50% + stop 1× | win 69% · media 0% · mediana 5.4% · peor -48.7% |
| TG 25% + stop 1× | win 76% · media -0.5% · mediana 3.5% · peor -48.7% |

## 90 días @ 1σ — Top⅓ EVA (n≈512)

| Regla de salida | Resultado |
|---|---|
| Sostener a vencimiento (baseline) | win 92% · media 4.7% · mediana 9.5% · peor -100% |
| Tomar ganancia 25% | win 96% · media 0.8% · mediana 3.8% · peor -100% |
| Tomar ganancia 50% | win 94% · media 2.4% · mediana 6.2% · peor -100% |
| Tomar ganancia 75% | win 94% · media 4% · mediana 8% · peor -100% |
| Stop a 1× el crédito | win 61% · media 0.8% · mediana 9.1% · peor -99.1% |
| Stop a 2× el crédito | win 79% · media 3.1% · mediana 9.4% · peor -99.1% |
| TG 50% + stop 2× | win 85% · media 1.4% · mediana 5.5% · peor -99.1% |
| TG 50% + stop 1× | win 68% · media -0.2% · mediana 5.1% · peor -99.1% |
| TG 25% + stop 1× | win 76% · media -0.5% · mediana 3.1% · peor -38.1% |

## Cómo leerlo

Compara cada regla contra el **baseline** (sostener a vencimiento):
- Si una regla sube la **media**, la gestión agrega expectativa → vale cablearla.
- Mira también **peor**: es la peor operación del conjunto. Un stop debería mejorarla mucho;
  si no la mejora, el stop no está funcionando como creemos.
- Cuidado con el espejismo: tomar ganancia temprano **sube el win%** casi siempre, pero puede
  **bajar la media** (cierras ganadores chicos y dejas correr los perdedores). La media manda.

## Caveats
- Granularidad DIARIA: los gatillos se evalúan al CIERRE de cada día → en vivo saltarían antes
  (y a veces peor, por gaps de apertura).
- Valor del spread modelado con Black-Scholes e **IV constante** = la vol realizada de entrada.
  No modela expansión de IV, que es justo lo que agranda las pérdidas en la vida real →
  **las pérdidas aquí están probablemente SUBESTIMADAS**.
- Sin comisiones ni slippage en las salidas anticipadas (cada cierre extra tiene su costo real).

