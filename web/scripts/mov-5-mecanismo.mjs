// PASO 7 — EL MECANISMO. Por que ningun filtro de movimiento matinal funciona.
//
// La hipotesis: el mercado de opciones YA HA LEIDO la mañana. A las 11:00 el straddle del dinero
// cotiza el movimiento que queda. Si eso es cierto, el movimiento de la mañana predice el de la
// tarde EN PUNTOS (los dias picados tienen tardes grandes) pero NO EN SIGMAS (una vez dividido
// por lo que el mercado cobra por ese movimiento, no queda nada).
//
// Es una prediccion falsable y decide todo el encargo: si la mañana esta totalmente en el precio,
// ningun umbral sobre la mañana puede recortar la cola sin pagar el precio completo.
import { listonT, pasarBarrera, informe } from "../lib/barreraHallazgos";
import { construir, media, pct, eur, racha, tWelch } from "./mov-lib.mjs";

const F = construir().filter((f) => f.huecoSig != null && f.rangoAnteSig != null && f.vel30Sig != null && f.rvIv != null);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
const corr = (x, y) => {
  const mx = media(x), my = media(y); let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); dx += (x[i] - mx) ** 2; dy += (y[i] - my) ** 2; }
  return n / Math.sqrt(dx * dy);
};
const tCorr = (r, n) => r * Math.sqrt((n - 2) / (1 - r * r));

// ── 1. EN PUNTOS SI, EN SIGMAS NO ──
const SENALES = ["movSig", "huecoSig", "rangoSig", "recorridoSig", "velMaxSig", "vel30Sig", "rvManana", "rvIv", "posRango", "eficiencia", "zigzag", "rangoAyerSig", "rangoAnteSig", "tardeAyerSig"];
console.log("\n## 1 · LA MAÑANA CONTRA LA TARDE — en PUNTOS y en SIGMAS\n");
console.log("   |tarde| en puntos = |cierre - spot 11:00|.  En sigmas = eso mismo / straddle del dinero a las 11:00.\n");
console.log("| senal de la manana | corr con |tarde| EN PUNTOS | t | corr con |tarde| EN SIGMAS | t | y con el P&L | t |");
console.log("|---|---|---|---|---|---|---|");
const tardePts = F.map((f) => Math.abs(f.zTardePts));
const tardeSig = F.map((f) => f.zTardeSig);
const pl = F.map((f) => f.pl);
for (const s of SENALES) {
  const v = F.map((f) => f[s]);
  const r1 = corr(v, tardePts), r2 = corr(v, tardeSig), r3 = corr(v, pl);
  console.log(`| ${s} | ${r1.toFixed(3)} | ${tCorr(r1, F.length).toFixed(2)} | ${r2.toFixed(3)} | ${tCorr(r2, F.length).toFixed(2)} | ${r3.toFixed(3)} | ${tCorr(r3, F.length).toFixed(2)} |`);
}
console.log(`\n  Y el propio precio, para comparar (esto NO es una senal de movimiento, es lo que cobra el mercado):`);
for (const [et, v] of [["straddle del dinero 11:00", F.map((f) => f.strad)], ["IV del dinero 11:00", F.map((f) => f.ivAtm)]]) {
  console.log(`    ${et.padEnd(28)} vs |tarde| EN PUNTOS: r=${corr(v, tardePts).toFixed(3)} (t=${tCorr(corr(v, tardePts), F.length).toFixed(1)})  ·  vs |tarde| EN SIGMAS: r=${corr(v, tardeSig).toFixed(3)} (t=${tCorr(corr(v, tardeSig), F.length).toFixed(1)})`);
}
console.log(`\n  Por periodo, la unica que importa (rvManana vs |tarde| en sigmas):`);
for (const [et, G] of [["2022-2023", A], ["2024-2026", B]]) {
  const r = corr(G.map((f) => f.rvManana), G.map((f) => f.zTardeSig));
  console.log(`    ${et}: r=${r.toFixed(3)} (t=${tCorr(r, G.length).toFixed(2)}, n=${G.length})`);
}

// ── 2. LA BARRERA OFICIAL sobre rvManana ──
console.log("\n\n## 2 · LA BARRERA — rvManana como criterio, cuatro cribas\n");
const filas = F.map((f) => ({ pnl: f.pl / 5000, ticker: "SPXW", fecha: f.fecha, rv: f.rvManana }));
console.log(informe(pasarBarrera(filas, (f) => -f.rv, { pruebas: 60, nMinimo: 200, maxPorTicker: 1.01 }), "no operar si la manana viene picada (rvManana alto)"));

// ── 3. LA MATRIZ: a quien caza y a quien no ──
console.log("\n\n## 3 · A QUIEN CAZA EL FILTRO rvManana > 18\n");
console.log("| corte de perdida | dias | cuantos caza el filtro | % cazado | dias saltados en total | precision |");
console.log("|---|---|---|---|---|---|");
const saltados = F.filter((x) => x.rvManana > 18);
for (const U of [-1000, -2000, -3000, -4000, -4500]) {
  const malos = F.filter((x) => x.pl < U);
  const cazados = malos.filter((x) => x.rvManana > 18);
  console.log(`| P&L < ${eur(U)} | ${malos.length} | ${cazados.length} | ${(cazados.length / malos.length * 100).toFixed(0)}% | ${saltados.length} | ${(cazados.length / saltados.length * 100).toFixed(1)}% |`);
}
console.log(`\n  Tasa base: los dias con P&L < -$4.000 son el ${(F.filter((x) => x.pl < -4000).length / F.length * 100).toFixed(1)}% de todos.`);
console.log(`  Entre los saltados son el ${(saltados.filter((x) => x.pl < -4000).length / saltados.length * 100).toFixed(1)}%. Ganancia de precision: x${((saltados.filter((x) => x.pl < -4000).length / saltados.length) / (F.filter((x) => x.pl < -4000).length / F.length)).toFixed(2)}`);
console.log(`  Y los saltados que eran GANADORES: ${saltados.filter((x) => x.pl > 0).length} de ${saltados.length} (${(saltados.filter((x) => x.pl > 0).length / saltados.length * 100).toFixed(0)}%), que sumaban ${eur(saltados.filter((x) => x.pl > 0).reduce((a, x) => a + x.pl, 0))}`);

// ── 4. QUE LE FALTARIA: cuanta punteria hace falta para capar el peor dia ──
console.log("\n\n## 4 · QUE LE FALTARIA — cuanta punteria hace falta\n");
const nMalos = F.filter((x) => x.pl < -4000).length;
const alAnoBase = F.reduce((a, x) => a + x.pl, 0) / (F.length / 252);
console.log(`  Hay ${nMalos} dias con perdida > $4.000 en ${F.length} (${(nMalos / F.length * 100).toFixed(1)}%). Suman ${eur(F.filter((x) => x.pl < -4000).reduce((a, x) => a + x.pl, 0))}.`);
console.log(`  El ingreso base es ${eur(alAnoBase)}/ano con 1 contrato.\n`);
console.log("| si el filtro cazara el X% de esos dias | falsos positivos por cada acierto | dias saltados | $ salvados/ano | $ perdidos/ano | neto |");
console.log("|---|---|---|---|---|---|");
const plMedio = media(F.map((x) => x.pl));
const dañoMalos = F.filter((x) => x.pl < -4000).reduce((a, x) => a + x.pl, 0);
for (const rec of [0.5, 0.8, 1.0]) {
  for (const fp of [3, 10, 20]) {
    const nSalta = Math.round(nMalos * rec * (1 + fp));
    const salvado = -dañoMalos * rec / (F.length / 252);
    const perdido = (nSalta - nMalos * rec) * plMedio / (F.length / 252);
    console.log(`| ${(rec * 100).toFixed(0)}% | ${fp} | ${nSalta} (${(nSalta / F.length * 100).toFixed(0)}%) | ${eur(salvado)} | ${eur(perdido)} | ${eur(salvado - perdido)} |`);
  }
}
console.log(`\n  El filtro rvManana>18, medido: caza el ${(F.filter((x) => x.pl < -4000 && x.rvManana > 18).length / nMalos * 100).toFixed(0)}% con ${((saltados.length - F.filter((x) => x.pl < -4000 && x.rvManana > 18).length) / Math.max(1, F.filter((x) => x.pl < -4000 && x.rvManana > 18).length)).toFixed(0)} falsos positivos por acierto.`);
