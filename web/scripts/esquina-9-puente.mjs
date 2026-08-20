// ESQUINA · PASO 9 — EL PUENTE: por que no cabe, y que habria que cambiar para que cupiera.
//
// El paso 8 dice la verdad incomoda: la senal solo funciona con k=5 (cinco contratos a la vez),
// y cinco contratos de la esquina cuestan $19.000-$25.000 de prima. Con $5.639 solo cabe UNO, y
// con uno el resultado es ruido (t entre -1,03 y +1,14, cambiando de signo segun el plazo).
//
// O sea: el problema NO es que la senal no separe. Es que la DIVERSIFICACION que la hace
// funcionar no cabe en el billete. Y eso tiene arreglo mirable: el precio de la esquina va de
// $30 a $30.000 segun el ticker. Si se restringe el universo a los activos con billete barato,
// entran cinco posiciones en $5.639.
//
// Aqui se mide: (1) cuanto cuesta la esquina en cada ticker, (2) si la senal sigue separando
// dentro del universo barato, y (3) cuanto da entonces en dolares al ano.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { elegirEsquina, bidSalida, cadena, dias, media, sd, nEfectiva, rng, fmt } from "./print-lib.mjs";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const D0 = "20260422", D1 = "20260819", CUENTA = 56389, PLAZA = 5639, SORTEOS = 500;
const HOLDS = [5, 10, 16, 23];

const diasCad = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (m[2] < D0 || m[2] > D1) continue;
  if (!diasCad.has(m[1])) diasCad.set(m[1], []);
  diasCad.get(m[1]).push(m[2]);
}
const cc = new Map();
const cierre = (t, y) => {
  if (!cc.has(t)) cc.set(t, existsSync(`${CIER}/${t}.json`) ? JSON.parse(readFileSync(`${CIER}/${t}.json`, "utf8")) : {});
  const v = cc.get(t)[y]; return Number.isFinite(v) && v > 0 ? v : null;
};
const rejilla = new Map();
for (const [ticker, ds] of [...diasCad].sort()) {
  ds.sort();
  for (let i = 0; i < ds.length; i++) {
    const ymd = ds[i], S = cierre(ticker, ymd);
    if (!(S > 0)) continue;
    const cad = cadena(ticker, ymd);
    if (!cad) continue;
    const fila = { ticker, ymd, S };
    let algo = false;
    for (const tipo of ["C", "P"]) {
      const e = elegirEsquina(cad, S, 90, 0.05, tipo, ymd, 25, 0.30);
      if (!e) continue;
      const o = { exp: e.exp, K: e.K, ask: e.ask, dte: e.dte, peaje: 1 - e.bid / e.ask, rets: {} };
      for (const h of HOLDS) {
        let sal = null;
        for (let j = i + 1; j < ds.length; j++) { const d = dias(ymd, ds[j]); if (d >= h) { if (d <= h + 6) sal = ds[j]; break; } }
        if (!sal) continue;
        const bid = bidSalida(ticker, sal, e.exp, tipo, e.K);
        if (bid === null) continue;
        o.rets[h] = bid / e.ask - 1; algo = true;
      }
      fila[tipo === "C" ? "c" : "p"] = o;
    }
    if (algo) rejilla.set(`${ticker}|${ymd}`, fila);
  }
}
const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));
const filas = [];
for (const s of sen) {
  const g = rejilla.get(`${s.ticker}|${s.ymd}`);
  if (!g || !Number.isFinite(s.desq) || !g.c) continue;
  filas.push({ ticker: s.ticker, ymd: s.ymd, desq: s.desq, c: g.c, p: g.p ?? null });
}
const RET = (f, der, h) => { const o = der === "C" ? f.c : f.p; const v = o?.rets?.[h]; return Number.isFinite(v) ? v : null; };

// ── 1. EL PRECIO DEL BILLETE por ticker ──
console.log("=== 1. LO QUE CUESTA LA ESQUINA (call 5% fuera, ~90 dias) EN CADA ACTIVO ===");
const porT = new Map();
for (const f of filas) { if (!porT.has(f.ticker)) porT.set(f.ticker, []); porT.get(f.ticker).push(f); }
const precios = [...porT].map(([t, v]) => ({ t, prima: media(v.map((x) => x.c.ask)) * 100, peaje: media(v.map((x) => x.c.peaje)), n: v.length })).sort((a, b) => a.prima - b.prima);
console.log("  baratos: " + precios.slice(0, 14).map((x) => `${x.t} $${fmt(x.prima)}`).join("  "));
console.log("  caros  : " + precios.slice(-8).map((x) => `${x.t} $${fmt(x.prima)}`).join("  "));
const BARATO = Number(process.env.BARATO || 1200);
const universoBarato = new Set(precios.filter((x) => x.prima <= BARATO).map((x) => x.t));
console.log(`\n  con billete <= $${BARATO}: ${universoBarato.size} activos -> ${[...universoBarato].join(" ")}`);
console.log(`  prima media del universo barato $${fmt(media(precios.filter(x=>universoBarato.has(x.t)).map(x=>x.prima)))} · peaje medio ${(media(precios.filter(x=>universoBarato.has(x.t)).map(x=>x.peaje))*100).toFixed(1)}%`);
console.log(`  prima media del universo entero  $${fmt(media(precios.map(x=>x.prima)))} · peaje medio ${(media(precios.map(x=>x.peaje))*100).toFixed(1)}%`);

// ── 2. ¿la senal sigue separando dentro del universo barato? ──
const eqT = (arr) => {
  const m = new Map();
  for (const o of arr) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.v); }
  const vals = [...m.values()].map(media);
  return { eq: media(vals), t: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length };
};
function medir(sub, der, h, k) {
  const dsT = [...new Set(sub.map((f) => f.ymd))].sort();
  const ops = [];
  for (const d of dsT) {
    const cand = sub.filter((f) => f.ymd === d && RET(f, der, h) != null);
    if (cand.length < Math.max(6, k + 1)) continue;
    const mDia = media(cand.map((r) => RET(r, der, h)));
    const ord = [...cand].sort((a, b) => a.desq - b.desq);
    for (const r of ord.slice(0, k)) ops.push({ ticker: r.ticker, ymd: d, v: RET(r, der, h) - mDia, ret: RET(r, der, h), ask: der === "C" ? r.c.ask : r.p.ask });
  }
  if (ops.length < 40) return null;
  const e = eqT(ops), nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), h);
  const ord = [...ops].sort((a, b) => a.ymd.localeCompare(b.ymd));
  const q = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => eqT(i < 2 ? ord.slice(i * q, (i + 1) * q) : ord.slice(2 * q)).eq);
  return { ...e, n: ops.length, nef: nef.porTicker, ventanas: nef.ventanas, bruto: media(ops.map((o) => o.ret)),
    prima: media(ops.map((o) => o.ask)) * 100, acierto: ops.filter((o) => o.ret > 0).length / ops.length,
    tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(e.eq)), ops };
}
const sub = filas.filter((f) => universoBarato.has(f.ticker));
console.log("\n=== 2. LA MISMA SENAL, SOLO EN EL UNIVERSO BARATO ===");
const puente = [];
for (const h of HOLDS) {
  for (const k of [3, 5]) {
    const c = medir(sub, "C", h, k), p = medir(sub, "P", h, k);
    if (!c) continue;
    const ciclosAno = 365 / h;
    const contratos = k;
    const capital = contratos * c.prima;
    puente.push({ h, k, exc: c.eq, t: c.t, bruto: c.bruto, prima: c.prima, capital, nef: c.nef, ventanas: c.ventanas,
      n: c.n, nT: c.nT, acierto: c.acierto, tercios: c.tercios, mismoSigno: c.mismoSigno,
      dolares: c.bruto * capital * ciclosAno, dolaresExc: c.eq * capital * ciclosAno, ciclosAno,
      put: p ? { exc: p.eq, t: p.t } : null });
    console.log(`  h=${String(h).padStart(2)}d k=${k}: CALL exc ${(c.eq*100).toFixed(2).padStart(6)}% t=${c.t.toFixed(2).padStart(5)} · PUT exc ${p?(p.eq*100).toFixed(2).padStart(6)+"% t="+p.t.toFixed(2):"  --"} · n=${c.n} nT=${c.nT} nef=${c.nef} · prima $${fmt(c.prima)} · ${k} contratos = $${fmt(capital)} · tercios ${c.tercios.map(x=>(x*100).toFixed(1).padStart(6)).join(" ")}${c.mismoSigno?" OK":""}`);
  }
}

// ── 3. LA VERSION QUE CABE: ciclos no solapados, universo barato, k=5, capital <= la plaza ──
console.log(`\n=== 3. LO QUE CABE EN $${fmt(PLAZA)}: ciclos SIN SOLAPAR, universo barato, 5 contratos ===`);
const dsT = [...new Set(sub.map((f) => f.ymd))].sort();
function ciclosNoSolapados(h, k, der, arranque) {
  const ops = [];
  let i = arranque;
  while (i < dsT.length) {
    const d = dsT[i];
    const cand = sub.filter((f) => f.ymd === d && RET(f, der, h) != null);
    if (cand.length < Math.max(6, k + 1)) { i++; continue; }
    const mDia = media(cand.map((r) => RET(r, der, h)));
    for (const r of [...cand].sort((a, b) => a.desq - b.desq).slice(0, k))
      ops.push({ ticker: r.ticker, ymd: d, v: RET(r, der, h) - mDia, ret: RET(r, der, h), ask: der === "C" ? r.c.ask : r.p.ask });
    let j = i + 1;
    while (j < dsT.length && dias(d, dsT[j]) < h) j++;
    i = j;
  }
  return ops;
}
const cabe = [];
for (const h of HOLDS) {
  const k = 5;
  const arr = [];
  for (let a = 0; a < Math.max(1, Math.min(4, Math.round(h / 2))); a++) arr.push(ciclosNoSolapados(h, k, "C", a));
  const es = arr.map((o) => eqT(o).eq), br = arr.map((o) => media(o.map((x) => x.ret)));
  const prima = media(arr.flatMap((o) => o.map((x) => x.ask))) * 100;
  const capital = k * prima, ciclosAno = 365 / h;
  const nCiclos = media(arr.map((o) => o.length)) / k;
  const acierto = media(arr.flatMap((o) => o.map((x) => (x.ret > 0 ? 1 : 0))));
  const fila = { h, k, nCiclos, exc: media(es), bruto: media(br), prima, capital, ciclosAno,
    dolares: media(br) * capital * ciclosAno, dolaresExc: media(es) * capital * ciclosAno, acierto,
    porArranque: br.map((x) => +(x * 100).toFixed(2)) };
  cabe.push(fila);
  console.log(`  h=${String(h).padStart(2)}d: ${nCiclos.toFixed(0)} ciclos · exceso ${(media(es)*100).toFixed(2)}% · BRUTO ${(media(br)*100).toFixed(2)}%/op · acierto ${(acierto*100).toFixed(0)}% · 5 contratos = $${fmt(capital)} · ${ciclosAno.toFixed(0)} ciclos/ano -> $${fmt(media(br)*capital*ciclosAno)}/ano (${(media(br)*capital*ciclosAno/CUENTA*100).toFixed(1)}% de la cuenta) · por arranque ${br.map(x=>(x*100).toFixed(1)).join("/")}%`);
}
writeFileSync("scripts/esquina-9-puente.json", JSON.stringify({ precios, universoBarato: [...universoBarato], puente, cabe }), "utf8");
console.log("\nescrito scripts/esquina-9-puente.json");
