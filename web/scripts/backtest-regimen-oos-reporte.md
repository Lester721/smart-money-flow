# ¿La regla de RÉGIMEN aguanta fuera de muestra?

**Muestra:** 1540 señales · 8 tickers · clima por vol de SPY (**Tranquilo** ≤16% · **Normal** 16-23% · **Volátil** >23%).

**La pregunta:** el diagnóstico mostró que vender prima rinde mejor en clima volátil. Pero esa
regla se propuso DESPUÉS de ver la tabla — que es donde nace el sobreajuste. Aquí la partimos
en dos mitades por fecha: si el patrón es real, debe aparecer en AMBAS.

## Credit spread 5d @1σ — Top⅓ EVA

| Clima | Todo el período | Mitad VIEJA | Mitad NUEVA | ¿Aguanta? |
|---|---|---|---|---|
| Tranquilo | -0.1% (win 86%, n=153) | -0.1% (win 86%, n=153) | — | ⚠ muestra chica |
| Normal | -2.6% (win 84%, n=155) | -1.3% (win 85%, n=86) | -4.2% (win 83%, n=69) | ✗ se voltea |
| Volátil | +4.3% (win 91%, n=204) | -0.8% (win 82%, n=17) | +4.8% (win 91%, n=187) | ✗ se voltea |

**¿Vale condicionar?** Operar SIEMPRE: +0.9% (win 87%, n=512) · Operar SOLO en volátil: +4.3% (win 91%, n=204)

## Credit spread 30d @1σ — Top⅓ EVA

| Clima | Todo el período | Mitad VIEJA | Mitad NUEVA | ¿Aguanta? |
|---|---|---|---|---|
| Tranquilo | -2.7% (win 82%, n=152) | -2.7% (win 82%, n=152) | — | ⚠ muestra chica |
| Normal | -7.5% (win 76%, n=155) | -3.6% (win 79%, n=86) | -12.5% (win 72%, n=69) | ✗ se voltea |
| Volátil | +7.3% (win 93%, n=204) | +8.6% (win 94%, n=17) | +7.2% (win 93%, n=187) | ✅ sí |

**¿Vale condicionar?** Operar SIEMPRE: -0.2% (win 85%, n=511) · Operar SOLO en volátil: +7.3% (win 93%, n=204)

## Credit spread 60d @1σ — Top⅓ EVA

| Clima | Todo el período | Mitad VIEJA | Mitad NUEVA | ¿Aguanta? |
|---|---|---|---|---|
| Tranquilo | 0% (win 87%, n=152) | 0% (win 87%, n=152) | — | ⚠ muestra chica |
| Normal | -3.1% (win 83%, n=155) | +2.2% (win 91%, n=86) | -9.7% (win 72%, n=69) | ✗ se voltea |
| Volátil | +8.7% (win 97%, n=204) | +4.5% (win 94%, n=17) | +9.1% (win 97%, n=187) | ✅ sí |

**¿Vale condicionar?** Operar SIEMPRE: +2.5% (win 89%, n=511) · Operar SOLO en volátil: +8.7% (win 97%, n=204)

## Credit spread 90d @1σ — Top⅓ EVA

| Clima | Todo el período | Mitad VIEJA | Mitad NUEVA | ¿Aguanta? |
|---|---|---|---|---|
| Tranquilo | +0.2% (win 86%, n=152) | +0.2% (win 86%, n=152) | — | ⚠ muestra chica |
| Normal | +4.4% (win 91%, n=155) | +7.2% (win 95%, n=86) | +1% (win 86%, n=69) | ✅ sí |
| Volátil | +8.1% (win 96%, n=204) | +7.5% (win 94%, n=17) | +8.2% (win 96%, n=187) | ✅ sí |

**¿Vale condicionar?** Operar SIEMPRE: +4.6% (win 92%, n=511) · Operar SOLO en volátil: +8.1% (win 96%, n=204)

## Cómo leerlo

- **✅ sí** = positivo en las DOS mitades → el patrón sobrevive fuera de muestra.
- **✗ se voltea** = ganó en una mitad y perdió en la otra → fue ruido de mirar la tabla completa.
- **⚠ muestra chica** = menos de 15 casos en alguna mitad; ni confirma ni descarta.
- Y aunque un clima aguante, la regla solo vale la pena si **operar SOLO en ese clima supera a operar siempre**.
  Filtrar reduce el número de operaciones: si el retorno sube poco, quizá no compense la mitad de oportunidades.

## Caveats
- Terciles de clima calculados sobre ESTA muestra: 'volátil' aquí es relativo al período, no absoluto.
- Sin gestión ni costos (el efecto del régimen se mide en bruto).

