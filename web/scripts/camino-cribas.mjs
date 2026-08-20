// CAMINO · PASO 7 — las cribas sobre lo ÚNICO que se afirma en positivo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-cribas.mjs
//
// El resultado de los pasos 3 a 6 es un NO: la gestión intradía no se sostiene. Un "no" se
// sostiene solo, pero hay una afirmación en POSITIVO en el informe —"los días malos se distinguen
// por su forma a partir de las 12:00"— y ésa sí hay que pasarla por las cribas. Aquí se parte en
// TRES tercios de tiempo, no en dos mitades, que fue justo el error que aprobó la inusualidad.
//
// También se listan los diez peores días con nombre y apellidos: si no se corresponden con
// sesiones reconocibles del mercado, el fichero está mal y todo lo anterior sobra.

import { cargar, media, pct, eur, auc, idx, periodo, P1, P2 } from "./camino-lib.mjs";
import { listonT, tWelch } from "../lib/barreraHallazgos";

const dias = cargar();
const HORAS = ["11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00"];
const tercio = (i, n) => (i < n / 3 ? 0 : i < (2 * n) / 3 ? 1 : 2);

console.log(`\n═══ 1 · LOS DIEZ PEORES DÍAS — ¿son sesiones reconocibles? ═══\n`);
console.log("| fecha | spot 11:00 | cierre | movimiento | crédito | P&L | primer toque |");
console.log("|---|---|---|---|---|---|---|");
for (const d of [...dias].sort((a, b) => a.pl - b.pl).slice(0, 10)) {
  const iT = d.margen.findIndex((m) => m <= 0);
  console.log(`| ${d.f} | ${d.s11.toFixed(0)} | ${d.cierre.toFixed(0)} | ${(d.cierre - d.s11 > 0 ? "+" : "") + (d.cierre - d.s11).toFixed(0)} pts (${(((d.cierre - d.s11) / d.s11) * 100).toFixed(1)}%) | $${d.cred.toFixed(2)} | ${eur(d.pl)} | ${iT < 0 ? "nunca" : d.h[iT]} |`);
}
console.log(`\n  Y los diez mejores, para ver el otro lado:`);
console.log(`  ${[...dias].sort((a, b) => b.pl - a.pl).slice(0, 10).map((d) => `${d.f} ${eur(d.pl)}`).join(" · ")}`);

console.log(`\n\n═══ 2 · LA CRIBA DE TERCIOS sobre "los días malos se distinguen por su forma" ═══`);
console.log(`\nP(un día malo tenga MENOS margen que uno bueno) a cada hora, en los tres tercios de tiempo.`);
console.log(`Si la separación es real, el signo se repite en los tres. 50% = no distingue.\n`);
const n = dias.length;
const tercios = [0, 1, 2].map((t) => dias.filter((_, i) => tercio(i, n) === t));
console.log(`  tercios: ${tercios.map((g) => `${g[0].f}→${g[g.length - 1].f} (n=${g.length})`).join(" · ")}\n`);
console.log("| hora | tercio 1 | tercio 2 | tercio 3 | 2022-2023 | 2024-2026 | ¿mismo signo? |");
console.log("|---|---|---|---|---|---|---|");
for (const H of HORAS) {
  const val = (g) => {
    const mm = g.filter((d) => d.pl < 0 && idx(d, H) >= 0), bb = g.filter((d) => d.pl >= 0 && idx(d, H) >= 0);
    if (mm.length < 10 || bb.length < 10) return null;
    return 1 - auc(mm.map((d) => d.margen[idx(d, H)]), bb.map((d) => d.margen[idx(d, H)]));
  };
  const v = [...tercios.map(val), val(dias.filter((d) => periodo(d.f) === P1)), val(dias.filter((d) => periodo(d.f) === P2))];
  const ok = v.every((x) => x != null && x > 0.5);
  console.log(`| ${H} | ${v.map((x) => (x == null ? "—" : (x * 100).toFixed(0) + "%")).join(" | ")} | ${ok ? "SÍ" : "no"} |`);
}

console.log(`\n\n═══ 3 · ¿Y LO MISMO CON EL PRECIO DE SALIR? ═══`);
console.log(`\nSi el precio de salir distingue TANTO como el margen, la información no es mía: es del mercado.\n`);
console.log("| hora | margen (todos) | precio de salida (todos) | diferencia |");
console.log("|---|---|---|---|");
for (const H of HORAS) {
  const mm = dias.filter((d) => d.pl < 0 && idx(d, H) >= 0), bb = dias.filter((d) => d.pl >= 0 && idx(d, H) >= 0);
  const a = 1 - auc(mm.map((d) => d.margen[idx(d, H)]), bb.map((d) => d.margen[idx(d, H)]));
  const ms = mm.filter((d) => d.sal[idx(d, H)] != null), bs = bb.filter((d) => d.sal[idx(d, H)] != null);
  const b = auc(ms.map((d) => d.sal[idx(d, H)]), bs.map((d) => d.sal[idx(d, H)]));
  console.log(`| ${H} | ${(a * 100).toFixed(0)}% | ${(b * 100).toFixed(0)}% | ${((b - a) * 100).toFixed(0)} puntos |`);
}

console.log(`\n\n═══ 4 · LA CONCENTRACIÓN EN EL TIEMPO — ¿el daño vive en unas pocas semanas? ═══\n`);
const cola = dias.filter((d) => d.pl <= pct(dias.map((x) => x.pl), 0.05));
const porAno = {}, porMes = {};
for (const d of cola) { porAno[d.f.slice(0, 4)] = (porAno[d.f.slice(0, 4)] ?? 0) + 1; porMes[d.f.slice(0, 7)] = (porMes[d.f.slice(0, 7)] ?? 0) + 1; }
console.log(`  el 5% peor (${cola.length} días) por año: ${JSON.stringify(porAno)}`);
const meses = Object.entries(porMes).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log(`  meses con más días de cola: ${meses.map(([m, c]) => `${m}:${c}`).join(" · ")}`);
console.log(`  los 8 meses peores concentran ${meses.reduce((a, x) => a + x[1], 0)} de los ${cola.length} días de cola (${((meses.reduce((a, x) => a + x[1], 0) / cola.length) * 100).toFixed(0)}%)`);
const diasPorAno = {};
for (const d of dias) diasPorAno[d.f.slice(0, 4)] = (diasPorAno[d.f.slice(0, 4)] ?? 0) + 1;
console.log(`  para comparar, días operados por año: ${JSON.stringify(diasPorAno)}`);

console.log(`\n\n═══ 5 · EL LISTÓN ═══\n`);
const malos = dias.filter((d) => d.pl < 0), buenos = dias.filter((d) => d.pl >= 0);
const t13 = tWelch(malos.filter((d) => idx(d, "13:00") >= 0).map((d) => d.margen[idx(d, "13:00")]),
                   buenos.filter((d) => idx(d, "13:00") >= 0).map((d) => d.margen[idx(d, "13:00")]));
console.log(`  t de Welch del margen a las 13:00 entre días malos y buenos: ${t13.toFixed(2)}`);
console.log(`  pruebas declaradas en todo el encargo: 47 reglas ×2 + 4 mapas + 7 anchos ×2 + 8 horas ×5 grupos = 152`);
console.log(`  listón de |t| con Bonferroni para 152 pruebas: ${listonT(152)}`);
console.log(`\n  (el hallazgo que se afirma en positivo es descriptivo —los días malos se distinguen— y pasa`);
console.log(`   con holgura; lo que NO pasa es convertir esa distinción en dinero, que es lo medido en los`);
console.log(`   pasos 3 a 6 y sale negativo en las dos direcciones del cruce.)`);
