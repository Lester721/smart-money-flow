// ESTADO REAL DE LOS CRON DE RAILWAY — mirando lo que ESCRIBIERON, no lo que dijo el log.
//
// Un log puede decir "ok" y no haber guardado nada; y en Railway el disco del contenedor se borra
// en cada arranque, así que lo único que prueba que un cron corrió de verdad es lo que hay en
// Redis. Cada operación lleva `origen` (railway o local) — sin eso, una prueba mía tapa un fallo
// suyo.
//
// Uso: node --env-file=.env.local scripts/estado-railway.mjs
// No imprime NINGUNA credencial.

import Redis from "ioredis";

if (!process.env.REDIS_URL) { console.error("falta REDIS_URL en .env.local"); process.exit(1); }
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DESDE_ORIGEN = "2026-08-13";   // el día que se añadió el campo `origen`
const ahoraET = new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);

const claves = await r.keys("*");
claves.sort();
console.log(`AHORA (hora de Nueva York): ${ahoraET}\n`);
console.log(`claves en Redis: ${claves.length}\n`);

let avisos = 0;
for (const k of claves) {
  const tipo = await r.type(k);
  if (tipo !== "string") { console.log(`  ${k.padEnd(34)} (${tipo})`); continue; }
  const crudo = await r.get(k);

  // Los informes de texto se enseñan aparte, buscando avisos.
  if (k.endsWith(":report")) {
    const warns = (crudo.match(/⚠|WARN|error|ERROR|falló|fallo/gi) || []).length;
    if (warns) avisos += warns;
    console.log(`  ${k.padEnd(34)} informe de ${crudo.length} caracteres · ${warns ? `⚠ ${warns} avisos` : "sin avisos"}`);
    continue;
  }

  let v; try { v = JSON.parse(crudo); } catch { console.log(`  ${k.padEnd(34)} ${crudo.slice(0, 60)}`); continue; }

  if (Array.isArray(v)) {
    const dias = v.map((o) => o.dia ?? o.entryDate ?? o.fecha).filter(Boolean).sort();
    const orig = {};
    for (const o of v) orig[o.origen ?? "SIN ORIGEN"] = (orig[o.origen ?? "SIN ORIGEN"] ?? 0) + 1;
    const abiertas = v.filter((o) => o.estado === "abierta").length;
    console.log(`  ${k}`);
    console.log(`      ${v.length} operaciones · ${dias[0] ?? "?"} → ${dias[dias.length - 1] ?? "?"} · ` +
                `${abiertas} abiertas`);
    console.log(`      origen: ${Object.entries(orig).map(([a, b]) => `${a}=${b}`).join(" · ")}`);
    const ultimo = dias[dias.length - 1];
    const dias_atras = ultimo ? Math.round((Date.parse(hoyET()) - Date.parse(ultimo)) / 86_400_000) : null;
    if (dias_atras != null && dias_atras > 4) { console.log(`      ⚠ la última operación es de hace ${dias_atras} días`); avisos++; }
    // El campo `origen` se añadió el 2026-08-13 a las 23:20 (commit 0c39633). Lo anterior no lo
    // lleva y NO es un fallo: es historia. Sólo se avisa de las posteriores, que sí deberían
    // llevarlo. Contar las viejas como fallo cada día enseña a ignorar el contador.
    const sinOrigenNuevas = v.filter((o) => (o.dia ?? o.entryDate ?? "") > DESDE_ORIGEN).filter((o) => !o.origen).length;
    const sinOrigenViejas = (orig["SIN ORIGEN"] ?? 0) - sinOrigenNuevas;
    if (sinOrigenViejas > 0) console.log(`      ${sinOrigenViejas} anteriores al ${DESDE_ORIGEN} (el campo no existía todavía)`);
    if (sinOrigenNuevas > 0) { console.log(`      ⚠ ${sinOrigenNuevas} operaciones POSTERIORES al ${DESDE_ORIGEN} sin marcar el origen`); avisos++; }
  } else {
    console.log(`  ${k.padEnd(34)} ${JSON.stringify(v).slice(0, 90)}`);
  }
}

console.log(`\n${avisos === 0 ? "✅ NINGÚN AVISO" : `⚠ ${avisos} avisos — hay que mirarlos`}`);
await r.quit();
