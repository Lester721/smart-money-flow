// LA REPETICION · 5 — VEREDICTO. Dos preguntas y una sospecha.
//
// PREGUNTA 1 (la del encargo): ¿aporta REPETIR sobre el TAMAÑO? Con toda la muestra a la vez,
//   emparejando por prima, distancia y plazo, para que lo único que cambie sea el número de veces.
//
// PREGUNTA 2 (lo que apareció de rebote en el pase 4): los contratos LEJANOS que el flujo golpea
//   al ask baten a sus gemelos de horquilla, y el efecto crece con la distancia y muere al bid.
//   Eso no es repetición: sale igual con un día que con tres. ¿Es real o es un artefacto?
//
// LA SOSPECHA que hay que resolver antes de creerse nada: cuando una opción lejana deja de tener
//   puja, su salida vale CERO. Si el contrato golpeado conserva puja MAS A MENUDO que sus gemelos,
//   el "exceso" no es que elija mejor: es que sus gemelos desaparecen de la cadena. Eso hay que
//   mirarlo ANTES, y volver a medir sólo donde todos siguen cotizados.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-5-veredicto.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDA = 5, VENTANA = 5, MIN_DIA = 5e5;
const PRUEBAS = 120;
const LISTON = listonT(PRUEBAS);
const TOL_DTE_GEM = 15, TOL_MNY = 0.02, TOL_HORQ = 0.25;

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const MULTI = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);
const BASURA = new Set([201, 202, 203, 204, 205, 206, 207, 208, 248]);
const ACCOPC = new Set([237, 240, 241, 242, 243, 244, 245]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const setCad = new Set(conCad);
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();

const tPorDia = (f, c) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
};
const tercios = (f, c) => {
  const o = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const k = Math.floor(o.length / 3);
  if (k < 3) return null;
  return [0, 1, 2].map((i) => media((i < 2 ? o.slice(i * k, (i + 1) * k) : o.slice(2 * k)).map((x) => x[c])));
};
const okSigno = (t) => !!t && Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]);

console.log(`\n${"#".repeat(108)}`);
console.log(`LA REPETICION · 5 — VEREDICTO`);
console.log(`${"#".repeat(108)}`);
console.log(`  listón |t| >= ${LISTON} · salida ${SALIDA}d\n`);

// ── 1. SERIE POR CONTRATO Y EVENTOS (los dos lados) ─────────────────────────────────────────
const serie = new Map(), meta = new Map();
const diasF = diasFlujo("100k");
for (const dia of diasF) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map();
  for (const o of crudos) {
    const cid = o.trade_condition_id;
    if (BASURA.has(cid) || ACCOPC.has(cid) || MULTI.has(cid)) continue;
    const q = parseOCC(o.symbol);
    if (!q || !setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    let a = g.get(o.symbol);
    if (!a) { a = { ask: 0, bid: 0, nAsk: 0 }; g.set(o.symbol, a); }
    if (lado === 1) { a.ask += o.premium; a.nAsk++; } else a.bid += o.premium;
    if (!meta.has(o.symbol)) meta.set(o.symbol, { tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike });
  }
  for (const [sym, a] of g) {
    if (a.ask + a.bid < 2.5e5) continue;
    if (!serie.has(sym)) serie.set(sym, new Map());
    serie.get(sym).set(dY, a);
  }
}
const calF = diasF.map((d) => d.replace(/-/g, ""));
const idxCal = new Map(calF.map((d, i) => [d, i]));
const eventos = [];
for (const lado of [1, -1]) {
  const campo = lado === 1 ? "ask" : "bid";
  for (const [sym, m] of serie) {
    const mm = meta.get(sym);
    for (const [d, hoy] of m) {
      if (hoy[campo] < MIN_DIA) continue;
      const i = idxCal.get(d);
      if (i == null) continue;
      const desde = calF[Math.max(0, i - VENTANA + 1)];
      let tot = 0, diasAct = 0, nAsk = 0;
      for (const [dd, a] of m) {
        if (dd < desde || dd > d) continue;
        tot += a[campo]; nAsk += a.nAsk;
        if (a[campo] >= MIN_DIA) diasAct++;
      }
      if (tot < 1e6) continue;
      eventos.push({ sym, tk: mm.tk, exp: mm.exp, tipo: mm.tipo, K: mm.K, dY: d, tot, diasAct, nAsk: hoy.nAsk, lado });
    }
  }
}
console.log(`  eventos (contrato, día, lado) con >=$1M en la ventana: ${fmt(eventos.length)}`);

// ── 2. MEDIR: contrato, gemelos, y SI CADA UNO CONSERVA PUJA AL SALIR ───────────────────────
const porTk = new Map();
for (const e of eventos) { if (!porTk.has(e.tk)) porTk.set(e.tk, []); porTk.get(e.tk).push(e); }
const filas = [];
for (const [tk, lista] of porTk) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  const porDia = new Map();
  for (const e of lista) { if (!porDia.has(e.dY)) porDia.set(e.dY, []); porDia.get(e.dY).push(e); }
  for (const [dY, es] of porDia) {
    if (dY > ULTIMO) continue;
    const S = cl?.[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const dSal = md.find((d) => d > dY && dias(dY, d) >= SALIDA);
    if (!dSal) continue;
    const cadSal = cadena(tk, dSal);
    if (!cadSal) continue;
    const univ = [];
    for (const exp of Object.keys(cad)) {
      const dte = dias(dY, exp);
      if (dte < 1 || exp <= dSal) continue;
      for (const clave of Object.keys(cad[exp])) {
        const [ks, tipo] = clave.split("|");
        const K = Number(ks);
        const [bid, aa] = cad[exp][clave];
        if (!(aa > 0) || !(bid > 0)) continue;
        const q = cadSal[exp]?.[clave];
        univ.push({ exp, K, tipo, dte, mny: tipo === "C" ? K / S - 1 : 1 - K / S, ask: aa, horq: (aa - bid) / aa, ret: (q ? q[0] : 0) / aa - 1, puja: !!q });
      }
    }
    if (!univ.length) continue;
    const idx = new Map(univ.map((u) => [`${u.exp}|${u.K}|${u.tipo}`, u]));
    for (const e of es) {
      const yo = idx.get(`${e.exp}|${e.K}|${e.tipo}`);
      if (!yo) continue;
      const gem = univ.filter((u) => u !== yo && u.tipo === yo.tipo
        && Math.abs(u.dte - yo.dte) <= TOL_DTE_GEM
        && Math.abs(u.mny - yo.mny) <= TOL_MNY
        && Math.abs(u.horq - yo.horq) <= TOL_HORQ * yo.horq);
      if (gem.length < 3) continue;
      const gemVivos = gem.filter((g) => g.puja);
      filas.push({
        ticker: tk, fechaY: dY, fecha: `${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`,
        lado: e.lado, tipo: e.tipo, diasAct: e.diasAct, tot: e.tot, nAsk: e.nAsk,
        dte: yo.dte, mny: yo.mny, horq: yo.horq, horqGem: media(gem.map((g) => g.horq)),
        prima: yo.ask * 100, nGem: gem.length,
        puja: yo.puja ? 1 : 0, pujaGem: gem.filter((g) => g.puja).length / gem.length,
        todosVivos: yo.puja && gemVivos.length === gem.length ? 1 : 0,
        ret: yo.ret, gemR: media(gem.map((g) => g.ret)), exceso: yo.ret - media(gem.map((g) => g.ret)),
        // versión LIMPIA: sólo gemelos que siguen cotizados, para que un hueco de cadena no cuente como −100%
        gemVivo: gemVivos.length >= 3 ? media(gemVivos.map((g) => g.ret)) : null,
        excVivo: gemVivos.length >= 3 ? yo.ret - media(gemVivos.map((g) => g.ret)) : null,
        diasPos: dias(dY, dSal),
      });
    }
  }
}
const ask = filas.filter((f) => f.lado === 1);
console.log(`  medidos ${fmt(filas.length)} · al ask ${fmt(ask.length)}\n`);
// `puja` y `todosVivos` son banderas 0/1: no se radiografían como predictores (el guardián las
// declara muertas con razón — dos valores no ordenan nada). Se miran aparte, en la tabla de abajo.
radiografia(ask, ["exceso", "ret", "gemR", "pujaGem", "mny", "diasAct", "tot", "prima"], "eventos al ask",
  { cerosLegitimos: ["exceso", "ret", "gemR", "pujaGem"] });

const linea = (nombre, f, campo = "exceso") => {
  const g = f.filter((x) => x[campo] != null);
  if (g.length < 40) { console.log(`  ${nombre.padEnd(48)} n=${String(g.length).padStart(5)}  — muestra corta`); return null; }
  const td = tPorDia(g, campo), te = tercios(g, campo), ne = nEfectiva(g, 5);
  const c = new Map();
  for (const x of g) c.set(x.ticker, (c.get(x.ticker) ?? 0) + 1);
  const may = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  const m = media(g.map((x) => x[campo]));
  console.log(`  ${nombre.padEnd(48)} n=${String(g.length).padStart(5)} nef=${String(ne.porTicker).padStart(4)} ${(100 * m).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " <<" : "   "} ter ${te ? te.map((x) => (100 * x).toFixed(1)).join("/") : "-"}${okSigno(te) ? " ok" : " x"} may ${may[0]} ${((100 * may[1]) / g.length).toFixed(0)}%${may[1] / g.length > 0.2 ? "!" : " "}`);
  return { nombre, n: g.length, nEfectiva: ne.porTicker, ventanas: ne.ventanas, media: m, t: td.t, tercios: te, mismoSigno: okSigno(te), mayor: may[0], mayorPct: may[1] / g.length, cruza: Math.abs(td.t) >= LISTON };
};

// ── 3. LA SOSPECHA: ¿desaparecen los gemelos de la cadena? ──────────────────────────────────
console.log(`${"=".repeat(108)}`);
console.log(`1. LA SOSPECHA — ¿conserva puja el contrato golpeado MAS que sus gemelos?`);
console.log(`${"=".repeat(108)}\n`);
console.log(`  ${"distancia".padEnd(18)} ${"n".padStart(6)}  ${"el contrato".padStart(12)} ${"sus gemelos".padStart(12)}  ${"diferencia".padStart(11)}`);
const sospecha = [];
for (const [lo, hi, et] of [[-9, 0, "dentro"], [0, 0.05, "0-5% fuera"], [0.05, 0.10, "5-10%"], [0.10, 0.20, "10-20%"], [0.20, 9, ">=20%"]]) {
  const f = ask.filter((x) => x.mny >= lo && x.mny < hi);
  if (f.length < 40) continue;
  const a = media(f.map((x) => x.puja)), b = media(f.map((x) => x.pujaGem));
  console.log(`  ${et.padEnd(18)} ${String(f.length).padStart(6)}  ${(100 * a).toFixed(2).padStart(11)}% ${(100 * b).toFixed(2).padStart(11)}%  ${((100 * (a - b)).toFixed(2) + " pts").padStart(11)}`);
  sospecha.push({ et, n: f.length, puja: a, pujaGem: b, dif: a - b });
}
console.log(`\n  Si la diferencia es grande, el "exceso" es un HUECO DE CADENA disfrazado: el gemelo que`);
console.log(`  desaparece cuenta como −100% y el contrato golpeado no. Abajo se vuelve a medir sólo`);
console.log(`  contra gemelos QUE SIGUEN COTIZADOS.\n`);

// ── 4. PREGUNTA 2: el efecto por distancia, crudo y limpio, ask y bid ───────────────────────
console.log(`${"=".repeat(108)}`);
console.log(`2. EL EFECTO POR DISTANCIA — con gemelos muertos dentro (crudo) y sólo con vivos (limpio)`);
console.log(`${"=".repeat(108)}\n`);
const P2 = { crudo: [], limpio: [], bid: [] };
for (const [lo, hi, et] of [[-9, 0, "dentro del dinero"], [0, 0.05, "0-5% fuera"], [0.05, 0.10, "5-10% fuera"], [0.10, 0.20, "10-20% fuera"], [0.20, 9, ">=20% fuera"]]) {
  const f = ask.filter((x) => x.mny >= lo && x.mny < hi);
  const r1 = linea(`AL ASK ${et} — crudo`, f);
  const r2 = linea(`AL ASK ${et} — sólo gemelos VIVOS`, f, "excVivo");
  const r3 = linea(`AL BID ${et} (placebo) — crudo`, filas.filter((x) => x.lado === -1 && x.mny >= lo && x.mny < hi));
  if (r1) P2.crudo.push({ ...r1, lo, hi });
  if (r2) P2.limpio.push({ ...r2, lo, hi });
  if (r3) P2.bid.push({ ...r3, lo, hi });
  console.log("");
}

// ── 5. PREGUNTA 1: ¿APORTA REPETIR? — con toda la muestra y emparejando ─────────────────────
console.log(`${"=".repeat(108)}`);
console.log(`3. LA PREGUNTA DEL ENCARGO — ¿aporta REPETIR sobre el TAMAÑO?`);
console.log(`${"=".repeat(108)}\n`);
console.log(`  Emparejado: dentro de cada cubo de (prima total × distancia × plazo), se compara el`);
console.log(`  contrato que recibió la prima en UN día contra el que la recibió en VARIOS.\n`);
const P1 = [];
for (const [lo, hi, etD] of [[-9, 0.05, "cerca (<5%)"], [0.05, 9, "lejos (>=5%)"]]) {
  for (const [a, b, etP] of [[1e6, 2.5e6, "$1-2,5M"], [2.5e6, 1e12, ">=$2,5M"]]) {
    const u = ask.filter((f) => f.diasAct === 1 && f.tot >= a && f.tot < b && f.mny >= lo && f.mny < hi);
    const r = ask.filter((f) => f.diasAct >= 2 && f.tot >= a && f.tot < b && f.mny >= lo && f.mny < hi);
    if (u.length < 40 || r.length < 40) { console.log(`  ${etD} · ${etP}: muestra corta (${u.length}/${r.length})`); continue; }
    const mu = media(u.map((x) => x.exceso)), mr = media(r.map((x) => x.exceso));
    const su = sd(u.map((x) => x.exceso)), sr = sd(r.map((x) => x.exceso));
    const tw = (mr - mu) / Math.sqrt(su * su / u.length + sr * sr / r.length);
    console.log(`  ${(etD + " · " + etP).padEnd(26)} 1 día ${(100 * mu).toFixed(2).padStart(6)}% (n=${String(u.length).padStart(4)})  ·  varios días ${(100 * mr).toFixed(2).padStart(6)}% (n=${String(r.length).padStart(4)})  ·  dif ${(100 * (mr - mu)).toFixed(2).padStart(6)}%  t ${tw.toFixed(2).padStart(5)}`);
    P1.push({ distancia: etD, prima: etP, unDia: { n: u.length, media: mu }, variosDias: { n: r.length, media: mr }, dif: mr - mu, tWelch: tw });
  }
}
console.log(`\n  Y por número de PRINTS del último día (la repetición DENTRO del día), a distancia sujeta:\n`);
for (const [lo, hi, et] of [[1, 1, "1 print"], [2, 4, "2-4 prints"], [5, 19, "5-19 prints"], [20, Infinity, "20+ prints"]]) {
  linea(`    ${et} (lejos >=5%)`, ask.filter((f) => f.nAsk >= lo && f.nAsk <= hi && f.mny >= 0.05));
}

// ── 6. DINERO Y LO QUE HARIA FALTA ──────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(108)}`);
console.log(`4. DINERO — y cuánta muestra haría falta para cerrar esto`);
console.log(`${"=".repeat(108)}\n`);
const lejos = ask.filter((f) => f.mny >= 0.05);
{
  const prima = media(lejos.map((f) => f.prima));
  const mR = media(lejos.map((f) => f.ret)), mG = media(lejos.map((f) => f.gemR)), mE = media(lejos.map((f) => f.exceso));
  const diasPos = media(lejos.map((f) => f.diasPos));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  console.log(`  contratos del flujo a >=5% fuera, al ask, n=${lejos.length} (${(lejos.length / 86 * 252).toFixed(0)}/año)`);
  console.log(`     prima media $${fmt(prima)} · ${nCtr} contrato(s) = $${fmt(nCtr * prima)} comprometidos`);
  console.log(`     el contrato golpeado : ${(100 * mR).toFixed(2)}%/op  ->  ${("$" + fmt(nCtr * prima * mR * (365 / diasPos)))}/año`);
  console.log(`     un gemelo cualquiera : ${(100 * mG).toFixed(2)}%/op  ->  ${("$" + fmt(nCtr * prima * mG * (365 / diasPos)))}/año`);
  console.log(`     la VENTAJA           : ${(100 * mE).toFixed(2)}%/op  ->  ${("$" + fmt(nCtr * prima * mE * (365 / diasPos)))}/año  si se cobrara sola`);
  console.log(`     acierto del contrato golpeado: ${((100 * lejos.filter((f) => f.ret > 0).length) / lejos.length).toFixed(1)}%`);
  console.log(`\n  El rincón entero pierde en esta ventana. Elegir mejor DENTRO de algo que pierde no gana.`);
}
{
  // ¿cuántos días harían falta para que el candidato de la repetición cerrara?
  const cand = ask.filter((f) => f.diasAct >= 2 && f.tot >= 2.5e6 && f.mny >= 0.10);
  const uno = ask.filter((f) => f.diasAct === 1 && f.tot >= 2.5e6 && f.mny >= 0.10);
  if (cand.length > 20 && uno.length > 20) {
    const dif = media(cand.map((x) => x.exceso)) - media(uno.map((x) => x.exceso));
    const s = Math.sqrt((sd(cand.map((x) => x.exceso)) ** 2 + sd(uno.map((x) => x.exceso)) ** 2) / 2);
    const nPorGrupo = Math.ceil(2 * (2.8 * s / Math.max(1e-9, Math.abs(dif))) ** 2);
    console.log(`\n  Para decidir si repetir aporta sobre el tamaño hace falta ver una diferencia de ${(100 * dif).toFixed(2)} puntos`);
    console.log(`  con desviación ${(100 * s).toFixed(2)}: eso son ~${fmt(nPorGrupo)} eventos POR GRUPO (potencia 80%).`);
    console.log(`  Hoy hay ${cand.length} y ${uno.length}. Al ritmo de ${(cand.length / 86).toFixed(1)} eventos/día -> ${fmt(Math.ceil((nPorGrupo - cand.length) / Math.max(0.01, cand.length / 86)))} días más de flujo.`);
  }
}

writeFileSync("scripts/rep-5-veredicto.json", JSON.stringify({ LISTON, sospecha, P2, P1 }, null, 1));
console.log(`\n  -> scripts/rep-5-veredicto.json\n`);
