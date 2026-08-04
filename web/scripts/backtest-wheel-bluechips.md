# Backtest de la WHEEL (vender puts cash-secured)

**Meta:** cobrar prima SIN ser asignado. La asignación se MIDE como riesgo. Precios con Black-Scholes (IV≈vol realizada 20d). Ventana de flujo ~365d.
**Días-señal:** 20. **Filtro EVA** = días de flujo alcista + convicción Top⅓ (umbral 74).
> Caveats: 0DTE aproximado con barras diarias (≈1 día). La pata de calls cubiertas (recuperación tras asignación) NO se modela aún. Sin comisiones/slippage en v1.

## Delta 0.10-0.20 (conserv.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 1d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 3d | win 94% · media 0.1% · asig 6% · anual 13.9% (n=18) | win 100% · media 0.2% · asig 0% · anual 26.8% (n=4) |
| 5d | win 82% · media 0.1% · asig 18% · anual 10.2% (n=17) | win 100% · media 0.3% · asig 0% · anual 20.2% (n=4) |
| 10d | win 100% · media 0.4% · asig 0% · anual 13.5% (n=13) | win 100% · media 0.4% · asig 0% · anual 14.6% (n=4) |
| 15d | win 100% · media 0.4% · asig 0% · anual 9.7% (n=12) | win 100% · media 0.5% · asig 0% · anual 12.2% (n=4) |
| 30d | win 89% · media 0.4% · asig 11% · anual 4.7% (n=9) | win 100% · media 0.9% · asig 0% · anual 10.6% (n=3) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 1d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 3d | win 94% · media 0.1% · asig 6% · anual 29.8% (n=18) | win 100% · media 0.2% · asig 0% · anual 49.2% (n=4) |
| 5d | win 100% · media 0.2% · asig 0% · anual 35.5% (n=17) | win 100% · media 0.2% · asig 0% · anual 45.3% (n=4) |
| 10d | win 100% · media 0.3% · asig 0% · anual 44.6% (n=13) | win 100% · media 0.3% · asig 0% · anual 44% (n=4) |
| 15d | win 100% · media 0.3% · asig 0% · anual 35.4% (n=12) | win 100% · media 0.3% · asig 0% · anual 46% (n=4) |
| 30d | win 100% · media 0.4% · asig 0% · anual 43.7% (n=9) | win 100% · media 0.5% · asig 0% · anual 67.6% (n=3) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 1d | win 80% · media 0% · asig 20% · anual -6.5% (n=20) | win 75% · media 0% · asig 25% · anual -9.7% (n=4) |
| 3d | win 94% · media 0.1% · asig 6% · anual 27.9% (n=18) | win 100% · media 0.2% · asig 0% · anual 49.2% (n=4) |
| 5d | win 100% · media 0.2% · asig 0% · anual 32.6% (n=17) | win 100% · media 0.3% · asig 0% · anual 37.8% (n=4) |
| 10d | win 100% · media 0.3% · asig 0% · anual 38.2% (n=13) | win 100% · media 0.3% · asig 0% · anual 44.2% (n=4) |
| 15d | win 100% · media 0.3% · asig 0% · anual 29.7% (n=12) | win 100% · media 0.4% · asig 0% · anual 45% (n=4) |
| 30d | win 100% · media 0.5% · asig 0% · anual 25.3% (n=9) | win 100% · media 0.7% · asig 0% · anual 24.4% (n=3) |

## Delta 0.20-0.30 (balanc.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 3d | win 83% · media 0.2% · asig 17% · anual 25.4% (n=18) | win 100% · media 0.4% · asig 0% · anual 49.4% (n=4) |
| 5d | win 82% · media 0.2% · asig 29% · anual 14.9% (n=17) | win 100% · media 0.5% · asig 0% · anual 37.6% (n=4) |
| 10d | win 85% · media 0.6% · asig 38% · anual 20.5% (n=13) | win 50% · media 0.4% · asig 75% · anual 13.4% (n=4) |
| 15d | win 100% · media 0.8% · asig 0% · anual 18.3% (n=12) | win 100% · media 1% · asig 0% · anual 23.1% (n=4) |
| 30d | win 78% · media 0.3% · asig 22% · anual 4.1% (n=9) | win 67% · media 0.3% · asig 33% · anual 3.7% (n=3) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 3d | win 89% · media 0.2% · asig 11% · anual 53.7% (n=18) | win 100% · media 0.3% · asig 0% · anual 81.9% (n=4) |
| 5d | win 100% · media 0.3% · asig 6% · anual 62.1% (n=17) | win 100% · media 0.4% · asig 0% · anual 73.8% (n=4) |
| 10d | win 92% · media 0.5% · asig 8% · anual 70.2% (n=13) | win 75% · media 0.5% · asig 25% · anual 71% (n=4) |
| 15d | win 100% · media 0.5% · asig 0% · anual 58.4% (n=12) | win 100% · media 0.6% · asig 0% · anual 77.8% (n=4) |
| 30d | win 100% · media 0.7% · asig 0% · anual 72.5% (n=9) | win 100% · media 0.9% · asig 0% · anual 112.1% (n=3) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 0.1% (n=20) | win 75% · media 0% · asig 25% · anual -6.4% (n=4) |
| 3d | win 89% · media 0.2% · asig 11% · anual 46.1% (n=18) | win 100% · media 0.4% · asig 0% · anual 62.5% (n=4) |
| 5d | win 100% · media 0.4% · asig 6% · anual 54.9% (n=17) | win 100% · media 0.5% · asig 0% · anual 66.3% (n=4) |
| 10d | win 92% · media 0.6% · asig 8% · anual 62.6% (n=13) | win 75% · media 0.5% · asig 25% · anual 70.5% (n=4) |
| 15d | win 100% · media 0.6% · asig 0% · anual 51.8% (n=12) | win 100% · media 0.7% · asig 0% · anual 77.4% (n=4) |
| 30d | win 89% · media 0.6% · asig 11% · anual 29.1% (n=9) | win 67% · media 0.1% · asig 33% · anual 8.1% (n=3) |

## Delta 0.30-0.40 (agres.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 3d | win 78% · media 0.3% · asig 39% · anual 38% (n=18) | win 75% · media 0.5% · asig 50% · anual 64.8% (n=4) |
| 5d | win 65% · media 0.2% · asig 47% · anual 14.2% (n=17) | win 75% · media 0.6% · asig 50% · anual 42% (n=4) |
| 10d | win 69% · media 0.6% · asig 38% · anual 20.7% (n=13) | win 25% · media 0.2% · asig 75% · anual 6.4% (n=4) |
| 15d | win 100% · media 1% · asig 25% · anual 25.1% (n=12) | win 100% · media 1.3% · asig 25% · anual 32.5% (n=4) |
| 30d | win 78% · media 0.4% · asig 22% · anual 4.7% (n=9) | win 67% · media -0.4% · asig 33% · anual -4.6% (n=3) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 3d | win 83% · media 0.3% · asig 22% · anual 76% (n=18) | win 75% · media 0.3% · asig 50% · anual 101.9% (n=4) |
| 5d | win 88% · media 0.4% · asig 18% · anual 79.8% (n=17) | win 75% · media 0.5% · asig 50% · anual 85.2% (n=4) |
| 10d | win 92% · media 0.6% · asig 8% · anual 95.5% (n=13) | win 75% · media 0.6% · asig 25% · anual 97.7% (n=4) |
| 15d | win 100% · media 0.8% · asig 8% · anual 72.9% (n=12) | win 100% · media 0.9% · asig 25% · anual 107.5% (n=4) |
| 30d | win 100% · media 1.1% · asig 0% · anual 92% (n=9) | win 100% · media 1.4% · asig 0% · anual 123.6% (n=3) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 1d | win 70% · media 0% · asig 30% · anual 14.1% (n=20) | win 75% · media 0.1% · asig 25% · anual 22.3% (n=4) |
| 3d | win 83% · media 0.3% · asig 28% · anual 67.9% (n=18) | win 75% · media 0.5% · asig 50% · anual 84.1% (n=4) |
| 5d | win 82% · media 0.4% · asig 29% · anual 67.7% (n=17) | win 75% · media 0.5% · asig 50% · anual 85.2% (n=4) |
| 10d | win 77% · media 0.6% · asig 23% · anual 73.9% (n=13) | win 25% · media 0% · asig 75% · anual 73.5% (n=4) |
| 15d | win 100% · media 0.9% · asig 17% · anual 65.1% (n=12) | win 100% · media 1.1% · asig 25% · anual 88.7% (n=4) |
| 30d | win 89% · media 0.6% · asig 11% · anual 25.7% (n=9) | win 67% · media -0.6% · asig 33% · anual 0.1% (n=3) |

## Cómo leerlo
- **win%** = % de trades con retorno positivo (te quedaste prima). **asig%** = con qué frecuencia terminaste ASIGNADO (lo que queremos EVITAR).
- **media** = retorno medio sobre el colateral por trade. **anual** = ese retorno llevado a un año (ojo: infla los DTE cortos).
- Candidata buena = **win alto + asig bajo + media positiva**. Si el FILTRO EVA baja la asignación y sube la media vs MECÁNICO → el flujo de EVA aporta.
