// REFUTACIÓN · segunda tanda — los ataques que quedan vivos tras la primera
//
//   9  · JACKKNIFE POR MES — la caída es un estadístico de EPISODIO, no de día.
//        Quitar 3 días no la mueve; quitar el mes que la produce, sí. Si la mejora desaparece
//        al sacar UN mes, la mitad de la caída la partió un episodio, no una regla.
//  10  · A contra B sin abril de 2025 — los 13 días que separan una regla de otra son un racimo.
//  11  · ¿aporta la MEDIA algo sobre la volatilidad implícita de las 11:00? (mismo dato, más directo)
//  12  · qué pasa con el dinero de verdad: 2 contratos, peor día y efectivo de la cuenta
//  13  · mitades del período (primera mitad = "en muestra", segunda = "fuera")

import { readFileSync } from "node:fs";

const MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);

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
const ops = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (const op of ops) {
  const i = idx.get(op.fecha);
  if (i === undefined || i < 200) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);
  filas.push({ fecha: op.fecha, pl: op.pl, credito: op.credito, sigma: op.sigma,
    mov: Math.abs(op.cierre - op.sp11), sp11: op.sp11,
    rangoMan: (op.maxM - op.minM) / op.sp11,
    d20: dias[i].p11 / media(cierres.slice(-20)) - 1,
    d50: dias[i].p11 / media(cierres.slice(-50)) - 1 });
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N / 252;
const dd = (o) => { let c = 0, p = 0, w = 0; for (const x of o) { c += x.pl; if (c > p) p = c; if (c - p < w) w = c - p; } return w; };
const res = (g, an) => { const pl = g.map((x) => x.pl).sort((a, b) => a - b); const n5 = Math.max(1, Math.round(pl.length * 0.05));
  const t = pl.reduce((a, x) => a + x, 0);
  return { n: g.length, total: t, ano: t / (an ?? ANOS), nMalo: pl.filter((x) => x <= -MALO).length,
    pMalo: pl.filter((x) => x <= -MALO).length / pl.length, es5: media(pl.slice(0, n5)),
    p5: pl[Math.floor(pl.length * 0.05)], peor: pl[0], dd: dd(g) }; };
const A = (f) => f.d20 >= 0, B = (f) => f.d20 >= 0 && f.d50 >= 0;
const BASE = res(filas), RA = res(filas.filter(A)), RB = res(filas.filter(B));

// ═══ 9 · JACKKNIFE POR MES ═════════════════════════════════════════════════════════════════
console.log("═".repeat(104));
console.log("9 · JACKKNIFE POR MES — se saca un mes entero y se vuelve a medir la mejora de la caída");
console.log("═".repeat(104));
const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort();
const jk = [];
for (const m of meses) {
  const sub = filas.filter((f) => !f.fecha.startsWith(m));
  const an = sub.length / 252;
  const b = res(sub, an), r = res(sub.filter(B), an);
  jk.push({ m, dDD: Math.abs(b.dd) - Math.abs(r.dd), ddBase: b.dd, ddB: r.dd, dAno: r.ano - b.ano, pMalo: r.pMalo });
}
jk.sort((a, b) => a.dDD - b.dDD);
console.log(`\n    Mejora de la caída con TODOS los meses: ${eur(Math.abs(BASE.dd) - Math.abs(RB.dd))}`);
console.log(`\n    Los 6 meses cuya ausencia MÁS reduce la mejora:`);
console.log("| mes fuera | caída base | caída B | mejora | ¿sigue positiva? |");
console.log("|---|---|---|---|---|");
for (const j of jk.slice(0, 6)) console.log(`| ${j.m} | ${eur(j.ddBase)} | ${eur(j.ddB)} | ${eur(j.dDD)} | ${j.dDD > 0 ? "sí" : "**NO**"} |`);
console.log(`\n    meses medidos: ${jk.length} · mejora mínima ${eur(jk[0].dDD)} · mediana ${eur(jk[Math.floor(jk.length / 2)].dDD)} · máxima ${eur(jk[jk.length - 1].dDD)}`);
console.log(`    meses cuya ausencia deja la mejora en NEGATIVO: ${jk.filter((j) => j.dDD <= 0).length}`);
console.log(`    meses cuya ausencia deja la mejora por debajo de $3.000: ${jk.filter((j) => j.dDD < 3000).length}`);

// jackknife dejando fuera trimestres (episodios más largos)
const trims = [...new Set(filas.map((f) => f.fecha.slice(0, 4) + "-T" + (Math.floor(+f.fecha.slice(5, 7) / 3.01) + 1)))].sort();
const jkT = [];
for (const t of trims) {
  const sub = filas.filter((f) => (f.fecha.slice(0, 4) + "-T" + (Math.floor(+f.fecha.slice(5, 7) / 3.01) + 1)) !== t);
  const an = sub.length / 252;
  const b = res(sub, an), r = res(sub.filter(B), an);
  jkT.push({ t, dDD: Math.abs(b.dd) - Math.abs(r.dd), pB: r.pMalo, pBase: b.pMalo, dAno: r.ano - b.ano });
}
jkT.sort((a, b) => a.dDD - b.dDD);
console.log(`\n    Por TRIMESTRE (episodios largos) · ${jkT.length} trimestres:`);
console.log("| trimestre fuera | mejora de la caída | P(>-2k) base → B | Δ$/año |");
console.log("|---|---|---|---|");
for (const j of jkT.slice(0, 4)) console.log(`| ${j.t} | ${eur(j.dDD)} | ${pct(j.pBase)} → ${pct(j.pB)} | ${eur(j.dAno)} |`);
console.log(`    trimestres con mejora ≤ 0: ${jkT.filter((j) => j.dDD <= 0).length} · con mejora < $3.000: ${jkT.filter((j) => j.dDD < 3000).length}`);

// ═══ 10 · A CONTRA B SIN ABRIL DE 2025 ═════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("10 · A CONTRA B — ¿la ventaja de B sobre A es un racimo (abril 2025)?");
console.log("═".repeat(104));
{
  const sin = filas.filter((f) => !(f.fecha >= "2025-03-20" && f.fecha <= "2025-05-05"));
  const an = sin.length / 252;
  console.log(`\n    con todo:        A ${eur(RA.dd)} · B ${eur(RB.dd)} → B mejora a A en ${eur(Math.abs(RA.dd) - Math.abs(RB.dd))}`);
  const a2 = res(sin.filter(A), an), b2 = res(sin.filter(B), an), base2 = res(sin, an);
  console.log(`    sin 20/3–5/5 2025: base ${eur(base2.dd)} · A ${eur(a2.dd)} · B ${eur(b2.dd)} → B mejora a A en ${eur(Math.abs(a2.dd) - Math.abs(b2.dd))}`);
  console.log(`                       $/año: base ${eur(base2.ano)} · A ${eur(a2.ano)} · B ${eur(b2.ano)}`);
  console.log(`                       P(>-2k): base ${pct(base2.pMalo)} · A ${pct(a2.pMalo)} · B ${pct(b2.pMalo)}`);
}

// ═══ 11 · ¿APORTA LA MEDIA SOBRE LA VOLATILIDAD IMPLÍCITA DE LAS 11:00? ═════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("11 · CONTRA UN FILTRO DE VOLATILIDAD — σ implícita a las 11:00 (mismo dato, más directo)");
console.log("═".repeat(104));
{
  const sig = filas.map((f) => f.sigma).sort((a, b) => a - b);
  const cortes = [0.5, 0.6, 0.667, 0.7, 0.8];
  console.log("\n| filtro | n | $/año | P(>-$2k) | ES5% | pct5 | peor día | peor racha |");
  console.log("|---|---|---|---|---|---|---|---|");
  console.log(`| base | ${BASE.n} | ${eur(BASE.ano)} | ${pct(BASE.pMalo)} | ${eur(BASE.es5)} | ${eur(BASE.p5)} | ${eur(BASE.peor)} | ${eur(BASE.dd)} |`);
  console.log(`| REGLA B (medias) | ${RB.n} | ${eur(RB.ano)} | ${pct(RB.pMalo)} | ${eur(RB.es5)} | ${eur(RB.p5)} | ${eur(RB.peor)} | ${eur(RB.dd)} |`);
  for (const q of cortes) {
    const c = sig[Math.floor(sig.length * q)];
    const r = res(filas.filter((f) => f.sigma <= c));
    console.log(`| σ 11:00 ≤ p${Math.round(q * 100)} (${c.toFixed(0)} pts) | ${r.n} | ${eur(r.ano)} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.p5)} | ${eur(r.peor)} | ${eur(r.dd)} |`);
  }
  // ¿la media añade algo DENTRO de cada tramo de sigma?
  const c67 = sig[Math.floor(sig.length * 0.667)];
  const baja = filas.filter((f) => f.sigma <= c67);
  const rr = res(baja.filter(B), baja.length / 252);
  console.log(`\n    Dentro del tramo de σ baja (n=${baja.length}), aplicar además la regla B: n=${rr.n} · ${eur(rr.ano)}/año · P(>-2k)=${pct(rr.pMalo)} · racha ${eur(rr.dd)}`);
  const bb = res(baja, baja.length / 252);
  console.log(`      (el tramo de σ baja solo: ${eur(bb.ano)}/año · P(>-2k)=${pct(bb.pMalo)} · racha ${eur(bb.dd)})`);
  // correlación entre estar bajo la media y sigma
  const dentro = filas.filter(B), fuera = filas.filter((f) => !B(f));
  console.log(`\n    σ media: días que B opera ${media(dentro.map((f) => f.sigma)).toFixed(0)} pts · días que salta ${media(fuera.map((f) => f.sigma)).toFixed(0)} pts`);
  console.log(`    crédito medio cobrado: opera ${eur(media(dentro.map((f) => f.credito)))} · salta ${eur(media(fuera.map((f) => f.credito)))}`);
  console.log(`    movimiento |11:00→cierre|: opera ${media(dentro.map((f) => f.mov)).toFixed(1)} pts · salta ${media(fuera.map((f) => f.mov)).toFixed(1)} pts`);
  console.log(`    tasa de acierto (P&L>0): opera ${pct(dentro.filter((f) => f.pl > 0).length / dentro.length)} · salta ${pct(fuera.filter((f) => f.pl > 0).length / fuera.length)}`);
}

// ═══ 12 · EN DINERO DE VERDAD ══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("12 · EN DINERO — 2 contratos ($5.000 de colateral cada cóndor, efectivo libre $7.977)");
console.log("═".repeat(104));
console.log("\n| serie | $/año ×2 | peor día ×2 | peor racha ×2 | días/año |");
console.log("|---|---|---|---|---|");
for (const [n, r] of [["base", BASE], ["A", RA], ["B", RB]])
  console.log(`| ${n} | ${eur(r.ano * 2)} | ${eur(r.peor * 2)} | ${eur(r.dd * 2)} | ${(r.n / ANOS).toFixed(0)} |`);

// ═══ 13 · MITADES ══════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("13 · MITADES Y TERCIOS DEL PERÍODO");
console.log("═".repeat(104));
console.log("\n| tramo | días | base $/año | B $/año | base racha | B racha | base P(>-2k) | B P(>-2k) | mejora racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [nom, ini, fin] of [["1ª mitad", 0, Math.floor(N / 2)], ["2ª mitad", Math.floor(N / 2), N],
  ["tercio 1", 0, Math.floor(N / 3)], ["tercio 2", Math.floor(N / 3), Math.floor(2 * N / 3)], ["tercio 3", Math.floor(2 * N / 3), N]]) {
  const g = filas.slice(ini, fin), an = g.length / 252;
  const b = res(g, an), r = res(g.filter(B), an);
  console.log(`| ${nom} (${g[0].fecha}…${g[g.length - 1].fecha}) | ${g.length} | ${eur(b.ano)} | ${eur(r.ano)} | ${eur(b.dd)} | ${eur(r.dd)} | ${pct(b.pMalo)} | ${pct(r.pMalo)} | ${eur(Math.abs(b.dd) - Math.abs(r.dd))} |`);
}
