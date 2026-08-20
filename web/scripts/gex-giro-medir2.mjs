// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO (2) — el efecto CRUDO es enorme. ¿Queda algo cuando se descuenta el precio?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-medir2.mjs
//
// La primera pasada dejó dos números que no se pueden leer por separado:
//   · CRUDO   el día que abre por DEBAJO del giro tiene un rango 1,30–1,42× mayor. t=7,8 a 10,2,
//             percentil 100 contra el azar, y sobrevive al cruce de mitades en las dos direcciones.
//   · DIVIDIDO por el straddle ATM que el mercado ya cobra a las 09:35: t = −0,45 · +0,80 · −1,25.
//             Nada. Percentil 35–56 contra el azar.
//
// Dividir asume que la elasticidad es EXACTAMENTE 1. Si la de verdad fuese 0,7, dividir se pasaría
// de frenada y mataría un efecto real. Así que aquí NO se divide: se deja que los datos pongan la
// elasticidad, y además se compara DENTRO de cubos de volatilidad parecida, que no asume nada.
//
// Y al final, lo único que no se discute: DÓLARES SIN MODELO. Straddle ATM de 0DTE comprado al ASK
// real de las 09:35 y liquidado a su valor intrínseco con el índice al cierre. Ni Black-Scholes,
// ni punto medio, ni una interpolación. Si el día de abajo se mueve más de lo que costaba, se ve.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "scripts/gex-niveles.json";
const SALIDA = "scripts/gex-giro-resultado2.json";
const CUENTA = 56389;
const SORTEOS = 500;
const PRUEBAS_DECLARADAS = 32;   // las 16 de la primera pasada + las 16 de ésta

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
function welch(a, b) {
  if (a.length < 3 || b.length < 3) return { t: NaN, n1: a.length, n2: b.length };
  const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length);
  return { t: se > 0 ? (media(a) - media(b)) / se : NaN, n1: a.length, n2: b.length };
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2, t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);
function rng(s) { let a = s >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

/** OLS múltiple por ecuaciones normales + eliminación de Gauss. Devuelve betas y sus t. */
function ols(X, y) {
  const n = y.length, k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k + 1).fill(0));
  for (let i = 0; i < k; i++) { for (let j = 0; j < k; j++) { let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * X[r][j]; A[i][j] = s; } let s = 0; for (let r = 0; r < n; r++) s += X[r][i] * y[r]; A[i][k] = s; }
  const XtX = A.map((r) => r.slice(0, k));
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    exigir(Math.abs(A[c][c]) > 1e-12, "matriz singular en la regresión");
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = A[r][c] / A[c][c]; for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j]; }
  }
  const b = A.map((r, i) => r[k] / r[i]);
  let sse = 0; for (let r = 0; r < n; r++) { let p = 0; for (let i = 0; i < k; i++) p += X[r][i] * b[i]; sse += (y[r] - p) ** 2; }
  const s2 = sse / (n - k);
  // inversa de XtX por Gauss-Jordan, sólo para la diagonal
  const M = XtX.map((r, i) => [...r, ...XtX.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < k; c++) {
    let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c]; for (let j = 0; j < 2 * k; j++) M[c][j] /= d;
    for (let r = 0; r < k; r++) { if (r === c) continue; const f = M[r][c]; for (let j = 0; j < 2 * k; j++) M[r][j] -= f * M[c][j]; }
  }
  return b.map((bi, i) => ({ b: bi, t: bi / Math.sqrt(s2 * M[i][k + i]) }));
}

// ═══ DATOS ═════════════════════════════════════════════════════════════════════════════════
const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
const D = [];
for (const f of J.filas) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!c || !p || !(c.bid > 0) || !(p.bid > 0)) continue;
  // Los dos lados tienen que ser el MISMO strike para que esto sea un straddle y no un strangle.
  if (c.K !== p.K) continue;
  const impl = (((c.bid + c.ask) / 2 + (p.bid + p.ask) / 2) / f.apertura) * 100;
  const d = {
    fecha: f.fecha, ano: +f.fecha.slice(0, 4), apertura: f.apertura, cierre: f.cierre,
    rango: f.rangoPct, mov: Math.abs(f.movDiaPct), impl,
    K: c.K, cAsk: c.ask, cBid: c.bid, pAsk: p.ask, pBid: p.bid, horq: c.horquillaPct,
  };
  d.efic = d.rango > 0 ? d.mov / d.rango : null;      // 1 = tendencia limpia · 0 = ida y vuelta
  // ── DÓLARES SIN MODELO ──
  // Comprar el straddle: se paga el ASK de las dos patas. Liquidación del 0DTE de SPXW = valor
  // intrínseco con el índice al cierre. Una sola pata acaba con valor, y vale |cierre − K|.
  // OJO: `cierre` es la barra de 16:00 de la propia cadena, no el precio oficial de liquidación.
  d.costeCompra = (d.cAsk + d.pAsk) * 100;
  d.cobraVenta = (d.cBid + d.pBid) * 100;
  d.intrinseco = Math.abs(d.cierre - d.K) * 100;
  d.plCompra = d.intrinseco - d.costeCompra;          // comprar el straddle al ask
  d.plVenta = d.cobraVenta - d.intrinseco;            // venderlo al bid (el espejo)
  for (const L of ["gam", "gamD"]) {
    const nv = f.niveles[L];
    d[L] = nv.flip == null ? null : { dFlipPct: nv.dFlip.pct, dist: Math.abs(nv.dFlip.pts), arriba: nv.dFlip.pts < 0 };
  }
  D.push(d);
}
console.log("\n" + "═".repeat(95));
console.log("RESPETAR · GIRO (2) — ¿queda efecto después de descontar lo que el mercado ya cobra?");
console.log("═".repeat(95));
console.log(`\n   n = ${D.length} días · listón |t| ≥ ${LISTON} con ${PRUEBAS_DECLARADAS} pruebas declaradas`);
exigir(D.length > 1000, `sólo ${D.length} días con straddle del mismo strike`);
exigir(D.filter((d) => d.plCompra !== 0).length > 1000, "plCompra está muerto");

const R = {};

// ═══ 1 · EL MECANISMO: ¿por qué muere al normalizar? ═══════════════════════════════════════
console.log(`\n## 1 · EL MECANISMO — el giro y el precio del straddle son la MISMA información`);
for (const L of ["gam", "gamD"]) {
  const con = D.filter((d) => d[L]);
  const ab = con.filter((d) => !d[L].arriba), ar = con.filter((d) => d[L].arriba);
  const w = welch(ab.map((d) => Math.log(d.impl)), ar.map((d) => Math.log(d.impl)));
  const x = con.map((d) => d[L].dFlipPct), y = con.map((d) => Math.log(d.impl));
  const mx = media(x), my = media(y); let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  R[`mecanismo|${L}`] = { implAbajo: +mediana(ab.map((d) => d.impl)).toFixed(3), implArriba: +mediana(ar.map((d) => d.impl)).toFixed(3), t: +w.t.toFixed(2), corr: +(sxy / Math.sqrt(sxx * syy)).toFixed(3) };
  console.log(`   ${L.padEnd(5)} straddle ATM que el mercado cobra:  abajo del giro ${mediana(ab.map((d) => d.impl)).toFixed(3)}%   arriba ${mediana(ar.map((d) => d.impl)).toFixed(3)}%   ` +
    `cociente ${(mediana(ab.map((d) => d.impl)) / mediana(ar.map((d) => d.impl))).toFixed(3)}×  t=${w.t.toFixed(2)}`);
  console.log(`         correlación entre la distancia al giro y lo que cobra el straddle: ${(sxy / Math.sqrt(sxx * syy)).toFixed(3)}`);
}
console.log(`   → el rango realizado sale 1,30–1,42× mayor abajo. El straddle YA se cobra en esa proporción.`);

// ═══ 2 · SIN ASUMIR ELASTICIDAD 1: regresión con log(implícito) libre ═══════════════════════
console.log(`\n## 2 · REGRESIÓN — log(desenlace) sobre log(implícito) + estar ABAJO del giro`);
console.log(`   (dividir asume elasticidad 1; aquí la ponen los datos. La t que importa es la del dummy ABAJO)`);
console.log(`   ${"lente".padEnd(6)} ${"desenlace".padEnd(12)} ${"período".padEnd(12)} ${"n".padStart(6)} ${"elasticidad".padStart(12)} ${"efecto ABAJO".padStart(13)} ${"t ABAJO".padStart(9)}`);
for (const L of ["gam", "gamD"]) {
  for (const [dn, dv] of [["rango", (d) => d.rango], ["|mov|", (d) => d.mov]]) {
    for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (d) => d.ano <= 2023], ["2024-2026", (d) => d.ano >= 2024]]) {
      const con = D.filter(pf).filter((d) => d[L] && dv(d) > 0);
      const X = con.map((d) => [1, Math.log(d.impl), d[L].arriba ? 0 : 1]);
      const y = con.map((d) => Math.log(dv(d)));
      const b = ols(X, y);
      R[`reg|${L}|${dn}|${pn}`] = { n: con.length, elast: +b[1].b.toFixed(3), abajo: +b[2].b.toFixed(4), t: +b[2].t.toFixed(2) };
      console.log(`   ${L.padEnd(6)} ${dn.padEnd(12)} ${pn.padEnd(12)} ${String(con.length).padStart(6)} ${b[1].b.toFixed(3).padStart(12)} ` +
        `${((Math.exp(b[2].b) - 1) * 100).toFixed(1).padStart(11)}% ${b[2].t.toFixed(2).padStart(9)}${Math.abs(b[2].t) >= LISTON ? "  ← pasa" : ""}`);
    }
  }
}

// ═══ 3 · SIN ASUMIR NADA: comparar DENTRO de cubos de volatilidad parecida ══════════════════
// Los terciles se cortan con el implícito, que es observable a las 09:35. No hay futuro dentro.
console.log(`\n## 3 · DENTRO DE CUBOS DE VOLATILIDAD PARECIDA (terciles del straddle de las 09:35)`);
console.log(`   ${"lente".padEnd(6)} ${"tercil".padEnd(10)} ${"n abajo".padStart(8)} ${"n arriba".padStart(9)} ${"rango abajo".padStart(12)} ${"rango arriba".padStart(13)} ${"cociente".padStart(9)} ${"t".padStart(7)}`);
for (const L of ["gam", "gamD"]) {
  const con = D.filter((d) => d[L]);
  const c1 = pct(con.map((d) => d.impl), 33.33), c2 = pct(con.map((d) => d.impl), 66.67);
  const cubos = [["calma", (d) => d.impl <= c1], ["medio", (d) => d.impl > c1 && d.impl <= c2], ["nervioso", (d) => d.impl > c2]];
  for (const [cn, cf] of cubos) {
    const g = con.filter(cf);
    const ab = g.filter((d) => !d[L].arriba), ar = g.filter((d) => d[L].arriba);
    const w = welch(ab.map((d) => Math.log(d.rango)), ar.map((d) => Math.log(d.rango)));
    R[`cubo|${L}|${cn}`] = { nAb: ab.length, nAr: ar.length, mAb: +mediana(ab.map((d) => d.rango)).toFixed(3), mAr: +mediana(ar.map((d) => d.rango)).toFixed(3), t: +w.t.toFixed(2) };
    console.log(`   ${L.padEnd(6)} ${cn.padEnd(10)} ${String(ab.length).padStart(8)} ${String(ar.length).padStart(9)} ` +
      `${mediana(ab.map((d) => d.rango)).toFixed(3).padStart(12)} ${mediana(ar.map((d) => d.rango)).toFixed(3).padStart(13)} ` +
      `${(mediana(ab.map((d) => d.rango)) / mediana(ar.map((d) => d.rango))).toFixed(3).padStart(9)} ${w.t.toFixed(2).padStart(7)}${Math.abs(w.t) >= LISTON ? "  ← pasa" : ""}`);
  }
}

// ═══ 4 · EFICIENCIA — el mecanismo de verdad: ¿tendencia o ida y vuelta? ════════════════════
// Ésta es la lectura limpia de "amplifica vs amortigua" y no depende del nivel de volatilidad:
// |cierre − apertura| / rango. Alta = el día tira en una dirección. Baja = va y vuelve.
console.log(`\n## 4 · EFICIENCIA |cierre−apertura| / rango — ¿el día de abajo TIENDE más?`);
console.log(`   ${"lente".padEnd(6)} ${"período".padEnd(12)} ${"n abajo".padStart(8)} ${"n arriba".padStart(9)} ${"efic abajo".padStart(11)} ${"efic arriba".padStart(12)} ${"t".padStart(7)}`);
for (const L of ["gam", "gamD"]) {
  for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (d) => d.ano <= 2023], ["2024-2026", (d) => d.ano >= 2024]]) {
    const con = D.filter(pf).filter((d) => d[L] && d.efic != null);
    const ab = con.filter((d) => !d[L].arriba).map((d) => d.efic), ar = con.filter((d) => d[L].arriba).map((d) => d.efic);
    const w = welch(ab, ar);
    R[`efic|${L}|${pn}`] = { nAb: ab.length, nAr: ar.length, mAb: +mediana(ab).toFixed(4), mAr: +mediana(ar).toFixed(4), t: +w.t.toFixed(2) };
    console.log(`   ${L.padEnd(6)} ${pn.padEnd(12)} ${String(ab.length).padStart(8)} ${String(ar.length).padStart(9)} ${mediana(ab).toFixed(4).padStart(11)} ${mediana(ar).toFixed(4).padStart(12)} ${w.t.toFixed(2).padStart(7)}${Math.abs(w.t) >= LISTON ? "  ← pasa" : ""}`);
  }
}

// ═══ 5 · DÓLARES SIN MODELO — el straddle 0DTE al ask real, liquidado a intrínseco ══════════
console.log(`\n## 5 · DÓLARES SIN MODELO — straddle ATM de 0DTE, ASK real de 09:35 → intrínseco al cierre`);
console.log(`   coste mediano de comprarlo: ${eur(mediana(D.map((d) => d.costeCompra)))} por contrato · el efectivo de la cuenta son $7.977`);
{
  const todos = D.map((d) => d.plCompra);
  console.log(`   comprarlo TODOS los días (${D.length}): media ${eur(media(todos))}/día · total ${eur(todos.reduce((a, b) => a + b, 0))} · aciertos ${((todos.filter((x) => x > 0).length / todos.length) * 100).toFixed(1)}%`);
}
console.log(`\n   ${"lente".padEnd(6)} ${"regla".padEnd(28)} ${"período".padEnd(12)} ${"n".padStart(5)} ${"$/op".padStart(9)} ${"$/año".padStart(11)} ${"acierto".padStart(8)} ${"t".padStart(7)}`);
const ANOS = { "2022-2026": (D[D.length - 1].fecha.slice(0, 4) - 2022) + 8 / 12 + 0.02, "2022-2023": 2, "2024-2026": 2.61 };
const REGLAS = [
  ["COMPRAR abajo del giro", (d, L) => (d[L] && !d[L].arriba ? d.plCompra : null)],
  ["VENDER arriba del giro", (d, L) => (d[L] && d[L].arriba ? d.plVenta : null)],
  ["COMPRAR abajo + VENDER arriba", (d, L) => (d[L] ? (d[L].arriba ? d.plVenta : d.plCompra) : null)],
];
for (const L of ["gam", "gamD"]) {
  for (const [rn, rf] of REGLAS) {
    for (const [pn, pf] of [["2022-2026", () => true], ["2022-2023", (d) => d.ano <= 2023], ["2024-2026", (d) => d.ano >= 2024]]) {
      const pl = D.filter(pf).map((d) => rf(d, L)).filter((x) => x != null);
      if (pl.length < 30) continue;
      const t = media(pl) / (sd(pl) / Math.sqrt(pl.length));
      const alAno = pl.reduce((a, b) => a + b, 0) / ANOS[pn];
      R[`dolares|${L}|${rn}|${pn}`] = { n: pl.length, porOp: +media(pl).toFixed(1), alAno: +alAno.toFixed(0), acierto: +((pl.filter((x) => x > 0).length / pl.length) * 100).toFixed(1), t: +t.toFixed(2), peor: Math.round(Math.min(...pl)) };
      console.log(`   ${L.padEnd(6)} ${rn.padEnd(28)} ${pn.padEnd(12)} ${String(pl.length).padStart(5)} ${eur(media(pl)).padStart(9)} ${eur(alAno).padStart(11)} ` +
        `${(((pl.filter((x) => x > 0).length / pl.length) * 100).toFixed(1) + "%").padStart(8)} ${t.toFixed(2).padStart(7)}${Math.abs(t) >= LISTON ? "  ← pasa" : ""}`);
    }
  }
}

// ═══ 6 · CONTROL CONTRA EL AZAR sobre los DÓLARES ══════════════════════════════════════════
// Un nivel a la MISMA distancia pero de lado al azar: mismo número de días comprando, mismo
// número vendiendo, sólo cambia CUÁLES. Si el giro no le gana a esa línea, el giro no elige.
console.log(`\n## 6 · CONTROL CONTRA EL AZAR sobre los dólares — ${SORTEOS} sorteos, mismo reparto`);
console.log(`   ${"lente".padEnd(6)} ${"regla".padEnd(28)} ${"$/año real".padStart(12)} ${"azar p50".padStart(11)} ${"azar p95".padStart(11)} ${"percentil".padStart(10)}  veredicto`);
for (const L of ["gam", "gamD"]) {
  const con = D.filter((d) => d[L]);
  const anos = ANOS["2022-2026"];
  for (const [rn, rf] of REGLAS) {
    const real = con.map((d) => rf(d, L)).filter((x) => x != null).reduce((a, b) => a + b, 0) / anos;
    const etiquetas = con.map((d) => d[L].arriba);
    const r = rng(20260820);
    const sorteos = [];
    for (let s = 0; s < SORTEOS; s++) {
      const perm = etiquetas.slice();
      for (let i = perm.length - 1; i > 0; i--) { const k = Math.floor(r() * (i + 1)); [perm[i], perm[k]] = [perm[k], perm[i]]; }
      let tot = 0;
      for (let i = 0; i < con.length; i++) {
        const d = con[i], arr = perm[i];
        if (rn.startsWith("COMPRAR abajo del")) { if (!arr) tot += d.plCompra; }
        else if (rn.startsWith("VENDER")) { if (arr) tot += d.plVenta; }
        else tot += arr ? d.plVenta : d.plCompra;
      }
      sorteos.push(tot / anos);
    }
    sorteos.sort((a, b) => a - b);
    const p = (sorteos.filter((x) => x < real).length / sorteos.length) * 100;
    R[`azar$|${L}|${rn}`] = { real: Math.round(real), p50: Math.round(mediana(sorteos)), p95: Math.round(pct(sorteos, 95)), percentil: +p.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${rn.padEnd(28)} ${eur(real).padStart(12)} ${eur(mediana(sorteos)).padStart(11)} ${eur(pct(sorteos, 95)).padStart(11)} ${(p.toFixed(1) + "%").padStart(10)}  ${p >= 95 ? "LE GANA AL AZAR" : "no le gana al azar"}`);
  }
}

// ═══ 7 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log(`\n## 7 · VEREDICTO`);
const regPasa = Object.entries(R).filter(([k, v]) => k.startsWith("reg|") && Math.abs(v.t) >= LISTON);
const cuboPasa = Object.entries(R).filter(([k, v]) => k.startsWith("cubo|") && Math.abs(v.t) >= LISTON);
const eficPasa = Object.entries(R).filter(([k, v]) => k.startsWith("efic|") && Math.abs(v.t) >= LISTON);
const dolPasa = Object.entries(R).filter(([k, v]) => k.startsWith("dolares|") && v.alAno > 0 && Math.abs(v.t) >= LISTON);
const azarPasa = Object.entries(R).filter(([k, v]) => k.startsWith("azar$|") && v.percentil >= 95);
console.log(`   regresión con elasticidad libre — dummy ABAJO pasa el listón: ${regPasa.length ? regPasa.map(([k, v]) => k + " t=" + v.t).join(" · ") : "NINGUNO"}`);
console.log(`   dentro de cubos de volatilidad parecida:                      ${cuboPasa.length ? cuboPasa.map(([k, v]) => k + " t=" + v.t).join(" · ") : "NINGUNO"}`);
console.log(`   eficiencia (tendencia vs ida y vuelta):                       ${eficPasa.length ? eficPasa.map(([k, v]) => k + " t=" + v.t).join(" · ") : "NINGUNO"}`);
console.log(`   dólares con signo positivo y por encima del listón:           ${dolPasa.length ? dolPasa.map(([k, v]) => k + " " + eur(v.alAno) + "/año").join(" · ") : "NINGUNO"}`);
console.log(`   dólares que le ganan al azar:                                 ${azarPasa.length ? azarPasa.map(([k, v]) => k + " p" + v.percentil).join(" · ") : "NINGUNO"}`);

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), n: D.length, liston: LISTON, pruebasDeclaradas: PRUEBAS_DECLARADAS, sorteos: SORTEOS, cuenta: CUENTA, ...R }, null, 1), "utf8");
console.log(`\n   escrito: ${SALIDA}\n`);
