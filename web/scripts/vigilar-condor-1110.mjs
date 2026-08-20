// VIGILAR LA CORRIDA DE LAS 11:10 — LOS TRES CUADERNOS. Emite y se muere.
//
// Desde el 2026-08-20 el cron del cóndor corre TRES forward-tests encadenados bajo una sola
// sesión de ThetaData, para que los tres vean exactamente la misma foto de las 11:00:
//
//   forward:gex-condor        ±25 · sólo los días de GEX positivo   (el pre-registrado)
//   forward:condor-sinfiltro  ±25 · todos los días                  (el control)
//   forward:condor-tendencia  ±30 · sólo por encima de MA20 y MA50  (el nuevo)
//
// ⚠️ EL SILENCIO NO ES ÉXITO. Un vigilante que sólo sabe decir "ya corrió" se calla igual si el
// contenedor no arranca o si el cron ni se dispara — y callarse se lee como "todavía no". Por eso
// hay HORA LÍMITE: pasada ella avisa igual, diciendo QUÉ falta. Ver [auditar-el-propio-monitor].
//
// ⚠️ Y OJO CON ARMARLO DE NOCHE: si el script comparase la hora actual contra las 11:30 sin más,
// armarlo a las 21:00 dispararía un fallo FALSO al instante. Por eso espera primero a que llegue
// el DÍA objetivo, y sólo entonces empieza a mirar.
//
// Uso:  node --env-file=.env.local scripts/vigilar-condor-1110.mjs            (próximo día hábil)
//       node --env-file=.env.local scripts/vigilar-condor-1110.mjs 2026-08-20 (uno concreto)

import Redis from "ioredis";

const CUADERNOS = [
  { key: "forward:gex-condor", nombre: "con filtro de GEX", regla: "±25, sólo GEX positivo" },
  { key: "forward:condor-sinfiltro", nombre: "SIN filtro", regla: "±25, todos los días" },
  { key: "forward:condor-tendencia", nombre: "con filtro de tendencia", regla: "±30, sólo sobre MA20 y MA50" },
];
const LIMITE = 11 * 60 + 40;                       // 11:40 ET — 30 min de margen sobre el cron

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const ahoraMin = () => {
  const s = new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false });
  return +s.slice(0, 2) * 60 + +s.slice(3, 5);
};
const reloj = () => new Date().toLocaleTimeString("en-GB", { timeZone: "America/New_York", hour12: false }).slice(0, 5);

/** El próximo día hábil: si hoy ya pasó la hora del cron, mañana; y nunca sábado ni domingo. */
function proximoDiaHabil() {
  const d = new Date(hoyET() + "T12:00:00Z");
  if (ahoraMin() >= LIMITE) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const DIA = process.argv[2] || proximoDiaHabil();

const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
const filaDelDia = async (key) => {
  try {
    const crudo = await r.get(key);
    if (!crudo) return null;
    return (JSON.parse(crudo) ?? []).find((o) => o.dia === DIA) ?? null;
  } catch { return null; }              // un fallo de red no puede matar la vigilancia
};

/** Una línea legible por operación. "sin señal" NO es un fallo: es el filtro trabajando. */
const describir = (o) => {
  if (!o) return "todavía nada";
  if (o.estado === "sin señal") return `sin señal — ${o.motivo ?? "?"}`;
  if (o.credito == null) return o.estado;
  return `crédito $${Math.round(o.credito * 100)} · call ${o.callCorta}/${o.callLarga} · put ${o.putCorta}/${o.putLarga}`;
};

while (true) {
  // Todavía no ha llegado el día objetivo: dormir sin hacer ruido.
  if (hoyET() < DIA) { await new Promise((s) => setTimeout(s, 600_000)); continue; }

  const filas = [];
  for (const c of CUADERNOS) filas.push({ ...c, fila: await filaDelDia(c.key) });
  const escritos = filas.filter((f) => f.fila);

  if (escritos.length === CUADERNOS.length) {
    console.log(`✅ ${reloj()} ET · LOS TRES CUADERNOS ESCRIBIERON (${DIA})`);
    for (const f of filas) console.log(`   ${f.nombre.padEnd(24)} ${describir(f.fila)}`);
    break;
  }

  if (hoyET() > DIA || (hoyET() === DIA && ahoraMin() >= LIMITE)) {
    const faltan = filas.filter((f) => !f.fila);
    console.log(`❌ ${reloj()} ET · pasada la hora y faltan ${faltan.length} de ${CUADERNOS.length} cuadernos (${DIA})`);
    for (const f of filas) console.log(`   ${f.fila ? "✓" : "✗"} ${f.nombre.padEnd(24)} ${describir(f.fila)}`);
    console.log(`   → node --env-file=.env.local scripts/railway-api.mjs --logs "Forward · Cóndor 0DTE" --lineas 40`);
    break;
  }

  await new Promise((s) => setTimeout(s, 60_000));
}
await r.quit();
