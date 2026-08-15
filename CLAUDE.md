# CLAUDE.md — Agente Tito Metralleta

Guía para Claude Code al trabajar en este proyecto.

## Qué es este proyecto

**Agente Tito Metralleta** es un sistema **multi-agente de análisis de flujo de opciones** (options flow). Su propósito es identificar **actividad inusual** en el mercado de opciones —actual e histórica— e interpretarla para dar contexto operativo, incluyendo señales de soporte/resistencia, "muros", flujo direccional vs. cobertura, y noticias relevantes del subyacente.

**Estado actual:** en construcción. La documentación del agente está completa y existe un primer
incremento de la **web interactiva** (`web/`) que lee la option chain desde Massive y muestra
Open Interest, Open Premium y Valor Nocional con pasos de carga en vivo (cubre Tareas 1, 2 y 5).

## Estructura

```
Agente Tito Metralleta/
├── CLAUDE.md                        # Este archivo
├── Agente Principal/
│   ├── Proceso Principal.pdf        # Fuente original (Apple Pages/PDF)
│   └── Proceso Principal.md         # Especificación del agente de Opciones (7 tareas)
├── Intrucciones Referencias.md      # Advertencia de liquidez / GEX
├── Intrucciones Referencias.pages   # Fuente original
├── RSS Feed.md                      # Fuentes de noticias a monitorear
├── RSS Feed.pages                   # Fuente original
├── Sub Agentes/                     # (vacío — agentes secundarios por definir)
└── web/                             # App Next.js (lector interactivo) — ver web/SPEC.md
```

## App web (`web/`)

- **Diseño (jul 2026):** tema claro estilo "Options AI Dashboard" importado de Claude Design (proyecto `0017fa5c…`, `Options AI Dashboard.dc.html`). Fuente **Space Grotesk** (next/font). Layout: `HeaderBar` sticky (logo + pills de tickers + búsqueda + precio) → Sentiment/Prediction → Activity/MoneyFlow → **PRO Strike Walls** (oscuro) → TradesFeed → `<details>` "Detalle de sub-agentes" con TODOS los paneles de categorías (esas tablas/promedios alimentan Prediction Pro — no eliminarlas). PredictionCard y la pestaña Accuracy están en estado "próximamente" hasta que estén los 6 sub-agentes.

- **Panel de riesgo + screener de ideas (`/ideas`, jul 2026):** responde "¿qué puedo tradear hoy y cuánto puedo poner?". Escanea **todo el mercado** (no un ticker): `fetchMarketFlow` en `lib/marketsnack.ts` es `fetchFlow` sin `filter[symbol][]` — ambos comparten el cuerpo de paginación `paginate()`. Ruta SSE `app/api/ideas/route.ts` → `classifyFlow` + capa 1 + historial; página `app/ideas/page.tsx`, componentes `RiskProfileCard.tsx` e `IdeasTable.tsx` (dos densidades con el toggle Estudiante/Pro, que se persiste en `tito.view`).
  - **Cascada de dos capas** en `lib/risk.ts` (PURO, tests en `risk.test.ts`): (1) `passesQualityFilter` descarta lotería (`thetaPctDaily > 5%`, la banda de `thetaScore`), vencidos y `dte < 7`; `isTradeableIdea` añade el umbral `UNUSUAL_TRADE_THRESHOLD`. (2) `sizeFlow` devuelve el **techo de contratos** = `min(por prima, por quema de theta)` y reporta cuál frenó.
  - **Por qué el theta tiene presupuesto propio (`THETA_BUDGET_PCT = 5`) y no comparte el del slider:** la quema se topa en el costo del contrato (una opción larga no puede perder más que su prima), así que `presupuesto/quema ≥ presupuesto/costo` **siempre** — con un solo presupuesto el `min` elegiría la prima el 100% de las veces y la capa de theta sería código muerto. Con presupuesto propio el theta frena de verdad en cuanto la tolerancia pasa del 5%.
  - **El saldo nunca llega al servidor:** el perfil vive en `localStorage` (`tito.risk.*`) y `sizeFlow` corre en el cliente. La ruta solo devuelve griegos.
  - **Historial** (la evidencia de "el flow inusual después pasa"): reusa `validationScore` de `lib/validation.ts` solo para tickers que ya tienen `data/trades/{TICKER}.json`; los demás salen "sin historial" sin gastar llamada a Massive. Cada escaneo hace `saveTrades`, así que la cobertura crece sola.
  - **Salvaguarda:** `lowLiquidity` → `blocked`, sin número de contratos. El texto es siempre un **techo** ("tu límite es N"), nunca "compra N". Limitación declarada en la UI: el sizing usa el precio de ejecución del flow, no la quote viva (el feed no la da).
- **Watchlist propio + sincronización con broker (jul 2026):** `lib/watchlist.ts` (PURO, tests en `watchlist.test.ts`) + `lib/watchlistLocal.ts` (localStorage) + `lib/outboxStore.ts` (fs en `data/outbox.json`) + `app/api/watchlist/route.ts` + `app/components/WatchlistCard.tsx`. Marcas una idea con ⭐ en `/ideas` y se guarda el **contrato completo** con la **foto del momento**: spot y precio de entrada, y tu sizing (`maxContracts`, `binding`, cuenta y tolerancia de entonces). Re-marcar NO pisa la foto original — es lo que da valor al histórico. Spec: [web/docs/superpowers/specs/2026-07-24-watchlist-broker-sync-design.md](web/docs/superpowers/specs/2026-07-24-watchlist-broker-sync-design.md).
  - **El watchlist vive en el navegador, no en el servidor** (`tito.watchlist`), por la misma regla que el perfil de riesgo: la entrada guarda tu saldo y tu sizing. Con el archivo único de antes toda la clase compartía un watchlist en un despliegue compartido. `watchlistStore.ts` queda **solo como legado de lectura** para la importación única del viejo `data/watchlist.json`; ya nadie escribe ahí. Contrapartida asumida: no cruza dispositivos.
  - **Los brokers son intercambiables** (`BROKERS` + `BrokerAdapter`): cada uno declara su `kind` (`mcp` | `link` | `copy` | `none`) y su `granularity`. Añadir un broker = añadir una entrada.
  - **Robinhood es el único `mcp`:** MCP oficial (`https://agent.robinhood.com/mcp/trading`, OAuth — no hay que guardar contraseñas), `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading` y luego `/mcp` para autenticar. Su granularidad es **`contracts`**, verificado contra la API real (jul 2026): expone `get_option_watchlist` / `add_option_to_watchlist` sobre una lista de opciones propia (`allowed_object_types: ["option_strategy"]`), separada de la de acciones. Lo que sigue en beta solo-acciones es la **ejecución de órdenes**, no el watchlist — y como **Tito nunca coloca una orden**, no nos limita. Conectarlo da lectura de **todos** los números de cuenta, posiciones e historial de órdenes — no es un permiso menor. Lo único que Robinhood no acepta por API son las **estrategias de varias patas** (spreads): esas siguen solo en su app.
    - **Ningún broker direcciona por símbolo OCC.** Robinhood pide un UUID de instrumento, que solo sale de buscar por subyacente+tipo+strike+vencimiento con `get_option_instruments`. `contractQuery` (en `lib/watchlist.ts`) arma esa búsqueda y **el agente la ejecuta**. El strike va con **4 decimales** (`toFixed(4)`) porque es un filtro exacto sobre cadena: `"20"` no casa con `"20.0000"` y la búsqueda vuelve vacía sin decir por qué. Sin strike o sin vencimiento devuelve `null` en vez de adivinar entre decenas de contratos.
  - **La sincronización la conduce el agente por MCP, no el servidor web.** Al marcar ⭐ con un broker `mcp` se encola en `data/outbox.json` **lo mínimo para identificar el contrato en el broker**, y es `addToOutbox` quien lo recorta según la `granularity`: con `contracts` viajan símbolo/tipo/strike/vencimiento; con `underlying_only`, solo el ticker. Lo que **nunca** cruza el puente navegador→agente son los griegos, tu sizing y tu saldo. La clave de deduplicación (`outboxKey`) es el contrato o el ticker según esa misma granularidad — por eso dos strikes de WULF son dos trabajos en Robinhood y uno solo en Schwab. `pendingOutbox` devuelve los **ítems enteros** (no solo el ticker: el agente necesita strike y vencimiento para resolver el id) y se confirma con `markOutboxSynced`. La cola vieja de solo-tickers se sigue leyendo — los campos del contrato son opcionales a propósito.
  - **Sincronización automática (jul 2026):** `scripts/sync-watchlist.sh` + launchd (`~/Library/LaunchAgents/com.tito.watchlist-sync.plist`, cada 15 min). Marcas ⭐ y entra solo. Spec: [web/docs/superpowers/specs/2026-07-24-sync-automatico-robinhood-design.md](web/docs/superpowers/specs/2026-07-24-sync-automatico-robinhood-design.md).
    - **Por qué launchd y no `CronCreate`:** los trabajos de `CronCreate` son de sesión — mueren al cerrar Claude, caducan a los 7 días y solo disparan con el REPL ocioso. launchd sobrevive a cerrar sesión y a reiniciar.
    - **Por qué NO puede hacerlo el servidor web:** Robinhood **no tiene OAuth público para acciones/opciones** (solo cripto, y sus ToS prohíben el acceso automatizado). El único token lo emitió Robinhood **a Claude**, vive en el keychain, caduca fuera de nuestro control y es **de un solo usuario** — con él en el servidor, el ⭐ de cualquier estudiante escribiría en la cuenta de Víctor. Plaid/SnapTrade hacen OAuth contra Robinhood pero exponen posiciones y órdenes, **no el watchlist**. Consecuencia asumida: **esto es solo para la máquina de Víctor**; los estudiantes se quedan en enlace/copiar.
    - **El shell hace lo determinista y el modelo solo lo que necesita un modelo.** El guion lee la cola, topa a 10, confirma y registra; `claude -p` solo resuelve el contrato → UUID de instrumento, con una lista blanca de **exactamente 3 herramientas** (`get_option_instruments`, `get_option_watchlist`, `add_option_to_watchlist`). Sin Bash y sin `place_option_order`: el proceso es **incapaz** de colocar una orden. **Con la cola vacía no se invoca al modelo** — coste cero en los pases en vacío.
    - **Idempotente:** consulta `get_option_watchlist` antes de añadir, así que si el `POST synced` falla tras haber añadido, el pase siguiente solo marca. **Solo añade, nunca borra** del broker. Bitácora en `data/sync-log.jsonl`.
    - **Estado terminal sin reintentos:** `markOutboxFailed` aparca lo irresoluble (`failedAt`/`failReason`) y `pendingOutbox` lo excluye. Sin contador de intentos a propósito: cuando `contractQuery` da `null` o el broker no encuentra el contrato, ya se sabe que no se resolverá nunca. Los fallos transitorios no marcan nada y se reintentan solos.
    - **Encolar sin strike o sin vencimiento devuelve 400** con granularidad `contracts`. Aceptarlo solo aplazaba el fallo hasta el drenador, donde ya no hay a quién avisar.
    - **Ojo con `removeFromOutbox`:** `outboxKey` vale el símbolo OCC en las filas nuevas y el **ticker** en las viejas, así que filtrar solo por `symbol` dejaba las filas legado **imborrables** (`"WULF270115C00020000" !== "WULF"`) — SPXW y SPY siguieron encoladas tras desmarcarlas. El cliente manda ahora símbolo **y** ticker; la segunda condición exige `!i.symbol` para no arrastrar los strikes hermanos.
  - **Los `link` y los `copy` se decidieron probando las URLs, no suponiendo.** Robinhood/Schwab/Fidelity/Tastytrade tienen página por símbolo. **Webull e IBKR son `copy` a propósito:** Webull exige el prefijo de bolsa (`nasdaq-wulf` responde, `nyse-wulf` da 404) y el feed no trae la bolsa; la página de IBKR responde 200 pero es genérica. Mandar a un estudiante a un 404 es peor que darle el ticker para pegar — `quoteLink` devuelve `null` y la UI enseña "copiar".
  - **Ojo con el estado en `page.tsx`:** el watchlist se lee de `wlRef` (ref siempre fresca), no del estado de React. Marcar una estrella mientras la carga inicial seguía en vuelo escribía sobre un array vacío y borraba lo ya guardado — pasó de verdad con el WULF migrado.
- **Wheel Strategy (`/wheel`, jul 2026):** screener de cash-secured puts que responde "qué put vendo hoy y cuánto efectivo inmoviliza". Universo curado de 40 tickers (`lib/wheelUniverse.ts`), 3 presets (`WHEEL_PRESETS` en `lib/wheel.ts`), score compuesto 0-100 que reusa `findLevels` (soportes), proxy de IV Rank y estimador de earnings (`lib/earnings.ts`). Criterio PURO y testeado en `lib/{blackScholes,wheel,earnings,wheelAfford}.ts`; ruta SSE `app/api/wheel/route.ts` solo orquesta I/O. El saldo vive en `localStorage` y la asequibilidad se calcula en el cliente (`sortByAffordThenScore`), nunca en el servidor. **Ojo:** la banda de IV Rank en `wheel.ts` va INVERTIDA respecto a `ivcontext.ts` — la Wheel vende volatilidad, el resto del agente la compra. Spec: [docs/superpowers/specs/2026-07-24-wheel-strategy-design.md](web/docs/superpowers/specs/2026-07-24-wheel-strategy-design.md).
- **Noticias (Tarea 7):** `lib/news.ts` + `app/api/news/route.ts` + `app/components/NewsCard.tsx`. **Dos capas:** macro (los RSS de [RSS Feed.md](RSS%20Feed.md), cache 15 min) + empresa (`/v2/reference/news?ticker=` de Massive, que trae `insights[].sentiment` por ticker, cache 5 min). Los titulares macro que mencionan a la empresa se promueven a la capa de empresa. **Bandera de contradicción** (`contradictionFlag`) confronta la dirección del flujo contra el sesgo de noticias — **no toca los 100 pts del scorecard**. Tests en `lib/news.test.ts`.
- **Stack:** Next.js 15 (App Router, TS). Correr con el dev server `tito-web` (`.claude/launch.json` a nivel Desktop) o `npm run dev` en `web/` (puerto 3000).
- **Proveedor de datos:** Massive (`api.massive.com`, rebrand de Polygon.io). Endpoints: option chain `GET /v3/snapshot/options/{ticker}` (paginado), detalles empresa `GET /v3/reference/tickers/{ticker}`, snapshot acción `GET /v2/snapshot/locale/us/markets/stocks/tickers/{ticker}`.
- **Vista Estudiante vs Pro (jul 2026):** toggle en `page.tsx` (`view`, default `estudiante`). La vista **Estudiante** es limpia para novatos y NO toca `lib/` (cálculos) — solo re-empaqueta lo ya calculado: `VeredictoCard` (frase llana desde `prediction.summary` + dirección + confianza; muestra "no fiable/no operar" si `prediction.caveat`), selector de horizonte llano (Esta semana/2 semanas/1 mes → 10/20/30), `SimpleChart`, `EscenariosCard` (los **3 targets** bajista/base/alcista con % y prob), `ContextoLinea` (noticias en 1 línea + bandera de contradicción), `NivelesSimples` (lista mínima con `probTouch` por nivel), y `MemoriaCard`. Sin jerga (GEX/gamma/notional viven solo en Pro). La vista **Pro** es el dashboard completo original sin cambios. Spec: [docs/superpowers/specs/2026-07-24-vista-simple-estudiantes-design.md](docs/superpowers/specs/2026-07-24-vista-simple-estudiantes-design.md).
  - **`SimpleChart`:** velas + los **3 escenarios** como líneas que SE MUEVEN (helper `wigglePath`: ruta `predictionPath` + oscilación ∝ σ con un sobre `sin(πf)` que vale 0 al inicio y al target, así ancla ambos extremos y "baila" dentro del cono; `seed` distinto por escenario, determinista). Se dibujan una vez (`stroke-dashoffset`) sobre `PriceChart`. Ruido reducido: solo los **2 soportes + 2 resistencias más cercanos** con fuerza ≥25. El **target base = nivel imán del GEX** (mayor probabilidad×premium) recortado al cono 2σ; por eso en flujo lateral la línea sale casi plana.
  - **Memoria del agente (auto-evaluación):** `lib/predictionStore.ts` (fs en `data/predictions/{TICKER}.json`, dedupe por fecha ET, se acumula hacia adelante) guarda una foto diaria con los 3 targets; `reviewPredictions` (PURA, tests en `predictionStore.test.ts`) la compara días después contra las barras reales: error del base, si tocó el nivel, acierto de dirección, **sesgo** (error medio firmado = si sistemáticamente apunta alto/bajo) y qué escenario acertó. Ruta `app/api/prediction/route.ts` (POST guarda al cargar desde `page.tsx`; GET revisa). Panel `app/components/MemoriaCard.tsx`. Al principio dirá "aún no hay predicciones vencidas" hasta que pase el horizonte.
  - **Auto-corrección por memoria (lazo de control):** `predictPro` acepta `calibration: { biasPct, samples }` y `calibrationShiftPct` (tests en `prediction.test.ts`) corrige el **target base** según el sesgo histórico. Amortiguado y acotado (`CALIBRATION = { minSamples: 5, gain: 0.6, capPct: 3 }`): solo con ≥5 vencidas, corrige el 60% del sesgo, tope ±3% del spot, y se recorta al cono 2σ. El imán crudo sigue anclando la búsqueda de bull/bear (no se arrastra el sesgo a los extremos). Converge: al mejorar, el sesgo baja y la corrección se apaga sola. `page.tsx` lee el sesgo (GET `/api/prediction`) ANTES de fijar el target y **guarda el target ya calibrado** (espera `calibReady`). Chip `🧠 ajustado ±X%` en `VeredictoCard` + nota en el resumen cuando aplica.
- **Panel de empresa:** antes de la tabla se muestra logo + info + stats (Stock Price, market cap, volumen, rango del día, cierre previo, empleados). El logo se sirve por proxy propio `GET /api/logo?ticker=` (la key nunca llega al cliente). La tabla tiene fila TOTAL con la sumatoria (incl. Notional).
- **Estructura / Acumulación y Rapidez (categoría 4 del scorecard):** `lib/structure.ts` → `structureScore` (nocional promedio por strike, dominio direccional calls/puts en los top-5 strikes, % volumen > OI; ver [SCOREDCARD/Acumulacion-Rapidez.md](SCOREDCARD/Acumulacion-Rapidez.md)). Panel en `app/components/StructureCard.tsx`. **Usa la cadena de opciones de Massive**, no el flujo de MarketSnack. Historial de 45 días: `lib/chainStore.ts` guarda una foto por día de mercado en `data/chain/{TICKER}.json` (dedupe por fecha ET) — se acumula hacia adelante porque Massive no expone OI histórico.
- **Confirmación de Precio / Validación de Flows (categoría 6 del scorecard):** `lib/validation.ts` → `validationScore` (backtest: para cada flow guardado mide MFE/MAE y cuántas sesiones tardó el movimiento a favor y en contra; ver [SCOREDCARD/Validacion-Flows.md](SCOREDCARD/Validacion-Flows.md)). Ruta `app/api/validation/route.ts`, panel `app/components/ValidationCard.tsx`. **El PDF no trae tabla de puntos** — las bandas de `validationPoints`/`speedPoints` son una propuesta y están aisladas para cambiarlas de un sitio. Umbral de movimiento **adaptativo** (rango diario típico × 1.5, piso 2%) porque un 2% fijo satura en tickers volátiles. Corre sobre `data/trades/{TICKER}.json`, que se acumula hacia adelante; avisa si no llega a los 60 días que pide el documento.
- **Soportes y resistencias:** `lib/levels.ts` → `findLevels` (puro, tests en `levels.test.ts`). Cruza **dos fuentes independientes**: (1) precio — `findPivots` (swing highs/lows con ventana k) + `clusterPivots` (agrupa por tolerancia %, así $299 y $301 son un solo nivel) con peso por `recencyFactor`; (2) opciones — según la tabla del Proceso Principal **vender calls = resistencia, vender puts = soporte**, así que solo cuentan calls para resistencias y puts para soportes, y solo la ejecución al **bid** (venta) suma como muro. Fuerza 0-100 = toques·frescura + OI + premium de flujo + |GEX| + **bonus de confluencia** cuando coinciden precio y opciones. Los strikes sin rebote previo deben superar el **percentil 70 de OI** para entrar, si no la lista se llena de ruido. Marca niveles `flipped` (era techo y ahora hace de suelo). Panel `app/components/LevelsCard.tsx` y líneas punteadas en `ProWallsCard` para los de fuerza ≥35.
- **Prediction Pro (cierre del sistema):** `lib/prediction.ts` → `predictPro` (puro, tests en `prediction.test.ts`). Junta los 6 sub-agentes + mapa GEX + σ en **tres escenarios**: `base` = nivel imán del heatmap, `bull`/`bear` = el nivel relevante arriba/abajo **excluyendo el base**, con fallback a las bandas de 1σ. Se fuerza el orden estricto **bear < base < bull** y todo se recorta al cono de 2σ. Cada escenario trae precio, %, probabilidad de toque y el porqué. `weightedScore` da el sentiment 0-100 con los pesos del scorecard; `confidenceOf` mezcla nitidez del imán + cobertura de sub-agentes + hit rate del sub-agente 6. Genera un **resumen en lenguaje llano** y avisos (baja liquidez → NO FIABLE; faltan categorías → confianza recortada). Panel `app/components/PredictionCard.tsx` con selector de horizonte **10/20/30 días** y los **top 3 flows** por premium. El horizonte vive en `page.tsx` y lo comparten PredictionCard y ProWallsCard.
- **Gráficas propias en SVG (jul 2026):** `SimpleChart` y `ProWallsCard` YA NO usan TradingView. Motor propio: `lib/chartGeometry.ts` (PURO, tests en `chartGeometry.test.ts`) + `app/components/chart/PriceChart.tsx` (dibujo, un solo `<svg>`) + `ChartCrosshair.tsx` (crosshair + tooltip, sin zoom ni paneo). Antes había **dos sistemas de coordenadas** peleándose —el canvas de la librería y un overlay HTML que cazaba píxeles con `priceToCoordinate`/`priceScale().width()`— y de ahí venían el futuro comprimido y los targets encimados. Tres funciones: `smartDomain` (encuadre que cubre velas + 1σ + targets con peso, y estira al 2σ solo mientras las velas conserven el 45% del alto), `buildScales` (reparto **60% histórico / 40% futuro** con `xNow` explícito; recorta el histórico a las velas que caben con ancho ≥3px), `packLabels` (anti-colisión de los chips en dos barridas; guarda `yAnchor` en el precio real para la guía punteada). La clave del layout es el **gutter derecho de 132px** reservado a los chips — el eje de precio se rotula dentro del área de dibujo. Alturas responsivas por CSS (`clamp`), no números fijos. Bonus: al ser SVG, los screenshots del preview ya no salen negros. Spec: [docs/superpowers/specs/2026-07-24-graficas-propias-svg-design.md](docs/superpowers/specs/2026-07-24-graficas-propias-svg-design.md). **`ChartPanel` y `FlowPriceChart` siguen con `lightweight-charts`**, así que la dependencia se queda.
- **Movimiento esperado y probabilidad por nivel:** `lib/expectedMove.ts` (puro, tests en `expectedMove.test.ts`) — `expectedMove` (σ = S·IV·√(T/365), bandas 1σ/2σ lognormales), `conePoints` (cono que se abre en √t), `probAbove`/`probInBand`/`probTouch` (lognormal sin deriva; el toque usa principio de reflexión ≈2× la de cierre) y `levelProbabilities` (mezcla normalizada de probabilidad de toque × concentración de dinero del GEX → el % de cada banda). `predictionPath` traza la ruta al nodo imán y la **recorta al cono de 2σ**. `ProWallsCard.tsx` ya no dibuja burbujas: pinta **bandas de heatmap con su probabilidad** + cono 1σ/2σ + ruta esperada, todo dentro del SVG propio (ver la viñeta de gráficas propias).
- **GEX Heatmap por strike × vencimiento:** `lib/gexHeatmap.ts` → `gexHeatmap` (celda = GEX neto de un strike en una expiración; gamma Black-Scholes anclada a la gamma real de MarketSnack donde ese strike/vencimiento operó). Panel `app/components/GexHeatmapCard.tsx`: filas = strikes (±18 alrededor del spot), columnas = 8 vencimientos más cercanos, verde γ+ / morado γ−, columna Total por strike, fila del spot resaltada y la malla se auto-centra en el precio actual.
- **Contexto IV (categoría 5 del scorecard):** `lib/ivcontext.ts` → `ivContextScore` (2 parámetros: IV actual con pico en 40-60%, e IV Rank con pico en 16-30%; ver [SCOREDCARD/Contexto-IV.md](SCOREDCARD/Contexto-IV.md)). Panel en `app/components/IvContextCard.tsx`. **La IV sale de MarketSnack** (`implied_volatility`, en decimal → ×100), ponderada por premium. El **IV Rank** usa un proxy de volatilidad realizada del subyacente hasta que `lib/ivStore.ts` acumule 60 fotos diarias en `data/iv/{TICKER}.json` (ventana 365 días), momento en que el rank real lo reemplaza solo. Deriva también el **skew del frente** (evento inminente si > +10 pts) y el régimen (dormida/compresión/normal/expansión/inflada). Tests en `lib/ivcontext.test.ts`.
- **Inusualidad (categoría 3 del scorecard):** `lib/flow.ts` → `unusualityScore` (6 parámetros de griegos: tamaño, delta, theta%, gamma, single/multileg, vencimiento; ver [SCOREDCARD/Inusualidad.md](SCOREDCARD/Inusualidad.md)). Panel en `app/components/UnusualityCard.tsx`. Usa la misma ventana de 30 días que Convicción.
- **Convicción (categoría 2 del scorecard):** `lib/flow.ts` → `convictionScore` (spread, dominancia ask/bid, fuerza de ejecución; ver [SCOREDCARD/Conviccion.md](SCOREDCARD/Conviccion.md)). Panel en `app/components/ConvictionCard.tsx`.
- **Time & Sales (sub-agente Agresividad):** vista `app/flow/` + `app/api/flow/route.ts` (SSE). Fuente de datos = **MarketSnack** (producto propio del usuario), endpoint interno `GET app.marketsnack.com/api/flow_feed?filter[scope]=all&filter[symbol][]=<T>&period=5d` (paginado por `next_page_token`), auth por cookie de sesión en `MARKETSNACK_COOKIE` (.env.local, caduca). Da bid/ask + `side` (ask/bid/mid) + greeks + premium — resuelve la agresividad que Massive no autoriza. Lógica pura en `lib/{marketsnack,flow,occ}.ts` (parseo OCC, clasificación, flags de "interesante": ≥$1M, ≥$100K & |Δ|>.60, above ask/below bid, repetidas 5min, multileg). Tests en `lib/{occ,flow}.test.ts`.
- **Mapa de nodos GEX & predicción (PRO):** `lib/gex.ts` → `gexAnalysis` (puro, tests en `lib/gex.test.ts`). Massive no da gamma/IV, así que la IV se estima de la volatilidad realizada de las barras diarias, la gamma con Black-Scholes por contrato, y se **ancla** a la gamma real de MarketSnack donde el strike operó. GEX por strike = `gamma × OI × 100 × spot² × 0.01` (+call/−put); **concentración** = 0.6·|GEX| + 0.4·premium de trades reales en ese strike. Deriva **nodo principal/imán** (precio objetivo), **zona de inversión gamma** (flip), **régimen** (γ+ revierte / γ− amplifica) y **confianza** (nitidez + scores de Convicción/Estructura). `ProWallsCard.tsx` dibuja las velas y los muros con `PriceChart` (SVG propio) y realimenta la predicción a `PredictionCard.tsx`. Hereda la salvaguarda de liquidez (si es ilíquida → "no fiable"). El GEX se calcula una vez en `page.tsx`.
- **Burbujas de repetición:** `app/components/RepeatBadge.tsx` (`🔁 ×N`) marca los trades repetitivos (`flags.repeated` — mismo strike ≥3× en 5 min) en TradesFeed, ConvictionTransactions y UnusualityCard.
- **Gráfica Top 5 por Notional:** `app/ChartPanel.tsx` usa TradingView **Lightweight Charts** (`lightweight-charts`) para dibujar el candlestick del subyacente (barras de `GET /api/history` → `/v2/aggs/...`) con una price line por cada uno de los 5 contratos de mayor Notional, más leyenda (contrato, vencimiento, OI, Open Premium, Notional). Nota: el canvas de la gráfica sale negro en screenshots del preview (limitación de captura), pero renderiza bien en el navegador real; verificar por análisis de píxeles si hace falta.
- **API key:** en `web/.env.local` como `MASSIVE_API_KEY` (server-only, gitignored). **Nunca** exponerla al cliente ni publicarla.
- **Progreso en vivo:** el route handler `app/api/chain/route.ts` transmite los pasos por SSE; el frontend usa `EventSource`.
- **Cálculos:** en `lib/compute.ts` (funciones puras, con tests en `lib/compute.test.ts`, `npm test`).
- **Limitación del plan actual:** Massive **sí** devuelve `last_quote` (bid/ask) en el Option Chain Snapshot (verificado jul 2026), pero **no** `greeks` ni `implied_volatility`. Open Premium sigue usando `last_trade.price ?? day.close ?? day.vwap` como proxy; el delta de la Wheel se calcula por Black-Scholes (`lib/blackScholes.ts`).
- Detalle completo en [web/SPEC.md](web/SPEC.md).

- **Agente Principal (de Opciones):** primer agente y núcleo del sistema. Su especificación completa está en [Proceso Principal](Agente%20Principal/Proceso%20Principal.md).
- **Sub Agentes:** aún no definidos. La Tarea 4 (Buy Put) menciona "validación de contexto con **otros agentes**", así que el diseño contempla sub-agentes de confirmación (p. ej. contexto macro, técnico o de noticias).

## Responsabilidades del Agente Principal (resumen)

1. **Open Interest** por fecha de vencimiento, ordenado de mayor a menor.
2. **Volumen más alto** por expiración + almacenar **≥5 días** de histórico para detectar patrones recurrentes.
3. **Comparación sectorial:** identificar las 5 líderes del sector y determinar si el flujo es **sectorial o individual** (con etiqueta).
4. **Interpretación de Call/Put** (ver tabla abajo).
5. **Segmentación con fórmulas** (Open Premium, Notional Value).
6. **Evaluación de liquidez** del Option Chain con alertas.
7. **Monitoreo RSS** de noticias.

Detalle completo en [Proceso Principal](Agente%20Principal/Proceso%20Principal.md).

## Reglas de dominio (críticas)

### Interpretación de flujo
| Operación | Señal |
|-----------|-------|
| Buy Call | Direccional (alcista) |
| Sell Call | Resistencia / posible "muro" en órdenes grandes |
| Buy Put | Hedge **o** direccional → **requiere validación de contexto con otros agentes** |
| Sell Put | Soporte del subyacente |

### Fórmulas
```
Open Premium   = Open Interest × Precio del Contrato (Bid)
Notional Value = Open Interest × 100 × Strike        # zonas de relevancia si expira ITM
```

### Liquidez — **regla de seguridad prioritaria**
- Comparar el nocional promedio de 5 días de las **"7 Magníficas"** contra la cadena consultada.
- **Alertar "datos no fiables"** si: disparidad de liquidez **20–40%** vs. líderes, **o** liquidez **< 60%** del promedio.
- **Nunca recomendar operar una opción ilíquida.** Si la cadena es ilíquida, marcarla explícitamente; esto aplica también a la interpretación del **GEX**. Ver [Instrucciones y Referencias](Intrucciones%20Referencias.md).

### Noticias
Monitorear los feeds definidos en [RSS Feed](RSS%20Feed.md) (CNBC + Investing.com) y adjuntar noticias relevantes al panel de resultados.

## LESTER OPERA EN ROBINHOOD — costes y estructuras ejecutables

Antes de escribir un backtest, una estimacion de rentabilidad, o de proponer una estructura:

| | |
|---|---|
| Comision por opciones | **$0** |
| Tasas regulatorias | **~$0,03 por contrato** |

Usar $0,65/contrato (broker tradicional) resta **~2,2 puntos sobre el riesgo** que el NO paga —
suficiente para volver negativa una estrategia positiva. Si un script tiene una constante de
comision, tiene que ser **0,03**.

**Lo que el movil de Robinhood permite:**
- Verticales: **un boton**, se llenan rapido.
- Iron condors: **NO**. Hay que armarlos pata por pata y tardan horas en llenarse, si se llenan.
  Una estrategia que no se puede ejecutar vale cero por bueno que salga el backtest.

Su cuenta es la 829411230; las operaciones reales se leen con `get_pnl_trade_history`.


## SIMBOLOS QUE CAMBIAN DE NOMBRE — usar `simboloEnFecha()` SIEMPRE

META era **FB** hasta el 2022-06-09. Pedir `META` para 2019 devuelve **vacio, sin error**. Ya ha
costado anos de datos **tres veces**: dos por no usar `segmentosPorSimbolo`, y la tercera al
escribir un descargador nuevo desde cero.

**Antes de pedir cualquier dato historico:** `simboloEnFecha(ticker, ymd)` (en `lib/thetadata.ts`).
El fichero de cache se guarda con el nombre ACTUAL; solo la peticion usa el viejo.

**Y al validar cobertura:** un ano que empieza tarde en UN ticker no es "coincide con el cambio de
nombre" — es un fallo que hay que arreglar. La validacion lo detecto las tres veces; lo que fallo
fue leerla y racionalizarla.

## Cómo pedir datos a ThetaData — LEER ANTES DE ESCRIBIR UN DESCARGADOR

Todo lo de aquí está **medido**, no supuesto. Es para no volver a descubrirlo cada vez.

### 0. ARRANCAR EL TERMINAL (Norton rompe el TLS)

```bash
cd "C:\Users\leste\dev\agente-tito-metralleta\web" && \
JAVA_TOOL_OPTIONS="-Djavax.net.ssl.trustStore=C:\\Users\\leste\\dev\\agente-tito-metralleta\\web\\theta-truststore.jks -Djavax.net.ssl.trustStorePassword=changeit" \
java -jar ThetaTerminalv3.jar
```

- Necesita **`web/creds.txt`**: 2 líneas, usuario y contraseña. Lo crea Lester — nunca Claude.
  Está en `.gitignore` (`creds.txt`, `*creds*.txt`); comprobar antes de crearlo si el repo es
  remoto, porque es una **contraseña en claro**.
- **`JAVA_TOOL_OPTIONS`, no `-D`**: el jar es un *bootstrap* que lanza un SEGUNDO JVM, y ese no
  hereda los `-D` de la línea de comandos. Con `-D` a secas falla con
  `PKIX path building failed` en bucle infinito, que parece un problema de red y no lo es.
- Arrancó bien cuando el log dice `Subscriptions: ... Options: STANDARD` y
  `Starting server at: http://0.0.0.0:25503/`.

### 0-bis. FILTRAR POR STRIKE — 180× menos datos

El endpoint de griegas repite `underlying_price` en CADA strike. Si solo se quiere la serie del
subyacente (que es lo que hace falta para valorar con Black-Scholes), pedir **un solo strike**:

| SPY, 1 día, `interval=1m` | |
|---|---|
| sin filtro | **18,5 MB** |
| `&strike=770` | **103 KB** |

Medido el 2026-08-09. Antes de bajar años, preguntarse **qué columna se necesita de verdad** y
filtrar por ahí: la diferencia entre 18 GB y 100 MB es esa línea.

### 1. PARALELIZAR. Es lo que más cambia.
El plan Standard permite **4 peticiones simultáneas** (el Terminal lo imprime al arrancar:
`Max concurrent requests: 4`). Un bucle secuencial usa **una** y desperdicia tres.

| | |
|---|---|
| 1 petición sola | 28,4 s · 8,7 MB · **308 KB/s** |
| 3 en paralelo | ~37 s · 30,5 MB · **824 KB/s** |

Medido sobre el mismo año: SPY 2016 pasó de **2,4 min a 0,6 min**. El cuello NO es el ancho de
banda: es la latencia por petición. Usar el `pMap` de `scripts/bajar-oi-por-expiracion.ts`.

**Cada tarea acumula en su PROPIO objeto y se funden al final.** Escribir todas sobre el mismo
desde tareas concurrentes es una carrera silenciosa: el resultado sale plausible pero
incompleto, que es justo lo que no se detecta mirando el reporte.

### 2. Endpoints masivos, no por contrato
`expiration=*` con rango de fechas trae toda la cadena de una vez. Iterar contrato por contrato
multiplica las peticiones por cien. Los rangos van **troceados a ≤28 días** (ThetaData corta a
un mes).

### 3. Caché por (ticker, AÑO), y leerla del DIRECTORIO
- Interrumpir cuesta el año en curso, no el ticker.
- **Nunca reconstruir el nombre del archivo a partir del rango pedido**: si el rango no coincide
  con el que generó la caché, el nombre cambia y la caché "desaparece" aunque esté entera. Se
  lista el directorio y se filtra por prefijo.
- Un año vacío **no se cachea** (salvo los que están fuera del alcance de la suscripción, que
  siempre vendrán vacíos). Cachear el vacío congela el fallo.

### 4. Las columnas CAMBIAN entre endpoints. Nunca adivinarlas.
| Endpoint | Columna de fecha |
|---|---|
| `option/history/open_interest` | **`timestamp`** |
| `option/history/eod`, `stock/history/eod` | `date` / `created` |

Imprimir la cabecera real la primera vez. Si faltan columnas: **`throw`, no `continue`** — un
`continue` convierte un error de parseo en horas de archivos vacíos sin un solo error.
El CSV viene **entrecomillado**: `"CALL"`, no `CALL`. Hay que quitar las comillas al parsear.

### 5. Símbolos renombrados: usar `segmentosPorSimbolo` de `lib/thetadata.ts`
META era **FB** antes del 2022-06-09. Pedirla por su nombre de hoy devuelve VACÍO para los años
anteriores. Ya pasó **dos veces** (el backtest y la descarga de OI) — **importar el helper, no
reimplementarlo**, que es la única forma de que el arreglo valga en todo el proyecto.

### 6. Límites de la suscripción (a 2026-08)
| Dato | Desde |
|---|---|
| Opciones (Standard) | 2016-01-01 |
| Acciones (Value) | 2021-01-01 |
| Acciones, símbolos solo-CTA (SPY, GLD) | 2020-01-01 — **no lo arregla ningún plan** |
| Índices (Free) | funciona para rangos recientes |

Los **índices no son acciones**: SPX/NDX/RUT van por `/v3/index/...`, no por `/v3/stock/...`.
SPY y QQQ **sí** son acciones (son ETF). Ver `resolverSubyacente`.

### 7. Si falta el precio del subyacente
Se puede derivar de las opciones por **paridad put-call** (`fetchDailyUnderlyingParidad`), sin
suscripción de acciones. Error mediano medido: 0,13%–0,17%. **Pero es OPTIMISTA para backtests**
(amortigua el extremo: el mayor movimiento diario de SPY pasa de 9,99% a 8,63%), así que
**nunca mezclar fuentes de precio dentro de un mismo backtest** — fabricaría una tendencia
temporal falsa.

## Prueba de humo antes de todo trabajo largo — OBLIGATORIO

**Origen (2026-08-07/08):** tres veces en dos días se lanzó un proceso largo que no producía
nada, y las tres se detectaron tarde o por casualidad:

| Qué se lanzó | Qué se verificó | Qué había que verificar |
|---|---|---|
| El jar del Theta Terminal | que la URL respondía (206) | **qué contenía** — era la v2, no la v3 |
| El probador de paridad | que corría | que devolvía algo — 5M filas → **0 resultados** |
| La descarga de OI | que arrancaba | que el primer año no venía vacío — **75 min de archivos vacíos** |

El patrón es siempre el mismo: **se comprueba que algo se EJECUTA, no que produce lo
CORRECTO.** Un proceso que falla al arrancar se ve enseguida; uno que escribe basura en
silencio se descubre horas después, o nunca.

### La regla
Antes de lanzar cualquier proceso de más de ~10 minutos:
1. **Correr la rebanada más pequeña posible** — un ticker, un mes. Dos minutos.
2. **Abrir la salida y mirarla.** No que el archivo exista: que tenga filas, y que los números
   sean plausibles (un orden de magnitud razonable, fechas dentro del rango pedido, alguna
   relación que se pueda contrastar con la realidad — p. ej. en el trimestre del crash de 2020
   el OI de puts debe superar de largo al de calls).
3. **Solo entonces** lanzar la corrida completa.

### En el código
- **Nunca adivinar nombres de columnas.** Imprimir la cabecera real o pedir una muestra. La de
  `open_interest` es `timestamp`; las de EOD son `date`/`created`. Adivinar costó una noche.
- **Fallar RUIDOSO ante lo inesperado.** Si faltan columnas, `throw` — no `continue`. Un
  `continue` convierte un fallo de parseo en horas de datos vacíos sin un solo error.
- **Un resultado vacío NO se cachea.** Cachear el vacío congela el fallo y lo hace permanente.
  (Excepción consciente: los años fuera del alcance de la suscripción, que siempre vendrán
  vacíos — ahí el vacío sí es la respuesta.)
- **Leer el directorio, no reconstruir nombres de archivo.** Los nombres de caché llevan el
  rango dentro; pedir otro rango genera otro nombre y la caché "desaparece" aunque esté entera.

## Protocolo de backtesting — OBLIGATORIO

**Origen (2026-08-06):** se reportó un backtest como "4 años, 2019-2022, incluye el crash del
COVID". Las barras de precio empezaban el **2021-01-14**: la suscripción *Stocks VALUE* de
ThetaData no llega más atrás, y el script **descarta en silencio** las señales sin barra. El run
real fue ~2 años sin COVID. El error sobrevivió una semana porque **ningún reporte decía su
período**. Lester invierte tiempo y dinero que no le sobra: un resultado sin auditar no se
reporta.

### Regla madre
**El período de un backtest es el de sus señales, NUNCA el que se pidió por variable de
entorno.** Está prohibido describir una corrida por su `BT_START`/`BT_END`.

### Auditoría después de CADA backtest — antes de decirle nada a Lester
1. **Procedencia.** Leer el bloque que `backtest-strategy.ts` estampa al inicio del reporte.
   Si dice **TRUNCADO**, el período pedido no se probó: decirlo primero, antes de cualquier
   número. Revisar la tabla por ticker — un solo ticker que arranque tarde (le pasó a META,
   2021-06-30) sesga su aporte.
2. **Muestra por celda.** Una celda con `n < 30` no es evidencia, es anécdota. Marcarla.
3. **Datos descartados.** Contrastar "días con flujo" contra "señales" en la tabla de
   procedencia. Una brecha grande = se está tirando muestra en silencio; averiguar por qué.
4. **Out-of-sample.** Ninguna conclusión sin las dos mitades. Si se voltea entre mitades, es
   régimen o cherry-picking, no edge.
5. **Costos.** Reportar a qué nivel de slippage muere la celda. Un edge que no aguanta el 10%
   no es operable.
6. **Confrontar con el forward-test.** Si el backtest y el papel en vivo se contradicen, gana
   el vivo y se dice.

### Al reportar
- Incluir **siempre** el período real y el `n`. Sin excepción, aunque el mensaje sea corto.
- Nada de "aguanta un crash" si el período no contiene un crash. Nada de "N años" sin haberlo
  verificado en la tabla de procedencia.
- Al **commitear** un resultado de backtest, el mensaje lleva el período real y el `n`, y deja
  constancia de que se auditó.

### Auditoría después de CADA corrida de forward-test
El forward-test es MÁS delicado que el backtest: corre solo en Railway, nadie lo mira, y falla
en silencio igual de bien.
1. **¿Corrió y terminó?** Estado terminal en Railway, no "Running". Un cron colgado no registra
   la corrida siguiente — Railway se la salta.
2. **Posiciones omitidas.** Los scripts imprimen `sin barras tras N intentos — omitido`. Cada
   línea es una posición que **nunca entró al ledger**. Contarlas y decirlas: si se omiten
   siempre los mismos tickers, el forward-test está midiendo un universo distinto del que crees.
3. **Altas vs. esperadas.** Contrastar `nuevas:` del reporte contra las candidatas del día.
   `nuevas: 0` puede ser deduplicación sana o el script muriendo antes de registrar.
4. **Cierres, no posiciones.** El win-rate se reporta **siempre** con el número de CIERRES, no
   con el tamaño del ledger. 70 posiciones abiertas y 2 cerradas es `n=2`.
5. **Cuándo hay veredicto.** Decir la fecha del primer vencimiento relevante. Sin cierres
   suficientes no hay conclusión, solo ruido — el 5d ya enseñó eso (win 86% con 7 cierres →
   65% con 23).
6. **Contra el backtest.** Si divergen, mandar el vivo.

### Al añadir un backtest o forward-test nuevo
Estampa el mismo bloque de procedencia. Un reporte sin él no se usa para decidir nada.

## Convenciones para trabajar aquí

- **Idioma:** la documentación y los prompts del agente están en **español**. Mantener ese idioma salvo indicación contraria.
- **Fuente de verdad:** los `.md` son la versión editable; los `.pages`/`.pdf` son los originales de referencia. Al actualizar reglas, editar el `.md` correspondiente y reflejar el cambio aquí.
- **Al implementar código:** este directorio es documentación de diseño. Cualquier implementación (parser de option chain, motor de flujo, lector RSS) debe respetar las fórmulas y umbrales exactos de arriba.
- La regla de **liquidez/GEX** es una salvaguarda: ante la duda, no operar y avisar.

---

# ⛔ LOS CINCO ERRORES QUE NO SE REPITEN

Escrito el 2026-08-15 a petición de Lester, después de que mis fallos le costaran horas de
trabajo suyo. **No son consejos: cada uno tiene un guardián en el código que falla solo.**
Si algo de aquí se incumple, se rompe un test — no depende de que yo me acuerde.

## 1. Ningún precio sale de un modelo

Los backtests valoraban con Black-Scholes alimentado con **volatilidad realizada**. En venta de
prima el dinero sale del hueco entre implícita y realizada; meter la realizada asume que ese
hueco es cero y el backtest devuelve tu propio supuesto disfrazado de resultado. El credit spread
pasó de **+3,20% a −2,53%** al usar precios reales.

**Guardián:** `web/lib/sin-precios-de-modelo.test.ts`. La lista de deuda **sólo encoge**.
Black-Scholes vale sólo en la dirección mercado → griega, nunca modelo → precio.

## 2. Un filtro que descarta casi todo es un BUG, no un resultado

`if (!q) return null; // sin precio real no se inventa` — la línea es correcta. Pero le pasaba a
`quoteCierre` el código OCC del contrato en vez del ticker, así que **descartó el 100% de los
flujos** y el informe salió con ceros. Lo conté como "no hay datos". Semanas así.

**Guardián:** `comprobarDescarte()` en `web/lib/barreraHallazgos.ts`. Lanza excepción si un filtro
se come más del 90%.

## 3. Un fallo de red NO se escribe como si fuera un resultado

El descargador escribía un fichero de "sin datos" cuando la petición fallaba. Al morir el
Terminal, **3.905 de 5.472 días se marcaron como hechos en segundos** — cinco tickers enteros
vacíos. El contador decía 5.472/5.472 y parecía terminado.

**Guardián:** `csv()` en `bajar-flujo-historico.mjs` distingue `vacio` (HTTP 200 o 472 = es un
resultado) de `fallo` (no se escribe nada y aborta a los 5 seguidos).

## 4. Validar el CONTENIDO, no el recuento

`ls | wc -l` no valida nada. El bug del "31 de febrero" (pedir `${mes}31` para febrero) dejó
**60 de 60 operaciones con `oi: null`** y el recuento de ficheros seguía perfecto.

**Guardián:** `web/scripts/validar-flujo-historico.mjs` abre todos los ficheros, desglosa **por
ticker y por año**, y sale con código 1 si algo falla. Un total sano esconde trozos muertos.

## 5. Ningún hallazgo se reporta sin sus cuatro cribas

Le presenté un hallazgo con **t=5,64**, monótono y coherente en las dos mitades. Vivía en dos
semanas y en un solo ticker. **Partir en dos MITADES lo aprobaba; partir en TRES lo mató.**

**Guardián:** `pasarBarrera()` en `web/lib/barreraHallazgos.ts` — se **niega** a devolver un
hallazgo si falla alguna:

| criba | de dónde salió |
|---|---|
| muestra mínima | el cóndor con 4 operaciones |
| ningún activo > 20% | NFLX era el 25% |
| mismo signo en los **tres** tercios de tiempo | la inusualidad |
| \|t\| contra el listón de Bonferroni | el IV proxy pasó de t=+6,7 a t=−3,8 |

Sus tests reproducen **los casos reales** que me engañaron: si la barrera dejara de tumbarlos,
falla el test.

---

## Y tres reglas de trato que también fallé

- **La hora y las fechas se COMPRUEBAN, no se infieren.** Le dije "son las 4am" cuando eran las
  00:59 (leía UTC), y "llevamos meses" cuando el proyecto empezó el **2026-07-24**. Comprobar con
  PowerShell y con `git log`, no con la sensación.
- **Sus preguntas van al manual con sus palabras.** Si preguntó, es que no estaba explicado. Y sus
  "¿cómo lo sabes?" han destapado dos errores míos en un día.
- **Él no tiene que saber de estadística ni de backtesting.** Ese es mi trabajo. Cuando le paso un
  número sin haberlo cribado, le fallo en lo único que no puede verificar por su cuenta.

## 6. El escepticismo va en las DOS direcciones

Estaba aplicando cuatro cribas a los resultados **positivos** y ninguna a los **negativos**. Eso
empuja sistemáticamente a no encontrar nunca nada: un "no funciona" con muestra pequeña o ruido
alto no significa que no haya efecto, significa que **la prueba no podía verlo**.

**Guardián:** `potencia()` en `web/lib/barreraHallazgos.ts`. Antes de reportar un negativo, calcula
la separación mínima que esa muestra podía detectar. Si el efecto que se busca es más pequeño que
eso, el resultado se reporta como **"no lo pudimos ver"**, nunca como "no existe".

Lester, 2026-08-15: *"pareces emocionado por destrozar a EVA, sin embargo deberías estar emocionado
por que pase. Si pasa, si nos da una ventaja en el mercado, es el éxito de los dos"*.

**El rigor es el MÉTODO, no el objetivo.** El objetivo es encontrar algo que funcione, y ser
riguroso es lo que hace que un hallazgo real sea fiable — no una forma de lucirse tumbando cosas.
Ya me lo había dicho una vez ("estoy por empezarte a llamar nube negra") y volví a lo mismo.

---

# 🔬 CUÁNDO SUBIR A ULTRACODE

Ultracode lanza **varios agentes en paralelo**, unos buscando y otros intentando **refutar** lo
que encontraron los primeros. Cuesta bastantes más tokens.

**La regla no es "cuando sea difícil". Es cuando algo SALGA BIEN.** Mis fallos nunca fueron por no
saber resolver algo: fueron por **creérmelo demasiado pronto**. La inusualidad tenía t=5,64 y era
ruido; el IV proxy tenía t=+6,7 y al período siguiente daba −3,8.

**Lester no tiene que acordarse de pedirlo: lo propongo yo cuando se dé un disparador.**

## Disparadores — proponerlo SIEMPRE que ocurra alguno

1. **Una medición pasa la barrera y el resultado es positivo.** Ese es el momento exacto. Antes de
   contárselo como hallazgo, una tanda de agentes con el encargo explícito de **tumbarlo** desde
   ángulos distintos: concentración por activo, por período, look-ahead, supervivencia a la
   horquilla, y si el vehículo real lo puede cobrar.
2. **Antes de que comprometa dinero real** en una estrategia. Aquí el coste en tokens es
   irrelevante comparado con el coste de equivocarse.
3. **Auditorías amplias** donde yo tendría que muestrear: "¿dónde más pasa esto?", "¿qué otros
   sitios tienen este bug?". Ahí el paralelismo cubre lo que yo dejaría fuera.
4. **Cuando él pida una decisión y haya varios caminos defendibles** — un panel de agentes
   independientes proponiendo y puntuando bate a que yo elija uno y lo argumente.

## Cuándo NO — decirlo también, para no quemarle tokens

- **Construir** paneles, APIs o scripts: el cuello de botella es decidir qué enseñar, no razonar.
- **Bajar datos**: el límite es ThetaData y un solo Terminal. Quince agentes se pelearían por las
  mismas cuatro conexiones.
- **Depurar un error concreto** ya localizado.
- **Conversación** y preguntas.

## Cómo se dice

Cuando se dé un disparador, decírselo así de claro: *"esto es un momento de ultracode: hay un
número que parece bueno y quiero varios agentes intentando destrozarlo antes de que te lo cuente
como hallazgo. Escribe 'ultracode' si quieres que lo haga."* Él lo activa; yo lo propongo.
