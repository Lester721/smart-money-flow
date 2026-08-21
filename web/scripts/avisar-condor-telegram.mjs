// EL PARTE DIARIO DEL CÓNDOR, ENVIADO POR RAILWAY — no por mí.
//
// ═══ POR QUÉ EXISTE ════════════════════════════════════════════════════════════════════════
//
// Hasta hoy el aviso de "los cuadernos escribieron" lo mandaba un vigilante que vive en la sesión
// de Claude. Si Lester me apaga, el vigilante muere y el aviso no llega — aunque los cron sí
// corran. Esto lo manda el propio Railway al terminar de escribir, así que llega exista yo o no.
//
// Y tiene una virtud que el otro no tenía: **si un día NO llega el mensaje, eso mismo avisa de
// que algo se rompió.** El silencio deja de ser ambiguo.
//
// Se ejecuta AL FINAL del cron del cóndor, después de los cuatro cuadernos. Si falla, no puede
// tumbar nada: los cuadernos ya están escritos y guardados cuando esto arranca.
//
// Uso: node scripts/avisar-condor-telegram.mjs        (necesita REDIS_URL y las de Telegram)

import Redis from "ioredis";

const TG = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;

const CUADERNOS = [
  { key: "forward:gex-condor", nombre: "con filtro de GEX", regla: "±25, sólo GEX positivo" },
  { key: "forward:condor-sinfiltro", nombre: "SIN filtro", regla: "±25, todos los días" },
  { key: "forward:condor-tendencia", nombre: "con amplitud", regla: "±30, sobre MA20 y MA50" },
  { key: "forward:tres-sies", nombre: "LOS TRES SÍES", regla: "±45, sobre MA5 y MA50, crédito ≥$100" },
];

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DIA = process.argv[2] || hoyET();

/** Una línea por cuaderno. "sin señal" NO es un fallo: es el filtro haciendo su trabajo. */
function describir(o) {
  if (!o) return "✗ no escribió";
  if (o.estado === "sin señal") return `— sin señal · ${o.motivo ?? "?"}`;
  if (o.credito == null) return o.estado;
  return `✓ crédito $${Math.round(o.credito * 100)} · call ${o.callCorta}/${o.callLarga} · put ${o.putCorta}/${o.putLarga}`;
}

/** El acumulado de cada cuaderno, que es lo que de verdad importa a la larga. */
function acumulado(filas) {
  const cerradas = filas.filter((o) => o.estado === "cerrada" && typeof o.pl === "number");
  if (!cerradas.length) return "sin cierres todavía";
  const total = cerradas.reduce((a, o) => a + o.pl, 0);
  const gana = cerradas.filter((o) => o.pl > 0).length;
  return `${cerradas.length} cierres · ${Math.round((gana / cerradas.length) * 100)}% acierto · ${total < 0 ? "−" : "+"}$${Math.abs(Math.round(total))}`;
}

const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
r.on("error", () => {});                       // los fallos de red no pueden tumbar esto

const lineas = [`📓 CÓNDOR · ${DIA}`, ""];
let escribieron = 0;
for (const c of CUADERNOS) {
  let filas = [];
  try { filas = JSON.parse((await r.get(c.key)) ?? "[]"); } catch { /* se dice abajo */ }
  const hoy = filas.find((o) => o.dia === DIA);
  if (hoy) escribieron++;
  lineas.push(`${c.nombre}`);
  lineas.push(`  ${describir(hoy)}`);
  lineas.push(`  acumulado: ${acumulado(filas)}`);
  lineas.push("");
}

// EL AVISO QUE IMPORTA: si falta alguno, va DELANTE y con el comando para mirarlo.
if (escribieron < CUADERNOS.length) {
  lineas.splice(1, 0, `⚠️ SÓLO ${escribieron} de ${CUADERNOS.length} cuadernos escribieron`, "");
  lineas.push(`Revisar: railway-api.mjs --logs "Forward · Cóndor 0DTE"`);
}
await r.quit().catch(() => {});

const texto = lineas.join("\n");
console.log(texto);

if (!TG || !CHAT) {
  console.error("\n(sin TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID: no se envía, sólo se imprime)");
  process.exit(0);
}
try {
  const res = await fetch(`https://api.telegram.org/bot${TG}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT, text: texto, disable_web_page_preview: true }),
    signal: AbortSignal.timeout(30_000),
  });
  console.log(res.ok ? "\n✓ enviado por Telegram" : `\n✗ Telegram devolvió ${res.status}`);
} catch (e) {
  // NO se relanza el error: el parte es un extra, y no puede hacer fallar el cron entero.
  console.error(`\n✗ no se pudo enviar: ${e.message.slice(0, 60)}`);
}
