// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 3 — ¿DÓNDE CAE EL MURO DE MS EN NUESTRA CADENA 0DTE?
//
// max_pain coincide 12/12 exacto → MS usa NUESTRO MISMO interés abierto y el MISMO vencimiento.
// magnet se acerca (7/12 exacto con la gamma 0DTE al cierre).  Los MUROS no cuadran.
// Aquí se mira si el strike que MS llama "muro" existe siquiera en la cadena 0DTE y qué puesto
// ocupa en nuestra escalera. Si el muro de MS cae en un strike con OI 0DTE ridículo, MS está
// mirando OTROS VENCIMIENTOS y no hay receta que valga con lo que tenemos en disco.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-3-donde.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import zlib from "node:zlib";

const DIR = "scripts/cache-theta/gex-2026";
const MSF = "scripts/cache-theta/marketsnack/aux/gex/2026-08-19/SPX.json.gz";

function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas [" + faltan.join(",") + "]");
  return idx;
}

const ms = JSON.parse(zlib.gunzipSync(readFileSync(MSF)).toString("utf8"))["1m"].data
  .map((d) => ({ ...d, fecha: d.t.slice(0, 10) }));

function leerOI(fecha) {
  const f = DIR + "/oi_" + fecha + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const I = columnas(lin[0], ["strike", "right", "timestamp", "open_interest"], f);
  const C = new Map(), P = new Map();
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 10) continue;
    const c = l.split(",");
    if (c[I.timestamp].slice(0, 10) !== fecha) continue;
    if (c[I.timestamp].slice(11, 16) >= "09:30") continue;
    const v = +c[I.open_interest]; if (!(v > 0)) continue;
    (c[I.right].replace(/"/g, "") === "CALL" ? C : P).set(+c[I.strike], v);
  }
  return { C, P };
}

const filas = [];
console.log("fecha        spot   MS_call  oiC(ese K)  puesto/total   MS_put   oiP(ese K)  puesto/total   maxOIC@K   maxOIP@K");
for (const m of ms) {
  const oi = leerOI(m.fecha);
  if (!oi) continue;
  const ordC = [...oi.C.entries()].sort((a, b) => b[1] - a[1]);
  const ordP = [...oi.P.entries()].sort((a, b) => b[1] - a[1]);
  const puestoC = ordC.findIndex(([k]) => k === m.call_wall);
  const puestoP = ordP.findIndex(([k]) => k === m.put_wall);
  const oiCw = oi.C.get(m.call_wall) ?? 0;
  const oiPw = oi.P.get(m.put_wall) ?? 0;
  filas.push({ fecha: m.fecha, puestoC: puestoC < 0 ? null : puestoC + 1, puestoP: puestoP < 0 ? null : puestoP + 1, oiCw, oiPw, nC: ordC.length, nP: ordP.length });
  console.log(
    m.fecha + m.asset_price.toFixed(0).padStart(8) + String(m.call_wall).padStart(9) + String(oiCw).padStart(12) +
      ((puestoC < 0 ? "NO EXISTE" : puestoC + 1 + "/" + ordC.length)).padStart(15) +
      String(m.put_wall).padStart(9) + String(oiPw).padStart(12) +
      ((puestoP < 0 ? "NO EXISTE" : puestoP + 1 + "/" + ordP.length)).padStart(15) +
      (ordC[0] ? (ordC[0][1] + "@" + ordC[0][0]) : "-").padStart(14) +
      (ordP[0] ? (ordP[0][1] + "@" + ordP[0][0]) : "-").padStart(14),
  );
}
const con = filas.filter((f) => f.puestoC != null);
const conP = filas.filter((f) => f.puestoP != null);
console.log("\ndias medidos: " + filas.length);
console.log("el strike del muro de CALLS de MS existe en la cadena 0DTE en " + con.length + "/" + filas.length + " dias; puesto mediano en la escalera de OI: " + (con.length ? con.map((f) => f.puestoC).sort((a, b) => a - b)[Math.floor(con.length / 2)] : "-"));
console.log("el strike del muro de PUTS  de MS existe en la cadena 0DTE en " + conP.length + "/" + filas.length + " dias; puesto mediano: " + (conP.length ? conP.map((f) => f.puestoP).sort((a, b) => a - b)[Math.floor(conP.length / 2)] : "-"));
writeFileSync("scripts/msmuros-3-salida.json", JSON.stringify({ generado: new Date().toISOString(), filas }, null, 1));
