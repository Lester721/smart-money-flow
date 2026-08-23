// ¿POR QUÉ SE APAGA LA MARIPOSA? — descomponerlo en vez de teorizar.
//
// ═══ EL HECHO ═══════════════════════════════════════════════════════════════════════════════
//
// La mariposa de las 15:00 con filtro de medias da $11.405/año sobre 518 operaciones, pero
// decae: primera mitad $14.872/año, segunda $7.939. Por años:
//     2022 +$8.903 (40 ops) · 2023 +$14.907 (125) · 2024 +$17.739 (145)
//     2025 +$8.494 (131) · 2026 +$2.422 (77, año incompleto)
//
// Lester pregunta lo correcto: ¿por qué, y se puede evitar SIN arriesgar más?
//
// ═══ LA DESCOMPOSICIÓN ══════════════════════════════════════════════════════════════════════
//
// El resultado de una mariposa aguantada a vencimiento es, exactamente:
//
//     P&L = CRÉDITO − |cierre − strike|          (acotado por el ala, que nunca se alcanzó:
//                                                 los 518 días acabaron DENTRO de las alas)
//
// O sea que sólo hay DOS causas posibles y son separables:
//     (a) el CRÉDITO ha encogido  → el mercado paga menos por lo mismo
//     (b) el MOVIMIENTO ha crecido → la última hora se mueve más que antes
//
// Y como el índice pasó de 4.700 a 7.700, los dos hay que mirarlos también en % del índice:
// 50 puntos eran el 1,06% del índice en 2022 y son el 0,65% en 2026. Una constante en PUNTOS
// sobre un índice que se ha triplicado NO es la misma estructura de un año a otro. Ese error
// exacto (umbral en puntos, no en %) ya infló un hallazgo de este proyecto.
//
// ═══ POR QUÉ IMPORTA CUÁL DE LAS DOS SEA ════════════════════════════════════════════════════
//
//   Si es el CRÉDITO → se arregla con un umbral: no operar los días que pagan poco. Eso NO
//   añade riesgo: opera menos días con la misma estructura. Es el «tercer sí» del cóndor.
//
//   Si es el MOVIMIENTO → se arregla entrando más tarde (menos tiempo para moverse). Tampoco
//   añade riesgo: el ala sigue siendo la misma y el colateral el mismo.
//
//   Si es que 50 puntos ya no son lo que eran → el arreglo sería ensanchar el ala en proporción
//   al índice, y ESO SÍ añade riesgo (más colateral por contrato). Lester lo ha descartado, así
//   que si sale esto hay que decirlo y buscar otra cosa.

import { diasDisponibles, cargarDia, idxHora, hayHora, rejilla, estructura, compraEn } from "./lib0dte.mjs";

const HORA = "15:00", ALA = 50;
const MEDIAS = new Set(["2022-11-25","2023-07-03","2023-11-24","2024-07-03","2024-11-29",
                        "2024-12-24","2025-07-03","2025-11-28","2025-12-24"]);
const mariposa = (K, a) => [
  { K, lado: "C", dir: -1 }, { K: K + a, lado: "C", dir: 1 },
  { K, lado: "P", dir: -1 }, { K: K - a, lado: "P", dir: 1 },
];
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };

const cierres = [];
const ops = [];
for (const dd of diasDisponibles()) {
  const d = cargarDia(dd);
  if (!d) continue;
  if (cierres.length >= 50 && !MEDIAS.has(dd) && hayHora(d, HORA) >= 0) {
    const ma5 = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
    const i = idxHora(d, HORA), U = d.barras[i].spot, K = rejilla(U);
    if (U > ma5 && U > ma50) {
      const o = estructura(d, i, "vencimiento", mariposa(K, ALA));
      if (o) {
        const cierre = d.barras[d.barras.length - 1].spot;
        // el movimiento esperado del DÍA, para normalizar entre regímenes
        const b0 = d.barras[0], K0 = rejilla(b0.spot);
        const cc = compraEn(b0, K0, "C"), pp = compraEn(b0, K0, "P");
        ops.push({
          dia: dd, anio: dd.slice(0, 4), U, K, cierre,
          creditoUsd: o.credito * 100,
          creditoPct: (o.credito / U) * 100,          // el crédito en % del índice
          movPtos: Math.abs(cierre - K),               // lo que se movió desde el strike
          movPct: (Math.abs(cierre - K) / U) * 100,
          alaPct: (ALA / U) * 100,                     // el ala, en % del índice
          cunaPct: cc != null && pp != null ? ((cc + pp) / b0.spot) * 100 : null,
          pl: o.dolares,
        });
      }
    }
  }
  cierres.push(d.barras[d.barras.length - 1].spot);
}
console.log(`## ${ops.length} operaciones\n`);

console.log("### LA DESCOMPOSICIÓN, AÑO A AÑO\n");
console.log("  año    n    $/op    crédito $   crédito %   movimiento %   ala %    ratio crédito/mov");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const v = ops.filter((x) => x.anio === a);
  if (!v.length) continue;
  const cPct = med(v.map((x) => x.creditoPct)), mPct = med(v.map((x) => x.movPct));
  console.log(`  ${a}  ${String(v.length).padStart(4)}  ${med(v.map((x) => x.pl)).toFixed(0).padStart(6)}  ` +
              `${med(v.map((x) => x.creditoUsd)).toFixed(0).padStart(9)}  ${cPct.toFixed(4).padStart(10)}  ` +
              `${mPct.toFixed(4).padStart(12)}   ${med(v.map((x) => x.alaPct)).toFixed(3).padStart(6)}   ${(cPct / mPct).toFixed(2).padStart(8)}`);
}
console.log(`\n  El crédito y el movimiento van en % del índice para poder comparar 2022 con 2026.`);
console.log(`  El ratio crédito/movimiento por debajo de 1 significa que el día medio PIERDE.\n`);

console.log("### ¿ES QUE 50 PUNTOS YA NO SON LO QUE ERAN?\n");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const v = ops.filter((x) => x.anio === a);
  if (!v.length) continue;
  const tocados = v.filter((x) => x.movPtos > ALA).length;
  console.log(`  ${a}: índice medio ${med(v.map((x) => x.U)).toFixed(0)} · el ala de 50 puntos es el ${med(v.map((x) => x.alaPct)).toFixed(3)}% · ` +
              `días que la superan: ${tocados} de ${v.length}`);
}
console.log(`\n  Si nunca se supera el ala, el ancho NO es la causa: la pérdida no viene de ahí.\n`);

console.log("### ¿Y LA VOLATILIDAD DEL PROPIO DÍA?\n");
console.log("  (la cuna de las 09:35 es lo que el mercado cobraba por el movimiento de ese día)");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const v = ops.filter((x) => x.anio === a && x.cunaPct != null);
  if (!v.length) continue;
  console.log(`  ${a}: cuna mediana ${mediana(v.map((x) => x.cunaPct)).toFixed(3)}% · crédito mediano ${mediana(v.map((x) => x.creditoPct)).toFixed(4)}% · ` +
              `crédito / cuna ${(mediana(v.map((x) => x.creditoPct)) / mediana(v.map((x) => x.cunaPct))).toFixed(4)}`);
}
console.log(`\n  Si «crédito / cuna» es estable, el mercado sigue pagando lo mismo por el riesgo`);
console.log(`  y lo que ha cambiado es el régimen. Si baja, es que pagan MENOS por lo mismo.\n`);

// ── EL ARREGLO SIN MÁS RIESGO: un umbral de crédito ────────────────────────
console.log("### EL ARREGLO QUE NO AÑADE RIESGO: no operar los días que pagan poco\n");
console.log("  (misma estructura, mismo colateral, sólo se opera menos días)\n");
console.log("  umbral            n    $/año    $/op   peor día   2022    2023    2024    2025    2026");
const ANOS = 4.6;
for (const [et, filtro] of [
  ["sin umbral", () => true],
  ["crédito ≥ $400", (x) => x.creditoUsd >= 400],
  ["crédito ≥ $600", (x) => x.creditoUsd >= 600],
  ["crédito ≥ $800", (x) => x.creditoUsd >= 800],
  ["crédito ≥ $1000", (x) => x.creditoUsd >= 1000],
  ["crédito ≥ 0,010% idx", (x) => x.creditoPct >= 0.010],
  ["crédito ≥ 0,012% idx", (x) => x.creditoPct >= 0.012],
  ["crédito ≥ 25% de la cuna", (x) => x.cunaPct != null && x.creditoPct >= 0.25 * x.cunaPct],
  ["crédito ≥ 30% de la cuna", (x) => x.cunaPct != null && x.creditoPct >= 0.30 * x.cunaPct],
]) {
  const v = ops.filter(filtro);
  if (v.length < 50) { console.log(`  ${et.padEnd(22)} muestra corta (${v.length})`); continue; }
  const porAno = (a) => { const w = v.filter((x) => x.anio === a); return w.length ? w.reduce((s, x) => s + x.pl, 0) : 0; };
  console.log(`  ${et.padEnd(20)}${String(v.length).padStart(5)}  ${(v.reduce((s, x) => s + x.pl, 0) / ANOS).toFixed(0).padStart(7)}  ` +
              `${med(v.map((x) => x.pl)).toFixed(0).padStart(6)}  ${Math.min(...v.map((x) => x.pl)).toFixed(0).padStart(8)}  ` +
              ["2022","2023","2024","2025","2026"].map((a) => porAno(a).toFixed(0).padStart(6)).join("  "));
}
