# Pregunta a soporte de ThetaData — historia de SPY

**Enviar a:** `support@thetadata.net`
**Asunto:** `Earliest available stock EOD history for SPY on Stocks Standard`

---

## Texto para pegar

Hi,

I'm on **Options Standard + Stocks Value** and I'm evaluating an upgrade to **Stocks Standard**
before my next renewal. Before I subscribe I'd like to confirm one thing, because your two
sources disagree and my decision depends entirely on the answer.

**My question:** what is the **earliest available date** for `/v3/stock/history/eod?symbol=SPY`
on each stocks tier — Value, Standard, and Pro?

**Why I'm asking.** Your Subscriptions doc says UTP-tape history goes back to 2012-06-01, while
symbols only available on the **CTA** tape are limited to **2020-01-01**, and it names `SPY` as an
example. Meanwhile the pricing page advertises Stocks Standard as "4 Years of CTA data" (which
would be 2022) and Stocks Pro as "8 Years of CTA data" (2018). Those three dates — 2020, 2022,
2018 — are all different, and SPY is the single most important symbol for my research.

I also noticed the "Years of data" labels don't match what I actually receive today. My **Options
Standard** plan is advertised as "8 Years of data" (which would be 2018), but I have successfully
pulled **the entire year 2016** — every month from January to December — including contracts such
as `SPY160318C00190000`. So rather than infer the real cutoffs from the marketing labels, I'd
prefer to confirm them with you.

**Two follow-ups, if you don't mind:**

1. On **Stocks Standard**, what is the earliest EOD date for **UTP-listed** symbols such as
   `AAPL`, `MSFT`, `NVDA`, `QQQ`? The docs say 2016-01-01 — is that correct?
2. Is the CTA limitation a **subscription** limit or a **data availability** limit? In other
   words, would upgrading to Stocks Pro give me more SPY history than Standard, or is SPY capped
   at the same date on every tier?

Thanks very much,
Lester

---

## Qué dice, en corto

1. **La pregunta principal:** ¿desde qué fecha hay EOD de SPY en cada plan de acciones?
2. **Por qué:** sus dos fuentes se contradicen (2020 en la documentación, 2022 y 2018 en la
   página de precios).
3. **El argumento que lo hace difícil de esquivar:** les demuestro con un ejemplo concreto
   (`SPY160318C00190000`) que sus etiquetas de "años de datos" ya no cuadran con lo que
   realmente entregan hoy — así que no me sirve deducirlo, lo tienen que confirmar.
4. **Las dos de propina:** ¿los símbolos de Nasdaq sí llegan a 2016? y ¿el tope de SPY es del
   plan o del dato? (Esta última es la que decide si Stocks Pro aporta algo.)

## Cómo leer la respuesta

| Si contestan | Qué significa |
|---|---|
| SPY desde **2016** | Mejor de lo esperado — Standard cubre todo |
| SPY desde **2020** | Lo que ya calculamos — Standard vale la pena igual (8 de 9 tickers a 2016) |
| SPY desde **2022** | **No compres.** Apenas mejora el 2021 que ya tienes; hay que buscar el precio de SPY en otra fuente |
| "Es límite del dato, no del plan" | Confirma que **Stocks Pro no aporta nada** para nosotros |
