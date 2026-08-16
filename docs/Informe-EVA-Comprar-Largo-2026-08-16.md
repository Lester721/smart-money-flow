# EVA, medida por fin para lo que Victor la construyó

**2026-08-16, de madrugada.** Test pedido por Lester: *"¿qué le hace falta a EVA para hacerla una
máquina de detectar contratos que el dinero inteligente se está metiendo y que tienen potencial
fuerte de aumentar de valor? ¿O debemos descartarla y crear un scorecard que sí funcione?"*

## La pregunta, y por qué nunca se había respondido

Victor hizo el scorecard para encontrar **contratos que multiplicaran de valor dentro de un año**.
Su fuerte es el swing trading.

Todas las mediciones que se le habían hecho a EVA fueron de **lo contrario**: vender prima a corto
plazo. Incluso la medición grande del 15 de agosto (19.465 operaciones, concluyente) — sus dos
subgrupos significativos eran "contratos a ≤30 días" y "salidas adelantadas por vencimiento".

O sea: se había medido el corto plazo y el lado vendedor. **Nunca comprando y aguantando meses.**

## El diseño

La medida es **pareada**, y es lo más importante:

```
pnl = retorno(el contrato que compró el dinero grande) − retorno(medio de su cubo comparable)
```

El cubo de control son todos los contratos del **mismo ticker, mismo día, mismo tipo, vencimiento
±30 días y prima entre 0,5× y 2×**. Si el mercado sube, sube el cubo también: la resta lo cancela.
Lo que queda es sólo si eligieron mejor contrato.

- Se compra al **ask real** y se vende al **bid real**, los dos de la misma fuente (cadena EOD).
- Contrato ausente en la cadena de salida = **puja cero = pérdida total**, no dato que falta.
- Horizontes 30 / 90 / 180 / 365 días. Muestra: 32.415 / 18.527 / 10.602 / 3.714 filas.
- Período 2024-01 → 2026-08, 8 tickers. Prima mínima $3M.
- Criterio y 12 pruebas **declaradas en la cabecera del script antes de correr nada**.

## El resultado

### 1. EVA no ordena nada. 0 de 12 pruebas pasan.

| prueba (a 180 días) | separación | t | listón |
|---|---|---|---|
| A · puntuación de EVA | −0,27% | −1,75 | 2,87 |
| B · posición en la horquilla | −0,28% | −1,77 | 2,87 |
| A · EVA · calls | −0,02% | −0,06 | 2,87 |
| A · EVA · puts | −0,22% | −1,77 | 2,87 |

Y la comprobación de potencia dice que **el negativo es concluyente**: con estas muestras se
detectaba una separación del 0,27%–0,84%, así que una ventaja del 10% —la que valdría la pena— se
habría visto. No está.

También falla el ingrediente que EVA **no tiene** y que uno diría que significa "dinero inteligente
entrando": dónde cayó el precio dentro de la horquilla (comprar contra la oferta). Plano o
ligeramente negativo en los cuatro plazos.

### 2. Lo que parecía un hallazgo, y no lo era

Salió que seguir al flujo batía a su cubo por +0,71% / +0,55% / +0,30% / +1,38%, con t enormes,
mismo signo en los tres tercios y sobreviviendo a quitar NVDA y TSLA.

**Era la horquilla.** El contrato del flujo tiene la horquilla ~26% más estrecha que su cubo de
control en los cuatro horizontes (2,14% contra 2,90% a 30 días). Comprando al ask y vendiendo al
bid, eso solo ya paga la diferencia entera, sin que nadie haya elegido mejor contrato.

Medido punto medio contra punto medio, con las mismas filas y el mismo cubo:

| horizonte | ask→bid | punto medio | era horquilla |
|---|---|---|---|
| 30 d | +0,708% (t=17,96) | +0,139% (t=3,49) | 80% |
| 90 d | +0,552% (t=12,53) | +0,091% (t=2,13) | 83% |
| 180 d | +0,301% (t=4,94) | **−0,098%** (t=−1,64) | 133% |
| 365 d | +1,376% (t=11,22) | +0,936% (t=7,61) | 32% |

Y lo poco que queda no pasa las cribas: a 30 y 90 días los tercios **cambian de signo**, a 180 es
negativo, y el único que aguanta (365 d) tiene **NVDA al 27,7%**, por encima del tope del 20%.

Confirmación causal, no correlación: en el subgrupo donde el contrato del flujo **no** tiene mejor
horquilla que su cubo, la diferencia es **negativa en los cuatro horizontes**.

## Los dos bugs que encontró la auditoría

**1. El split de NVDA — habría envenenado la tabla entera.** NVDA hizo 10:1 el 2024-06-10, dentro
del período. El strike 1200 pasó a 120, la búsqueda por `strike|tipo` no lo encontraba, y "no está"
se leía como pérdida total. De las filas que cruzaban el split, **el 81–98% se contaban como −100%**;
de las que no, el 0,2–0,6%. Contratos que ganaron entre +27% y +66% figuraban como ruina.

Arreglado detectando los splits solos (caída brusca del strike máximo entre dos días) y ajustando
strike y valor por el ratio. Tras el arreglo las pérdidas totales caen al 0,3%.

Salió a favor que el fallo golpeaba **igual** al tratamiento y al control, así que la diferencia
pareada apenas se movió. Los retornos absolutos sí estaban contaminados.

**2. Las t estaban infladas por falta de independencia.** Varias filas del mismo ticker y el mismo
día no son observaciones independientes. Agrupando por ticker-día, la t de 180 días cae de 5,73 a
2,47 y la de 90 días de 12,91 a 6,03.

## La respuesta a la pregunta de Lester

**A EVA no le falta un ingrediente. Le falla la premisa.**

La hipótesis de fondo —que una operación grande marca un contrato que va a comportarse mejor que
sus comparables— **no se sostiene en estos datos**, ni ordenando por EVA, ni por el lado de la
operación, ni a ningún plazo entre un mes y un año.

Añadir los ingredientes que EVA no tiene (lado, permanencia del interés abierto, repetición) sería
seguir afinando el ranking de una señal cuya materia prima ya se midió y no separa. El lado, que era
el candidato más prometedor, se midió aquí y no funciona.

**Ni arreglar EVA ni construir otro scorecard sobre el mismo flujo.** El flujo de opciones
inusuales, como fuente de señal direccional, está cerrado por las cuatro vías que hemos probado:
corto plazo vendiendo, corto plazo comprando, largo plazo comprando, y ordenando por scorecard.

## Lo que este test NO mide, y hay que decirlo

- **Estructura (15% del peso de EVA)** — necesita el interés abierto de toda la cadena.
- **Confirmación (10%)** — se calcula con barras posteriores: meterla sería mirar al futuro.
- **IV y griegas (10%)** — el flujo cacheado no las trae.
- Sólo **8 tickers** (los que tienen cadena en disco) y sólo **2024-2026**, que fue un mercado
  alcista fuerte. En una caída larga esto no está medido.
- El punto medio **no es operable**: es un diagnóstico para separar liquidez de selección, no un
  resultado alternativo.

## Ficheros

| qué | dónde |
|---|---|
| el medidor (criterio en la cabecera) | `web/scripts/eva-comprar-largo.mjs` |
| el puntuador y las 12 pruebas | `web/scripts/eva-comprar-largo-puntuar.ts` |
| cobertura de salidas medibles | `web/scripts/cobertura-salidas.mjs` |
| ausente = puja cero, contra ThetaData | `web/scripts/validar-ausentes-cadena.mjs` |
| auditorías adversarias | `web/scripts/audit-*.mjs` |
