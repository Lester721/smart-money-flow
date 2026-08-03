# Backtest de la WHEEL (vender puts cash-secured)

**Meta:** cobrar prima SIN ser asignado. La asignación se MIDE como riesgo. Precios con Black-Scholes (IV≈vol realizada 20d). Ventana de flujo ~365d.
**Días-señal:** 81. **Filtro EVA** = días de flujo alcista + convicción Top⅓ (umbral 75).
> Caveats: 0DTE aproximado con barras diarias (≈1 día). La pata de calls cubiertas (recuperación tras asignación) NO se modela aún. Sin comisiones/slippage en v1.

## Delta 0.10-0.20 (conserv.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 1d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 3d | win 81% · media -0.2% · asig 25% · anual -22.9% (n=77) | win 75% · media -0.2% · asig 31% · anual -28.7% (n=16) |
| 5d | win 79% · media -0.3% · asig 23% · anual -19.7% (n=77) | win 75% · media -0.3% · asig 25% · anual -23.5% (n=16) |
| 10d | win 68% · media -1% · asig 34% · anual -37.7% (n=71) | win 67% · media -0.6% · asig 33% · anual -20.8% (n=15) |
| 15d | win 74% · media -1% · asig 30% · anual -24.7% (n=66) | win 83% · media 0.3% · asig 25% · anual 6.2% (n=12) |
| 30d | win 76% · media -0.8% · asig 24% · anual -9.3% (n=51) | win 89% · media 0.4% · asig 11% · anual 4.7% (n=9) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 1d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 3d | win 84% · media -0.2% · asig 21% · anual 7.7% (n=77) | win 75% · media -0.3% · asig 31% · anual -6.5% (n=16) |
| 5d | win 86% · media -0.1% · asig 14% · anual 25.4% (n=77) | win 81% · media -0.1% · asig 19% · anual 31.7% (n=16) |
| 10d | win 80% · media -0.5% · asig 20% · anual 20.3% (n=71) | win 73% · media -0.6% · asig 27% · anual 27.6% (n=15) |
| 15d | win 88% · media -0.4% · asig 14% · anual 32.3% (n=66) | win 83% · media 0.1% · asig 25% · anual 54.9% (n=12) |
| 30d | win 88% · media -0.1% · asig 12% · anual 35.2% (n=51) | win 89% · media 0.1% · asig 11% · anual 54.6% (n=9) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 1d | win 84% · media -0.1% · asig 17% · anual -18.5% (n=81) | win 88% · media 0.1% · asig 19% · anual 44% (n=16) |
| 3d | win 83% · media -0.2% · asig 22% · anual 3.9% (n=77) | win 75% · media -0.3% · asig 31% · anual -6.6% (n=16) |
| 5d | win 82% · media -0.2% · asig 18% · anual 13.1% (n=77) | win 75% · media -0.4% · asig 25% · anual 7.3% (n=16) |
| 10d | win 75% · media -0.8% · asig 25% · anual -1.1% (n=71) | win 67% · media -0.6% · asig 33% · anual 13.6% (n=15) |
| 15d | win 83% · media -0.6% · asig 18% · anual 15.9% (n=66) | win 83% · media 0.2% · asig 25% · anual 50.6% (n=12) |
| 30d | win 88% · media 0% · asig 12% · anual 29.2% (n=51) | win 89% · media 0.2% · asig 11% · anual 53.2% (n=9) |

## Delta 0.20-0.30 (balanc.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 1d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 3d | win 73% · media -0.2% · asig 32% · anual -28.4% (n=77) | win 69% · media -0.4% · asig 31% · anual -45.9% (n=16) |
| 5d | win 74% · media -0.3% · asig 30% · anual -23.4% (n=77) | win 75% · media -0.4% · asig 31% · anual -32% (n=16) |
| 10d | win 62% · media -1.3% · asig 39% · anual -47% (n=71) | win 60% · media -1% · asig 40% · anual -35.3% (n=15) |
| 15d | win 68% · media -1.2% · asig 38% · anual -28.3% (n=66) | win 75% · media 0.2% · asig 33% · anual 3.9% (n=12) |
| 30d | win 67% · media -0.9% · asig 37% · anual -10.7% (n=51) | win 67% · media 0.1% · asig 33% · anual 1.2% (n=9) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 1d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 3d | win 77% · media -0.2% · asig 27% · anual 17.7% (n=77) | win 69% · media -0.4% · asig 31% · anual -8.2% (n=16) |
| 5d | win 79% · media -0.3% · asig 22% · anual 36.6% (n=77) | win 75% · media -0.6% · asig 31% · anual 19% (n=16) |
| 10d | win 79% · media -0.6% · asig 21% · anual 44% (n=71) | win 67% · media -0.8% · asig 33% · anual 53% (n=15) |
| 15d | win 86% · media -0.3% · asig 17% · anual 60.4% (n=66) | win 75% · media -0.1% · asig 25% · anual 92.2% (n=12) |
| 30d | win 86% · media 0% · asig 14% · anual 59.2% (n=51) | win 89% · media 0.2% · asig 11% · anual 97.2% (n=9) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 1d | win 77% · media -0.1% · asig 27% · anual -21.6% (n=81) | win 75% · media 0.1% · asig 38% · anual 22.4% (n=16) |
| 3d | win 77% · media -0.2% · asig 27% · anual 14.8% (n=77) | win 69% · media -0.4% · asig 31% · anual -10.9% (n=16) |
| 5d | win 78% · media -0.2% · asig 23% · anual 28.8% (n=77) | win 75% · media -0.5% · asig 31% · anual 18.1% (n=16) |
| 10d | win 70% · media -1.1% · asig 30% · anual 0.6% (n=71) | win 60% · media -1% · asig 40% · anual 20% (n=15) |
| 15d | win 79% · media -0.8% · asig 24% · anual 31.1% (n=66) | win 75% · media 0% · asig 25% · anual 83.6% (n=12) |
| 30d | win 84% · media 0.1% · asig 18% · anual 48.5% (n=51) | win 89% · media 0.5% · asig 11% · anual 91.2% (n=9) |

## Delta 0.30-0.40 (agres.)

### Gestión: vencimiento

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 1d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 3d | win 66% · media -0.3% · asig 44% · anual -32.2% (n=77) | win 69% · media -0.4% · asig 50% · anual -48.4% (n=16) |
| 5d | win 70% · media -0.4% · asig 45% · anual -29.1% (n=77) | win 69% · media -0.6% · asig 50% · anual -41.2% (n=16) |
| 10d | win 59% · media -1.4% · asig 49% · anual -52% (n=71) | win 60% · media -1.1% · asig 40% · anual -40.1% (n=15) |
| 15d | win 62% · media -1.2% · asig 47% · anual -29.7% (n=66) | win 67% · media 0.1% · asig 50% · anual 3.5% (n=12) |
| 30d | win 63% · media -1.1% · asig 53% · anual -13.7% (n=51) | win 67% · media -0.7% · asig 67% · anual -8.1% (n=9) |

### Gestión: 50%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 1d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 3d | win 71% · media -0.2% · asig 34% · anual 34.8% (n=77) | win 69% · media -0.5% · asig 38% · anual 3.3% (n=16) |
| 5d | win 77% · media -0.3% · asig 30% · anual 57.2% (n=77) | win 69% · media -0.6% · asig 38% · anual 39% (n=16) |
| 10d | win 76% · media -0.8% · asig 28% · anual 55.5% (n=71) | win 60% · media -1.3% · asig 40% · anual 50.1% (n=15) |
| 15d | win 80% · media -0.6% · asig 21% · anual 70.6% (n=66) | win 75% · media -0.2% · asig 25% · anual 130.6% (n=12) |
| 30d | win 82% · media 0.1% · asig 20% · anual 81.7% (n=51) | win 78% · media -0.3% · asig 33% · anual 131.5% (n=9) |

### Gestión: 70%

| DTE | MECÁNICO (todos) | FILTRO EVA (alcista+conv) |
|---|---|---|
| 0d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 1d | win 69% · media -0.1% · asig 35% · anual -20.9% (n=81) | win 56% · media -0.1% · asig 56% · anual -27% (n=16) |
| 3d | win 71% · media -0.2% · asig 36% · anual 28.1% (n=77) | win 69% · media -0.4% · asig 44% · anual 0.5% (n=16) |
| 5d | win 73% · media -0.3% · asig 39% · anual 30.9% (n=77) | win 69% · media -0.6% · asig 44% · anual 19.1% (n=16) |
| 10d | win 70% · media -1.1% · asig 34% · anual 16.3% (n=71) | win 60% · media -1.2% · asig 40% · anual 41% (n=15) |
| 15d | win 73% · media -0.8% · asig 30% · anual 41.7% (n=66) | win 75% · media 0.1% · asig 25% · anual 121.8% (n=12) |
| 30d | win 76% · media 0.1% · asig 25% · anual 64.2% (n=51) | win 78% · media 0% · asig 33% · anual 127.9% (n=9) |

## Cómo leerlo
- **win%** = % de trades con retorno positivo (te quedaste prima). **asig%** = con qué frecuencia terminaste ASIGNADO (lo que queremos EVITAR).
- **media** = retorno medio sobre el colateral por trade. **anual** = ese retorno llevado a un año (ojo: infla los DTE cortos).
- Candidata buena = **win alto + asig bajo + media positiva**. Si el FILTRO EVA baja la asignación y sube la media vs MECÁNICO → el flujo de EVA aporta.
