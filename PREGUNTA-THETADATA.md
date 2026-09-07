# Pregunta a soporte de ThetaData — streaming y NBBO consolidado

**Enviar a:** `support@thetadata.net`
**Asunto:** `Options streaming on Standard + is the options quote a consolidated NBBO?`

Preparada el 2026-08-11. Dos preguntas que deciden cosas distintas:

1. **El streaming** — si no funciona, no hay flujo firmado en tiempo real y hay que replantear.
2. **Si la cotización es NBBO consolidado o de un subconjunto de mercados** — de esto depende que
   la clasificación compra/venta esté sesgada o no. Es la más importante de las dos y la que
   nadie documenta.

---

## Texto para pegar

Hi,

I'm on **Options Standard + Stocks Value**, running Theta Terminal v3 locally. Two questions.

### 1. Options streaming on the Standard tier

I connect successfully to `ws://127.0.0.1:25520/v1/events` and send:

```json
{"msg_type":"STREAM","sec_type":"OPTION","req_type":"TRADE","add":true,"id":1,"contract":{"root":"SPXW"}}
```

The socket opens, but I only receive repeated `{"header":{"type":"STATUS","status":"DISCONNECTED"}}`
and no trades. The Terminal log shows:

```
ERROR: [FPSS] Unable to connect to any listed streaming servers. Please ensure you are not
trying to use the test server and there is no scheduled maintenance.
```

**Questions:**
- Is the options **trade stream** included in the **Options Standard** subscription, or does it
  require a higher tier? I'd rather know than guess from the silence.
- If it *is* included, what does `[FPSS] Unable to connect` usually mean — an outage on your
  side, or something local (firewall / TLS)? I already had to point the Terminal at a custom
  truststore because a local security product was breaking TLS, so a local cause is plausible.
- Is the subscription message above the correct format for v3?

### 2. Is the options quote a consolidated NBBO?

This one matters more to me than the first.

When I pull `/v3/option/history/quote` (or the `bid`/`ask` columns in
`/v3/option/history/greeks/implied_volatility`), **is that the consolidated NBBO across all OPRA
exchanges, or the best quote from a subset of venues?**

I ask because I classify each trade as buyer- or seller-initiated by whether it printed at the
bid or at the ask. If the quote I'm comparing against is not the true consolidated NBBO, that
classification is systematically biased — a trade can look like it "lifted the ask" simply
because the real national best offer was on a venue I'm not seeing.

Specifically:
- Which OPRA participant exchanges feed the `bid`/`ask` fields?
- Are `bid_exchange` / `ask_exchange` the venue posting the best quote at that moment across all
  venues, or only within the subset you consolidate?
- Same question for the `trade_quote` endpoint: is the attached quote the NBBO **at the exact
  moment of the trade**, or the last quote you had on record?

Thanks,
Lester

---

## Qué se hace con cada respuesta

| respuesta | consecuencia |
|---|---|
| streaming incluido y es un fallo suyo/local | se arregla y se monta el recolector de flujo firmado |
| streaming necesita plan superior | **no comprar todavía**: primero medir con el histórico `trade_quote`, que ya se tiene |
| la cotización SÍ es NBBO consolidado | la clasificación compra/venta vale; se puede medir el desequilibrio |
| es de un subconjunto | hay sesgo — habría que cuantificarlo, o mirar el NBBO consolidado de Databento (OPRA.PILLAR) |

**Antes de pagar nada:** ver [[analisis-antes-de-recomendar-gasto]]. Los $200 de Massive fueron
por comprar antes de medir.
