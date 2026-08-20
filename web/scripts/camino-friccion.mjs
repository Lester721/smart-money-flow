// CAMINO · PASO 6 — ¿por qué no se puede frenar? EL PEAJE DE SALIR.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/camino-friccion.mjs
//
// El paso 4 dejó un resultado seco: en 29 de 30 estados salir deja MENOS dinero que aguantar.
// Hay dos explicaciones posibles y llevan a sitios opuestos:
//   (a) el mercado tiene razón — el precio de la opción ya sabe lo que yo creo saber. Entonces no
//       hay nada que arreglar y la conclusión es definitiva.
//   (b) es el peaje — el precio JUSTO diría que salir compensa, pero cruzar la horquilla se come
//       la ventaja. Entonces sí hay algo que arreglar: ejecutar mejor.
//
// Se separan restando. El punto medio de cada pata NO es un precio operable y NO aparece en
// ninguna cifra que Lester pueda usar; aquí sirve sólo de referencia teórica para medir el peaje.

import { radiografia } from "../lib/radiografia";
import { cargar, media, pct, eur, PATAS, COMM } from "./camino-lib.mjs";

const dias = cargar();
const ULTIMA = "15:45";
for (const d of dias) {
  d.iFin = d.h.indexOf(ULTIMA);
  d.mC = d.sp.map((s) => d.KC - s);
  d.mP = d.sp.map((s) => s - d.KP);
}

const HOR = [["11:00-11:55", "11:00", "12:00"], ["12:00-12:55", "12:00", "13:00"], ["13:00-13:55", "13:00", "14:00"], ["14:00-14:55", "14:00", "15:00"], ["15:00-15:45", "15:00", "15:50"]];
const MAR = [["más de 15", 15, 999], ["10 a 15", 10, 15], ["5 a 10", 5, 10], ["0 a 5", 0, 5], ["−10 a 0", -10, 0], ["roto >10", -999, -10]];
const cubHora = (h) => HOR.findIndex(([, a, b]) => h >= a && h < b);
const cubMar = (m) => MAR.findIndex(([, a, b]) => m >= a && m < b);

// ── el peaje, marca a marca ──
const marcas = [];
for (const d of dias) {
  for (let i = 0; i <= d.iFin; i++) {
    if (d.sal[i] == null || d.salMid[i] == null) continue;
    const ih = cubHora(d.h[i]), im = cubMar(Math.min(d.mC[i], d.mP[i]));
    if (ih < 0 || im < 0) continue;
    marcas.push({
      fecha: d.f, ticker: "SPXW", ih, im,
      aguantar: d.pl,
      salirReal: (d.cred - d.sal[i]) * 100 - PATAS * COMM,
      salirMedio: (d.cred - d.salMid[i]) * 100 - PATAS * COMM,
      peaje: (d.sal[i] - d.salMid[i]) * 100,
      pnl: d.pl,
    });
  }
}
radiografia(marcas, ["aguantar", "salirReal", "salirMedio", "peaje"], "marcas con precio de salida");

console.log(`\n═══ 1 · CUÁNTO CUESTA CRUZAR LA HORQUILLA AL SALIR (${marcas.length.toLocaleString("es-ES")} marcas) ═══\n`);
console.log(`  peaje de salir del cóndor entero: mediana ${eur(pct(marcas.map((m) => m.peaje), 0.5))} · media ${eur(media(marcas.map((m) => m.peaje)))} · p90 ${eur(pct(marcas.map((m) => m.peaje), 0.9))}`);
const credMedio = media(dias.map((d) => d.cred)) * 100;
console.log(`  crédito medio cobrado a las 11:00: ${eur(credMedio)} → el peaje de UNA salida es el ${((media(marcas.map((m) => m.peaje)) / credMedio) * 100).toFixed(0)}% del crédito del día\n`);
console.log("| margen \\ hora | " + HOR.map((x) => x[0]).join(" | ") + " |");
console.log("|---|" + HOR.map(() => "---").join("|") + "|");
for (let im = 0; im < MAR.length; im++) {
  const cols = HOR.map((_, ih) => {
    const c = marcas.filter((m) => m.ih === ih && m.im === im);
    return c.length < 20 ? "—" : `${eur(media(c.map((m) => m.peaje)))}`;
  });
  console.log(`| ${MAR[im][0]} | ${cols.join(" | ")} |`);
}

console.log(`\n\n═══ 2 · EL MAPA CON PRECIO REAL Y CON PRECIO MEDIO ═══`);
console.log(`\nDiferencia "salir − aguantar". Positivo = salir deja más. La columna de la izquierda de`);
console.log(`cada casilla es con PRECIO REAL (lo operable); la de la derecha, al punto medio`);
console.log(`(CONTRAFACTUAL, no operable).\n`);
console.log("| margen \\ hora | " + HOR.map((x) => x[0]).join(" | ") + " |");
console.log("|---|" + HOR.map(() => "---").join("|") + "|");
let ganaReal = 0, ganaMedio = 0, celdas = 0;
for (let im = 0; im < MAR.length; im++) {
  const cols = HOR.map((_, ih) => {
    const c = marcas.filter((m) => m.ih === ih && m.im === im);
    if (c.length < 20) return "—";
    const dR = media(c.map((m) => m.salirReal - m.aguantar));
    const dM = media(c.map((m) => m.salirMedio - m.aguantar));
    celdas++;
    if (dR > 0) ganaReal++;
    if (dM > 0) ganaMedio++;
    return `${dR > 0 ? "+" : ""}${eur(dR)} / ${dM > 0 ? "+" : ""}${eur(dM)}`;
  });
  console.log(`| ${MAR[im][0]} | ${cols.join(" | ")} |`);
}
console.log(`\n  Con precio real, salir gana en ${ganaReal} de ${celdas} casillas.`);
console.log(`  Al punto medio (no operable), salir ganaría en ${ganaMedio} de ${celdas}.`);
console.log(`  → ${ganaMedio > ganaReal ? `el peaje da la vuelta a ${ganaMedio - ganaReal} casillas` : "el peaje no cambia el veredicto de ninguna casilla"}.`);

console.log(`\n\n═══ 3 · EL VEREDICTO EN UNA LÍNEA ═══\n`);
const dR = media(marcas.map((m) => m.salirReal - m.aguantar));
const dM = media(marcas.map((m) => m.salirMedio - m.aguantar));
console.log(`  Salir en una marca cualquiera, promediando todas: ${eur(dR)} con precio real, ${eur(dM)} al punto medio.`);
console.log(`  Del hueco de ${eur(dM - dR)} que hay entre las dos, TODO es horquilla.`);
console.log(`  Si el hueco al punto medio también es negativo, el mercado tiene razón y no hay nada que ejecutar mejor.`);

// ── ¿y en la cola? ──
const enCola = marcas.filter((m) => m.im >= 4);    // margen negativo: el día ya está roto
console.log(`\n  Sólo en los estados ya rotos (margen negativo, ${enCola.length.toLocaleString("es-ES")} marcas):`);
console.log(`    salir − aguantar = ${eur(media(enCola.map((m) => m.salirReal - m.aguantar)))} real · ${eur(media(enCola.map((m) => m.salirMedio - m.aguantar)))} al medio · peaje ${eur(media(enCola.map((m) => m.peaje)))}`);

// ── el peaje de la ENTRADA, para comparar ──
console.log(`\n\n═══ 4 · PARA COMPARAR: EL PEAJE DE LA ENTRADA ═══\n`);
const dEnt = dias.filter((d) => d.salMid[0] != null);
console.log(`  crédito real cobrado a las 11:00 (bid−ask): ${eur(media(dEnt.map((d) => d.cred * 100)))}`);
console.log(`  el mismo cóndor al punto medio:            ${eur(media(dEnt.map((d) => d.salMid[0] * 100)))}`);
console.log(`  peaje de ENTRAR: ${eur(media(dEnt.map((d) => (d.salMid[0] - d.cred) * 100)))} — el ${((media(dEnt.map((d) => (d.salMid[0] - d.cred) * 100)) / media(dEnt.map((d) => d.salMid[0] * 100))) * 100).toFixed(0)}% del valor teórico se queda en la horquilla al abrir.`);
console.log(`  entrar y salir el mismo día = dos peajes: ${eur(media(dEnt.map((d) => (d.salMid[0] - d.cred) * 100)) + media(marcas.map((m) => m.peaje)))} sobre un crédito teórico de ${eur(media(dEnt.map((d) => d.salMid[0] * 100)))}.`);
