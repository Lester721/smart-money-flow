> ⚠️ **SUSTITUIDO el 30 de agosto de 2026** por `LA-PALANCA-ESTADO-30-AGO.md`.
> Lo de aquí abajo es el estado del 29 de agosto. Tres de sus piezas se midieron al día
> siguiente y no aportan: el mínimo de $5.000, el umbral del 3% y la media de 20 días.
> Se conserva como histórico.

# LA PALANCA — ESPECIFICACIÓN CONGELADA
**Congelada el 2026-08-29.** A partir de aquí no se toca ni un parámetro hasta que termine el
examen de los 30 tickers del grupo A. Todo lo que hoy está sin decidir se decide AHORA, porque
una ambigüedad en la regla es un fallo silencioso en vivo.

---

## LA REGLA, sin un solo hueco

### Universo
Los 27 tickers actuales. **TSLA queda fuera** (está en su propio forward test y distorsiona).

### Cuándo se mira
Una vez al día, **con los precios de cierre de la sesión anterior**. Nada intradía.

### La señal de entrada
La acción tiene que estar **más de un 3,0% por debajo de la media de sus últimos 20 cierres**.

- La media son **20 sesiones de negociación**, **sin incluir** el día que se evalúa.
- Los precios van **ajustados por split**. Un split sin ajustar hace que la acción parezca un
  75-90% por debajo de su media y se convierte en la candidata número uno. Ya pasó.
- **Descarte de seguridad:** si la distancia a la media sale por debajo de **−30%**, la señal
  se ignora. Es imposible de forma natural y siempre ha sido un dato roto.

### Qué contrato exactamente
**CALL**, sobre el mismo ticker, eligiendo el que minimice
`|profundidad − 0,25| / 0,25 + |plazo − 400| / 400`, entre los que cumplan **todo** esto:

| | |
|---|---|
| profundidad | entre **13,75% y 36,25%** dentro del dinero (0,25 ± 45%) |
| plazo | entre **180 y 620 días** naturales (400 ± 55%) |
| coste | **≥ $5.000** por contrato (prima × 100) |
| cotización | bid > 0 y ask > 0 |

Si **ningún** contrato cumple las tres tolerancias, **no se opera ese día en ese ticker**.
No se coge «el más parecido»: eso fue lo que convirtió una regla del 15% en una mezcla del
15% al 52% sin que nadie se enterara.

La profundidad se mide contra el **spot derivado de la paridad put-call** de la propia cadena
(strike + call − put al vencimiento más cercano), no contra el precio de la acción de otro feed.

### A quién se compra si hay varios candidatos
Se ordenan por **distancia a la media, de menor a mayor** — la más hundida primero.
Empate exacto: por orden alfabético del ticker.

### Cuántas posiciones
**2 huecos.** **Una posición por ticker** a la vez. Si los 2 están ocupados, no se abre nada.

### Cuánto dinero
**12% del patrimonio total** por posición. Se compran contratos **enteros**:
`n = suelo( min(12% del patrimonio, efectivo disponible) / coste del contrato )`.
Si `n < 1`, **no se opera**.

### Cómo se compra
**Al ASK.** Nunca a punto medio.

### Cuándo se vende — lo primero que ocurra
1. Han pasado **120 sesiones de negociación** desde la compra, **o**
2. el contrato vale **0,50x o menos** de lo que se pagó (mirado al **bid**, una vez al día).

**No hay tope de ganancia.** No hay stop que siga al máximo. No hay salida por recuperación de
la media. Los tres se midieron y los tres empeoran.

### Cómo se vende
**Al BID.**

### El dinero parado
Todo lo que no está en contratos va en **SPY**. Se vende SPY para financiar una compra y se
recompra con lo que sobra.

### Lo que NO lleva la regla
Sin freno por caída del SPY · sin filtro de régimen · sin tamaño variable · sin filtro de
volatilidad, de miedo, de tipos ni de nada macro. **Todo eso está medido y no funciona.**

---

## LOS NÚMEROS QUE HAY QUE BATIR (27 tickers, 2016-2026, $60.000)

Con castigo de ejecución de media horquilla medida (0,0138) y mediana de 41 capitales:

| | al año | caída | Sharpe | $60.000 → |
|---|---|---|---|---|
| **LA PALANCA con umbral 3%** | **~23%** | ~−42% | **~0,80** | **~$527.000** |
| la misma sin umbral (control) | 20,9% | −42% | 0,72 | $454.558 |
| comprar SPY y dormir | 14,9% | −34% | 0,70 | $262.254 |

⚠️ El umbral del 3% es **la hipótesis a examinar**, no un hecho. Se ha barrido tres veces sobre
estos mismos 27 tickers y ésa es exactamente la receta del sobreajuste.

---

## LO QUE YA ESTÁ COMPROBADO Y NO SE REPITE

| | |
|---|---|
| liquidez | horquilla 2,4-2,8% del punto medio, **mejor** que la call al dinero (4,0%). Aguanta 2 horquillas enteras de castigo |
| ejecución | con +1 horquilla de más sigue dando 20,6% |
| estabilidad | 41 capitales de partida: el rendimiento baila 1 punto, el Sharpe 0,03 |
| vecindario | de 240 configuraciones era la única con dispersión 0,04 |
| ¿cabe? | 12% de $60.000 = $7.200 contra $6.665 del contrato mediano |
| frecuencia | ~5 operaciones al año |

## LOS TRECE DIALES BARRIDOS — sólo tres importan

**Importan:** profundidad (fija la beta) · plazo (120→400 mejora, luego plano) · tamaño.

**No importan (medidos y muertos):** aguante · freno del SPY · largo de la media entre 5 y 20 ·
suelo · tope de ganancia · coste mínimo (arriba y abajo) · régimen · análogos históricos ·
stop que sigue al máximo · salida por recuperación de la media.

---

## FIRMA

Esta especificación se congela **antes** de bajar los 60 tickers nuevos.
Cualquier cambio posterior invalida el examen del grupo A.
