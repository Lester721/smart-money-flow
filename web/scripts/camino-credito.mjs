// CAMINO · PASO 8 — lo que los diez peores días tienen en común y SE VE A LAS 11:00.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-credito.mjs
//
// De la lista de los diez peores días salta algo a la vista: el crédito. Los peores cobraron
// $0,60 · $1,00 · $2,40 · $3,35 · $3,95 — y se comieron entre $4.200 y $4.940. Los diez MEJORES
// son justo los días de pánico (7 abr 2025, 5 ago 2024), donde el crédito era enorme. O sea que
// el día que más duele no es el día del desplome: es el día tranquilo de precio que se mueve un
// 1,5% sin avisar. Y el crédito se conoce A LAS 11:00, antes de firmar nada.
//
// Ya se midieron 17 filtros de régimen y ninguno pasó — VIX incluido, con un porqué conocido: "el
// crédito compensa el riesgo extra". Pero eso se midió en el centro de la distribución. Aquí se
// mira el EXTREMO BAJO, que es donde la compensación no puede existir: si cobras $60 y arriesgas
// $4.940, no hay prima que compense nada. Se mide, se cruza, y se dice lo que salga.
//
// El umbral se elige mirando SÓLO un período y se aplica tal cual al otro. Y al revés.

import { radiografia } from "../lib/radiografia";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { cargar, media, pct, eur, peorRacha, periodo, P1, P2, EFECTIVO } from "./camino-lib.mjs";

const dias = cargar();
for (const d of dias) { d.credD = d.cred * 100; d.riesgoPremio = (50 - d.cred) / d.cred; }
radiografia(dias, ["pl", "credD", "riesgoPremio", "ivEntrada"], "crédito a las 11:00");

const metricas = (p) => ({
  n: p.length, total: p.reduce((a, x) => a + x, 0), anual: p.length ? (p.reduce((a, x) => a + x, 0) / p.length) * 252 : 0,
  p1: pct(p, 0.01), p5: pct(p, 0.05), peor: p.length ? Math.min(...p) : 0, racha: peorRacha(p),
  gan: p.length ? p.filter((x) => x > 0).length / p.length : 0,
});

console.log(`\n═══ 1 · EL CRÉDITO DE LAS 11:00 CONTRA LO QUE PASA DESPUÉS (deciles) ═══\n`);
const ord = [...dias].sort((a, b) => a.credD - b.credD);
console.log("| decil de crédito | crédito | días | % ganados | media/día | peor día | p5 | riesgo/premio |");
console.log("|---|---|---|---|---|---|---|---|");
for (let k = 0; k < 10; k++) {
  const g = ord.slice(Math.floor((k * ord.length) / 10), Math.floor(((k + 1) * ord.length) / 10));
  const m = metricas(g.map((d) => d.pl));
  console.log(`| ${k + 1} | $${g[0].credD.toFixed(0)}–$${g[g.length - 1].credD.toFixed(0)} | ${g.length} | ${(m.gan * 100).toFixed(0)}% | ${eur(media(g.map((d) => d.pl)))} | ${eur(m.peor)} | ${eur(m.p5)} | ${media(g.map((d) => d.riesgoPremio)).toFixed(0)}:1 |`);
}

console.log(`\n\n═══ 2 · NO OPERAR SI EL CRÉDITO ES MENOR QUE X ═══\n`);
const UMB = [1, 2, 3, 4, 5, 6, 8];
const PRUEBAS = UMB.length * 2 * 2;   // umbrales × períodos × (filtro y su control invertido)
console.log(`  ${PRUEBAS} pruebas · listón de |t| = ${listonT(PRUEBAS)}\n`);
const grupo = { [P1]: dias.filter((d) => periodo(d.f) === P1), [P2]: dias.filter((d) => periodo(d.f) === P2), TODO: dias };
const base = Object.fromEntries(Object.entries(grupo).map(([k, v]) => [k, metricas(v.map((d) => d.pl))]));
console.log("| regla | días operados 22-23 | $/año 22-23 | peor día | racha | días 24-26 | $/año 24-26 | peor día | racha | $/año TODO |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(`| operar siempre (base) | ${base[P1].n} | ${eur(base[P1].anual)} | ${eur(base[P1].peor)} | ${eur(base[P1].racha)} | ${base[P2].n} | ${eur(base[P2].anual)} | ${eur(base[P2].peor)} | ${eur(base[P2].racha)} | ${eur(base.TODO.anual)} |`);
const res = {};
for (const U of UMB) {
  const f = (P) => metricas(grupo[P].filter((d) => d.cred >= U).map((d) => d.pl));
  const a = f(P1), b = f(P2), t = f("TODO");
  res[U] = { a, b, t };
  // $/año se calcula sobre los días del CALENDARIO, no sobre los operados: no operar es $0 ese día
  const anualCal = (m, P) => (m.total / grupo[P].length) * 252;
  console.log(`| sólo si el crédito ≥ $${U}.00 | ${a.n} | ${eur(anualCal(a, P1))} | ${eur(a.peor)} | ${eur(a.racha)} | ${b.n} | ${eur(anualCal(b, P2))} | ${eur(b.peor)} | ${eur(b.racha)} | ${eur(anualCal(t, "TODO"))} |`);
}
console.log(`\n  (el $/año cuenta los días que NO se operan como $0, que es lo que son)`);

console.log(`\n\n═══ 3 · EL CONTROL INVERTIDO — operar SÓLO los días de crédito bajo ═══\n`);
console.log("| regla | días 22-23 | $/año 22-23 | días 24-26 | $/año 24-26 | peor día TODO |");
console.log("|---|---|---|---|---|---|");
for (const U of UMB) {
  const f = (P) => metricas(grupo[P].filter((d) => d.cred < U).map((d) => d.pl));
  const a = f(P1), b = f(P2), t = f("TODO");
  const anualCal = (m, P) => (m.total / grupo[P].length) * 252;
  console.log(`| sólo si el crédito < $${U}.00 | ${a.n} | ${eur(anualCal(a, P1))} | ${b.n} | ${eur(anualCal(b, P2))} | ${eur(t.peor)} |`);
}

console.log(`\n\n═══ 4 · EL CRUCE DEL UMBRAL ═══\n`);
for (const [aj, pb] of [[P1, P2], [P2, P1]]) {
  const anualCal = (m, P) => (m.total / grupo[P].length) * 252;
  const mejor = UMB.reduce((x, y) => (anualCal(res[x][aj === P1 ? "a" : "b"], aj) >= anualCal(res[y][aj === P1 ? "a" : "b"], aj) ? x : y));
  const mAj = res[mejor][aj === P1 ? "a" : "b"], mPb = res[mejor][pb === P1 ? "a" : "b"];
  console.log(`  elegido en ${aj} → crédito ≥ $${mejor}.00`);
  console.log(`     ${aj} (ajuste): ${eur(anualCal(mAj, aj))}/año · ${mAj.n} días · peor ${eur(mAj.peor)} · racha ${eur(mAj.racha)}   [base ${eur(base[aj].anual)}/año]`);
  console.log(`     ${pb} (PRUEBA): ${eur(anualCal(mPb, pb))}/año · ${mPb.n} días · peor ${eur(mPb.peor)} · racha ${eur(mPb.racha)}   [base ${eur(base[pb].anual)}/año]`);
  const mejora = anualCal(mPb, pb) - base[pb].anual;
  console.log(`     fuera de muestra ${mejora > 0 ? "MEJORA" : "empeora"} el $/año en ${eur(Math.abs(mejora))} y ${Math.abs(mPb.racha) < Math.abs(base[pb].racha) ? "REDUCE" : "aumenta"} la racha en ${eur(Math.abs(Math.abs(base[pb].racha) - Math.abs(mPb.racha)))}\n`);
}

console.log(`\n═══ 5 · LOS TERCIOS DEL UMBRAL QUE SOBREVIVA ═══\n`);
const n = dias.length;
const terc = [0, 1, 2].map((t) => dias.filter((_, i) => (i < n / 3 ? 0 : i < (2 * n) / 3 ? 1 : 2) === t));
console.log("| umbral | tercio 1 | tercio 2 | tercio 3 | ¿los tres a favor? |");
console.log("|---|---|---|---|---|");
for (const U of UMB) {
  const v = terc.map((g) => {
    const con = metricas(g.filter((d) => d.cred >= U).map((d) => d.pl));
    const sin = metricas(g.map((d) => d.pl));
    return (con.total / g.length) * 252 - sin.anual;
  });
  console.log(`| ≥ $${U}.00 | ${v.map((x) => eur(x)).join(" | ")} | ${v.every((x) => x > 0) ? "SÍ" : "no"} |`);
}
console.log(`\n  (la cifra es la MEJORA en $/año respecto a operar todos los días de ese tercio)`);

console.log(`\n\n═══ 6 · Y EN LA CUENTA ═══\n`);
console.log("| estrategia | $/año 1 contrato | racha 22-26 | contratos que caben en $7.977 | $/año a ese tamaño |");
console.log("|---|---|---|---|---|");
const linea = (nom, filas) => {
  const m = metricas(filas.map((d) => d.pl));
  const anualCal = (m.total / dias.length) * 252;
  const c = Math.max(0, Math.min(Math.floor(EFECTIVO / Math.abs(m.racha)), 14));
  console.log(`| ${nom} | ${eur(anualCal)} | ${eur(m.racha)} | ${c} | ${c ? eur(anualCal * c) : "no cabe ni 1"} |`);
};
linea("operar siempre", dias);
for (const U of UMB) linea(`crédito ≥ $${U}.00`, dias.filter((d) => d.cred >= U));
const tCred = tWelch(dias.filter((d) => d.cred >= 4).map((d) => d.pl), dias.filter((d) => d.cred < 4).map((d) => d.pl));
console.log(`\n  t de Welch entre los días de crédito ≥ $4 y los de crédito < $4: ${tCred.toFixed(2)} (listón ${listonT(PRUEBAS)})`);
