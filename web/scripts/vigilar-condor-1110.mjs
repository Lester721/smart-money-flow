// VIGILAR LA CORRIDA DE LAS 11:10 — emite UNA línea y se muere.
//
// Lester pidió que le avise cuando el cóndor corra hoy. Es la primera vez que corre con todo lo
// de esta mañana: el jar dentro de la imagen, los reintentos, y el SEGUNDO registro sin filtro
// encadenado detrás del filtrado.
//
// ⚠️ EL SILENCIO NO ES ÉXITO. Un vigilante que sólo sabe decir "ya corrió" se calla igual si el
// servicio se cae, si el Terminal no arranca, o si el cron ni se dispara — y callarse se lee como
// "todavía no". Por eso hay HORA LÍMITE: a las 11:30 avisa igual, diciendo que NO corrió.
// Ver [auditar-el-propio-monitor] en memoria: un monitor tiene que fallar CERRADO.

import Redis from "ioredis";

const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const LIMITE = 11 * 60 + 30;                       // 11:30 ET, 20 min de margen sobre el cron
const KEYS = { filtrado: "forward:gex-condor", sinFiltro: "forward:condor-sinfiltro" };

const ahoraMin = () => {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false });
  return +s.slice(0, 2) * 60 + +s.slice(3, 5);
};
const reloj = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false }).slice(0, 5);

const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const filaDeHoy = async (key) => {
  try {
    const crudo = await r.get(key);
    if (!crudo) return null;
    return (JSON.parse(crudo) ?? []).find((o) => o.dia === HOY) ?? null;
  } catch { return null; }                          // un fallo de red no mata la vigilancia
};

const describir = (o) => {
  if (!o) return "sin fila";
  if (o.estado === "sin señal") return `SIN SEÑAL (${o.motivo ?? "?"})`;
  if (o.credito == null) return o.estado;
  return `crédito $${Math.round(o.credito * 100)} · call ${o.callCorta}/${o.callLarga} · put ${o.putCorta}/${o.putLarga}`;
};

while (true) {
  const a = await filaDeHoy(KEYS.filtrado);
  const b = await filaDeHoy(KEYS.sinFiltro);

  if (a || b) {
    console.log(`✅ ${reloj()} ET · EL CÓNDOR CORRIÓ (${HOY})`);
    console.log(`   filtrado por GEX : ${describir(a)}`);
    console.log(`   SIN filtro       : ${describir(b)}`);
    if (a && !b) console.log(`   ⚠ el registro SIN FILTRO no escribió — el encadenado no funcionó`);
    if (!a && b) console.log(`   ⚠ el registro FILTRADO no escribió`);
    break;
  }

  if (ahoraMin() >= LIMITE) {
    console.log(`❌ ${reloj()} ET · SON LAS ${Math.floor(LIMITE / 60)}:${LIMITE % 60} Y EL CÓNDOR NO HA ESCRITO NADA (${HOY})`);
    console.log(`   ninguno de los dos registros tiene fila de hoy · revisar:`);
    console.log(`   node --env-file=.env.local scripts/railway-api.mjs --logs "Forward · Cóndor 0DTE" --lineas 40`);
    break;
  }

  await new Promise((s) => setTimeout(s, 60_000));
}
await r.quit();
