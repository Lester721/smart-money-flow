// DECISION FINAL — la tabla por ano de las candidatas vivas, con la CAJA REAL.
// Fuente: scripts/amplitud-riesgo-dias.json (1.069 sesiones, precios reales bid/ask, alas 50).
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const CUENTA = 56389, EFECTIVO = 7977, TASA = 0.05;
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pc = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => (v.length ? sum(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const N = dias.length;
const MC = [5, 10, 20, 50];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });

radiografia(dias.map((d, i) => ({
  sp11: d.sp11, cierre: d.cierre, pl45: d.pnl["45"], cred45: d.cred["45"],
  pl25: d.pnl["25"], ma5: MA[5][i], ma50: MA[50][i],
})), ["sp11", "cierre", "pl45", "cred45", "pl25", "ma5", "ma50"], "decision final");

function serie(cfg) {
  return dias.map((d, i) => {
    const p = d.pnl[String(cfg.dist)], c = d.cred[String(cfg.dist)];
    if (p == null || c == null) return { pl: 0, op: false };
    if (cfg.a != null) {
      const m1 = MA[cfg.a][i], m2 = MA[cfg.b][i];
      if (m1 == null || m2 == null || d.sp11 < m1 || d.sp11 < m2) return { pl: 0, op: false };
    }
    if (cfg.suelo && c < cfg.suelo) return { pl: 0, op: false };
    return { pl: p, op: true, cred: c };
  });
}
const caida = (v) => { let c = 0, p = 0, w = 0; for (const x of v) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; };
const es5 = (v) => { const o = [...v].sort((a, b) => a - b); return med(o.slice(0, Math.max(1, Math.round(v.length * 0.05)))); };
function racha(ops) { let cur = 0, peor = 0, n = 0, nPeor = 0; for (const x of ops) { if (x < 0) { cur += x; n++; if (cur < peor) { peor = cur; nPeor = n; } } else { cur = 0; n = 0; } } return { peor, nPeor }; }
function caja(v) {
  let c = EFECTIVO, min = EFECTIVO, rojo = 0, inter = 0;
  for (const x of v) { c += x; if (c < 0) { const it = c * TASA / 252; inter += it; c += it; rojo++; } if (c < min) min = c; }
  return { min, rojo, inter };
}

const ANOS = ["2022", "2023", "2024", "2025", "2026"];
const idxAno = {}; ANOS.forEach((a) => idxAno[a] = dias.map((d, i) => (d.ano === a ? i : -1)).filter((i) => i >= 0));

function tabla(nombre, cfg, ctr = 1) {
  const s = serie(cfg), pl = s.map((x) => x.pl * ctr);
  const opsIdx = s.map((x, i) => (x.op ? i : -1)).filter((i) => i >= 0);
  const ops = opsIdx.map((i) => pl[i]);
  const anosN = N / 252;
  console.log("\n### " + nombre + " · " + ctr + " contrato(s)");
  console.log("| año | ses. | opera | $ del año | % cuenta | peor día | peor racha | caída del año | % cuenta | caja mín | días rojo |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const a of ANOS) {
    const ii = idxAno[a], v = ii.map((i) => pl[i]);
    const o = ii.filter((i) => s[i].op).map((i) => pl[i]);
    const r = racha(o), cj = caja(v);
    console.log("| " + a + " | " + ii.length + " | " + o.length + " | " + eur(sum(v)) + " | " + pc(sum(v) / CUENTA) + " | " + eur(o.length ? Math.min(...o) : 0) + " | " + eur(r.peor) + " (" + r.nPeor + "d) | " + eur(caida(v)) + " | " + pc(caida(v) / CUENTA) + " | " + eur(cj.min) + " | " + cj.rojo + " |");
  }
  const cjT = caja(pl), r = racha(ops);
  console.log("| **TODO** | " + N + " | " + ops.length + " | " + eur(sum(pl)) + " = " + eur(sum(pl) / anosN) + "/año | " + pc(sum(pl) / anosN / CUENTA) + " | " + eur(Math.min(...ops)) + " | " + eur(r.peor) + " (" + r.nPeor + "d) | " + eur(caida(pl)) + " | " + pc(caida(pl) / CUENTA) + " | " + eur(cjT.min) + " | " + cjT.rojo + " |");
  console.log("   5% peor " + eur(es5(pl)) + " · crédito medio del día operado " + eur(med(opsIdx.map((i) => s[i].cred))) + " · interés " + eur(cjT.inter) + " · ops/año " + (ops.length / anosN).toFixed(0));
}

const H1 = dias.map((d, i) => i).filter((i) => i < Math.floor(N / 2));
const H2 = dias.map((d, i) => i).filter((i) => i >= Math.floor(N / 2));
function tramo(cfg, idx) {
  const s = serie(cfg), pl = idx.map((i) => s[i].pl), ops = idx.filter((i) => s[i].op).map((i) => s[i].pl);
  return { ano: sum(pl) / (idx.length / 252), caida: caida(pl), es5: es5(pl), peor: ops.length ? Math.min(...ops) : 0, n: ops.length, caja: caja(pl) };
}

console.log("\n\n# DECISION — las candidatas vivas, ano a ano, con la caja real");
console.log("\n" + N + " sesiones · " + dias[0].fecha + " → " + dias[N - 1].fecha + " · cuenta " + eur(CUENTA) + " · efectivo " + eur(EFECTIVO));
console.log("H1 = " + dias[H1[0]].fecha + "→" + dias[H1[H1.length - 1]].fecha + " (" + H1.length + ") · H2 = " + dias[H2[0]].fecha + "→" + dias[H2[H2.length - 1]].fecha + " (" + H2.length + ")");

const CFGS = [
  ["A · ±25 alas 50 · TODOS los dias (el condor de hoy)", { dist: 25, a: null, b: null }],
  ["B · ±45 alas 50 · sobre MA5 y MA50", { dist: 45, a: 5, b: 50 }],
  ["C · ±45 alas 50 · sobre MA5 y MA50 · credito >= $100", { dist: 45, a: 5, b: 50, suelo: 100 }],
  ["D · ±45 alas 50 · TODOS los dias (solo distancia)", { dist: 45, a: null, b: null }],
  ["E · ±45 alas 50 · credito >= $100, SIN filtro de medias", { dist: 45, a: null, b: null, suelo: 100 }],
];
for (const [n, c] of CFGS) tabla(n, c);

console.log("\n\n## EL CRUCE de cada candidata");
console.log("| config | H1 $/año | H1 5%peor | H1 caída | H1 caja | H2 $/año | H2 5%peor | H2 caída | H2 caja | mismo signo |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [n, c] of CFGS) {
  const a = tramo(c, H1), b = tramo(c, H2);
  console.log("| " + n.split("·")[0].trim() + " | " + eur(a.ano) + " | " + eur(a.es5) + " | " + eur(a.caida) + " | " + eur(a.caja.min) + " | " + eur(b.ano) + " | " + eur(b.es5) + " | " + eur(b.caida) + " | " + eur(b.caja.min) + " | " + ((a.ano > 0) === (b.ano > 0) ? "sí" : "NO") + " |");
}

console.log("\n\n## 2023 — que hizo cada candidata EN EL AÑO MALO");
console.log("| config | ses. operadas | $ 2023 | peor día | caída 2023 | % cuenta | crédito medio |");
console.log("|---|---|---|---|---|---|---|");
for (const [n, c] of CFGS) {
  const s = serie(c), ii = idxAno["2023"];
  const v = ii.map((i) => s[i].pl), o = ii.filter((i) => s[i].op);
  console.log("| " + n.split("·")[0].trim() + " | " + o.length + " | " + eur(sum(v)) + " | " + eur(o.length ? Math.min(...o.map((i) => s[i].pl)) : 0) + " | " + eur(caida(v)) + " | " + pc(caida(v) / CUENTA) + " | " + eur(o.length ? med(o.map((i) => s[i].cred)) : NaN) + " |");
}

console.log("\n\n## EL SUELO DE CREDITO — cruce formal (7 suelos x 2 direcciones)");
const SUELOS = [0, 25, 50, 75, 100, 150, 200];
console.log("| suelo | H1 $/año | H1 5%peor | H1 n | H1 peor día | H2 $/año | H2 5%peor | H2 n | H2 peor día |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const su of SUELOS) {
  const c = { dist: 45, a: 5, b: 50, suelo: su }; const a = tramo(c, H1), b = tramo(c, H2);
  console.log("| >=$" + su + " | " + eur(a.ano) + " | " + eur(a.es5) + " | " + a.n + " | " + eur(a.peor) + " | " + eur(b.ano) + " | " + eur(b.es5) + " | " + b.n + " | " + eur(b.peor) + " |");
}
console.log("\nlistón 14 pruebas: |t| >= " + listonT(14).toFixed(2) + " · 105 pruebas: |t| >= " + listonT(105).toFixed(2));

console.log("\n\n## EL TOPE DE TAMAÑO — un solo dia contra el efectivo");
console.log("| config | contratos | peor día | % del efectivo | colateral | caja mín | días rojo | interés |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [n, c] of [CFGS[0], CFGS[1], CFGS[2]]) {
  for (const k of [1, 2]) {
    const s = serie(c), pl = s.map((x) => x.pl * k), ops = s.filter((x) => x.op).map((x) => x.pl * k);
    const cj = caja(pl);
    console.log("| " + n.split("·")[0].trim() + " | " + k + " | " + eur(Math.min(...ops)) + " | " + pc(Math.abs(Math.min(...ops)) / EFECTIVO) + " | " + eur(5000 * k) + " | " + eur(cj.min) + " | " + cj.rojo + " | " + eur(cj.inter) + " |");
  }
}
