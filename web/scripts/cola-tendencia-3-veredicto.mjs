// EL VEREDICTO — ¿la caída baja de verdad, o es UN camino con suerte?
//
// La peor racha acumulada es un estadístico de UN SOLO CAMINO: depende del orden en que
// cayeron los días. Un filtro puede parecer que la parte por la mitad sólo porque quitó dos
// días concretos que estaban pegados. Aquí se remuestrea la serie por BLOQUES (para no romper
// las agrupaciones de volatilidad) y se mira la DISTRIBUCIÓN de la mejora, no un número suelto.
//
// Se añaden dos estadísticos de cola mucho más estables que el máximo:
//   · déficit esperado al 5% (media del 5% de días peores) — el peor día es un solo dato.
//   · déficit esperado al 10%.
//
// Y se responde a lo que el filtro NO arregla: el PEOR DÍA no se mueve. Se mira por qué.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 48;                       // acumuladas en los tres scripts
const LISTON = listonT(PRUEBAS);
const MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const percentil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

const opsBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (const op of opsBase) {
  const i = idx.get(op.fecha);
  if (i === undefined || i < 200) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);
  filas.push({
    fecha: op.fecha, pl: op.pl,
    dma20: dias[i].p11 / media(cierres.slice(-20)) - 1,
    dma50: dias[i].p11 / media(cierres.slice(-50)) - 1,
    mov: op.cierre - op.sp11,
    rangoMan: (op.maxM - op.minM) / op.sp11,       // rango de 09:30 a 11:00, observable a las 11:00
    sigma: op.sigma,                                // movimiento esperado por la IV a las 11:00
  });
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = filas.length / 252;

const dd = (ops) => { let c = 0, p = 0, w = 0; for (const o of ops) { c += o.pl; if (c > p) p = c; if (c - p < w) w = c - p; } return w; };
function res(ops) {
  const pl = ops.map((o) => o.pl).sort((a, b) => a - b);
  const n5 = Math.max(1, Math.round(pl.length * 0.05)), n10 = Math.max(1, Math.round(pl.length * 0.10));
  return {
    n: ops.length, total: pl.reduce((a, x) => a + x, 0), ano: pl.reduce((a, x) => a + x, 0) / ANOS,
    nMalo: pl.filter((x) => x <= -MALO).length, pMalo: pl.filter((x) => x <= -MALO).length / pl.length,
    es5: media(pl.slice(0, n5)), es10: media(pl.slice(0, n10)),
    p5: percentil(pl, 0.05), p1: percentil(pl, 0.01), peor: pl[0], dd: dd(ops),
  };
}

const REGLAS = {
  "SIN FILTRO": () => true,
  "A · spot 11:00 ≥ media de 20": (f) => f.dma20 >= 0,
  "B · spot 11:00 ≥ media de 20 Y ≥ media de 50": (f) => f.dma20 >= 0 && f.dma50 >= 0,
};

console.log("═".repeat(104));
console.log("VEREDICTO · ¿corta la cola de verdad y conserva el ingreso?");
console.log("═".repeat(104));
console.log(`\nListón de Bonferroni con ${PRUEBAS} pruebas acumuladas: |z| ≥ ${LISTON}\n`);
console.log("| regla | días | $/año | retiene | P(pérd>$2k) | déficit esp. 5% | déficit esp. 10% | pct 5 | peor día | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const R = {};
for (const [nom, fn] of Object.entries(REGLAS)) {
  const r = res(filas.filter(fn)); R[nom] = r;
  const base = R["SIN FILTRO"];
  console.log(`| ${nom} | ${r.n} | ${eur(r.ano)} | ${pct(r.total / base.total)} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.es10)} | ${eur(r.p5)} | ${eur(r.peor)} | ${eur(r.dd)} |`);
}
const BASE = R["SIN FILTRO"];

// ═══ z de la tasa de días malos, regla contra los días que descarta ════════════════════════
console.log(`\n| regla | días malos operando | días malos saltados | z | ¿pasa el listón? |`);
console.log("|---|---|---|---|---|");
for (const nom of ["A · spot 11:00 ≥ media de 20", "B · spot 11:00 ≥ media de 20 Y ≥ media de 50"]) {
  const fn = REGLAS[nom];
  const d = filas.filter(fn), f = filas.filter((x) => !fn(x));
  const k1 = f.filter((x) => x.pl <= -MALO).length, k2 = d.filter((x) => x.pl <= -MALO).length;
  const p = (k1 + k2) / filas.length, se = Math.sqrt(p * (1 - p) * (1 / f.length + 1 / d.length));
  const z = (k1 / f.length - k2 / d.length) / se;
  console.log(`| ${nom} | ${k2}/${d.length} (${pct(k2 / d.length)}) | ${k1}/${f.length} (${pct(k1 / f.length)}) | ${z.toFixed(2)} | ${Math.abs(z) >= LISTON ? "SÍ" : "no"} |`);
}

// ═══ REMUESTREO POR BLOQUES — la distribución de la mejora ═════════════════════════════════
// Se recortan bloques contiguos de 10 sesiones y se recomponen 5.000 series de la misma
// longitud. En cada una se calcula la caída con y sin filtro. Si la mejora fuera un capricho
// del orden, la distribución cruzaría el cero.
function bootstrap(fn, B = 5000, L = 10) {
  const n = filas.length, nb = Math.ceil(n / L);
  const dDD = [], dES = [], dAno = [];
  let semilla = 20260819;
  const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
  for (let b = 0; b < B; b++) {
    const s = [];
    for (let k = 0; k < nb; k++) {
      const ini = Math.floor(rnd() * (n - L));
      for (let j = 0; j < L && s.length < n; j++) s.push(filas[ini + j]);
    }
    const con = s.filter(fn);
    if (con.length < 50) continue;
    const plS = s.map((o) => o.pl).sort((a, b2) => a - b2), plC = con.map((o) => o.pl).sort((a, b2) => a - b2);
    const e5 = (v) => media(v.slice(0, Math.max(1, Math.round(v.length * 0.05))));
    dDD.push(Math.abs(dd(s)) - Math.abs(dd(con)));
    dES.push(e5(plC) - e5(plS));
    dAno.push((con.reduce((a, o) => a + o.pl, 0) - s.reduce((a, o) => a + o.pl, 0)) / ANOS);
  }
  const q = (v, p) => [...v].sort((a, b2) => a - b2)[Math.floor(v.length * p)];
  return {
    dDD: { med: q(dDD, 0.5), p05: q(dDD, 0.05), p95: q(dDD, 0.95), pPositivo: dDD.filter((x) => x > 0).length / dDD.length },
    dES: { med: q(dES, 0.5), p05: q(dES, 0.05), p95: q(dES, 0.95), pPositivo: dES.filter((x) => x > 0).length / dES.length },
    dAno: { med: q(dAno, 0.5), p05: q(dAno, 0.05), p95: q(dAno, 0.95), pPositivo: dAno.filter((x) => x > 0).length / dAno.length },
  };
}
console.log(`\n${"═".repeat(104)}`);
console.log("REMUESTREO POR BLOQUES DE 10 SESIONES · 5.000 series — la mejora, ¿aguanta otro orden de los días?");
console.log("═".repeat(104));
console.log("\n| regla | mejora de la peor racha (mediana) | intervalo 5–95% | % de series que mejora | mejora del déficit 5% | % que mejora | cambio en $/año (mediana) |");
console.log("|---|---|---|---|---|---|---|");
const boots = {};
for (const nom of ["A · spot 11:00 ≥ media de 20", "B · spot 11:00 ≥ media de 20 Y ≥ media de 50"]) {
  const b = bootstrap(REGLAS[nom]); boots[nom] = b;
  console.log(`| ${nom} | ${eur(b.dDD.med)} | ${eur(b.dDD.p05)} … ${eur(b.dDD.p95)} | ${pct(b.dDD.pPositivo)} | ${eur(b.dES.med)} | ${pct(b.dES.pPositivo)} | ${eur(b.dAno.med)} |`);
}

// ═══ LO QUE EL FILTRO NO ARREGLA ═══════════════════════════════════════════════════════════
const fnA = REGLAS["A · spot 11:00 ≥ media de 20"];
const quedan = filas.filter(fnA);
const malosQuedan = quedan.filter((f) => f.pl <= -MALO).sort((a, b) => a.pl - b.pl);
console.log(`\n${"═".repeat(104)}`);
console.log("LO QUE EL FILTRO NO ARREGLA — los días malos que SIGUEN dentro");
console.log("═".repeat(104));
console.log(`\n  El peor día de toda la muestra (${eur(BASE.peor)}) NO se evita: ese día el spot estaba POR ENCIMA de su media de 20.`);
console.log(`  Quedan ${malosQuedan.length} días malos de ${BASE.nMalo}. Así estaban a las 11:00:\n`);
console.log("| fecha | P&L | dist MA20 | dist MA50 | rango de la mañana | σ implícita (pts) | movimiento 11:00→cierre |");
console.log("|---|---|---|---|---|---|---|");
for (const f of malosQuedan) {
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${(f.dma20 * 100).toFixed(1)}% | ${(f.dma50 * 100).toFixed(1)}% | ${(f.rangoMan * 100).toFixed(2)}% | ${f.sigma.toFixed(0)} | ${f.mov.toFixed(0)} pts |`);
}
const restoOK = quedan.filter((f) => f.pl > -MALO);
console.log(`\n  Contra la media de los ${restoOK.length} días que SÍ salen bien dentro del filtro:`);
console.log(`    rango de la mañana:  malos ${(media(malosQuedan.map((f) => f.rangoMan)) * 100).toFixed(2)}%  ·  buenos ${(media(restoOK.map((f) => f.rangoMan)) * 100).toFixed(2)}%`);
console.log(`    σ implícita:         malos ${media(malosQuedan.map((f) => f.sigma)).toFixed(0)} pts  ·  buenos ${media(restoOK.map((f) => f.sigma)).toFixed(0)} pts`);
console.log(`    dist a la MA20:      malos ${(media(malosQuedan.map((f) => f.dma20)) * 100).toFixed(2)}%  ·  buenos ${(media(restoOK.map((f) => f.dma20)) * 100).toFixed(2)}%`);

// ═══ ESCALA: ¿y con el tamaño que la cuenta aguanta? ═══════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("EN DINERO — 2 contratos, que es lo que la cuenta aguanta (colateral $5.000 por cóndor)");
console.log("═".repeat(104));
console.log("\n| regla | $/año con 2 contratos | peor día | peor racha | días operados al año |");
console.log("|---|---|---|---|---|");
for (const [nom, r] of Object.entries(R)) {
  console.log(`| ${nom} | ${eur(r.ano * 2)} | ${eur(r.peor * 2)} | ${eur(r.dd * 2)} | ${(r.n / ANOS).toFixed(0)} |`);
}

writeFileSync("scripts/cola-tendencia-3-salida.json", JSON.stringify({
  generado: new Date().toISOString(), pruebas: PRUEBAS, listonZ: LISTON, anos: ANOS,
  resultados: R, bootstrap: boots,
  malosQueQuedan: malosQuedan.map((f) => ({ fecha: f.fecha, pl: f.pl, dma20: f.dma20, rangoMan: f.rangoMan, mov: f.mov })),
}, null, 2));
console.log("\n\nDetalle en scripts/cola-tendencia-3-salida.json");
