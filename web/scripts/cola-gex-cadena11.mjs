// PASO 5a — volcar la cadena de las 11:00 (y el cierre real) a un fichero compacto,
// para poder probar VARIAS distancias de strike sin releer 3,4 GB cada vez.
// Sólo se guarda lo que existe de verdad: bid/ask/IV reales del fichero.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00";

function leerLado(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  const filas = []; let spot11 = 0, spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 20) continue;
    const c = l.split(","), hora = c[iT].slice(11, 16), sp = +c[iU];
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    if (sp > 0) spot11 = sp;
    filas.push([+c[iK], +c[iB], +c[iA], +c[iV]]);
  }
  return { filas, spot11, cierre: spotFin };
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const out = [];
for (const fecha of fechas) {
  const C = leerLado(fecha, "C"), P = leerLado(fecha, "P");
  if (!C || !P) continue;
  const spot = C.spot11 || P.spot11, cierre = Math.max(C.cierre, P.cierre);
  if (!(spot > 0) || !(cierre > 0)) continue;
  const crib = (fs) => fs.filter(([K, b, a]) => K > 0 && a > 0 && b >= 0 && Math.abs(K - spot) / spot < 0.05);
  out.push({ fecha, spot, cierre, C: crib(C.filas), P: crib(P.filas) });
}
writeFileSync("scripts/cola-cadena11.json", JSON.stringify(out));
console.log(`${out.length} días · ${out.reduce((s, d) => s + d.C.length + d.P.length, 0).toLocaleString("es-ES")} cotizaciones reales de las 11:00`);
console.log(`strikes por día: mediana ${out.map(d=>d.C.length+d.P.length).sort((a,b)=>a-b)[out.length>>1]}`);
