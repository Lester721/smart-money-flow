# Proveedores de datos de opciones — análisis y opciones

_Preparado 2026-08-04. Precios aproximados: verificar en las webs (cambian seguido)._

## El problema, en concreto (por qué Massive nos molesta desde el día 1)

1. **Massive ES Polygon.io rebrandeado.** `polygon.io` ahora redirige a `massive.com`; misma API y mismas keys. Así que "los problemas de Massive" son, literalmente, las características de Polygon.
2. **Límite por VELOCIDAD, no por dinero.** Nuestro plan Advanced (~$199/mo) es plano en número de llamadas, pero Massive limita por **velocidad** (error 429). Al cargar un ticker disparamos ~13 llamadas a la vez → throttling → respuestas vacías. (Confirmado en `web/lib/massive.ts:38-44`.)
3. **El plan no devuelve bid/ask de opciones.** Nuestra fórmula pide el bid; hoy lo **estimamos**. (`web/lib/compute.ts:7`)
4. **No entrega griegas ni IV.** Las **calculamos** con Black-Scholes. (`web/lib/gex.ts:7`)
5. **No trae calendario de earnings.** (`web/lib/earnings.ts:3`)
6. **Cantidad de datos inestable entre corridas** — lo que rompió el diagnóstico de régimen (229 señales en el run validado vs 45-79 en los reintentos).

→ **Traducción honesta:** pagamos ~$199/mo por un feed que nos limita por velocidad y encima nos obliga a estimar bid, griegas y earnings.

## Qué necesitamos de un proveedor
- **Trades de opciones** (time & sales) → es la base de nuestro "flujo" (nosotros derivamos el flujo de los trades; no necesitamos un producto de "flow alerts").
- **Cadenas con bid/ask** → pricing de spreads y liquidez real.
- **Barras diarias** del subyacente.
- **Griegas / IV** (idealmente reales, no estimadas).
- **Fiabilidad** (nuestro dolor #1).
- **Histórico** para backtests.

## Comparativa (verificar precios)

| Proveedor | Precio/mo aprox | Bid/ask | Trades (base del flujo) | Griegas/IV | Histórico | Fiabilidad | Notas |
|---|---|---|---|---|---|---|---|
| **Massive (=Polygon)** — actual | ~$199 | ✗ (nuestro plan) | ✓ | ✗ (calculamos) | ✓ tick | ⚠ límite por velocidad | Lo que ya sufrimos |
| **ThetaData** | ~$25–80 | ✓ | ✓ tick | ✓ (1º/2º/3º orden) | ✓ tick | ✓ (hecho para backtesting) | Más barato Y nos da lo que hoy estimamos |
| **Databento** (ya lo usamos en el fork de Victor) | ~$199 (o pago por uso, histórico) | ✓ NBBO, 17 exchanges | ✓ | — (crudo, calculas) | ✓ +10 años | ✓✓ institucional (dashboard de latencia, marca días con gaps) | Más crudo/trabajo; máxima fiabilidad |
| **Tradier** | ~$10 (gratis con cuenta) | ✓ | ✗ (sin tape de trades) | ✓ | limitado | ✓ (es un broker) | Barato para cadenas EN VIVO; flojo en histórico |
| **ORATS** | ~$99 | ✓ | ✗ | ✓ | ✓ 25 años EOD | ✓ | Solo EOD, no intradía/flujo |
| **Unusual Whales** | ~$48 | limitado | ✓ (alertas de flujo) | limitado | ✗ | — | Producto de flujo empaquetado, poca flexibilidad de API |
| **Intrinio** | $1,000+ | ✓ | ✓ | ✓ | ✓ | ✓ | Institucional, caro |

## Opciones (con recomendación honesta)

**A — Quedarnos en Massive y arreglar el USO ($0 extra).**
Ya reduje la concurrencia y agregué **caché acumulativa** al backtest (ataca el dolor inmediato). Además: preguntar a Massive/Polygon si nuestro plan de $199 puede **habilitar el NBBO (bid/ask) de opciones** — Polygon lo ofrece en ciertos tiers; sería arreglar el bid sin cambiar de proveedor.
- ✅ Cero migración, cero costo extra.
- ❌ No arregla griegas/earnings estimados; el límite por velocidad sigue.

**B — Migrar a ThetaData (~$25–80) — RECOMENDADA para evaluar ya.**
Está hecho para exactamente lo que hacemos (backtesting + trades de opciones). Nos da **bid/ask + griegas + IV reales + tick histórico**, y **más barato** que Massive.
- ✅ Baja el costo Y elimina 3 de los "estimados" (bid, griegas, IV).
- ❌ Requiere reescribir el cliente de datos (`massive.ts`, `massiveFlow.ts`, `compute.ts`, `gex.ts`). Trabajo acotado, se puede hacer incremental.

**C — Consolidar en Databento (~$199, ya lo conocemos).**
Ya lo usamos en el fork de Victor. Fiabilidad institucional + NBBO de los 17 exchanges + 10 años de histórico. Unificar a UN proveedor elimina el split actual (Massive aquí, Databento allá).
- ✅ Máxima fiabilidad; ya tenemos experiencia con él.
- ❌ Más crudo (calculamos más); mismo precio que hoy; migración.

**D — Tradier (~$10) como complemento del EN VIVO.**
Cadenas + quotes + griegas baratas para la app en vivo; NO para backtests (histórico flojo). Podría convivir con otro para histórico.

## Mi recomendación
1. **Ahora (hecho / rápido):** el arreglo de uso (caché + menos concurrencia) ya está. Acción de 5 min: revisar en el dashboard de Massive/Polygon si el plan habilita el NBBO de opciones (quick win del bid/ask).
2. **Este mes:** una **prueba de concepto con ThetaData** — es el mejor costo/beneficio para nuestro caso (backtest + flujo + griegas reales, y más barato). Si la POC va bien, migramos.
3. **Si priorizamos fiabilidad por encima de todo:** Databento (ya lo conocemos del fork de Victor).

## Fuentes
- Polygon → Massive rebrand y pricing: apicostcalc.com/polygon.html
- Comparativa de proveedores de opciones 2026: flashalpha.com/articles/best-options-data-apis-2026
- ThetaData: thetadata.net
- Databento OPRA (planes y fiabilidad): databento.com/blog/introducing-new-opra-pricing-plans · databento.com/datasets/OPRA.PILLAR
