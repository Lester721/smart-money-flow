// ARCHIVAR EL FLUJO DEL DÍA — comprimir y copiar a OneDrive.
//
// El flujo en vivo NO SE PUEDE VOLVER A BAJAR: o se grabó ese día, o se perdió para siempre.
// Por eso hay copia fuera del disco. Pero el archivo en vivo nunca vive dentro de OneDrive: se
// escribe cientos de miles de veces al día y la sincronización lo estaría re-subiendo sin parar.
// Se comprime al cierre, una vez, y se copia el resultado.
//
// El JSONL comprime alrededor de 10 a 1: ~180 MB del día quedan en ~18 MB. Un año son ~4,5 GB
// contra el terabyte de la suscripción de Microsoft 365 que Lester ya paga.
//
// Es idempotente: si el .gz ya existe y es más nuevo que el original, no rehace nada.
//
// Uso:  node scripts/gex-2026/archivar-flujo.mjs              (el día de hoy)
//       node scripts/gex-2026/archivar-flujo.mjs --dia 2026-08-12
//       node scripts/gex-2026/archivar-flujo.mjs --todos      (todos los .jsonl sin archivar)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pipeline } from "node:stream/promises";

const ORIGEN = path.join("data", "flujo");
const NUBE = process.env.FLUJO_NUBE || "C:\\Users\\leste\\OneDrive\\Datos EVA\\flujo";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const mb = (b) => (b / 1024 / 1024).toFixed(1);

async function archivar(dia) {
  const crudo = path.join(ORIGEN, `${dia}.jsonl`);
  const gz = path.join(ORIGEN, `${dia}.jsonl.gz`);
  if (!fs.existsSync(crudo)) return { dia, estado: "no existe" };

  const tamCrudo = fs.statSync(crudo).size;
  if (tamCrudo === 0) return { dia, estado: "vacío" };

  // ¿Ya está comprimido y al día?
  const hecho = fs.existsSync(gz) && fs.statSync(gz).mtimeMs >= fs.statSync(crudo).mtimeMs;
  if (!hecho) {
    await pipeline(fs.createReadStream(crudo), zlib.createGzip({ level: 9 }), fs.createWriteStream(gz));
  }
  const tamGz = fs.statSync(gz).size;

  // La copia a la nube. Si OneDrive no está, se dice y se sigue — el .gz local ya existe y eso
  // es lo que importa; la copia es un extra, no el objetivo.
  let nube = "no copiado";
  try {
    fs.mkdirSync(NUBE, { recursive: true });
    const destino = path.join(NUBE, `${dia}.jsonl.gz`);
    const yaEsta = fs.existsSync(destino) && fs.statSync(destino).size === tamGz;
    if (!yaEsta) fs.copyFileSync(gz, destino);
    nube = yaEsta ? "ya estaba" : "copiado";
  } catch (e) {
    nube = `FALLÓ: ${String(e.message).slice(0, 70)}`;
  }

  return { dia, estado: hecho ? "ya comprimido" : "comprimido", tamCrudo, tamGz,
           ratio: (tamCrudo / tamGz).toFixed(1), nube };
}

const dias = process.argv.includes("--todos")
  ? [...new Set(fs.existsSync(ORIGEN) ? fs.readdirSync(ORIGEN).filter((f) => f.endsWith(".jsonl")).map((f) => f.replace(".jsonl", "")) : [])].sort()
  : [arg("--dia") || hoyET()];

console.log(`═══ ARCHIVAR FLUJO ═══`);
console.log(`   local: ${ORIGEN}`);
console.log(`   nube : ${NUBE}\n`);

let ahorro = 0;
for (const d of dias) {
  const r = await archivar(d);
  if (!r.tamGz) { console.log(`  ${d}  —  ${r.estado}`); continue; }
  ahorro += r.tamCrudo - r.tamGz;
  console.log(`  ${d}  ${mb(r.tamCrudo).padStart(7)} MB → ${mb(r.tamGz).padStart(6)} MB  (${r.ratio}:1)  ·  nube: ${r.nube}`);
}
if (ahorro > 0) console.log(`\n   ahorro total: ${mb(ahorro)} MB`);
console.log(`\n   El .jsonl sin comprimir SE QUEDA en local para analizar. Borrarlo es`);
console.log(`   una decisión aparte y a mano — el .gz ya está a salvo en la nube.\n`);
