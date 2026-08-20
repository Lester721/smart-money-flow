// ¿Cuántos ficheros están TRUNCADOS? Si el último timestamp no es el cierre, mi liquidación
// se hace contra un precio de media sesión y nadie se entera. Se comprueba antes de medir.
import { openSync, readSync, statSync, closeSync, readdirSync, writeFileSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026";
function ultimaHora(f) {
  const st = statSync(f), fd = openSync(f, "r");
  const n = Math.min(8192, st.size), buf = Buffer.alloc(n);
  readSync(fd, buf, 0, n, st.size - n); closeSync(fd);
  const lin = buf.toString("utf8").split("\n").filter(l => l.length > 20);
  let max = "", spot = 0;
  for (const l of lin) { const c = l.split(","); const h = c[4]?.slice(11,16);
    if (h && /^\d\d:\d\d$/.test(h) && h >= max) { max = h; if (+c[13] > 0) spot = +c[13]; } }
  return { max, spot };
}
const fechas = [...new Set(readdirSync(DIR).map(f=>f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const cuenta = {}, malos = [];
for (const d of fechas) {
  const u = ultimaHora(`${DIR}/iv_${d}_C.csv`);
  cuenta[u.max] = (cuenta[u.max] ?? 0) + 1;
  if (u.max < "12:55") malos.push({ fecha: d, ultima: u.max });
}
console.log("última hora de cada fichero:", Object.entries(cuenta).sort());
console.log(`\nficheros que NO llegan ni a media sesión: ${malos.length}`);
console.log(malos.map(m=>`${m.fecha}(${m.ultima})`).join(" "));
writeFileSync("scripts/coste-real-truncados.json", JSON.stringify(malos));
