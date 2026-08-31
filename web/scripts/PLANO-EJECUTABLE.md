# EL PLANO — ORDEN EJECUTABLE

**Escrito el 2026-08-25.** Estado: **NO OPERAR TODAVÍA.** Faltan dos piezas (§5) y el aviso en
vivo (§6). Esto es lo que se compraría, escrito para que se pueda seguir a mano.

---

## 1. LA REGLA, PASO A PASO

**Disparo.** Alguien compra un contrato de opciones con estas tres cosas a la vez:

| condición | valor |
|---|---|
| tamaño de la operación | **$500,000 o más** en una sola operación |
| cómo se ejecutó | **al ask o por encima del ask** — el comprador tenía prisa |
| delta del contrato | **entre 0.15 y 0.30** (en valor absoluto: una put de −0.22 cuenta) |

**Entrada.** **Al día siguiente**, comprar ese mismo contrato — mismo ticker, mismo vencimiento,
mismo strike, mismo lado. Se paga **el ask**. No se espera a que baje.

> Se compra el día siguiente, no el mismo día, por dos razones: la primera es que así se mide sin
> hacer trampa (el golpe ya ocurrió, la información ya es pública); la segunda es que en la
> práctica no vas a estar mirando la pantalla en el segundo exacto.

**Salida — la única definida.** Vender **el día que el bid llegue a 2 veces lo pagado**.
Si pagaste $6.60 el contrato, vendes cuando el bid marque $13.20 o más.

**Salida si no dobla.** ⚠️ **SIN DEFINIR.** Ver §5.

**Lado.** No lo eliges tú. Si el golpe fue en una put, compras la put. Si fue en una call,
compras la call. En los siete meses medidos salieron puts de enero a marzo y calls de abril a
mayo, y las dos cosas funcionaron.

---

## 2. CUÁNTO SE PONE — LA REGLA DE TAMAÑO

**La regla: 5% de la cuenta por posición.** Ni más ni menos, en todas, gane o pierda la anterior.
No se sube el tamaño después de una racha buena ni se baja después de una mala.

**Lo que la estrategia necesita en capital para funcionar completa:** llegan a haber **21
posiciones abiertas a la vez**. Al 5% cada una, eso es el 105% de la cuenta — o sea que el tope de
21 se alcanza justo cuando el dinero se acaba. En la práctica hace falta que el capital sea
**unas 20 veces el tamaño de una posición** para no dejar señales sin coger.

Sobre los siete meses medidos, con el capital suficiente para cogerlas las 56:

| $ por posición | capital | señales cogidas | termina en | ganancia |
|---|---|---|---|---|
| $2,000 | $60,000 | 53 de 56 | $140,905 | +135% |
| **$3,000** | **$60,000** | **56 de 56** | **$183,104** | **+205%** |
| $4,000 | $60,000 | 56 de 56 | $232,130 | +287% |
| $5,000 | $60,000 | 54 de 56 | $268,001 | +347% |

Con $3,000 por posición sobre $60,000 —el 5%— **no se pierde ni una señal y la caja libre nunca
baja de $21,879.** Ese es el punto de referencia del plano.

**Por qué NO subir del 5%.** Las filas de abajo ganan más porque concentran: con posiciones más
grandes se agotan las señales por falta de efectivo y el año acaba dependiendo de menos apuestas.
Cuando el resultado sale de 6 apuestas en vez de 56, una sola mala se lleva un tercio del año.
Más tamaño no es más estrategia, es más suerte.

**Contratos enteros.** Un contrato son 100 opciones. Si cotiza a $6.60, cuesta $660. Con $3,000
compras 4 ($2,640) y sobran $360. No hay fracciones.

**Si un contrato cuesta más que el tamaño de posición, se salta la señal.** Con $3,000 eso no
pasó ni una vez en los siete meses medidos.

**Con menos capital la estrategia sigue funcionando, sólo coge menos señales** — el orden de
llegada decide cuáles, no una elección. Es una limitación de capital, no un defecto del plano.

---

## 3. DE DÓNDE SALE CADA NÚMERO

Medido sobre **9 tickers** (AAPL, AMD, HOOD, META, MSFT, NVDA, QQQ, SPY, TSLA), **enero a julio de
2026**, con precios reales de ThetaData: se compra al ask, se vende al bid, el peaje está pagado.

**Por qué delta 0.15–0.30 y no otra cosa** — se partió el universo en cinco cajones:

| delta | contratos | doblaron | $ ganados ÷ $ perdidos |
|---|---|---|---|
| **0.15–0.30** | **56** | **45 (80.4%)** | **26.48** |
| 0.30–0.50 | 165 | 123 (74.5%) | 17.55 |
| 0.50–0.70 | 133 | 78 (58.6%) | 11.48 |
| 0.70–1.00 | 520 | 31 (6.0%) | **0.99 — muerto** |

El cajón de arriba tiene apalancamiento suficiente para doblar. El de abajo (0.70+) es casi la
acción con otro nombre: no se va a cero, pero tampoco dobla, y en agregado no gana nada. **El
dinero grande compra sobre todo ahí** — 520 de los 875 contratos — así que copiarles a ciegas, sin
mirar el delta, no habría dado nada.

**Peaje real.** La diferencia entre el bid y el ask fue del **2% de mediana** en estos contratos, y
del 1% en SPY y QQQ. Está descontado en todos los números de arriba.

**Frecuencia.** 56 señales en 7 meses = **unas 8 al mes**.

---

## 4. LOS TRES PEROS — ESTÁN AQUÍ PARA QUE NO SE OLVIDEN

**1. El cajón 0.15–0.30 se eligió después de ver los resultados.** Se partió en cinco y se cogió
el mejor. **El 80.4% no se va a repetir.** El cajón probablemente sea bueno de verdad, por la razón
mecánica de arriba, pero el número exacto es optimista y hay que contar con menos.

**2. No son 56 apuestas independientes, son dos o tres.** Puts de índice de enero a marzo mientras
el mercado caía; calls de abril a mayo mientras subía. SPY y QQQ ponen $28,238 de los $45,648.
Si el próximo trimestre es plano, este plano no gana nada — no porque falle, sino porque necesita
que algo se mueva.

**3. Siete meses y nueve tickers.** Es poco. (La misma cinta está en disco **desde 2016** — once
años, con 2018, 2020 y 2022 dentro. Medirlo ahí es lo primero que hay que hacer.)

---

## 5. LOS DOS HUECOS — SIN MEDIR

**Hueco A — ¿qué se hace si NO dobla?** Ahora mismo el plano dice *aguantar hasta el vencimiento*,
y eso NO es una decisión, es lo que hacía el script porque no se probó otra cosa. Sin medir:
cortar cuando pierde la mitad, o salir a los 30 días, o vender la mitad al 1.5×.

**Hueco B — ¿cuántos días le tienen que quedar al contrato?** Ahora mismo, ninguna condición. En
los siete meses medidos hay contratos de 2 días y de 6 meses mezclados. Eso no puede quedarse así.

**Hasta que se midan, si se opera, la regla provisional es:** aguantar a vencimiento, y no tocar
contratos a los que les queden menos de 20 días. Es una decisión conservadora tomada a mano, no un
resultado.

---

## 6. LO QUE NO ESTÁ MONTADO

**El aviso en vivo.** Todo esto está medido sobre cinta guardada. Para operarlo hace falta que la
cinta de ThetaData llegue en directo y avise cuando entre un golpe de >$500,000, al ask o por
encima, con delta entre 0.15 y 0.30.

**Sin eso no hay plano que valga**, porque la señal caduca en un día. Es la pieza que separa esto
de una operación real, y no es medir: es construir.

---

## 7. LA PIEZA QUE ESTÁ EN DUDA, Y QUÉ PASA CON CADA RESPUESTA

Hay **una sola** pieza en duda: el disparador (§1). La duda es si el golpe de $500,000 aporta
algo, o si lo que funciona es simplemente el cajón de delta 0.15–0.30 en un mercado que se mueve.

Se resuelve comprando el **contrato vecino** —mismo día, mismo vencimiento, mismo delta, elegido
sin mirar quién compró— y comparando.

| si el vecino… | lo que significa | lo que cambia en el plano |
|---|---|---|
| dobla también el ~80% | el disparador es el **cajón de delta**, no el dinero grande | **mejor**: no hace falta la cinta de flujo, se puede entrar más a menudo. Lo que hay que buscar es **cuándo**, no **cuál** |
| dobla el ~30% | el dinero grande vale ~50 puntos de acierto | se monta el aviso en vivo sobre la cinta, tal cual |

**Ninguna de las dos borra el plano.** Las seis piezas restantes (vehículo, delta, salida al 2×,
tamaño, subyacente líquido, lado) se quedan en pie en los dos casos.

---

## 8. QUÉ ESTE PLANO NO HACE

- **No predice la dirección.** El lado lo elige el disparador.
- **No gana en un mercado plano.** Vive de que algo se mueva.
- **No vende nada.** Una pata comprada, la pérdida máxima es la prima.
- **No lo ejecuto yo.** Preparo la orden y la reviso; el botón lo aprietas tú.

---

## 9. LOS SCRIPTS

| fichero | qué saca |
|---|---|
| `q1-delta-por-cajones.mjs` | la tabla de los cinco cajones de delta |
| `q2-los-56-casos.mjs` | las 56 señales una por una, con el movimiento de la acción |
| `q3-simulacion-cuenta.mjs` | la simulación de cuenta con contratos enteros |

```
node --import tsx --max-old-space-size=10240 scripts/q1-delta-por-cajones.mjs
```

---

## 10. LOS TRES FALLOS QUE HUBO QUE ARREGLAR PARA LLEGAR AQUÍ

Documentados en la memoria (`fallos-al-medir-el-plano.md`), porque los tres devolvieron un número
precioso sin dar error:

1. El precio de la acción se calculaba con el vencimiento **del mismo día**, que a esa hora tiene
   1 a 5 strikes con precio. La versión buena es `spotOk()` en `z1-la-rejilla-completa.mjs`.
2. Dije que la cinta no traía delta. Sí lo trae — miré el fichero equivocado.
3. La misma operación contada cuatro veces: hay que agrupar por
   `ticker|vencimiento|strike|lado|día`.
