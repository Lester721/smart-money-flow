// ══ PRECIOS AJUSTADOS POR SPLIT ══ para poder medir «la acción recuperó su media».
//
// precios-diarios.json trae precios CRUDOS: AAPL 499→129 el día de su split 4:1. Cualquier
// media móvil sobre eso es basura durante 20-200 días después de cada split.
//
// El ajuste es HACIA ATRÁS y NO mira al futuro: escala uniformemente el pasado, así que el
// COCIENTE precio/media —que es lo único que usamos— queda intacto. Es exactamente lo que ve
// un operador en su gráfico, que su bróker ya le ajusta.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const P = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8"));
const OUT = {}; let nSplits = 0;
console.log("");
for (const tk of Object.keys(P)) {
  const D = Object.keys(P[tk]).sort();
  const v = D.map(d => P[tk][d]);
  // detectar saltos y acumular el factor hacia atrás
  const fac = new Array(v.length).fill(1);
  const sp = [];
  for (let i = 1; i < v.length; i++) {
    const r = v[i] / v[i-1];
    if (r < 0.6 || r > 1.7) { sp.push([D[i], r]); }
  }
  // aplicar: todo lo ANTERIOR a cada salto se multiplica por la razón del salto
  for (const [f, r] of sp) {
    const k = D.indexOf(f);
    for (let i = 0; i < k; i++) fac[i] *= r;
  }
  OUT[tk] = {}; for (let i = 0; i < D.length; i++) OUT[tk][D[i]] = Math.round(v[i]*fac[i]*10000)/10000;
  if (sp.length) { nSplits += sp.length;
    console.log("  " + tk.padEnd(6) + sp.map(([f,r]) => f + " x" + r.toFixed(3)).join("  ")); }
}
writeFileSync(join(CACHE, "precios-ajustados.json"), JSON.stringify(OUT));
console.log("");
console.log("  ══ AUDIT ══");
let malos = 0;
for (const tk of Object.keys(OUT)) { const D = Object.keys(OUT[tk]).sort();
  for (let i = 1; i < D.length; i++) { const r = OUT[tk][D[i]]/OUT[tk][D[i-1]];
    if (r < 0.6 || r > 1.7) { malos++; console.log("  ⛔ queda un salto: " + tk + " " + D[i] + " x" + r.toFixed(3)); } } }
console.log("  saltos ajustados: " + nSplits + "   ·   saltos que quedan: " + malos + (malos ? "  ⛔" : "  ✓"));
// comprobación: el precio de HOY no se toca nunca (el ajuste es sólo hacia atrás)
let ok = 0, tot = 0;
for (const tk of Object.keys(OUT)) { const D = Object.keys(OUT[tk]).sort(); const u = D[D.length-1];
  tot++; if (Math.abs(OUT[tk][u] - P[tk][u]) < 0.01) ok++; }
console.log("  el ÚLTIMO precio de cada ticker queda intacto: " + ok + " de " + tot + (ok===tot ? "  ✓" : "  ⛔"));
console.log("");
