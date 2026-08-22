# Noche del 2026-08-10 — la venta de puts, medida con cotizaciones reales

Todo lo de aquí usa **bid/ask real de ThetaData**, comisiones de Robinhood ($0,03), strikes y
vencimientos listados, y filtro de cotización rota (bid>0, ask>0, horquilla relativa < 50%).
Ninguna prima está modelada con Black-Scholes: BS solo se usa **al revés**, para invertir la IV
desde el precio real y así poder etiquetar la delta.

## Lo que hay que leer primero

**El coste del bid/ask es un porcentaje de la PRIMA, no del nominal.** (`semanal.mjs`, primera
tabla). La horquilla apenas crece con la distancia al dinero, pero la prima se hunde 23 veces.
Eso explica de una vez por qué murieron el credit spread, el 0DTE, el iron condor y los barridos
de distancia: todos vendían lejos, donde el peaje se come el billete.

## Los datos YA ESTÁN BAJADOS

`web/scripts/cache-theta/noche-2026-08-10/` — 1,2 GB, ignorado por git. **No hay que volver a
bajar nada.** Cualquier script de aquí funciona pasándole esa ruta como `<scratch>`:

```bash
node semanal.mjs "../cache-theta/noche-2026-08-10"
```

| carpeta | qué es |
|---|---|
| `theta-hood/` | cadenas completas de puts: HOOD, PLTR, COIN, SOFI, MARA, RBLX, DKNG (1,1 GB) |
| `theta-sem/` | QQQ y SPY, cada viernes, la expiración siguiente (EOD) |
| `theta-intra/` | QQQ, cadena cada 30 min del viernes de entrada |
| `theta-griegas/` | precio del QQQ cada 30 min — **el bueno**, foto del mismo instante que el quote |
| `theta-semana/` | QQQ, los 5 días de cada semana (para probar stops) |
| `theta-venc/` | QQQ, la cadena del propio día de vencimiento (para valorar la recompra) |
| `theta-idx/` | SPY/QQQ/IWM mensuales al dinero (índice PUT de CBOE) |
| `series/` | los JSON de precios diarios y las operaciones ya calculadas |

## Cómo se bajó (si hiciera falta rehacerlo)

```bash
# 0. arrancar el Terminal (ver §0 de CLAUDE.md)
node bajar-hood.mjs    <scratch> HOOD 2021-08     # cadena completa de un ticker (91 MB/5 años)
node bajar-indice.mjs  <scratch> SPY              # solo el día de rolo mensual (~80 peticiones)
node bajar-semanal.mjs <scratch> QQQ              # cada viernes, la expiración siguiente
node bajar-intradia.mjs <scratch>                 # cadena cada 30 min del viernes
node bajar-spot-griegas.mjs <scratch>             # precio intradía SIN el look-ahead
node bajar-semana-completa.mjs <scratch>          # los 5 días, para los stops

node semanal.mjs   <scratch>   # LA TABLA: horquilla vs prima, y semanal vs mensual al dinero
node put-indice.mjs <scratch>  # el índice PUT de CBOE replicado, con intereses por paridad
node auditar.mjs   <scratch>   # rompe la cifra antes de reportarla
node robusto.mjs   <scratch>   # partición 2020-2022 / 2023-2026 y aritmética del apalancamiento
```

## Autopsia de las operaciones reales de Lester en HOOD

```bash
node autopsia.mjs  <scratch>   # reparto del P&L por pieza
node tus-puts.mjs  <scratch>   # sus 101 puts sostenidas a vencimiento (contrafactual exacto)
node timing.mjs    <scratch>   # ¿elegía el día? (sí: 4 rasgos significativos)
```

## Lo que se descartó esta noche

- `generaliza.mjs` — decía que 21 de 21 tickers tenían margen. **Está mal y se deja como aviso**:
  aplicaba la prima extra supuesta DOS veces (para elegir el strike y para valorarlo), lo que
  infla el resultado. Con precios reales (`multi-real.mjs`) la misma regla da 2,2%/año sobre
  1.916 operaciones. Cualquier backtest que elija el strike con una IV supuesta tiene este sesgo.
- `regimen.mjs` — los filtros de régimen (SPY o el ticker sobre su media de 200) **empeoran**.
  El invertido va marginalmente mejor, que es la firma del ruido.
- El objetivo de beneficio (recomprar al 25/50/75%) empeora en los 7 tickers. Tercera vez.

## El resultado

`QQQ semanal, put un 3% por debajo, sostenida a vencimiento, colateral en efectivo`:
**11,3%/año, 14% de caída máxima, 90% de acierto, 316 semanas.**
2020-2022 (COVID + oso) → 11,1%. 2023-2026 (toro) → 11,5%. Comprar QQQ → 20,0% con 36% de caída.
