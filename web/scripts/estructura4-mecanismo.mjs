// ESTRUCTURA 4 · EL MECANISMO — ¿por qué entrar más tarde recorta la cola, y es mejor dial que
// alejar los strikes?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura4-mecanismo.mjs
//
// ═══ LA PREGUNTA QUE DECIDE SI EL HALLAZGO ES UN HALLAZGO ════════════════════════════════════
//
// Entrar más tarde y alejar los strikes hacen LA MISMA COSA: dejar el strike vendido más lejos
// del alcance real del índice. Si son la misma palanca contada de dos maneras, mover el reloj no
// aporta nada nuevo — hay un dial más simple (los ±puntos) que ya está medido.
//
// Así que se ponen las dos curvas EN LOS MISMOS EJES:
//   · la curva del RELOJ    (mía)                    scripts/estructura4-hora.json
//   · la curva de la DISTANCIA (otro agente, 11:00)  scripts/anatomia-distancia-salida.json
//   · la curva de las ALAS     (otro agente, 11:00)  scripts/anatomia-alas-salida.json
// y se compara el $/año que cada una retiene AL MISMO nivel de cola (p5 y peor racha).
//
// Y se mide el mecanismo directo, sin opciones de por medio: la TASA DE ROTURA — cuántos días el
// cierre de las 16:00 queda más allá del strike vendido. Eso dice a qué distancia REAL estás,
// sin que la valoración se meta. Si a las 13:45 con ±25 puntos rompes tanto como a las 11:00 con
// ±50, las dos configuraciones están igual de lejos y la única diferencia es lo que te PAGAN.
//
// NADA DE FUTURO: la distancia se mide desde el spot de la hora de entrada, el desenlace es el
// cierre. El cierre es el resultado, no un dato de decisión.

import { readFileSync } from "node:fs";

const HORA_CURVA = JSON.parse(readFileSync("scripts/estructura4-hora.json", "utf8"));
const DIST = JSON.parse(readFileSync("scripts/anatomia-distancia-salida.json", "utf8"));
const ALAS = JSON.parse(readFileSync("scripts/anatomia-alas-salida.json", "utf8"));
const CAM = JSON.parse(readFileSync("scripts/anatomia3-camino.json", "utf8"));
const FILAS = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const HORAS = Object.keys(HORA_CURVA.entradas);

// ═══ 1 · LA TASA DE ROTURA — el mecanismo desnudo, sin precios de opciones ═══════════════════
console.log("═".repeat(104));
console.log("  1 · TASA DE ROTURA — % de días en que el cierre de las 16:00 queda más allá del strike vendido");
console.log("═".repeat(104));
console.log("  (medido sobre el índice, sin opciones: es la distancia REAL, no la valorada)\n");

function rotura(getSpot, sep) {
  let n = 0, rotos = 0, exceso = 0;
  for (const f of FILAS) {
    const sp = getSpot(f);
    if (!(sp > 0)) continue;
    n++;
    const d = Math.abs(f.cierre - sp);
    if (d > sep) { rotos++; exceso += d - sep; }
  }
  return { n, rotos, pct: (rotos / n) * 100, excesoMedio: rotos ? exceso / rotos : 0 };
}
const spotHora = (h) => (f) => { const c = CAM[f.fecha]; if (!c) return 0; const i = c.h.indexOf(h); return i < 0 ? 0 : c.s[i]; };

console.log("| entrada (±25 puntos fijos) | días | días que rompen | % rotura | exceso medio cuando rompe |");
console.log("|---|---|---|---|---|");
const rotHora = {};
for (const h of HORAS) { const r = rotura(spotHora(h), 25); rotHora[h] = r; console.log(`| ${h} | ${r.n} | ${r.rotos} | ${r.pct.toFixed(1)}% | ${r.excesoMedio.toFixed(1)} pts |`); }

console.log("\n| 11:00, alejando el strike | días | días que rompen | % rotura | exceso medio cuando rompe |");
console.log("|---|---|---|---|---|");
const rotDist = {};
for (const sep of [25, 30, 35, 40, 45, 50, 60, 75]) {
  const r = rotura(spotHora("11:00"), sep); rotDist[sep] = r;
  console.log(`| ±${sep} | ${r.n} | ${r.rotos} | ${r.pct.toFixed(1)}% | ${r.excesoMedio.toFixed(1)} pts |`);
}

// ═══ 2 · LOS DOS DIALES, MISMOS EJES ═════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  2 · LOS DOS DIALES EN LOS MISMOS EJES — cuánto ingreso retiene cada uno al MISMO nivel de cola");
console.log("═".repeat(104));
console.log("  ⚠️ la curva de distancia es de otro agente y corre 650 días (2024-01-02→2026-08-10) contra mis 653;");
console.log("     su ±25 da $18.816/año y el mío $18.696. La diferencia (0,6%) es el desfase de 3 días, no un método distinto.\n");

const puntos = [];
for (const h of HORAS) {
  const e = HORA_CURVA.entradas[h];
  puntos.push({ dial: "RELOJ", etiqueta: `entrar a las ${h}`, alAno: e.alAno, p5: e.p5, dd: e.dd, peor: e.peor, rotura: rotHora[h].pct });
}
for (const [sep, v] of Object.entries(DIST.curva)) {
  puntos.push({ dial: "DISTANCIA", etiqueta: `11:00, ±${sep} puntos`, alAno: v.alAno, p5: v.p5, dd: v.ddPico ?? v.dd, peor: v.peorDia, rotura: rotDist[sep] ? rotDist[sep].pct : null });
}
puntos.sort((a, b) => a.p5 - b.p5);   // de la cola más profunda a la más suave
console.log("| dial | configuración | p5 | peor racha | PEOR DÍA | $/año | rotura |");
console.log("|---|---|---|---|---|---|---|");
for (const p of puntos) console.log(`| ${p.dial} | ${p.etiqueta} | ${eur(p.p5)} | ${eur(p.dd)} | ${eur(p.peor)} | ${eur(p.alAno)} | ${p.rotura == null ? "—" : p.rotura.toFixed(1) + "%"} |`);

// ═══ 3 · LA COMPARACIÓN DIRECTA — parejas con la MISMA cola ══════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  3 · CARA A CARA — para cada punto del reloj, el punto de DISTANCIA con la cola (p5) más parecida");
console.log("═".repeat(104));
console.log("| entrar a las | p5 | $/año | ≈ misma p5 alejando strikes | p5 | $/año | ventaja del RELOJ |");
console.log("|---|---|---|---|---|---|---|");
const dpts = Object.entries(DIST.curva).map(([sep, v]) => ({ sep: Number(sep), alAno: v.alAno, p5: v.p5, dd: v.ddPico ?? v.dd }));
const ventajas = [];
for (const h of HORAS) {
  const e = HORA_CURVA.entradas[h];
  const m = dpts.reduce((a, b) => (Math.abs(b.p5 - e.p5) < Math.abs(a.p5 - e.p5) ? b : a));
  const v = e.alAno - m.alAno;
  ventajas.push({ h, v, p5: e.p5 });
  console.log(`| ${h} | ${eur(e.p5)} | ${eur(e.alAno)} | ±${m.sep} puntos | ${eur(m.p5)} | ${eur(m.alAno)} | ${eur(v)} |`);
}

// ═══ 4 · EL PEOR DÍA — lo que el reloj NO puede tocar ════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  4 · EL PEOR DÍA ES ESTRUCTURAL, NO HORARIO");
console.log("═".repeat(104));
console.log("  La pérdida máxima de un cóndor de alas 50 es ancho − crédito = $5.000 − crédito. Entrar más tarde");
console.log("  cobra MENOS crédito, así que el techo de pérdida SUBE en vez de bajar:\n");
console.log("| entrada | crédito mediano | pérdida máxima teórica | peor día observado |");
console.log("|---|---|---|---|");
for (const h of HORAS) {
  const e = HORA_CURVA.entradas[h];
  console.log(`| ${h} | ${eur(e.credMed)} | ${eur(-(5000 - e.credMed))} | ${eur(e.peor)} |`);
}
console.log("\n  Lo único que baja el PEOR DÍA es estrechar las alas (ya medido por otro agente):\n");
console.log("| ancho de ala (11:00, ±25) | $/año | PEOR DÍA | peor racha |");
console.log("|---|---|---|---|");
for (const [k, v] of Object.entries(ALAS.unContrato)) {
  if (!k.startsWith("25-")) continue;
  console.log(`| ${k.split("-")[1]} puntos | ${eur(v.alAno)} | ${eur(v.peorDia)} | ${eur(v.dd)} |`);
}

// ═══ 5 · ¿Y LAS DOS PALANCAS A LA VEZ? — lo que queda por medir ══════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  5 · LO QUE ESTE SCRIPT NO PUEDE RESPONDER");
console.log("═".repeat(104));
console.log("  El reloj recorta la FRECUENCIA de días malos; las alas estrechas recortan el TECHO de cada día malo.");
console.log("  Son palancas distintas y no se pueden sumar sobre el papel. Se miden JUNTAS, con las cadenas, en");
console.log("  scripts/estructura4-combinado.mjs — que es el siguiente paso, no una suposición.");
