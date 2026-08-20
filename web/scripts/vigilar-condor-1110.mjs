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

// Y SI EL DÍA OBJETIVO YA ESCRIBIÓ, PASA AL SIGUIENTE. Sin esto, rearmarlo a las 11:14 —después
// del cron pero antes de la hora límite— elige HOY, ve las filas ya puestas y dispara al
// instante repitiendo el aviso de hace un minuto. Pasó el 2026-08-20.
const siguienteHabil = (d) => { const x = new Date(d + 'T12:00:00Z'); do { x.setUTCDate(x.getUTCDate() + 1); } while (x.getUTCDay() === 0 || x.getUTCDay() === 6); return x.toISOString().slice(0, 10); };

const r = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  // Reintenta con espera creciente en vez de martillear el DNS con el portátil dormido.
  retryStrategy: (veces) => Math.min(veces * 2000, 30_000),
});
// SIN ESTO, cada reintento de DNS es un 'Unhandled error event' que el monitor convierte en una
// notificación. Callarlos es correcto: filaDelDia() ya se traga los fallos de red, y quien decide
// que algo va mal es la HORA LÍMITE, no la conexión.
r.on('error', () => {});
const filaDelDia = async (key) => {
  try {
    const crudo = await r.get(key);
    if (!crudo) return null;
    return (JSON.parse(crudo) ?? []).find((o) => o.dia === (globalThis.__dia || DIA)) ?? null;
  } catch { return null; }              // un fallo de red no puede matar la vigilancia
};

/** Una línea legible por operación. "sin señal" NO es un fallo: es el filtro trabajando. */
const describir = (o) => {
  if (!o) return "todavía nada";
  if (o.estado === "sin señal") return `sin señal — ${o.motivo ?? "?"}`;
  if (o.credito == null) return o.estado;
  return `crédito $${Math.round(o.credito * 100)} · call ${o.callCorta}/${o.callLarga} · put ${o.putCorta}/${o.putLarga}`;
};

{
  // ¿ya está escrito el día que íbamos a vigilar? entonces vigila el siguiente.
  const yaEscrito = (await Promise.all(CUADERNOS.map((c) => filaDelDia(c.key)))).every(Boolean);
  if (yaEscrito) { const otro = siguienteHabil(DIA); console.error('[vigilante] ' + DIA + ' ya escribió; paso a ' + otro); globalThis.__dia = otro; }
}
let OBJETIVO = globalThis.__dia || DIA;

while (true) {
  // Todavía no ha llegado el día objetivo: dormir sin hacer ruido.
  if (hoyET() < OBJETIVO) { await new Promise((s) => setTimeout(s, 600_000)); continue; }

  const filas = [];
  for (const c of CUADERNOS) filas.push({ ...c, fila: await filaDelDia(c.key) });
  const escritos = filas.filter((f) => f.fila);

  if (escritos.length === CUADERNOS.length) {
    console.log(`✅ ${reloj()} ET · LOS TRES CUADERNOS ESCRIBIERON (${OBJETIVO})`);
    for (const f of filas) console.log(`   ${f.nombre.padEnd(24)} ${describir(f.fila)}`);
    break;
  }

  if (hoyET() > OBJETIVO || (hoyET() === OBJETIVO && ahoraMin() >= LIMITE)) {
    const faltan = filas.filter((f) => !f.fila);
    console.log(`❌ ${reloj()} ET · pasada la hora y faltan ${faltan.length} de ${CUADERNOS.length} cuadernos (${OBJETIVO})`);
    for (const f of filas) console.log(`   ${f.fila ? "✓" : "✗"} ${f.nombre.padEnd(24)} ${describir(f.fila)}`);
    console.log(`   → node --env-file=.env.local scripts/railway-api.mjs --logs "Forward · Cóndor 0DTE" --lineas 40`);
    break;
  }

  await new Promise((s) => setTimeout(s, 60_000));
}
await r.quit();
