# MarketSnack — qué copiar y qué no

Sacado de las 55 capturas de `docs/referencias-visuales/MarketSnack-capturas.docx` el 2026-08-13.

**La regla de fondo:** copiamos sus **paneles**, nunca su **puntuación**. Su score está medido y
**no predice** (4 meses, 3.321 eventos, t=0,62, y las dos mitades se contradicen). Lo que hacen
bien es *enseñar* la gamma, no *interpretarla*.

La suscripción vence a mediados de septiembre. Hay recordatorio para el 9.

---

## 1. GEX por vencimiento — ✅ HECHO (2026-08-13)

Su panel *"Trading Session"*: una tarjeta por vencimiento con su GEX y **su cuota en % del
tablero** (en su captura: Aug 12 = 32%, Aug 13 = 12%, Aug 14 = 38%…).

**Por qué era el primero:** nosotros agregábamos toda la gamma en un número, y así no se ve
**dónde** está. Importa de verdad porque está medido que la gamma pega el doble a 1 día que a 10:
si el peso no está en el 0DTE, el mecanismo del que vive el cóndor no está donde lo suponemos.

- `lib/gexSpx.ts` — el cálculo, con IV real del mercado (Black-Scholes solo mercado → griega).
- `GET /api/gex/vencimientos?n=5`

Verificado en vivo el 2026-08-13 a las 16:00: los pesos suman 100%, SPX 7.799,73.

⚠️ **El peso del 0DTE sube solo según avanza la sesión** (la gamma va como 1/√T). A las 16:00 dio
56,4%; MarketSnack a las 12:15 daba 32%. Para comparar entre días, **siempre a la misma hora**.

## 2. Nominal ajustado por delta — ✅ YA LO TENÍAMOS

Está en `/api/gex` y ahora también por vencimiento. El bruto infla por diez (~$297B contra ~$25B
ajustado) y no significa nada: lo que importa es lo que los dealers tienen que cubrir de verdad.

## 3. "Underlying & Gamma" — PENDIENTE

Precio intradía con **Call Wall, Put Wall, Magnet y Gamma Flip dibujados encima**, y el Net GEX
en barras compartiendo el eje de tiempo. Selector 1D / 5D / 1M.

- Los cuatro niveles ya los calculamos (`muroCall`, `muroPut`, `giro` en `/api/gex`).
- **Lo que falta es la serie temporal**: hoy solo guardamos la foto del momento. Hay que
  persistir el GEX intradía para poder dibujar la línea.
- El **"Magnet"** es suyo y no sabemos cómo lo calculan. **No copiar a ciegas**: o averiguamos la
  definición o no lo ponemos. Un nivel que no sabes calcular es un nivel en el que no puedes confiar.

## 4. "Gamma Ladder" — PARCIAL

Barras horizontales por strike, a los dos lados, con Net GEX / Notional / 1D Premium / OI /
Volumen arriba, selector de cuántos strikes mostrar (20/40/50/100/200) y un desplegable de
fórmula (*"Per 1% move"*).

- Los datos están todos en `barras` de `/api/gex`. **Falta la vista.**
- Lo que sí vale la pena copiarles: **las cifras en dólares en los extremos de cada barra** y las
  etiquetas **CW** / **PW** sobre los muros. Se lee de un vistazo.
- Lo que **no** hay que copiar (lo apuntó Lester en `referencias-visuales/LEEME.md`): la cifra
  absoluta suelta ("1,2B") sin referencia. Va acompañada del **percentil contra los días medidos**,
  o no significa nada.

## 5. "Institutional Flow Tape" — PENDIENTE, y es el más caro

Impresiones en vivo: `7875P` · `Sell` · `$245K` · Size 20 · Cond `ML` · Spot $7.751,96.

- **El lado (Buy/Sell) es lo valioso** y es justo lo que a nosotros nos falta. Ya tenemos el
  recolector de flujo firmado corriendo contra el stream de ThetaData.
- `Cond: ML / SL` son códigos de condición del trade. Hay que mapearlos antes de enseñarlos.
- **Su taxonomía de 7 categorías del lado comprador/vendedor está sin descifrar.** Antes de
  copiarla hay que entenderla; si no, es una etiqueta bonita encima de una suposición.

---

## Orden sugerido

1. **Gamma Ladder** (4) — los datos ya están, es casi todo vista. Máximo valor por hora invertida.
2. **Flow Tape** (5) — tenemos la fuente; falta mapear condiciones y decidir la taxonomía.
3. **Underlying & Gamma** (3) — el último, porque exige persistir series intradía que hoy no guardamos.
