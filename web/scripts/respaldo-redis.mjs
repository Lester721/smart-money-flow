// RESPALDO DE REDIS — copia de seguridad antes de tocar nada en producción.
//
// Uso:
//   node --env-file=.env.local scripts/respaldo-redis.mjs            (guarda)
//   node --env-file=.env.local scripts/respaldo-redis.mjs --listar   (ve qué respaldos hay)
//   node --env-file=.env.local scripts/respaldo-redis.mjs --restaurar <fichero>
//
// POR QUÉ. Los ledgers de los forward-tests viven SÓLO en Redis: el disco del contenedor de
// Railway se borra en cada arranque. Si una corrida escribe algo mal —un Run now en sábado, un
// script a medio arreglar— no hay atrás. Un respaldo cuesta dos segundos y lo hace reversible.
//
// El fichero va a data/respaldos/ y está en .gitignore: son datos, no código.

import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import Redis from "ioredis";

const DIR = "data/respaldos";
const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };

if (process.argv.includes("--listar")) {
  if (!existsSync(DIR)) { console.log("no hay ningún respaldo todavía"); process.exit(0); }
  for (const f of readdirSync(DIR).sort()) {
    const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    console.log(`  ${f}  ·  ${Object.keys(d.claves).length} claves  ·  ${d.cuandoET}`);
  }
  process.exit(0);
}

if (!process.env.REDIS_URL) { console.error("falta REDIS_URL en .env.local"); process.exit(1); }
const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });

const restaurar = arg("--restaurar");
if (restaurar) {
  const d = JSON.parse(readFileSync(restaurar, "utf8"));
  console.log(`restaurando ${Object.keys(d.claves).length} claves del respaldo de ${d.cuandoET}\n`);
  for (const [k, v] of Object.entries(d.claves)) {
    if (v.tipo === "string") await r.set(k, v.valor);
    else if (v.tipo === "list") { await r.del(k); if (v.valor.length) await r.rpush(k, ...v.valor); }
    else { console.log(`  (saltada ${k}: tipo ${v.tipo} no soportado)`); continue; }
    console.log(`  ✓ ${k}`);
  }
  await r.quit();
  process.exit(0);
}

// ── guardar ─────────────────────────────────────────────────────────────────
const claves = {};
for (const k of (await r.keys("*")).sort()) {
  const tipo = await r.type(k);
  if (tipo === "string") claves[k] = { tipo, valor: await r.get(k) };
  else if (tipo === "list") claves[k] = { tipo, valor: await r.lrange(k, 0, -1) };
  else claves[k] = { tipo, valor: null };
}

const ahora = new Date();
const sello = ahora.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const cuerpo = {
  cuandoISO: ahora.toISOString(),
  cuandoET: ahora.toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16),
  claves,
};
mkdirSync(DIR, { recursive: true });
const destino = join(DIR, `redis-${sello}.json`);
writeFileSync(destino, JSON.stringify(cuerpo), "utf8");

console.log(`respaldo de ${Object.keys(claves).length} claves → ${destino}`);
for (const [k, v] of Object.entries(claves)) {
  const n = v.tipo === "string" ? `${v.valor.length} caracteres`
          : v.tipo === "list" ? `${v.valor.length} elementos` : v.tipo;
  console.log(`  ${k.padEnd(34)} ${n}`);
}
console.log(`\npara volver atrás:\n  node --env-file=.env.local scripts/respaldo-redis.mjs --restaurar ${destino}`);
await r.quit();
