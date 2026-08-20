// CONCENTRACION · LA CONFUSION, Y LAS METRICAS ARREGLADAS.
//
// conc-2 dejo un patron que no se puede ignorar: TODAS las t grandes (13,90 / 9,26 / 7,80 / 5,34)
// estan sobre |retorno| CRUDO, y las MISMAS metricas sobre |retorno| / vol20 dan t entre -1,2 y
// +2,2. Eso tiene una lectura sola: las metricas eligen TICKERS VOLATILES, no dias grandes.
// Aqui se demuestra con numeros y se arreglan las metricas para que la hipotesis se pueda probar
// de verdad. Tres confusiones y su arreglo:
//
//  1. DISTANCIA EN % ELIGE VOLATILIDAD. "El contrato mayor esta al 20% del dinero" quiere decir
//     cosas opuestas en KO y en MSTR. ARREGLO: distancia en DESVIACIONES, no en %:
//        distSigma = distancia / (vol20 * raiz(DTE))
//  2. CONCENTRACION ALTA = POCO FLUJO. El tercio alto tiene 7,8 contratos y $10,9M de prima; el
//     bajo, 81,8 contratos y $80,8M. Con 3 contratos la concentracion es alta por aritmetica.
//     ARREGLO: rango de la concentracion DENTRO de su cubo de nº de contratos (residualizada).
//  3. "EL CONTRATO MAYOR" POR PRIMA ES SIEMPRE LARGO. La mediana del DTE del mayor es 196 dias y
//     hay CERO 0DTE, porque prima = precio x size, y lo caro es lo largo. La apuesta que describe
//     la hipotesis -corta y lejos- no es nunca "la mayor por prima". ARREGLO: definir el mayor por
//     SIZE (nº de contratos) y ademas medir la concentracion SOLO dentro del flujo corto (DTE<=14
//     y DTE<=30), que es donde vive la hipotesis.
//
// PRUEBAS ACUMULADAS: 48 (conc-2) + 24 (aqui: 6 metricas x 2 resultados x 2 cortes) = 72.

import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const RUPTURA = "2026-07-16";
const CORTES = { "12:00": 12 * 60, "15:45": 15 * 60 + 45 };
const PRUEBAS = 72;
const LISTON = listonT(PRUEBAS);
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const corr = (a, b) => { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i]-ma)*(b[i]-mb); da += (a[i]-ma)**2; db += (b[i]-mb)**2; } return n / Math.sqrt(da*db); };

const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  if (!/^\d{8}$/.test(k) || !/^[CP]$/.test(t) || !/^\d{6}$/.test(d) || !u) return null;
  return { u, call: t === "C", exp: `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}`, K: Number(k) / 1000 };
};
const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// -- precios ---------------------------------------------------------------------------------
const precios = {}, fechasT = {}, posT = {};
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  const T = f.slice(0, -8); if (APAL.has(T)) continue;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH, f))).toString("utf8"));
  const m = {}; for (const r of j.data) if (Number.isFinite(r.v) && r.v > 0) m[r.t.slice(0, 10)] = r.v;
  const ff = Object.keys(m).sort(); if (ff.length < 60) continue;
  precios[T] = m; fechasT[T] = ff; const p = {}; ff.forEach((x, i) => (p[x] = i)); posT[T] = p;
}
function vol20(T, fecha) {
  const i = posT[T]?.[fecha]; if (i == null || i < 21) return null;
  const rs = []; for (let j = i - 19; j <= i; j++) { const a = precios[T][fechasT[T][j-1]], b = precios[T][fechasT[T][j]]; if (a>0&&b>0) rs.push(b/a-1); }
  if (rs.length < 15) return null; const m = media(rs);
  return Math.sqrt(rs.reduce((s,x)=>s+(x-m)**2,0)/(rs.length-1));
}
function cierrePrevio(T, f) { const i = posT[T]?.[f]; return i == null || i < 1 ? null : precios[T][fechasT[T][i-1]]; }
function ret(T, f, k) { const i = posT[T]?.[f]; if (i == null || i + k >= fechasT[T].length) return null;
  const a = precios[T][fechasT[T][i]], b = precios[T][fechasT[T][i+k]]; return a>0&&b>0 ? b/a-1 : null; }

// -- panel enriquecido -------------------------------------------------------------------------
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const panel = { "12:00": [], "15:45": [] };

for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  const acc = {}; for (const c of Object.keys(CORTES)) acc[c] = new Map();
  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    const o = parseOcc(r.symbol); if (!o || !precios[o.u]) continue;
    if (!(r.premium > 0) || !(r.size > 0)) continue;
    const min = ((Date.parse(r.timestamp) - 4*3600e3) / 60000) % 1440;
    if (!(min >= 0 && min < 16*60)) continue;
    for (const [nom, lim] of Object.entries(CORTES)) {
      if (min >= lim) continue;
      let m = acc[nom].get(o.u);
      if (!m) { m = { contratos: new Map(), ops: 0, prima: 0, size: 0 }; acc[nom].set(o.u, m); }
      m.ops++; m.prima += r.premium; m.size += r.size;
      let c = m.contratos.get(r.symbol);
      if (!c) { c = { exp: o.exp, K: o.K, call: o.call, prima: 0, size: 0 }; m.contratos.set(r.symbol, c); }
      c.prima += r.premium; c.size += r.size;
    }
  }
  for (const [nom, mapa] of Object.entries(acc)) {
    for (const [T, m] of mapa) {
      if (m.ops < 5 || m.contratos.size < 2) continue;
      const S = cierrePrevio(T, dia); const v = vol20(T, dia);
      if (!(S > 0) || !(v > 0)) continue;
      const cs = [...m.contratos.values()];
      const porPrima = [...cs].sort((a,b)=>b.prima-a.prima), porSize = [...cs].sort((a,b)=>b.size-a.size);
      const tp = porPrima[0], ts = porSize[0];
      const distDe = (c) => (c.call ? c.K/S - 1 : 1 - c.K/S);
      const sigmaDe = (c) => { const d = dd(dia, c.exp); return d > 0 ? Math.abs(distDe(c)) / (v * Math.sqrt(d)) : null; };
      // flujo CORTO: donde vive la hipotesis (movimiento GRANDE y PRONTO)
      const corto = (lim) => {
        const g = cs.filter((c) => dd(dia, c.exp) <= lim);
        const pr = g.reduce((s,c)=>s+c.prima,0);
        if (!(pr > 0) || g.length < 2) return null;
        const o2 = [...g].sort((a,b)=>b.prima-a.prima);
        return { conc: o2[0].prima/pr, cuota: pr/m.prima, dist: Math.abs(distDe(o2[0])), sigma: sigmaDe(o2[0]), n: g.length };
      };
      const c14 = corto(14), c30 = corto(30);
      const r1 = ret(T, dia, 1), r5 = ret(T, dia, 5);
      panel[nom].push({
        ticker: T, fecha: dia, tramo: dia < RUPTURA ? "antes" : "despues",
        contratos: m.contratos.size, ops: m.ops, prima: m.prima, vol20: v,
        // originales (para reproducir la confusion)
        concTop1: tp.prima/m.prima, top1AbsDist: Math.abs(distDe(tp)), top1DTE: dd(dia, tp.exp),
        // ARREGLADAS
        distSigma: sigmaDe(tp),                                  // distancia en desviaciones
        concSize: ts.size/m.size,                                // concentracion del SIZE
        sizeDist: Math.abs(distDe(ts)), sizeDTE: dd(dia, ts.exp), sizeSigma: sigmaDe(ts),
        conc14: c14?.conc ?? null, cuota14: c14?.cuota ?? null, sigma14: c14?.sigma ?? null,
        conc30: c30?.conc ?? null, cuota30: c30?.cuota ?? null, sigma30: c30?.sigma ?? null,
        // resultados
        d_r1: r1, a_r1: r1 == null ? null : Math.abs(r1), a_r1n: r1 == null ? null : Math.abs(r1)/v,
        a_r5n: r5 == null ? null : Math.abs(r5)/(v*Math.sqrt(5)),
      });
    }
  }
}

// concentracion RESIDUALIZADA: rango dentro del cubo de nº de contratos, dentro del dia
for (const nom of Object.keys(panel)) {
  const cubo = (n) => (n <= 3 ? 0 : n <= 6 ? 1 : n <= 12 ? 2 : n <= 25 ? 3 : n <= 60 ? 4 : 5);
  const g = new Map();
  for (const x of panel[nom]) { const k = `${x.fecha}|${cubo(x.contratos)}`; let a = g.get(k); if (!a) { a = []; g.set(k, a); } a.push(x); }
  for (const a of g.values()) {
    const o = [...a].sort((p, q) => p.concTop1 - q.concTop1);
    o.forEach((x, i) => (x.concResid = a.length > 1 ? i/(a.length-1) : null));
  }
}

console.log(`liston |t| >= ${LISTON} (${PRUEBAS} pruebas acumuladas)\n`);
for (const nom of Object.keys(panel))
  radiografia(panel[nom], ["distSigma","concSize","sizeDist","sizeDTE","concResid","a_r1n"], `panel arreglado - corte ${nom}`, { maxNulos: 0.6 });

// -- LA APUESTA CORTA CASI NO EXISTE: hay que decirlo antes de medirla ------------------------
// La radiografia tumbo conc30/conc14 sobre el panel entero (84% nulos) y tiene razon: son otra
// POBLACION, no un campo del panel. Se miden aparte, diciendo sobre cuantos dias-ticker viven.
console.log("=".repeat(100));
console.log("0. LA APUESTA CORTA Y CONCENTRADA CASI NO EXISTE EN ESTE FLUJO");
console.log("=".repeat(100));
for (const nom of Object.keys(panel)) {
  const f = panel[nom];
  const c14 = f.filter((x) => x.conc14 != null), c30 = f.filter((x) => x.conc30 != null);
  console.log(`  corte ${nom}: ${f.length} dias-ticker`);
  console.log(`     con >=2 contratos grandes a <=14 dias: ${c14.length} (${(100*c14.length/f.length).toFixed(1)}%) - dias distintos ${new Set(c14.map(x=>x.fecha)).size}`);
  console.log(`     con >=2 contratos grandes a <=30 dias: ${c30.length} (${(100*c30.length/f.length).toFixed(1)}%) - dias distintos ${new Set(c30.map(x=>x.fecha)).size}`);
  console.log(`     cuota MEDIA de la prima del dia que va a <=30 dias: ${(100*media(f.map(x=>x.cuota30??0))).toFixed(1)}%`);
}
console.log(`\n  El perfil de la hipotesis -concentrado, lejos y PRONTO- no es lo que hay en el flujo de`);
console.log(`  >=$100k. Se mide igualmente sobre las filas donde existe, pero es OTRA poblacion, y`);
console.log(`  las cribas de esa poblacion se dicen aparte.`);
for (const nom of Object.keys(panel)) {
  const sub = panel[nom].filter((x) => x.conc30 != null);
  radiografia(sub, ["conc30","sigma30","cuota30","a_r1n"], `subpoblacion <=30 dias - corte ${nom}`, { maxNulos: 0.6 });
}

// ============================================================================================
// 1. LA CONFUSION, CON NUMEROS
// ============================================================================================
console.log("=".repeat(100));
console.log("1. LA CONFUSION - las metricas de conc-2 eligen TICKERS VOLATILES, no dias grandes");
console.log("=".repeat(100));
{
  const f = panel["15:45"].filter((x) => x.a_r1n != null);
  const cc = (a, b) => corr(f.map((x)=>x[a]).filter(Number.isFinite), f.map((x)=>x[b]).filter(Number.isFinite));
  const g = f.filter((x) => Number.isFinite(x.top1AbsDist) && Number.isFinite(x.vol20) && Number.isFinite(x.contratos));
  console.log(`  correlacion distancia%(mayor) con vol20 del ticker : ${corr(g.map(x=>Math.min(x.top1AbsDist,2)), g.map(x=>x.vol20)).toFixed(3)}`);
  console.log(`  correlacion concentracion con log(nº contratos)    : ${corr(g.map(x=>x.concTop1), g.map(x=>Math.log(x.contratos))).toFixed(3)}`);
  console.log(`  correlacion concentracion con vol20                : ${corr(g.map(x=>x.concTop1), g.map(x=>x.vol20)).toFixed(3)}`);
  // que vol20 tiene el tercio alto de cada metrica, DENTRO del dia
  const porDia = new Map(); for (const x of g) { let a = porDia.get(x.fecha); if (!a) { a=[]; porDia.set(x.fecha,a);} a.push(x); }
  const volDeTercio = (campo, signo) => {
    const alt = [], baj = [];
    for (const a of porDia.values()) { const o = [...a].sort((p,q)=>signo*(q[campo]-p[campo])); const k = Math.floor(o.length/3); if (k<5) continue;
      alt.push(media(o.slice(0,k).map(x=>x.vol20))); baj.push(media(o.slice(-k).map(x=>x.vol20))); }
    return { a: media(alt), b: media(baj) };
  };
  console.log(`\n  vol20 media del tercio ALTO vs BAJO, dentro del dia:`);
  for (const [c, s, n] of [["top1AbsDist",1,"distancia % del mayor"],["top1DTE",-1,"plazo corto del mayor"],["concTop1",1,"concentracion"]]) {
    const v = volDeTercio(c, s);
    console.log(`    ${n.padEnd(26)} alto ${(v.a*100).toFixed(2)}% - bajo ${(v.b*100).toFixed(2)}% - cociente ${(v.a/v.b).toFixed(2)}x`);
  }
  console.log(`\n  LECTURA: ordenar por distancia en % da un tercio alto con ${(volDeTercio("top1AbsDist",1).a/volDeTercio("top1AbsDist",1).b).toFixed(2)}x la volatilidad del bajo.`);
  console.log(`  Ese cociente EXPLICA por si solo la separacion de |retorno| crudo. Y la opcion de ese`);
  console.log(`  ticker cuesta proporcionalmente mas, asi que no se cobra nada.`);
}

// ============================================================================================
// 2. LAS METRICAS ARREGLADAS
// ============================================================================================
const resultados = [];
function prueba(corte, metrica, signo, resultado, filas, nota = "") {
  const f = filas.filter((x) => x[metrica] != null && Number.isFinite(x[metrica]) && x[resultado] != null);
  const porDia = new Map();
  for (const x of f) { let g = porDia.get(x.fecha); if (!g) { g=[]; porDia.set(x.fecha,g);} g.push(x); }
  const serie = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < 15) continue;
    const o = [...g].sort((a,b)=>signo*(b[metrica]-a[metrica]));
    const k = Math.floor(o.length/3); if (k < 5) continue;
    serie.push({ fecha: d, sep: media(o.slice(0,k).map(x=>x[resultado])) - media(o.slice(-k).map(x=>x[resultado])),
                 alto: media(o.slice(0,k).map(x=>x[resultado])), bajo: media(o.slice(-k).map(x=>x[resultado])) });
  }
  const seps = serie.map(s=>s.sep), t = tUna(seps);
  const k3 = Math.floor(serie.length/3);
  const terc = k3>=3 ? [serie.slice(0,k3),serie.slice(k3,2*k3),serie.slice(2*k3)].map(g=>media(g.map(s=>s.sep))) : [];
  const antes = serie.filter(s=>s.fecha<RUPTURA).map(s=>s.sep), desp = serie.filter(s=>s.fecha>=RUPTURA).map(s=>s.sep);
  const r = { corte, metrica, resultado, nFilas: f.length, dias: serie.length, sepDia: media(seps), tDia: t,
    positivos: seps.filter(x=>x>0).length, tercios: terc, alto: media(serie.map(s=>s.alto)), bajo: media(serie.map(s=>s.bajo)),
    antes: { n: antes.length, m: media(antes), t: tUna(antes) }, desp: { n: desp.length, m: media(desp), t: tUna(desp) }, nota };
  resultados.push(r);
  const marca = Math.abs(t) >= LISTON ? "**" : Math.abs(t) >= 2 ? "* " : "  ";
  console.log(`  ${marca}${(metrica+" -> "+resultado).padEnd(26)} n=${String(f.length).padStart(5)} d=${String(serie.length).padStart(3)}  alto ${r.alto.toFixed(4).padStart(7)} bajo ${r.bajo.toFixed(4).padStart(7)}  sep ${r.sepDia.toFixed(4).padStart(8)}  tDIA=${t.toFixed(2).padStart(6)}  ${r.positivos}/${serie.length}+  antes ${r.antes.m.toFixed(4)}(t${r.antes.t.toFixed(1)}) desp ${r.desp.m.toFixed(4)}(t${r.desp.t.toFixed(1)})  tercios ${terc.map(x=>x.toFixed(3)).join("/")}`);
  return r;
}

console.log("\n" + "=".repeat(100));
console.log("2. LAS METRICAS ARREGLADAS - todas contra el TAMANO NORMALIZADO (lo unico que no es volatilidad)");
console.log("=".repeat(100));
const MET = [
  ["distSigma", 1, "distancia del mayor EN DESVIACIONES (arregla la confusion 1)"],
  ["concResid", 1, "concentracion dentro de su cubo de nº de contratos (arregla la 2)"],
  ["concSize", 1, "concentracion del SIZE, no de la prima (arregla la 3)"],
  ["sizeSigma", 1, "distancia en desviaciones del mayor POR SIZE"],
  ["conc30", 1, "concentracion DENTRO del flujo a <=30 dias"],
  ["cuota30", 1, "cuota del flujo del dia que va a <=30 dias"],
];
for (const corte of Object.keys(panel)) {
  console.log(`\n-- corte ${corte} ET --`);
  for (const [m, s, n] of MET) { console.log(`   ${n}`); for (const r of ["a_r1n","a_r5n"]) prueba(corte, m, s, r, panel[corte], n); }
}

// ============================================================================================
// 3. CONTROL POSITIVO - ¿esta prueba PUEDE ver algo?
// ============================================================================================
console.log("\n" + "=".repeat(100));
console.log("3. CONTROL POSITIVO - una senal que SI deberia funcionar, para saber si la prueba ve");
console.log("=".repeat(100));
console.log("  Si un predictor conocido y trivial separa con esta maquinaria, el cero de arriba es");
console.log("  un cero de verdad. Si NO separa, la prueba esta ciega y no concluye nada.\n");
for (const corte of Object.keys(panel)) {
  const f = panel[corte];
  // control 1: nº de operaciones del dia (mas flujo = mas cosas pasando). Deberia separar algo.
  prueba(corte, "ops", 1, "a_r1n", f, "CONTROL: nº de operaciones grandes del dia");
  // control 2: la volatilidad reciente predice la volatilidad futura (autocorrelacion, trivial)
  //   se mide sobre |r| CRUDO a proposito: vol20 alto -> |r1| alto es aritmetica pura.
  prueba(corte, "vol20", 1, "a_r1", f, "CONTROL: vol20 -> |r1| crudo (tiene que salir enorme)");
}

fs.writeFileSync(path.join(RAIZ, "conc-3-salida.json"), JSON.stringify({ liston: LISTON, pruebas: PRUEBAS, resultados }, null, 1));
console.log(`\nOK ${path.join(RAIZ, "conc-3-salida.json")}`);
