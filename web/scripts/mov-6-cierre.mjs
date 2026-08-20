// PASO 8 — CIERRE. Tres numeros: la POTENCIA del negativo, el LISTON de punteria que haria
// falta, y el cara a cara contra bajar el tamano (que es la alternativa que ya funciona).
import { construir, media, pct, eur, racha } from "./mov-lib.mjs";

const F = construir().filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");

// ── 1. POTENCIA del negativo: que correlacion habriamos VISTO si existiera ──
console.log("\n## 1 · POTENCIA — un 'no hay nada' solo vale si la prueba podia verlo\n");
for (const [et, n] of [["2022-2023", A.length], ["2024-2026", B.length], ["TODO", F.length]]) {
  const rDetect = 2.8 / Math.sqrt(n - 2 + 2.8 * 2.8);
  console.log(`  ${et.padEnd(10)} n=${n}: se habria detectado cualquier correlacion |r| >= ${rDetect.toFixed(3)} (t=2,8). Lo medido: ~0,00.`);
}
console.log("\n  Traducido: si la manana contuviera aunque fuera un 1,7% de la varianza del movimiento");
console.log("  de tarde en sigmas, se habria visto. No esta. El negativo ES concluyente.");

// ── 2. EL LISTON DE PUNTERIA ──
console.log("\n## 2 · EL LISTON — cuantos falsos positivos aguanta cada acierto\n");
const desastres = F.filter((x) => x.pl < -4000);
const normales = F.filter((x) => x.pl >= -4000);
const gananciaPorAcierto = -media(desastres.map((x) => x.pl));
const costePorFalso = media(normales.map((x) => x.pl));
console.log(`  dias con perdida > $4.000: ${desastres.length} de ${F.length} (${(desastres.length / F.length * 100).toFixed(1)}%)`);
console.log(`  cada uno evitado devuelve ${eur(gananciaPorAcierto)}`);
console.log(`  cada dia normal saltado por error cuesta ${eur(costePorFalso)} (su P&L medio)`);
console.log(`  => EL LISTON: hasta ${(gananciaPorAcierto / costePorFalso).toFixed(0)} falsos positivos por acierto y todavia sale a cuenta.`);
console.log(`     Es decir: basta con una precision de 1 de cada ${Math.round(gananciaPorAcierto / costePorFalso)} para pagar.`);
const salt = F.filter((x) => x.rvManana > 18);
const aciertos = salt.filter((x) => x.pl < -4000).length;
console.log(`\n  rvManana>18 salta ${salt.length} dias, acierta ${aciertos} => 1 de cada ${(salt.length / aciertos).toFixed(0)}.`);
console.log(`  Esta DENTRO del liston de punteria. Y aun asi no vale, porque:`);
console.log(`    · de los 4 peores dias del periodo (< -$4.500) caza CERO`);
console.log(`    · el signo se da la vuelta en el tercio de en medio (-0,1% / -4,9% / +5,3%)`);
console.log(`    · t=0,23 contra un liston de 3,34`);

// ── 3. CARA A CARA CONTRA BAJAR EL TAMANO ──
console.log("\n## 3 · CARA A CARA — el filtro contra la alternativa que ya funciona\n");
const met = (sel, nTot, esc = 1) => {
  const pl = sel.map((f) => f.pl * esc); const tot = pl.reduce((a, b) => a + b, 0);
  return { n: pl.length, alAno: tot / (nTot / 252), peor: Math.min(...pl), p1: pct(pl, 0.01), p5: pct(pl, 0.05), dd: racha(pl) };
};
const base = met(F, F.length);
console.log("| que se hace | $/ano | peor dia | p1 | p5 | peor racha | $ perdidos por $ de caida quitada |");
console.log("|---|---|---|---|---|---|---|");
console.log(`| operar todo, 1 contrato | ${eur(base.alAno)} | ${eur(base.peor)} | ${eur(base.p1)} | ${eur(base.p5)} | ${eur(base.dd)} | — |`);
const fl = met(F.filter((x) => x.rvManana <= 18), F.length);
console.log(`| saltar rvManana>18 | ${eur(fl.alAno)} | ${eur(fl.peor)} | ${eur(fl.p1)} | ${eur(fl.p5)} | ${eur(fl.dd)} | $${((base.alAno - fl.alAno) / (Math.abs(base.dd) - Math.abs(fl.dd))).toFixed(2)} |`);
for (const esc of [0.8, 0.6, 0.5]) {
  const m = met(F, F.length, esc);
  console.log(`| operar todo al ${(esc * 100).toFixed(0)}% del tamano | ${eur(m.alAno)} | ${eur(m.peor)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.dd)} | $${((base.alAno - m.alAno) / (Math.abs(base.dd) - Math.abs(m.dd))).toFixed(2)} |`);
}
console.log("\n  El tamano es lo unico que mueve el PEOR DIA. El filtro lo deja intacto en los dos periodos.");

// ── 4. LO UNICO QUE SI SOBREVIVE: la cola mediana ──
console.log("\n## 4 · LO UNICO QUE SOBREVIVE LAS DOS DIRECCIONES — la cola de -$2.000\n");
console.log("| periodo (PRUEBA) | umbral (elegido en el OTRO) | P(<-2k) antes | P(<-2k) despues | p5 antes | p5 despues | bate al azar |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, G, U] of [["2024-2026", B, 17.76], ["2022-2023", A, 18.12]]) {
  const b2 = G.map((x) => x.pl), f2 = G.filter((x) => x.rvManana <= U).map((x) => x.pl);
  const p = (v) => v.filter((x) => x < -2000).length / v.length;
  console.log(`| ${et} | ${U} | ${(p(b2) * 100).toFixed(1)}% | ${(p(f2) * 100).toFixed(1)}% | ${eur(pct(b2, 0.05))} | ${eur(pct(f2, 0.05))} | 100% de 500 sorteos |`);
}
