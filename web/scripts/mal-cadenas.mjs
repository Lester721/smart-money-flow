// LA CADENA DE LAS 11:00, guardada entera para poder mover los strikes sin releer 5,2 GB.
//
// Para cada uno de los 1.121 días guarda todos los strikes con cotización a ±260 puntos del
// spot de las 11:00, con BID y ASK reales. Con eso se puede probar cualquier regla de colocación
// de patas (±25 fijos, ±k·sigma, alas de 20/30/50/75) sin volver a tocar los CSV.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", VENTANA = 260;

function chain(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n");
  const cab = txt.slice(0, nl).split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const out = []; let spot = 0;
  let pos = nl + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos); if (fin < 0) fin = txt.length;
    const lin = txt.slice(pos, fin); pos = fin + 1;
    if (lin.length < 20) continue;
    const c1 = lin.lastIndexOf(",");
    const c2 = lin.lastIndexOf(",", c1 - 1);
    if (lin.slice(c2 + 12, c2 + 17) !== HORA) continue;
    const sp = +lin.slice(c1 + 1); if (sp > 0) spot = sp;
    const c = lin.split(",");
    const K = +c[iK], bid = +c[iB], ask = +c[iA], iv = +c[iV];
    if (K > 0 && bid >= 0 && ask > 0) out.push([K, bid, ask, iv]);
  }
  if (!spot) return null;
  return out.filter((r) => Math.abs(r[0] - spot) <= VENTANA).sort((a, b) => a[0] - b[0]);
}

const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"));
const salida = {};
const t0 = Date.now();
let vacios = 0;
for (let i = 0; i < dias.length; i++) {
  const d = dias[i];
  if (i % 100 === 0) console.log(`   ${i}/${dias.length} · ${d.fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  const C = chain(d.fecha, "C"), P = chain(d.fecha, "P");
  if (!C || !P || !C.length || !P.length) { vacios++; console.log("   VACÍA:", d.fecha); continue; }
  salida[d.fecha] = { C, P };
}
console.log(`## ${Object.keys(salida).length} cadenas · ${vacios} vacías · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
// control de densidad: strikes disponibles a ±260, por año
const porAno = {};
for (const [f, v] of Object.entries(salida)) {
  const a = f.slice(0, 4);
  (porAno[a] = porAno[a] || []).push(v.C.length);
}
for (const [a, v] of Object.entries(porAno)) {
  const s = [...v].sort((x, y) => x - y);
  console.log(`   ${a}: strikes CALL a ±260 pts — mínimo ${s[0]} · mediana ${s[s.length >> 1]} · máximo ${s[s.length - 1]}`);
}
writeFileSync("scripts/mal-cadenas.json", JSON.stringify(salida), "utf8");
console.log("## guardado en scripts/mal-cadenas.json");
