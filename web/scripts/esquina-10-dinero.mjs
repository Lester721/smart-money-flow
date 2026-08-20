// ESQUINA · PASO 10 — LA CIFRA QUE DECIDE, sin equiponderar ni demediar: dinero contra dinero.
//
// Todo lo anterior mide el exceso equiponderado por ticker, que es lo correcto para saber si la
// senal separa. Pero Lester no cobra un exceso equiponderado: cobra el retorno de las operaciones
// que hizo. Aqui se ponen las dos cosas en la misma unidad:
//   REGLA  = media del retorno REAL de las operaciones que la regla habria hecho
//   MONEDA = media del retorno REAL de 500 replicas sorteando el ticker esos mismos dias
// y la diferencia se lleva a dolares al ano sobre el capital que de verdad se compromete.
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
      const o = { ask: e.ask, peaje: 1 - e.bid / e.ask, rets: {} };
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

console.log("=== DINERO CONTRA DINERO: la regla vs 500 sorteos, retornos REALES sin demediar ===");
console.log("    regla: cada dia, los 5 tickers con desq mas bajo -> comprar la call 5% fuera ~90d");
console.log(`    capital de referencia $${fmt(PLAZA)} · cuenta $${fmt(CUENTA)}\n`);
const out = [];
for (const h of HOLDS) {
  for (const der of ["C", "P"]) {
    const ops = [];
    for (const d of diasT) {
      const cand = porDia.get(d).filter((r) => RET(r, der, h) != null);
      if (cand.length < 15) continue;
      for (const r of [...cand].sort((a, b) => a.desq - b.desq).slice(0, 5))
        ops.push({ ticker: r.ticker, ymd: d, ret: RET(r, der, h), ask: der === "C" ? r.c.ask : r.p.ask, peaje: der === "C" ? r.c.peaje : r.p.peaje });
    }
    const R = rng(11223344 + h * 17 + (der === "C" ? 1 : 2));
    const pools = new Map(diasT.map((d) => [d, porDia.get(d).filter((r) => RET(r, der, h) != null)]));
    const dist = [];
    for (let s = 0; s < SORTEOS; s++) {
      const v = ops.map((o) => { const p = pools.get(o.ymd); return RET(p[Math.floor(R() * p.length)], der, h); });
      dist.push(media(v));
    }
    dist.sort((a, b) => a - b);
    const regla = media(ops.map((o) => o.ret));
    const moneda = media(dist);
    const pts = (regla - moneda) * 100;
    const p = (dist.filter((x) => x >= regla).length + 1) / (SORTEOS + 1);
    const ciclos = 365 / h;
    const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), h);
    const dolReg = regla * PLAZA * ciclos, dolMon = moneda * PLAZA * ciclos;
    const acierto = ops.filter((o) => o.ret > 0).length / ops.length;
    out.push({ h, der, n: ops.length, nef: nef.porTicker, ventanas: nef.ventanas, regla, moneda, pts, p,
      p05: dist[25], p95: dist[475], ciclos, dolReg, dolMon, dolDif: dolReg - dolMon, acierto,
      prima: media(ops.map((o) => o.ask)) * 100, peaje: media(ops.map((o) => o.peaje)) });
    console.log(`  h=${String(h).padStart(2)}d ${der}: n=${ops.length} nef=${nef.porTicker} (${nef.ventanas} ventanas indep.)`);
    console.log(`         REGLA ${(regla*100).toFixed(2).padStart(7)}%/op  ·  MONEDA ${(moneda*100).toFixed(2).padStart(7)}%/op [p5 ${(dist[25]*100).toFixed(1)}, p95 ${(dist[475]*100).toFixed(1)}]  ·  DIFERENCIA ${pts.toFixed(2).padStart(6)} puntos  ·  p=${p.toFixed(4)}`);
    console.log(`         acierto ${(acierto*100).toFixed(0)}% · peaje ${(media(ops.map(o=>o.peaje))*100).toFixed(1)}% de la prima · ${ciclos.toFixed(1)} ciclos/ano`);
    console.log(`         sobre $${fmt(PLAZA)}: regla $${fmt(dolReg)}/ano  vs  moneda $${fmt(dolMon)}/ano  ->  la senal aporta $${fmt(dolReg-dolMon)}/ano (${((dolReg-dolMon)/CUENTA*100).toFixed(1)}% de la cuenta)`);
  }
  console.log("");
}
writeFileSync("scripts/esquina-10-dinero.json", JSON.stringify(out), "utf8");
console.log("escrito scripts/esquina-10-dinero.json");
