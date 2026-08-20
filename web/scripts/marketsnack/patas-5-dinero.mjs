// PATAS SUELTAS · PASO 5 — LO QUE PAGA, CON PRECIOS REALES
//
// La señal, si valiera, diría TAMAÑO, no dirección. El vehículo que cobra tamaño sin apostar
// dirección es el CONO: comprar call Y put al mismo strike. Se compra al ASK y se vende al BID,
// los dos de las cadenas reales de ThetaData. Cero Black-Scholes, cero punto medio.
//
// REGLAS QUE SE COMPRUEBAN FILA A FILA (nada inventado):
//   · el VENCIMIENTO tiene que existir en la cadena del día de comprar
//   · el STRIKE tiene que existir y estar cotizado (bid>0, ask>bid) en las DOS patas
//   · el strike se elige SÓLO con datos del día de comprar; si al salir no hay cotización,
//     la fila se cae y se cuenta — no se rellena
//
// Uso: node --import tsx scripts/marketsnack/patas-5-dinero.mjs [100k] [minOps] [horizonte]

import fs from "node:fs";
import path from "node:path";
import { listonT, pasarBarrera, informe } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const NIVEL = process.argv[2] || "100k";
const MIN_OPS = Number(process.argv[3] || 5);
const H = Number(process.argv[4] || 5);
const MIN_TICKERS = 9;
const CUENTA = 56389;

const panel = JSON.parse(fs.readFileSync(path.resolve(`scripts/marketsnack/patas-2-panel-${NIVEL}.json`), "utf8"));
const CIERRES = path.resolve("scripts/cache-theta/cierres");
const CADENAS = path.resolve("scripts/cache-theta/cadenas");

const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8"));
  const dias = Object.keys(j).sort();
  cierres.set(t, { j, dias, idx: new Map(dias.map((d, i) => [d, i])) });
}
const cacheCad = new Map();
function cadena(t, ymd) {
  const k = `${t}_${ymd}`;
  if (cacheCad.has(k)) return cacheCad.get(k);
  let v = null;
  try { v = JSON.parse(fs.readFileSync(path.join(CADENAS, `${t}_d${ymd}.json`), "utf8")); } catch { v = null; }
  cacheCad.set(k, v);
  return v;
}

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t1 = (a) => (a.length < 3 ? 0 : media(a) / (de(a) / Math.sqrt(a.length)));

// ── universo de decisión, idéntico al de los pasos 3 y 4 ──
for (const f of panel) {
  const c = cierres.get(f.t); if (!c) continue;
  const i = c.idx.get(f.d.replaceAll("-", "")); if (i == null) continue;
  if (i + H < c.dias.length) { f.i = i; f.ok = true; }
}
const usable = panel.filter((f) => f.ok && f.nSueltaE >= MIN_OPS && f.nTodas >= MIN_OPS && f.desSueltaE != null && f.desTodas != null);
const diasOk = new Map();
for (const f of usable) { if (!diasOk.has(f.d)) diasOk.set(f.d, []); diasOk.get(f.d).push(f); }
for (const [d, v] of [...diasOk]) if (v.length < MIN_TICKERS) diasOk.delete(d);

console.log(`═══ EL CONO CON PRECIOS REALES · h=${H} días · nivel ${NIVEL} ═══\n`);
console.log(`   días con tercios: ${diasOk.size}  ·  celdas: ${[...diasOk.values()].flat().length}\n`);

// ── construir el cono real de una celda ──
let sinCadena = 0, sinVenc = 0, sinStrike = 0, sinSalida = 0, hechas = 0;
function cono(f) {
  const c = cierres.get(f.t);
  const ymd = f.d.replaceAll("-", "");
  const ymdSal = c.dias[f.i + H];
  const cad = cadena(f.t, ymd); if (!cad) { sinCadena++; return null; }
  const cadSal = cadena(f.t, ymdSal); if (!cadSal) { sinCadena++; return null; }
  const spot = c.j[ymd];

  // VENCIMIENTO: el primero que sigue vivo DESPUÉS del día de salir. Tiene que existir de verdad.
  const vencs = Object.keys(cad).filter((v) => v > ymdSal).sort();
  if (!vencs.length) { sinVenc++; return null; }
  const venc = vencs[0];

  // STRIKE: el listado más cercano al cierre con las DOS patas cotizadas ese día.
  const cont = cad[venc];
  const strikes = new Set();
  for (const k of Object.keys(cont)) strikes.add(Number(k.split("|")[0]));
  let mejor = null;
  for (const s of [...strikes].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))) {
    const qc = cont[`${s}|C`], qp = cont[`${s}|P`];
    if (!qc || !qp) continue;
    const [bc, ac] = qc, [bp, ap] = qp;
    if (!(bc > 0 && ac > bc && bp > 0 && ap > bp)) continue;
    mejor = { s, ac, ap }; break;
  }
  if (!mejor) { sinStrike++; return null; }

  // SALIDA: el mismo contrato en la cadena del día de salir. Si no está, la fila se cae.
  const contSal = cadSal[venc];
  if (!contSal) { sinSalida++; return null; }
  const qcS = contSal[`${mejor.s}|C`], qpS = contSal[`${mejor.s}|P`];
  if (!qcS || !qpS) { sinSalida++; return null; }
  const salida = qcS[0] + qpS[0];      // se VENDE al BID
  const coste = mejor.ac + mejor.ap;   // se COMPRA al ASK
  if (!(coste > 0)) { sinStrike++; return null; }
  hechas++;
  return {
    t: f.t, d: f.d, venc, strike: mejor.s, spot,
    coste: coste * 100, salida: salida * 100,
    ret: (salida - coste) / coste * 100,
    pnl: (salida - coste) * 100,
    dte: (Date.UTC(+venc.slice(0, 4), +venc.slice(4, 6) - 1, +venc.slice(6)) - Date.UTC(+ymd.slice(0, 4), +ymd.slice(4, 6) - 1, +ymd.slice(6))) / 864e5,
    horquilla: (mejor.ac + mejor.ap - (cont[`${mejor.s}|C`][0] + cont[`${mejor.s}|P`][0])) / coste * 100,
  };
}

// ── operar por tercios ──
const grupos = { alto: [], medio: [], bajo: [], altoTodas: [], bajoTodas: [], todo: [] };
for (const [d, v] of diasOk) {
  const ord = [...v].sort((a, b) => a.desSueltaE - b.desSueltaE);
  const k = Math.floor(ord.length / 3);
  const ordT = [...v].sort((a, b) => a.desTodas - b.desTodas);
  const marca = new Map();
  ord.slice(-k).forEach((f) => marca.set(f, "alto"));
  ord.slice(0, k).forEach((f) => marca.set(f, "bajo"));
  const altoT = new Set(ordT.slice(-k)), bajoT = new Set(ordT.slice(0, k));
  for (const f of v) {
    const c = cono(f); if (!c) continue;
    grupos.todo.push(c);
    const g = marca.get(f);
    if (g === "alto") grupos.alto.push(c); else if (g === "bajo") grupos.bajo.push(c); else grupos.medio.push(c);
    if (altoT.has(f)) grupos.altoTodas.push(c);
    if (bajoT.has(f)) grupos.bajoTodas.push(c);
  }
}

console.log(`── CONSTRUCCIÓN DE LOS CONOS ──`);
console.log(`   conos construidos: ${hechas}`);
console.log(`   caídos: sin cadena ${sinCadena} · sin vencimiento posterior a la salida ${sinVenc} · sin strike cotizado ${sinStrike} · sin cotización al salir ${sinSalida}`);
console.log(`   (nada se rellena: la fila que no tiene precio real no existe)\n`);

radiografia(grupos.todo, ["coste", "salida", "ret", "dte", "strike", "spot", "horquilla"], "los conos", { cerosLegitimos: ["salida", "ret"] });

const dtes = grupos.todo.map((c) => c.dte).sort((a, b) => a - b);
console.log(`\n   días hasta vencimiento: mín ${dtes[0]} · mediana ${dtes[Math.floor(dtes.length / 2)]} · máx ${dtes.at(-1)}`);
console.log(`   coste medio del cono: $${media(grupos.todo.map((c) => c.coste)).toFixed(0)}`);
console.log(`   la HORQUILLA como % de la prima: ${media(grupos.todo.map((c) => c.horquilla)).toFixed(1)}%  ← el peaje de entrar y salir\n`);

const LISTON = listonT(24);
console.log(`${"═".repeat(78)}\nRESULTADO POR GRUPO  (listón de |t|: ${LISTON})\n`);
console.log(`   grupo                          n     retorno/op   t      capital/op   sin valor`);
for (const [k, nom] of [["alto", "TERCIO ALTO (dese SUELTAS)"], ["medio", "tercio medio"], ["bajo", "TERCIO BAJO (dese SUELTAS)"],
                        ["altoTodas", "tercio alto SIN separar"], ["bajoTodas", "tercio bajo SIN separar"], ["todo", "TODOS los conos"]]) {
  const g = grupos[k]; if (!g.length) continue;
  const r = g.map((c) => c.ret);
  const cero = g.filter((c) => c.salida <= 0).length;
  console.log(`   ${nom.padEnd(30)} ${String(g.length).padStart(4)}  ${(media(r) >= 0 ? "+" : "") + media(r).toFixed(2).padStart(7)}%  ${t1(r).toFixed(2).padStart(6)}   $${media(g.map((c) => c.coste)).toFixed(0).padStart(6)}      ${((cero / g.length) * 100).toFixed(1)}%`);
}
const dA = grupos.alto.map((c) => c.ret), dB = grupos.bajo.map((c) => c.ret);
const vA = de(dA) ** 2 / dA.length, vB = de(dB) ** 2 / dB.length;
console.log(`\n   ALTO − BAJO (patas sueltas): ${(media(dA) - media(dB) >= 0 ? "+" : "") + (media(dA) - media(dB)).toFixed(2)} puntos  ·  t = ${((media(dA) - media(dB)) / Math.sqrt(vA + vB)).toFixed(2)}`);
const dAT = grupos.altoTodas.map((c) => c.ret), dBT = grupos.bajoTodas.map((c) => c.ret);
const vAT = de(dAT) ** 2 / dAT.length, vBT = de(dBT) ** 2 / dBT.length;
console.log(`   ALTO − BAJO (sin separar) : ${(media(dAT) - media(dBT) >= 0 ? "+" : "") + (media(dAT) - media(dBT)).toFixed(2)} puntos  ·  t = ${((media(dAT) - media(dBT)) / Math.sqrt(vAT + vBT)).toFixed(2)}`);

// ── DÓLARES AL AÑO ──
console.log(`\n${"═".repeat(78)}\nDÓLARES AL AÑO sobre una cuenta de $${CUENTA.toLocaleString("es-ES")}\n`);
const diasOperados = new Set(grupos.alto.map((c) => c.d)).size;
for (const [k, nom] of [["alto", "comprar el TERCIO ALTO cada día"], ["altoTodas", "lo mismo SIN separar patas"], ["todo", "comprar todos los conos"]]) {
  const g = grupos[k]; if (!g.length) continue;
  const porDia = new Map();
  for (const c of g) { if (!porDia.has(c.d)) porDia.set(c.d, { coste: 0, pnl: 0, n: 0 }); const e = porDia.get(c.d); e.coste += c.coste; e.pnl += c.pnl; e.n++; }
  const costeDia = media([...porDia.values()].map((e) => e.coste));
  const pnlDia = media([...porDia.values()].map((e) => e.pnl));
  const capital = costeDia * H;                        // H cestas vivas a la vez
  const escala = Math.min(1, CUENTA / capital);        // la cuenta no da para más
  const dias = porDia.size;
  // Una cesta nueva cada sesión, cada una viva H días: 252 cestas al año.
  const anual = pnlDia * escala * 252;
  console.log(`   ${nom}`);
  console.log(`     ${g.length} conos en ${dias} días · ${(g.length / dias).toFixed(1)} conos/día · $${costeDia.toFixed(0)}/día`);
  console.log(`     capital comprometido (${H} cestas vivas): $${capital.toFixed(0)}  → escala que cabe en la cuenta: ${(escala * 100).toFixed(0)}%`);
  console.log(`     P&L medio por día de cesta: $${pnlDia.toFixed(0)} × ${(escala * 100).toFixed(0)}% = $${(pnlDia * escala).toFixed(0)}`);
  console.log(`     ANUALIZADO (252 cestas/año): $${anual.toFixed(0)}/año  (${((anual / CUENTA) * 100).toFixed(1)}% de la cuenta)\n`);
}

// ── las cuatro cribas sobre el tercio alto ──
console.log(`${"═".repeat(78)}\nLAS CUATRO CRIBAS sobre los conos del tercio alto\n`);
const filasB = grupos.todo.map((c) => ({ pnl: c.ret, ticker: c.t, fecha: c.d }));
const clave = new Map(grupos.alto.map((c) => [`${c.t}|${c.d}`, 1]));
for (const f of filasB) f.m = clave.has(`${f.ticker}|${f.fecha}`) ? 1 : 0;
const veredicto = pasarBarrera(filasB, (f) => f.m, { pruebas: 24, nMinimo: 200, maxPorTicker: 0.2 });
console.log(informe(veredicto, `retorno del cono ordenado por estar en el tercio alto de patas sueltas`));

fs.writeFileSync(path.resolve(`scripts/marketsnack/patas-5-salida-${NIVEL}.json`), JSON.stringify({
  h: H, conos: hechas, caidos: { sinCadena, sinVenc, sinStrike, sinSalida },
  costeMedio: media(grupos.todo.map((c) => c.coste)),
  horquillaPct: media(grupos.todo.map((c) => c.horquilla)),
  grupos: Object.fromEntries(Object.entries(grupos).map(([k, g]) => [k, g.length ? { n: g.length, ret: media(g.map((c) => c.ret)), t: t1(g.map((c) => c.ret)), sinValor: g.filter((c) => c.salida <= 0).length / g.length } : null])),
}, null, 1));
