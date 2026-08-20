// ESQUINA · PASO 8 — LA VERSION QUE CABE EN LA CUENTA.
//
// La regla del paso 6 entra TODOS LOS DIAS con 5 contratos y plazo de 5 dias: eso son ~20
// posiciones abiertas a la vez, $77.000 de prima. No cabe. Y una regla que no cabe no es una regla.
//
// Aqui se mide la version ejecutable: se entra UNA VEZ POR CICLO (cada h dias), con k contratos,
// y se sale al cierre del ciclo. Capital comprometido = k x prima. Ademas se prueba si el UMBRAL
// ABSOLUTO (desq por debajo de un numero fijo) funciona igual que el ranking, porque en pantalla
// mirar un numero es mucho mas facil que ordenar 38 activos.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { elegirEsquina, bidSalida, cadena, dias, media, sd, nEfectiva, rng, fmt } from "./print-lib.mjs";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const D0 = "20260422", D1 = "20260819", CUENTA = 56389, SORTEOS = 500;
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
      const o = { exp: e.exp, K: e.K, ask: e.ask, dte: e.dte, rets: {} };
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
  if (!g || !Number.isFinite(s.desq)) continue;
  filas.push({ ticker: s.ticker, ymd: s.ymd, desq: s.desq, c: g.c ?? null, p: g.p ?? null });
}
const diasT = [...new Set(filas.map((f) => f.ymd))].sort();
const porDia = new Map(diasT.map((d) => [d, filas.filter((f) => f.ymd === d)]));
const RET = (f, der, h) => { const o = der === "C" ? f.c : f.p; const v = o?.rets?.[h]; return Number.isFinite(v) ? v : null; };

// ── donde cae el corte: que valor de desq tiene el 5º mas bajo de cada dia ──
console.log("=== DONDE CAE EL CORTE — el valor de desq del k-esimo mas bajo de cada dia ===");
for (const k of [1, 3, 5, 8]) {
  const v = [];
  for (const d of diasT) {
    const c = porDia.get(d).filter((r) => RET(r, "C", 5) != null).sort((a, b) => a.desq - b.desq);
    if (c.length >= 15) v.push(c[Math.min(k, c.length) - 1].desq);
  }
  v.sort((a, b) => a - b);
  console.log(`  k=${k}: mediana ${v[Math.floor(v.length/2)].toFixed(3)}  ·  p10 ${v[Math.floor(v.length*0.1)].toFixed(3)}  ·  p90 ${v[Math.floor(v.length*0.9)].toFixed(3)}  ·  candidatos elegibles/dia ~${Math.round(media(diasT.map(d=>porDia.get(d).filter(r=>RET(r,"C",5)!=null).length)))}`);
}
console.log(`  mediana global de desq: ${[...filas].map(f=>f.desq).sort((a,b)=>a-b)[Math.floor(filas.length/2)].toFixed(3)}`);

// ── CICLOS NO SOLAPADOS: se entra cada h dias, se cierra, se vuelve a entrar ──
console.log("\n=== LA VERSION EJECUTABLE: entrar cada h dias, k contratos, sin solapar ===");
console.log("    (esto es lo que cabe en la cuenta: capital = k x prima, no k x prima x dias)\n");
const eqT = (arr) => {
  const m = new Map();
  for (const o of arr) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.v); }
  const vals = [...m.values()].map(media);
  return { eq: media(vals), t: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length };
};
/** modo: "rank" = los k de desq mas bajo · "umbral" = todos los que estan por debajo de `u`, hasta k */
function ciclos(h, k, der, modo, u = 0.10, arranque = 0) {
  const ops = [];
  let i = arranque;
  while (i < diasT.length) {
    const d = diasT[i];
    const cand = porDia.get(d).filter((r) => RET(r, der, h) != null);
    if (cand.length < 12) { i++; continue; }
    const mDia = media(cand.map((r) => RET(r, der, h)));
    let ord = [...cand].sort((a, b) => a.desq - b.desq);
    if (modo === "umbral") ord = ord.filter((r) => r.desq < u);
    const elegidos = ord.slice(0, k);
    for (const r of elegidos) ops.push({ ticker: r.ticker, ymd: d, v: RET(r, der, h) - mDia, ret: RET(r, der, h), ask: der === "C" ? r.c.ask : r.p.ask });
    // avanzar h dias de calendario
    let j = i + 1;
    while (j < diasT.length && dias(d, diasT[j]) < h) j++;
    i = j;
  }
  return ops;
}
const salida = [];
for (const h of HOLDS) {
  for (const k of [1, 2, 3, 5]) {
    // se promedian los h arranques posibles para no depender de con que dia se empieza
    const todas = [];
    const arranques = Math.max(1, Math.min(5, Math.round(h / 2)));
    for (let a = 0; a < arranques; a++) todas.push(ciclos(h, k, "C", "rank", 0, a));
    const perArr = todas.map((ops) => ({ ops, e: eqT(ops), bruto: media(ops.map((o) => o.ret)) }));
    const exc = media(perArr.map((x) => x.e.eq)), bru = media(perArr.map((x) => x.bruto));
    const nOps = Math.round(media(perArr.map((x) => x.ops.length)));
    const prima = media(perArr.flatMap((x) => x.ops.map((o) => o.ask))) * 100;
    const nCiclos = nOps / k;
    const capital = k * prima;
    const ciclosAno = 365 / h;
    const dolares = bru * capital * ciclosAno;
    const dolaresExc = exc * capital * ciclosAno;
    const tPromedio = media(perArr.map((x) => x.e.t));
    const gana = perArr.flatMap((x) => x.ops).filter((o) => o.ret > 0).length / perArr.flatMap((x) => x.ops).length;
    salida.push({ h, k, nOps, nCiclos, exc, bru, prima, capital, ciclosAno, dolares, dolaresExc, t: tPromedio, acierto: gana, arranques });
    console.log(`  h=${String(h).padStart(2)}d k=${k}: ${nCiclos.toFixed(0)} ciclos · ${nOps} ops · exceso ${(exc*100).toFixed(2).padStart(6)}% t=${tPromedio.toFixed(2).padStart(5)} · BRUTO ${(bru*100).toFixed(2).padStart(6)}%/op · acierto ${(gana*100).toFixed(0)}% · capital $${fmt(capital).padStart(7)} · ${ciclosAno.toFixed(0)} ciclos/ano -> $${fmt(dolares)}/ano (${(dolares/CUENTA*100).toFixed(1)}% de la cuenta)`);
  }
  console.log("");
}

// ── ¿el umbral absoluto funciona igual que el ranking? ──
console.log("=== ¿SIRVE UN UMBRAL FIJO EN PANTALLA, en vez de ordenar los 38? ===");
const umb = [];
for (const u of [-0.20, 0, 0.10, 0.20, 0.30]) {
  const ops = [];
  for (const d of diasT) {
    const cand = porDia.get(d).filter((r) => RET(r, "C", 5) != null);
    if (cand.length < 12) continue;
    const mDia = media(cand.map((r) => RET(r, "C", 5)));
    for (const r of cand.filter((x) => x.desq < u)) ops.push({ ticker: r.ticker, ymd: d, v: RET(r, "C", 5) - mDia, ret: RET(r, "C", 5) });
  }
  if (ops.length < 40) { console.log(`  desq < ${u}: solo ${ops.length} ops, sin muestra`); continue; }
  const e = eqT(ops);
  const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), 5);
  umb.push({ u, n: ops.length, eq: e.eq, t: e.t, nT: e.nT, nef: nef.porTicker, porDia: ops.length / diasT.length });
  console.log(`  desq < ${String(u).padStart(5)}: n=${String(ops.length).padStart(4)} (${(ops.length/diasT.length).toFixed(1)} candidatos/dia, ${e.nT} activos) · exceso ${(e.eq*100).toFixed(2).padStart(6)}% t=${e.t.toFixed(2).padStart(5)} · nef=${nef.porTicker}`);
}

writeFileSync("scripts/esquina-8-ejecutable.json", JSON.stringify({ salida, umb }), "utf8");
console.log("\nescrito scripts/esquina-8-ejecutable.json");
