// CATÁLOGO · PASO 6 — VALIDAR LA TUBERÍA ANTES DE CREERSE EL −24%
//
// "MIRAR el fichero antes de medirlo": un −24,23% por operación con 18% de ganadoras
// puede ser el mercado... o puede ser que la cadena de salida no encuentre el contrato y
// se esté leyendo el hueco como CERO. Se comprueba antes de escribir el número.
//
// Uso: node --import tsx scripts/marketsnack/cat-6-validar.mjs

import fs from "node:fs";
import path from "node:path";

const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");
const HOLD = 23, TOL = 6;
const OTM = [0.03, 0.08], DTE = [60, 120];
const DESDE = "20260422", HASTA = "20260714";

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) cierres.set(f.replace(".json", ""), JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8")));
const diasCadena = new Map();
for (const f of fs.readdirSync(CADENAS)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!m) continue; if (!diasCadena.has(m[1])) diasCadena.set(m[1], new Set()); diasCadena.get(m[1]).add(m[2]); }
const UNIV = [...diasCadena.keys()].filter((t) => cierres.has(t)).sort();
const cache = new Map();
function cadena(t, d) { const k = `${t}|${d}`; if (cache.has(k)) return cache.get(k); const p = path.join(CADENAS, `${t}_d${d}.json`); let v = null; if (fs.existsSync(p)) { try { v = JSON.parse(fs.readFileSync(p, "utf8")); } catch {} } if (cache.size > 2000) cache.clear(); cache.set(k, v); return v; }
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, "");
const mas = (d, n) => { const x = new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return ymd(x); };
const entre = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000);
function diaCad(t, d, tol) { const s = diasCadena.get(t); if (!s) return null; for (let i = 0; i <= tol; i++) { const x = mas(d, i); if (s.has(x)) return x; } return null; }

let total = 0, sinVencSalida = 0, sinStrikeSalida = 0, conCot = 0;
let sumRetConCot = 0, nConCot = 0, sumRetTratandoCero = 0;
const porTipo = { C: [], P: [] }, porTicker = new Map();
const ejemplos = [];
let movSub = [];

for (const t of UNIV) {
  const dias = [...diasCadena.get(t)].filter((d) => d >= DESDE && d <= HASTA).sort();
  for (const dia of dias) {
    const c = cadena(t, dia); if (!c) continue;
    const spot = cierres.get(t)?.[dia]; if (!(spot > 0)) continue;
    const dOut = diaCad(t, mas(dia, HOLD), TOL); if (!dOut) continue;
    const cOut = cadena(t, dOut); if (!cOut) continue;
    const spotOut = cierres.get(t)?.[dOut];
    if (spotOut > 0) movSub.push({ t, dia, mov: spotOut / spot - 1 });
    for (const venc of Object.keys(c)) {
      const dte = entre(dia, venc); if (dte < DTE[0] || dte > DTE[1]) continue;
      if (entre(dOut, venc) < 1) continue;
      for (const k of Object.keys(c[venc])) {
        const [sS, tp] = k.split("|");
        const st = +sS, otm = tp === "C" ? (st - spot) / spot : (spot - st) / spot;
        if (otm < OTM[0] || otm > OTM[1]) continue;
        const [b, a] = c[venc][k]; if (!(a >= 0.05) || b == null) continue;
        total++;
        const eOut = cOut[venc];
        if (!eOut) { sinVencSalida++; continue; }
        const qOut = eOut[k];
        if (!qOut) { sinStrikeSalida++; continue; }
        conCot++;
        const ret = qOut[0] / a - 1;
        sumRetConCot += ret; nConCot++;
        porTipo[tp].push(ret);
        if (!porTicker.has(t)) porTicker.set(t, []);
        porTicker.get(t).push(ret);
        if (ejemplos.length < 8 && Math.random() < 0.002) ejemplos.push({ t, dia, dOut, venc, k, spot, spotOut, askIn: a, bidIn: b, bidOut: qOut[0], askOut: qOut[1], ret });
      }
    }
  }
}

const media = (x) => x.reduce((s, y) => s + y, 0) / x.length;
console.log(`═══ VALIDACIÓN DE LA TUBERÍA ═══`);
console.log(`   contratos-día en la esquina: ${total.toLocaleString("es-ES")}`);
console.log(`   · el VENCIMIENTO no está en la cadena de salida: ${sinVencSalida.toLocaleString("es-ES")} (${(sinVencSalida / total * 100).toFixed(2)}%)`);
console.log(`   · el STRIKE no está en la cadena de salida:      ${sinStrikeSalida.toLocaleString("es-ES")} (${(sinStrikeSalida / total * 100).toFixed(2)}%)`);
console.log(`   · con cotización real de salida:                 ${conCot.toLocaleString("es-ES")} (${(conCot / total * 100).toFixed(2)}%)`);
console.log(`\n   retorno medio SÓLO con cotización real de salida: ${(media(porTipo.C.concat(porTipo.P)) * 100).toFixed(2)}%`);
console.log(`   · calls  n=${porTipo.C.length}  ${(media(porTipo.C) * 100).toFixed(2)}%`);
console.log(`   · puts   n=${porTipo.P.length}  ${(media(porTipo.P) * 100).toFixed(2)}%`);
console.log(`\n── MOVIMIENTO DEL SUBYACENTE A ${HOLD} DÍAS (¿es régimen?) ──`);
console.log(`   n=${movSub.length}  media ${(media(movSub.map((x) => x.mov)) * 100).toFixed(2)}%  ·  subieron ${(movSub.filter((x) => x.mov > 0).length / movSub.length * 100).toFixed(0)}%`);
console.log(`\n── POR TICKER (los 10 con más muestra) ──`);
for (const [t, v] of [...porTicker.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10)) {
  console.log(`   ${t.padEnd(6)} n=${String(v.length).padStart(5)}  ${(media(v) * 100).toFixed(2)}%`);
}
console.log(`\n── EJEMPLOS CRUDOS (para mirar a ojo) ──`);
for (const e of ejemplos) console.log(`   ${e.t} ${e.dia}→${e.dOut} ${e.venc} ${e.k}  spot ${e.spot}→${e.spotOut}  compra al ask ${e.askIn} (bid ${e.bidIn})  vende al bid ${e.bidOut} (ask ${e.askOut})  = ${(e.ret * 100).toFixed(1)}%`);
