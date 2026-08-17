// AUDITORÍA — extrae el strike máximo de cada cadena diaria (para reconstruir los splits
// exactamente como los detecta puente-se-veia-venir.mjs). Sólo lee; no toca nada.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas";
const solo = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const out = {};
let i = 0;
const re = /"(\d+(?:\.\d+)?)\|[CP]"/g;
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (solo && !solo.has(m[1])) continue;
  const s = readFileSync(`${CDIR}/${f}`, "utf8");
  let maxK = 0, x;
  re.lastIndex = 0;
  while ((x = re.exec(s)) !== null) { const v = +x[1]; if (v > maxK) maxK = v; }
  out[`${m[1]}|${m[2]}`] = maxK;
  if (++i % 5000 === 0) console.error(i);
}
writeFileSync("scripts/auditc-maxk.json", JSON.stringify(out), "utf8");
console.log(`${i} cadenas`);
