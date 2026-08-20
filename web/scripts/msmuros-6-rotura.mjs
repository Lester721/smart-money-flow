// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 6 — EL MURO NO REBOTA: ROMPE.  ¿Se puede cobrar eso?
//
// El paso 5 midió la regla tal como venía escrita y salió INVERTIDA:
//   · toca el muro de PUTS  → llega al imán (arriba) el 41,1% de las veces (azar 50%)
//   · toca el muro de CALLS → llega al imán (abajo)  el 41,0% de las veces
// O sea: en las carreras que se deciden, el precio SIGUE en la dirección del muro el ~59%.
// Eso es una candidata, NO un hallazgo: la dirección se eligió DESPUÉS de ver el dato. Aquí se
// somete a lo que sí decide — tercios de tiempo, precios reales y azar — y se dice cuánto falta.
//
// LA REGLA DE ROTURA que se mide:
//   toca el muro de puts  → vertical BAJISTA  (vender call ATM / comprar call ATM+25)
//   toca el muro de calls → vertical ALCISTA  (comprar call ATM / vender call ATM+25)
//   objetivo: la misma distancia que había hasta el imán, al otro lado.  stop: esa distancia en
//   contra.  si no pasa ninguna cosa, se cierra a las 15:55.  Todo al ask comprando y al bid
//   vendiendo, cotizaciones del fichero.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-6-rotura.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIV = "scripts/gex-niveles.json";
const CAM = "scripts/msmuros-5-camino.json";
const SALIDA = "scripts/msmuros-6-salida-a" + (process.env.ANCHO || 25) + ".json";
const CUENTA = 56389;
const ANCHO = Number(process.env.ANCHO || 25);
const THETA = 0.10;
const HORA0 = "09:40", HORAF = "15:55";

function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas [" + faltan.join(",") + "]");
  return idx;
}
function leerQuotes(fecha) {
  const f = DIR + "/iv_" + fecha + "_C.csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask"], f);
  const q = new Map();
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 20) continue;
    const c = l.split(",");
    const ts = c[I.timestamp]; if (ts.length < 16) continue;
    const b = +c[I.bid], a = +c[I.ask];
    if (a > 0 && a >= b) q.set(+c[I.strike] + "|" + ts.slice(11, 16), [b, a]);
  }
  return q;
}
const media = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(v.length - 1, 1)); };
const tDe = (v) => (v.length > 2 && sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : 0);
function listonT(p) { if (p <= 1) return 2; const pp = 0.05 / p / 2; const t = Math.sqrt(-2 * Math.log(pp)); return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100; }

const N = JSON.parse(readFileSync(NIV, "utf8"));
const camino = JSON.parse(readFileSync(CAM, "utf8"));
const LENTES = ["gam", "gamD"];
const LADOS = [["put", -1], ["call", +1]];   // ROTURA: se opera en la dirección del muro
const PRUEBAS = 4;                            // 2 lentes × 2 lados, θ fijo, objetivo fijo
const LISTON = listonT(PRUEBAS);
console.log("pruebas: " + PRUEBAS + "   liston |t| = " + LISTON);

// ═══ 1 · los eventos (sólo camino, barato) ════════════════════════════════════════════════
const eventos = [];
let seed = 7654321;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (const fila of N.filas) {
  const c0 = camino[fila.fecha]; if (!c0) continue;
  const cam = c0.filter(([h, s]) => h >= HORA0 && h <= HORAF && s > 0);
  if (cam.length < 40) continue;
  const S0 = fila.apertura, tol = (S0 * THETA) / 100;
  for (const L of LENTES) {
    const niv = fila.niveles[L]; if (!niv) continue;
    const iman = niv.imanBruto; if (iman == null) continue;
    for (const [ln, dir] of LADOS) {
      const muro = ln === "put" ? niv.muroPut : niv.muroCall;
      if (muro == null) continue;
      if (ln === "put" && !(S0 > muro && iman > muro)) continue;
      if (ln === "call" && !(S0 < muro && iman < muro)) continue;
      let i1 = -1;
      for (let i = 0; i < cam.length; i++) { const s = cam[i][1]; if (ln === "put" ? s <= muro + tol : s >= muro - tol) { i1 = i; break; } }
      if (i1 < 0 || i1 >= cam.length - 3) continue;
      const d = Math.abs(iman - cam[i1][1]);
      if (!(d > 0)) continue;
      eventos.push({ fecha: fila.fecha, L, ln, dir, i1, d, cam });
      // control azar-hora, misma distancia y misma dirección
      const i3 = Math.floor(rnd() * (cam.length - 4));
      eventos.push({ fecha: fila.fecha, L, ln: ln + "AZAR", dir, i1: i3, d, cam });
    }
  }
}
console.log("eventos (con su control): " + eventos.length + "   dias distintos: " + new Set(eventos.map((e) => e.fecha)).size);

// ═══ 2 · la carrera y la operación con precios reales ═════════════════════════════════════
const porFecha = new Map();
for (const e of eventos) { if (!porFecha.has(e.fecha)) porFecha.set(e.fecha, []); porFecha.get(e.fecha).push(e); }
const filas = [];
let leidos = 0, sinQ = 0;
for (const [fecha, evs] of [...porFecha.entries()].sort()) {
  const q = leerQuotes(fecha);
  if (!q) continue;
  leidos++;
  for (const e of evs) {
    const cam = e.cam, i1 = e.i1, dir = e.dir, d = e.d;
    const sEnt = cam[i1][1], hEnt = cam[i1][0];
    const obj = dir > 0 ? sEnt + d : sEnt - d;
    const stp = dir > 0 ? sEnt - d : sEnt + d;
    let iSal = cam.length - 1, motivo = "cierre", gana = null;
    for (let i = i1 + 1; i < cam.length; i++) {
      const s = cam[i][1];
      if (dir > 0 ? s >= obj : s <= obj) { iSal = i; motivo = "objetivo"; gana = 1; break; }
      if (dir > 0 ? s <= stp : s >= stp) { iSal = i; motivo = "stop"; gana = 0; break; }
    }
    // vertical de 25 pts con las dos patas de CALL, cotizaciones reales
    const K1 = Math.round(sEnt / 5) * 5, K2 = K1 + ANCHO;
    const a1 = q.get(K1 + "|" + hEnt), a2 = q.get(K2 + "|" + hEnt);
    const b1 = q.get(K1 + "|" + cam[iSal][0]), b2 = q.get(K2 + "|" + cam[iSal][0]);
    if (!a1 || !a2 || !b1 || !b2) { sinQ++; continue; }
    let pnl = null, riesgo = null;
    if (dir > 0) {
      const coste = a1[1] - a2[0];                    // compro K1 al ASK, vendo K2 al BID
      if (!(coste > 0) || coste >= ANCHO) { sinQ++; continue; }
      const valor = b1[0] - b2[1];
      pnl = (valor - coste) * 100; riesgo = coste * 100;
    } else {
      const credito = a1[0] - a2[1];                  // vendo K1 al BID, compro K2 al ASK
      if (!(credito > 0) || credito >= ANCHO) { sinQ++; continue; }
      const recompra = b1[1] - b2[0];
      pnl = (credito - recompra) * 100; riesgo = (ANCHO - credito) * 100;
    }
    filas.push({ fecha, clave: e.L + "|" + e.ln, pnl, riesgo, gana, motivo, d });
  }
}
console.log("dias con cotizaciones: " + leidos + "   operaciones: " + filas.length + "   descartadas por falta de cotizacion: " + sinQ);

// ═══ 3 · resultados ═══════════════════════════════════════════════════════════════════════
const diasAno = 252 * (leidos / N.filas.length);
const res = {};
const claves = [...new Set(filas.map((f) => f.clave))].sort();
console.log("\n" + "═".repeat(126));
console.log("REGLA DE ROTURA · vertical SPXW 0DTE de " + ANCHO + " pts, al ask comprando y al bid vendiendo");
console.log("═".repeat(126));
console.log("lente|lado".padEnd(16) + "n=nEfec".padStart(9) + "sigue%".padStart(8) + "t vs50".padStart(8) + "$/op".padStart(9) + "t".padStart(7) + "riesgo$".padStart(9) + "%riesgo".padStart(9) + "$/año".padStart(9) + "  tercios $/op");
for (const c of claves) {
  const f = filas.filter((x) => x.clave === c);
  if (f.length < 20) continue;
  const p = f.map((x) => x.pnl);
  const dec = f.filter((x) => x.gana != null);
  const sigue = dec.length ? media(dec.map((x) => x.gana)) : null;
  const tSig = dec.length > 5 ? (sigue - 0.5) / Math.sqrt(0.25 / dec.length) : null;
  const opsAno = (f.length / leidos) * diasAno;
  const ord = [...f].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => { const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k); return +media(g.map((x) => x.pnl)).toFixed(0); });
  const r = {
    n: f.length, nDecididas: dec.length,
    siguePct: sigue == null ? null : +(sigue * 100).toFixed(1),
    tSigueVs50: tSig == null ? null : +tSig.toFixed(2),
    porOp: +media(p).toFixed(2), t: +tDe(p).toFixed(2),
    riesgoMedio: +media(f.map((x) => x.riesgo)).toFixed(0),
    pctSobreRiesgo: +((media(p) / media(f.map((x) => x.riesgo))) * 100).toFixed(2),
    opsAno: +opsAno.toFixed(0), alAno: +(media(p) * opsAno).toFixed(0),
    tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(ter[0])),
    pctObjetivo: +((f.filter((x) => x.motivo === "objetivo").length / f.length) * 100).toFixed(1),
    pctStop: +((f.filter((x) => x.motivo === "stop").length / f.length) * 100).toFixed(1),
  };
  res[c] = r;
  console.log(c.padEnd(16) + String(r.n).padStart(9) + String(r.siguePct).padStart(8) + String(r.tSigueVs50).padStart(8) +
    r.porOp.toFixed(1).padStart(9) + r.t.toFixed(2).padStart(7) + String(r.riesgoMedio).padStart(9) + r.pctSobreRiesgo.toFixed(1).padStart(9) +
    String(r.alAno).padStart(9) + "   " + ter.join(" / "));
}

// ═══ 4 · los dos lados juntos (lo que Lester ejecutaría de verdad) ════════════════════════
console.log("\n" + "═".repeat(126));
console.log("LOS DOS LADOS JUNTOS — una sola regla, cualquiera de los dos muros");
console.log("═".repeat(126));
const juntos = {};
for (const L of LENTES) {
  const f = filas.filter((x) => x.clave === L + "|put" || x.clave === L + "|call");
  const fa = filas.filter((x) => x.clave === L + "|putAZAR" || x.clave === L + "|callAZAR");
  if (f.length < 20) continue;
  const p = f.map((x) => x.pnl), pa = fa.map((x) => x.pnl);
  const dec = f.filter((x) => x.gana != null), decA = fa.filter((x) => x.gana != null);
  const sigue = media(dec.map((x) => x.gana));
  const tSig = (sigue - 0.5) / Math.sqrt(0.25 / dec.length);
  const opsAno = (f.length / leidos) * diasAno;
  const ord = [...f].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => { const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k); return { desde: g[0].fecha, hasta: g[g.length - 1].fecha, n: g.length, porOp: +media(g.map((x) => x.pnl)).toFixed(0), sigue: +(media(g.filter((x) => x.gana != null).map((x) => x.gana)) * 100).toFixed(1) }; });
  // cuánta muestra falta para que el "sigue%" pase el listón
  const ventaja = sigue - 0.5;
  const nNecesaria = ventaja > 0 ? Math.ceil(((LISTON / ventaja) ** 2) * 0.25) : null;
  const j = {
    n: f.length, nDecididas: dec.length, siguePct: +(sigue * 100).toFixed(1), tSigueVs50: +tSig.toFixed(2),
    porOp: +media(p).toFixed(2), t: +tDe(p).toFixed(2),
    riesgoMedio: +media(f.map((x) => x.riesgo)).toFixed(0),
    pctSobreRiesgo: +((media(p) / media(f.map((x) => x.riesgo))) * 100).toFixed(2),
    opsAno: +opsAno.toFixed(0), alAno: +(media(p) * opsAno).toFixed(0),
    pctDeLaCuenta: +(((media(p) * opsAno) / CUENTA) * 100).toFixed(1),
    azarPorOp: pa.length > 20 ? +media(pa).toFixed(2) : null,
    azarSiguePct: decA.length > 5 ? +((media(decA.map((x) => x.gana)) * 100).toFixed(1)) : null,
    tercios: ter, mismoSigno: ter.every((x) => Math.sign(x.porOp) === Math.sign(ter[0].porOp)),
    nDecididasNecesarias: nNecesaria,
    diasQueFaltan: nNecesaria ? Math.max(0, Math.ceil((nNecesaria - dec.length) * (N.filas.length / Math.max(dec.length, 1)))) : null,
  };
  juntos[L] = j;
  console.log("\nlente " + L + ":  n=" + j.n + " operaciones (n efectiva = n, cada una nace y muere el mismo día)");
  console.log("  sigue en la dirección del muro: " + j.siguePct + "%  (azar 50%, t=" + j.tSigueVs50 + ", listón " + LISTON + ")   control azar-hora: " + j.azarSiguePct + "%");
  console.log("  $/operación: " + j.porOp + "   t=" + j.t + "   riesgo medio $" + j.riesgoMedio + " (" + j.pctSobreRiesgo + "% sobre riesgo)");
  console.log("  $/año: " + j.alAno + "  (" + j.opsAno + " ops/año, " + j.pctDeLaCuenta + "% de la cuenta de $" + CUENTA + ")   azar: $" + j.azarPorOp + "/op");
  console.log("  tercios: " + ter.map((x) => x.desde.slice(0, 7) + "→" + x.hasta.slice(0, 7) + " $" + x.porOp + " (" + x.sigue + "%)").join("  ·  ") + "   mismo signo: " + j.mismoSigno);
  console.log("  para que el " + j.siguePct + "% pase el listón hacen falta " + j.nDecididasNecesarias + " carreras decididas (hay " + j.nDecididas + ") ≈ " + j.diasQueFaltan + " días de mercado más");
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), ancho: ANCHO, theta: THETA, cuenta: CUENTA, pruebas: PRUEBAS, liston: LISTON, diasLeidos: leidos, diasAno: +diasAno.toFixed(1), res, juntos }, null, 1));
console.log("\nescrito " + SALIDA);
