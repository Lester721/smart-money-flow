// ═══ COMBINACIÓN · PASO 2 — LA MEDICIÓN ═════════════════════════════════════════════════
//
// ESPECIFICACIÓN CERRADA ANTES DE VER UN SOLO RETORNO (ver comb-1-recon.mjs para el recon
// de forma con el que se eligió el corte; ese recon no toca precios).
//
//   SEÑAL PRIMARIA .... direccionNueva = (Cc − Cv − Pc + Pv) / primaNueva, calculada SÓLO
//                       sobre operaciones con size > open_interest (imposible que sean cierre)
//   SE OBSERVA A ...... las 10:30 ET. Elegido en el paso 1 por COBERTURA, no por resultado:
//                       es el corte MÁS TEMPRANO de {09:45, 10:00, 10:30, 11:00, 12:00} con
//                       mediana ≥ 20 símbolos/día con ≥3 operaciones nuevas. A las 09:45 la
//                       mediana de operaciones nuevas por símbolo es CERO: no es medible.
//   ENTRADA ........... primer precio del subyacente impreso en el propio flujo a las ≥10:30
//   SALIDA ............ cierre del MISMO día
//   VEHÍCULO .......... largo el tercio alto, corto el tercio bajo (transversal, dentro del día)
//   PRUEBAS ........... 1 → listón |t| = 2,0
//
// CONTROLES (no son intentos de encontrar algo: un positivo en ellos TUMBA el mecanismo):
//   A · direccionCierre — la misma dirección sobre las operaciones que SÍ pueden ser cierre
//       (size ≤ OI). Si el mecanismo es cierto, aquí NO debe haber nada.
//   B · direccion cruda — la mezcla de las dos. Debe quedar entre medias.
//   C · 500 SORTEOS al azar con las mismas reglas: mismos días, mismo universo, mismos
//       filtros, mismos tamaños de tercio — sólo se destruye la ORDENACIÓN.
//
// SIN FUTURO: `open_interest` es la foto del cierre de D−1 (validado en oi-validar.mjs,
// corr 0,861 con el volumen de D contra 0,291 con el de D+1). Nada se normaliza con días
// posteriores: los tercios son del propio día.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, informe, listonT, potencia, comprobarDescarte } from "../../lib/barreraHallazgos.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");

const CORTE_PRIMARIO = 10 * 60 + 30;
const CORTES = [9 * 60 + 45, 10 * 60, 10 * 60 + 30, 11 * 60, 12 * 60];
const MIN_OPS = 5;        // heredado del hallazgo del LADO, sin retocar
const MIN_NUEVAS = 3;     // una fracción hecha con 1-2 operaciones es el signo de una operación
const MIN_SIM = 20;       // heredado: por debajo de 20 símbolos el tercio son 6 nombres
const SORTEOS = 500;

const PROXY = { SPX: "SPY", SPXW: "SPY", XSP: "SPY", NDX: "QQQ", NDXP: "QQQ", RUT: "IWM" };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  return (/^\d{8}$/.test(k) && /^[CP]$/.test(t) && /^\d{6}$/.test(d) && u) ? { u, call: t === "C" } : null;
};

// ── cierres diarios ──────────────────────────────────────────────────────────────────────
const cierres = new Map();
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH, f))).toString("utf8")); } catch { continue; }
  const d = j?.data ?? []; if (d.length < 60) continue;
  cierres.set(f.slice(0, -8), { c: d.map((p) => p.v), idx: new Map(d.map((p, i) => [p.t.slice(0, 10), i])) });
}

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();

// ── acumulación por corte × (símbolo, día) ───────────────────────────────────────────────
const A = CORTES.map(() => new Map());
const EN = CORTES.map(() => new Map());
let entraron = 0;

for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    const o = parseOcc(r.symbol); if (!o) continue;
    const T = PROXY[o.u] ?? o.u;
    if (APAL.has(T) || !cierres.has(T)) continue;
    const min = ((Date.parse(r.timestamp) - 4 * 3600e3) / 60000) % 1440;
    const k = `${T}|${dia}`;
    for (let c = 0; c < CORTES.length; c++) {
      // ENTRADA: primera impresión propia del subyacente a partir del corte
      if (o.u === T && r.asset_price > 0 && min >= CORTES[c]) {
        const b = EN[c].get(k);
        if (!b || min < b.min) EN[c].set(k, { min, px: r.asset_price });
      }
      if (min >= CORTES[c]) continue;
      if (r.side == null || r.open_interest == null || r.size == null || r.premium == null) continue;
      const comp = COMPRA.has(r.side), vend = VENTA.has(r.side);
      if (!comp && !vend) continue;
      if (r.ask_price === 0 || r.bid_price === 0) continue;
      const p = r.premium || 0;
      const nueva = r.size > r.open_interest;
      let a = A[c].get(k);
      if (!a) { a = { T, dia, ops: 0, nOps: 0, Cc:0,Cv:0,Pc:0,Pv:0, nCc:0,nCv:0,nPc:0,nPv:0, cCc:0,cCv:0,cPc:0,cPv:0 }; A[c].set(k, a); }
      a.ops++;
      if (o.call) { comp ? a.Cc += p : a.Cv += p; } else { comp ? a.Pc += p : a.Pv += p; }
      if (nueva) {
        a.nOps++;
        if (o.call) { comp ? a.nCc += p : a.nCv += p; } else { comp ? a.nPc += p : a.nPv += p; }
      } else {
        if (o.call) { comp ? a.cCc += p : a.cCv += p; } else { comp ? a.cPc += p : a.cPv += p; }
      }
      if (c === 2) entraron++;
    }
  }
}

// ── construcción de filas ────────────────────────────────────────────────────────────────
function filasDe(c) {
  const out = [];
  let candidatos = 0;
  for (const a of A[c].values()) {
    candidatos++;
    if (a.ops < MIN_OPS || a.nOps < MIN_NUEVAS) continue;
    const Tot = a.Cc + a.Cv + a.Pc + a.Pv;
    const nTot = a.nCc + a.nCv + a.nPc + a.nPv;
    const cTot = a.cCc + a.cCv + a.cPc + a.cPv;
    if (!(Tot > 0) || !(nTot > 0) || !(cTot > 0)) continue;
    const s = cierres.get(a.T), i = s.idx.get(a.dia); if (i == null) continue;
    const cie = s.c[i];
    const pe = EN[c].get(`${a.T}|${a.dia}`);
    if (!pe || !(cie > 0) || !(pe.px > 0) || Math.abs(pe.px / cie - 1) > 0.15) continue;
    out.push({
      T: a.T, dia: a.dia, r: cie / pe.px - 1, minEntrada: pe.min, nOps: a.nOps, ops: a.ops,
      direccionNueva:  (a.nCc - a.nCv - a.nPc + a.nPv) / nTot,
      direccionCierre: (a.cCc - a.cCv - a.cPc + a.cPv) / cTot,
      direccion:       (a.Cc  - a.Cv  - a.Pc  + a.Pv)  / Tot,
      fracNuevaPrima:  nTot / Tot,
    });
  }
  return { out, candidatos };
}

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const sd = (v) => { if (v.length < 2) return 0; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => { const s = sd(v); return s > 0 ? media(v) / (s / Math.sqrt(v.length)) : 0; };

/** Serie de separaciones diarias tercio-alto − tercio-bajo, ordenando por `metrica`. */
function serieDiaria(filas, metrica) {
  const porDia = new Map();
  for (const f of filas) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
  const S = [], det = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < MIN_SIM) continue;
    const o = [...g].sort((a, b) => a[metrica] - b[metrica]);
    const k = Math.floor(o.length / 3); if (k < 5) continue;
    const alto = o.slice(-k), bajo = o.slice(0, k);
    S.push(media(alto.map((x) => x.r)) - media(bajo.map((x) => x.r)));
    det.push({ dia: d, n: g.length, minAlto: media(alto.map((x) => x.minEntrada)), minBajo: media(bajo.map((x) => x.minEntrada)) });
  }
  return { S, det };
}

function tercios(S) {
  const k = Math.floor(S.length / 3);
  return [S.slice(0, k), S.slice(k, 2 * k), S.slice(2 * k)].map((g) => media(g));
}

// ═══ PRIMARIA ════════════════════════════════════════════════════════════════════════════
const cP = CORTES.indexOf(CORTE_PRIMARIO);
const { out: filas, candidatos } = filasDe(cP);
comprobarDescarte(candidatos, filas.length, `filtros del corte 10:30 (ops≥${MIN_OPS}, nuevas≥${MIN_NUEVAS}, precio de entrada)`);
console.log(`pares simbolo-dia a las 10:30: ${candidatos.toLocaleString("es-ES")} candidatos → ${filas.length.toLocaleString("es-ES")} medibles\n`);

radiografia(filas, ["direccionNueva", "direccionCierre", "direccion", "fracNuevaPrima", "r", "nOps", "minEntrada"], "combinacion lado x OI nuevo (10:30)");

const LIST = listonT(1);
console.log(`\nPRUEBAS DECLARADAS: 1 (una sola combinación preinscrita) → listón |t| = ${LIST}\n`);

const res = {};
for (const m of ["direccionNueva", "direccionCierre", "direccion"]) {
  const { S, det } = serieDiaria(filas, m);
  const ter = tercios(S);
  res[m] = { ventanas: S.length, sep: media(S), t: tUna(S), sd: sd(S), pos: S.filter((x) => x > 0).length, ter, S, det };
}

console.log("── RESULTADO (corte 10:30 ET → cierre del mismo día) ────────────────────────────");
console.log("metrica            ventanas  simb/dia   sep L/S      t     dias>0   tres tercios");
const simbDia = media(res.direccionNueva.det.map((d) => d.n));
for (const m of ["direccionNueva", "direccionCierre", "direccion"]) {
  const R = res[m];
  console.log(`${m.padEnd(17)} ${String(R.ventanas).padStart(8)}  ${simbDia.toFixed(0).padStart(7)}  ${(R.sep * 100).toFixed(3).padStart(8)}%  ${R.t.toFixed(2).padStart(6)}  ${String(R.pos).padStart(4)}/${R.ventanas}   ${R.ter.map((x) => (x >= 0 ? "+" : "−")).join("")} [${R.ter.map((x) => (x * 100).toFixed(3)).join(" ")}]`);
}

// confusor: ¿entra más tarde el tercio alto que el bajo? (menos tiempo para moverse)
const dA = media(res.direccionNueva.det.map((d) => d.minAlto)), dB = media(res.direccionNueva.det.map((d) => d.minBajo));
console.log(`\nminuto medio de entrada — tercio alto ${dA.toFixed(1)} vs bajo ${dB.toFixed(1)} (diferencia ${(dA - dB).toFixed(2)} min)`);

// ── LAS CUATRO CRIBAS sobre la primaria ──────────────────────────────────────────────────
const porDia = new Map();
for (const f of filas) { if (!porDia.has(f.dia)) porDia.set(f.dia, []); porDia.get(f.dia).push(f); }
const filasBarrera = [];
for (const [d, g] of [...porDia].sort()) {
  if (g.length < MIN_SIM) continue;
  const md = media(g.map((x) => x.r));
  const ord = [...g].sort((a, b) => a.direccionNueva - b.direccionNueva);
  ord.forEach((f, i) => filasBarrera.push({ pnl: f.r - md, ticker: f.T, fecha: f.dia, rango: g.length > 1 ? i / (g.length - 1) : 0.5 }));
}
const ver = pasarBarrera(filasBarrera, (f) => f.rango, { pruebas: 1, nMinimo: 200, maxPorTicker: 0.2 });
console.log("\n" + informe(ver, "direccionNueva 10:30 → cierre"));
const pot = potencia(filasBarrera, 0.003);
console.log("\nPOTENCIA: " + pot.mensaje);

// ── CONTROL C · 500 sorteos al azar con las mismas reglas ────────────────────────────────
let semilla = 20260819;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const tsAzar = [];
for (let s = 0; s < SORTEOS; s++) {
  const S = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < MIN_SIM) continue;
    const k = Math.floor(g.length / 3); if (k < 5) continue;
    const mez = [...g];
    for (let i = mez.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [mez[i], mez[j]] = [mez[j], mez[i]]; }
    S.push(media(mez.slice(0, k).map((x) => x.r)) - media(mez.slice(k, 2 * k).map((x) => x.r)));
  }
  tsAzar.push(tUna(S));
}
const absAzar = tsAzar.map(Math.abs).sort((a, b) => a - b);
const tReal = res.direccionNueva.t;
const gana = absAzar.filter((x) => x < Math.abs(tReal)).length;
console.log(`\n── CONTROL AL AZAR (${SORTEOS} sorteos, mismas reglas, sólo se destruye la ordenación) ──`);
console.log(`  |t| al azar: p50=${absAzar[250].toFixed(2)}  p95=${absAzar[474].toFixed(2)}  p99=${absAzar[494].toFixed(2)}  max=${absAzar[499].toFixed(2)}`);
console.log(`  |t| real = ${Math.abs(tReal).toFixed(2)} → percentil ${(gana / SORTEOS * 100).toFixed(1)}%  ·  p empírico = ${((SORTEOS - gana) / SORTEOS).toFixed(3)}`);
console.log(`  ${Math.abs(tReal) > absAzar[474] ? "GANA al azar al 95%" : "NO gana al azar al 95%"}`);

// ── CORRELACIÓN entre los dos ingredientes (¿se suman o se pisan?) ───────────────────────
const rangoDe = (metrica) => {
  const m = new Map();
  for (const [d, g] of porDia) {
    if (g.length < MIN_SIM) continue;
    const o = [...g].sort((a, b) => a[metrica] - b[metrica]);
    o.forEach((f, i) => m.set(`${f.T}|${f.dia}`, i / (o.length - 1)));
  }
  return m;
};
const rN = rangoDe("direccionNueva"), rD = rangoDe("direccion"), rF = rangoDe("fracNuevaPrima");
const corr = (a, b) => {
  const xs = [], ys = [];
  for (const [k, v] of a) if (b.has(k)) { xs.push(v); ys.push(b.get(k)); }
  const mx = media(xs), my = media(ys);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy);
};
console.log(`\n── ¿SE SUMAN O SE PISAN? (correlación de rangos transversales) ──`);
console.log(`  direccionNueva vs direccion cruda : ${corr(rN, rD).toFixed(3)}`);
console.log(`  direccionNueva vs fracNuevaPrima  : ${corr(rN, rF).toFixed(3)}`);
console.log(`  direccion cruda vs fracNuevaPrima : ${corr(rD, rF).toFixed(3)}`);

// ── DIAGNÓSTICO por corte (NO son la prueba: la prueba es 10:30) ─────────────────────────
console.log(`\n── DIAGNÓSTICO: el mismo cálculo en los otros cortes (NO es la prueba) ──`);
console.log("corte   ventanas  simb/dia   sep L/S      t     tercios");
const diag = [];
for (let c = 0; c < CORTES.length; c++) {
  const { out } = filasDe(c);
  const { S, det } = serieDiaria(out, "direccionNueva");
  if (S.length < 10) { console.log(`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}   sin muestra suficiente (${S.length} ventanas)`); diag.push({ corte: CORTES[c], ventanas: S.length }); continue; }
  const ter = tercios(S);
  const et = `${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  console.log(`${et}   ${String(S.length).padStart(8)}  ${media(det.map(d=>d.n)).toFixed(0).padStart(7)}  ${(media(S)*100).toFixed(3).padStart(8)}%  ${tUna(S).toFixed(2).padStart(6)}   ${ter.map((x)=>x>=0?"+":"−").join("")}`);
  diag.push({ corte: CORTES[c], ventanas: S.length, sep: media(S), t: tUna(S), ter });
}

fs.writeFileSync(path.join("scripts", "marketsnack", "comb-2-salida.json"), JSON.stringify({
  filas: filas.length, ventanas: res.direccionNueva.ventanas, simbDia,
  primaria: { sep: res.direccionNueva.sep, t: res.direccionNueva.t, sd: res.direccionNueva.sd, ter: res.direccionNueva.ter, pos: res.direccionNueva.pos },
  cierre: { sep: res.direccionCierre.sep, t: res.direccionCierre.t, ter: res.direccionCierre.ter },
  cruda: { sep: res.direccion.sep, t: res.direccion.t, ter: res.direccion.ter },
  azar: { p50: absAzar[250], p95: absAzar[474], p99: absAzar[494], percentil: gana / SORTEOS },
  corr: { nuevaVsCruda: corr(rN, rD), nuevaVsFrac: corr(rN, rF), crudaVsFrac: corr(rD, rF) },
  barrera: ver.detalle, motivos: ver.motivos, potencia: pot, diag, liston: LIST,
  serieDiaria: res.direccionNueva.S,
}, null, 1));
console.log("\n(guardado comb-2-salida.json)");
