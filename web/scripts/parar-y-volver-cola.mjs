// ¿HAY ALGO OBSERVABLE A LAS 11:00 QUE CONCENTRE LOS DÍAS DE PÉRDIDA MÁXIMA?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/parar-y-volver-cola.mjs
//
// Los 17 filtros de régimen se midieron contra la MEDIA (tercio alto contra bajo). Esto es otra
// pregunta: no "¿gana más?" sino "¿CAEN AHÍ los días que arruinan el año?". Es un problema de
// CLASIFICACIÓN, no de medias — una señal puede no mover un dólar la media y aun así concentrar
// los 4 días que hacen la peor racha.
//
// Se mide cada señal observable a las 11:00 por DECILES: ¿cuántos días de pérdida grande caen en
// el decil alto y en el bajo, contra la tasa base? Prueba binomial de una cola, y el listón sube
// por Bonferroni contando TODAS las pruebas hechas hoy sobre estos 653 días (40 de parada + las
// de aquí). Bajarlo porque son "otra familia" sería manosear el experimento.

import { writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, media, pct, eur } from "./anatomia3-lib.mjs";

const { filas } = cargar();
const N = filas.length;
const PRUEBAS_PARADA = 40;

// Las señales: TODO lo de anatomia3-lib que se observa a las 11:00 o antes. Nada con prefijo `z`.
const SENALES = [
  ["movManana", "% de la apertura a las 11:00 (con signo)"], ["movMananaAbs", "lo mismo en valor absoluto"],
  ["rangoManana", "% de rango de la mañana"], ["rangoMananaPts", "rango de la mañana en PUNTOS"],
  ["posRango", "dónde cierra las 11:00 dentro del rango"], ["extremo", "qué tan al borde del rango"],
  ["recorrido", "% de camino recorrido"], ["recorridoPts", "camino recorrido en puntos"],
  ["eficiencia", "neto / camino (1 = línea recta)"], ["zigzag", "nº de giros de la mañana"],
  ["rvManana", "volatilidad realizada de la mañana"], ["acel", "% movido entre 10:30 y 11:00"],
  ["ivAtm11", "IV del dinero a las 11:00"], ["ivCambio", "% que cambió la IV en la mañana"],
  ["sigmaRatio", "cuántas σ son los ±25 puntos"], ["rvIv", "realizada de la mañana / implícita"],
  ["hueco", "% de hueco de apertura"], ["huecoAbs", "hueco en valor absoluto"],
  ["rangoAyerReal", "% de rango de AYER"], ["rvAyer", "volatilidad realizada de AYER"],
  ["tardeAyerPts", "puntos que se movió AYER de 11:00 al cierre"], ["retAyer", "% que hizo AYER"],
  ["vix", "VIX al cierre de AYER"], ["vixCambio", "% que cambió el VIX AYER"],
  ["term9", "VIX9D / VIX de ayer"], ["term3m", "VIX / VIX3M de ayer"],
  ["vvix", "VVIX al cierre de AYER"], ["vvixVix", "VVIX / VIX de ayer"],
  ["ivVsVix", "IV del dinero / VIX de ayer"], ["nivel", "nivel del índice a las 11:00"],
  ["sepPct", "qué % del índice son los 25 puntos"], ["credito", "crédito cobrado (se sabe al entrar)"],
  ["sigma", "movimiento esperado del resto de sesión"],
];
const BINARIAS = [["opex", "vencimiento mensual"], ["empleo", "informe de empleo"], ["finMes", "último día del mes"],
                  ["vispera", "víspera del fin de mes"], ["primeroMes", "primer día del mes"]];

const PRUEBAS = PRUEBAS_PARADA + SENALES.length * 2 + BINARIAS.length;   // dos colas por señal continua
const LISTON = listonT(PRUEBAS);

radiografia(filas, ["pl", "movMananaAbs", "rangoMananaPts", "ivAtm11", "vix", "credito", "sigma"], "señales de las 11:00", { maxCeros: 0.3 });

// EL BLANCO: día de pérdida grande. Dos definiciones, para que no dependa de dónde se pone la raya.
const BLANCOS = [["pérdida > $3.000", (f) => f.pl < -3000], ["pérdida > $2.000", (f) => f.pl < -2000]];

console.log(`\n${"═".repeat(112)}`);
console.log(`  ¿ALGO CONCENTRA LOS DÍAS MALOS? · ${N} días · listón |z| = ${LISTON} (Bonferroni sobre ${PRUEBAS} pruebas)`);
console.log(`  ${PRUEBAS_PARADA} de las reglas de parada + ${SENALES.length * 2} colas de deciles + ${BINARIAS.length} binarias`);
console.log(`${"═".repeat(112)}`);

const todo = [];
for (const [nomB, esMalo] of BLANCOS) {
  const malos = filas.filter(esMalo).length;
  const p0 = malos / N;
  console.log(`\n## BLANCO: ${nomB} — ${malos} días de ${N} (tasa base ${(p0 * 100).toFixed(1)}%)\n`);
  console.log("| señal | decil BAJO: malos / 65 | tasa | z | decil ALTO: malos / 65 | tasa | z |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [campo, desc] of SENALES) {
    const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
    if (val.length < 400) { console.log(`| \`${campo}\` | — sólo ${val.length} días con dato — | | | | | |`); continue; }
    const ord = [...val].sort((a, b) => a[campo] - b[campo]);
    const k = Math.floor(ord.length / 10);
    const bajo = ord.slice(0, k), alto = ord.slice(-k);
    const z = (g) => { const o = g.filter(esMalo).length, e = g.length * p0; return { o, tasa: o / g.length, z: (o - e) / Math.sqrt(e * (1 - p0)) }; };
    const zb = z(bajo), za = z(alto);
    todo.push({ blanco: nomB, campo, desc, lado: "bajo", ...zb }, { blanco: nomB, campo, desc, lado: "alto", ...za });
    console.log(`| \`${campo}\` | ${zb.o} / ${k} | ${(zb.tasa * 100).toFixed(1)}% | ${zb.z.toFixed(2)} | ${za.o} / ${k} | ${(za.tasa * 100).toFixed(1)}% | ${za.z.toFixed(2)} |`);
  }
  console.log("\n  binarias:\n");
  console.log("| señal | días marcados | malos | tasa | tasa resto | z |");
  console.log("|---|---|---|---|---|---|");
  for (const [campo, desc] of BINARIAS) {
    const si = filas.filter((f) => f[campo] === 1);
    if (si.length < 10) { console.log(`| \`${campo}\` | ${si.length} | — muestra corta — | | | |`); continue; }
    const o = si.filter(esMalo).length, e = si.length * p0;
    const zz = (o - e) / Math.sqrt(e * (1 - p0));
    const resto = filas.filter((f) => f[campo] !== 1);
    todo.push({ blanco: nomB, campo, desc, lado: "marcado", o, tasa: o / si.length, z: zz });
    console.log(`| \`${campo}\` | ${si.length} | ${o} | ${(o / si.length * 100).toFixed(1)}% | ${(resto.filter(esMalo).length / resto.length * 100).toFixed(1)}% | ${zz.toFixed(2)} |`);
  }
}

// ── VEREDICTO Y LA ESPECIFICACIÓN DE LO QUE HARÍA FALTA ──────────────────────────────────────
const pasan = todo.filter((x) => x.z >= LISTON);
const mejor = [...todo].sort((a, b) => b.z - a.z)[0];
console.log(`\n${"═".repeat(112)}`);
console.log(`  VEREDICTO: ${pasan.length} de ${todo.length} colas de decil pasan el listón de |z| = ${LISTON}`);
console.log(`${"═".repeat(112)}\n`);
if (!pasan.length) {
  console.log(`  Ninguna. La más alta: \`${mejor.campo}\` decil ${mejor.lado} (${mejor.desc})`);
  console.log(`     ${mejor.o} días malos de 65 · tasa ${(mejor.tasa * 100).toFixed(1)}% · z = ${mejor.z.toFixed(2)} contra un listón de ${LISTON}\n`);
} else {
  for (const p of pasan) console.log(`  🟢 ${p.campo} decil ${p.lado} (${p.desc}) · ${p.o}/65 · z=${p.z.toFixed(2)} · blanco ${p.blanco}`);
}

// LA ESPECIFICACIÓN: qué precisión necesitaría una regla de parada para valer la pena.
console.log(`${"─".repeat(112)}`);
console.log("  QUÉ LE FALTARÍA A UNA REGLA DE PARADA PARA SERVIR — la especificación, en números\n");
const pls = filas.map((f) => f.pl).sort((a, b) => a - b);
const grandes = filas.filter((f) => f.pl < -3000);
const totalGrandes = grandes.reduce((a, f) => a + f.pl, 0);
const ANOS = N / 252;
console.log(`  · Los ${grandes.length} días peores de $3.000 suman ${eur(totalGrandes)}: el ${(Math.abs(totalGrandes) / 48638 * 100).toFixed(0)}% del beneficio bruto del período.`);
console.log(`  · Un día normal de los otros ${N - grandes.length} deja ${eur(media(filas.filter((f) => f.pl >= -3000).map((f) => f.pl)))}.`);
console.log("");
console.log("  Para conservar el 90% del ingreso ($16.893/año) y quitar $5.000 de peor racha, una regla");
console.log("  tiene que parar días cuyo P&L sumado sea NEGATIVO. Con la tasa base y el valor de un día bueno:");
console.log("");
console.log("| si la regla para… | acierta X de los días malos | falsos positivos que puede permitirse | precisión mínima |");
console.log("|---|---|---|---|");
const buenoMedio = media(filas.filter((f) => f.pl >= -3000).map((f) => f.pl));
const maloMedio = media(grandes.map((f) => f.pl));
for (const cazados of [2, 3, 4, 6]) {
  // cuántos días buenos puede tirar antes de que la parada empiece a costar ingreso
  const falsos = Math.floor((cazados * Math.abs(maloMedio)) / buenoMedio);
  console.log(`| ${cazados} días malos | ${cazados} de ${grandes.length} | ${falsos} | ${(cazados / (cazados + falsos) * 100).toFixed(1)}% |`);
}
console.log(`\n  (un día malo medio vale ${eur(maloMedio)}; un día normal medio, ${eur(buenoMedio)} — hacen falta`);
console.log(`   ${(Math.abs(maloMedio) / buenoMedio).toFixed(1)} días buenos tirados para borrar lo que ahorra un solo día malo esquivado)`);
console.log(`\n  El mejor decil medido hoy acierta ${mejor.o} de 65 → precisión ${(mejor.tasa * 100).toFixed(1)}%.`);
console.log(`  Hace falta ${(1 / (1 + Math.abs(maloMedio) / buenoMedio) * 100).toFixed(1)}% como mínimo. La distancia es el trabajo que queda.`);

writeFileSync("scripts/parar-y-volver-cola.json", JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, mejor, todo }, null, 2), "utf8");
console.log("\n  detalle en scripts/parar-y-volver-cola.json");
