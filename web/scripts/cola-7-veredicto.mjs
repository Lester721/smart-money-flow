// EL VEREDICTO — y, sobre todo, QUÉ LE FALTA PARA SERVIR.
//
// Tres cosas quedaron claras y las tres importan:
//   1. Las pérdidas del cóndor NO se agrupan (cola-1). La familia entera de "reducir tras N
//      pérdidas" está condenada por el dato, no por opinión.
//   2. La MAGNITUD sí se agrupa (cola-2, r=0,265 con t=6,76) y la media es plana entre regímenes.
//      Ese es el único mecanismo por el que una regla de tamaño podía funcionar.
//   3. La regla que salió de ahí —mitad de tamaño con σ en el tercio alto— NO aguanta: se cae
//      en el primer tercio y su mejor casilla del mapa de sensibilidad tiene vecinas negativas.
//
// Este fichero hace dos cosas: enseñar los tercios EN CRUDO (sin el reescalado, que en un
// subperíodo con poco ingreso exagera la caída), y calcular con números POR QUÉ nada de esto se
// puede validar todavía y qué haría falta exactamente.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const ALA = 50, CAPITAL = 56389;
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
radiografia(filas, ["pl", "credito", "sigma"], "días del cóndor", { maxCeros: 0.2 });

const pS = (() => {
  const o = new Array(filas.length).fill(null);
  for (let i = 0; i < filas.length; i++) {
    const h = []; for (let j = Math.max(0, i - 250); j < i; j++) h.push(filas[j].sigma);
    if (h.length < 60) continue;
    o[i] = h.filter((x) => x <= filas[i].sigma).length / h.length;
  }
  return o;
})();
const met = (idx, tam) => {
  const p = idx.map((i) => filas[i].pl * tam(i));
  let pico = 0, ac = 0, dd = 0;
  for (const x of p) { ac += x; pico = Math.max(pico, ac); dd = Math.min(dd, ac - pico); }
  return { anual: p.reduce((a, b) => a + b, 0) / (p.length / 252), peorDia: Math.min(...p),
           p1: pctl(p, 0.01), p5: pctl(p, 0.05), dd, tam: media(idx.map(tam)) };
};

console.log("═".repeat(112));
console.log("  VEREDICTO · los tercios EN CRUDO, a 1 contrato base, sin reescalar nada");
console.log("═".repeat(112));
const t3 = Math.floor(filas.length / 3);
const PER = [["1er tercio", 0, t3], ["2º tercio", t3, 2 * t3], ["3er tercio", 2 * t3, filas.length], ["TODO", 0, filas.length]];
console.log("\n| período | fechas | días | plan | $/año | peor día | p1 | p5 | PEOR RACHA | tam. medio |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, a, b] of PER) {
  const idx = []; for (let i = a; i < b; i++) idx.push(i);
  const f = met(idx, () => 1);
  const r = met(idx, (i) => (pS[i] != null && pS[i] > 2 / 3 ? 0.5 : 1));
  console.log("| " + nom + " | " + filas[a].fecha + "→" + filas[b - 1].fecha + " | " + idx.length + " | fijo 1 | " +
    eur(f.anual) + " | " + eur(f.peorDia) + " | " + eur(f.p1) + " | " + eur(f.p5) + " | " + eur(f.dd) + " | 1.00 |");
  console.log("| | | | mitad si σ alta | " + eur(r.anual) + " | " + eur(r.peorDia) + " | " + eur(r.p1) + " | " +
    eur(r.p5) + " | " + eur(r.dd) + " | " + r.tam.toFixed(2) + " |");
}
console.log("\n  En crudo la regla baja la caída en los tres tercios — pero también baja el ingreso, que es");
console.log("  exactamente lo que hace operar más pequeño. La comparación válida es a IGUAL INGRESO, y ahí");
console.log("  el primer tercio se da la vuelta: la regla cobró " + eur(met([...Array(t3).keys()], (i) => (pS[i] != null && pS[i] > 2 / 3 ? 0.5 : 1)).anual) +
            "/año contra " + eur(met([...Array(t3).keys()], () => 1).anual) + " del fijo.");

// ── el ingreso por período: el cóndor NO rinde igual todo el rato ──────────
console.log("\n## Aparte, y no es menor: el ingreso del cóndor se está encogiendo\n");
console.log("| período | $/año a 1 contrato | % días ganadores | crédito mediano |");
console.log("|---|---|---|---|");
for (const [nom, a, b] of PER) {
  const g = filas.slice(a, b);
  const idx = []; for (let i = a; i < b; i++) idx.push(i);
  console.log("| " + nom + " | " + eur(met(idx, () => 1).anual) + " | " +
    ((g.filter((x) => x.pl > 0).length / g.length) * 100).toFixed(0) + "% | " +
    eur(pctl(g.map((x) => x.credito), 0.5)) + " |");
}

// ── LA INESTABILIDAD, en una tabla ─────────────────────────────────────────
console.log("\n## Por qué la regla de σ no aguanta: los días de σ alta cambian de signo\n");
console.log("| período | días σ ALTA | media σ alta | días σ normal | media σ normal | diferencia |");
console.log("|---|---|---|---|---|---|");
for (const [nom, a, b] of PER) {
  const alta = [], normal = [];
  for (let i = a; i < b; i++) {
    if (pS[i] == null) continue;
    (pS[i] > 2 / 3 ? alta : normal).push(filas[i].pl);
  }
  if (alta.length < 5 || normal.length < 5) { console.log("| " + nom + " | " + alta.length + " | sin calibrar | | | |"); continue; }
  console.log("| " + nom + " | " + alta.length + " | " + eur(media(alta)) + " | " + normal.length + " | " +
    eur(media(normal)) + " | **" + eur(media(alta) - media(normal)) + "** |");
}
console.log("\n  Ese es el mismo patrón de [eva-la-inusualidad-es-el-ingrediente]: el ingrediente cambia de signo");
console.log("  al período siguiente. Una regla de tamaño que se apoya en él hereda el cambio de signo.");

// ── POR QUÉ NO SE PUEDE VALIDAR: la cola tiene 6 días ─────────────────────
console.log("\n" + "═".repeat(112));
console.log("  QUÉ LE FALTA PARA SERVIR · la cuenta que explica por qué nada de esto cierra");
console.log("═".repeat(112));
const n = filas.length;
console.log("\n| medida | valor | qué significa |\n|---|---|---|");
console.log("| días en la muestra | " + n + " | 2 años y 7 meses |");
console.log("| días en el percentil 1 | " + Math.floor(n * 0.01) + " | **la «cola» que se quiere partir por la mitad son 6 días** |");
console.log("| días en el percentil 5 | " + Math.floor(n * 0.05) + " | |");
console.log("| observaciones de la PEOR RACHA | 1 | un solo camino, un solo número |");
console.log("\n  Ahí está todo el problema. Se puede medir una MEDIA con 653 días. No se puede validar una");
console.log("  regla sobre la COLA con 6 días en ella, ni una regla sobre la CAÍDA con una sola caída.");
console.log("  Por eso el control D4 —recortar al azar— salió el primero de la tabla de caídas de cola-3:");
console.log("  con 1 observación, la suerte y el mecanismo son indistinguibles.");

// ── la cola está TRUNCADA: no es gorda, es un muro ────────────────────────
const pl = filas.map((f) => f.pl);
const cola5 = [...pl].sort((a, b) => a - b).slice(0, Math.floor(n * 0.05));
const sdCola = Math.sqrt(cola5.reduce((a, x) => a + (x - media(cola5)) ** 2, 0) / (cola5.length - 1));
console.log("\n## La cola del cóndor no es gorda: es un MURO\n");
console.log("| medida | valor |\n|---|---|");
console.log("| media del 5% peor | " + eur(media(cola5)) + " |");
console.log("| desviación DENTRO de ese 5% | " + eur(sdCola) + " |");
console.log("| pérdida máxima aritmética (crédito mediano " + eur(pctl(filas.map((f) => f.credito), 0.5)) + ") | " +
            eur(-(ALA * 100 - pctl(filas.map((f) => f.credito), 0.5))) + " |");
console.log("\n  El 5% peor se apiña en " + eur(sdCola) + " de desviación contra un muro de −$5.000. Eso cambia");
console.log("  la pregunta: la cola no se hace más PROFUNDA, se hace más FRECUENTE. Y una frecuencia es");
console.log("  un sí/no, no una media — por eso la cuenta de muestra hay que hacerla como una proporción.");

// muestra necesaria para detectar que una regla PARTE POR LA MITAD la frecuencia de la cola
console.log("\n## Cuánta muestra haría falta para probar que una regla parte la cola por la mitad\n");
console.log("| cola | frecuencia base | frecuencia objetivo | días por grupo | días totales | **años de mercado** |");
console.log("|---|---|---|---|---|---|");
for (const [nom, p1] of [["percentil 1", 0.01], ["percentil 5", 0.05], ["días perdedores", 0.245]]) {
  const p2 = p1 / 2;
  const nGrupo = Math.ceil((2.8 ** 2 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p1 - p2) ** 2);
  console.log("| " + nom + " | " + (p1 * 100).toFixed(1) + "% | " + (p2 * 100).toFixed(2) + "% | " +
    nGrupo.toLocaleString("es-ES") + " | " + (2 * nGrupo).toLocaleString("es-ES") + " | **" +
    ((2 * nGrupo) / 252).toFixed(0) + " años** |");
}
console.log("\n  Con 653 días hay 6 días en el 1% y 32 en el 5%. Para el 1% harían falta ~" +
            Math.ceil((2 * Math.ceil((2.8 ** 2 * (0.01 * 0.99 + 0.005 * 0.995)) / 0.005 ** 2)) / 252) +
            " años de SPXW. Ese es");
console.log("  el motivo real de que las 25 reglas no cierren: no es que sean malas ideas, es que la muestra");
console.log("  no puede distinguirlas ni de sus propios barajados.");
console.log("\n  Y la PEOR RACHA es peor todavía: 653 días dan UNA. Para 20 observaciones independientes de");
console.log("  la caída harían falta 20 × 653 = 13.060 días = 52 años.");

console.log("\n## Los tres caminos para conseguir esa muestra SIN esperar décadas\n");
console.log("| camino | qué multiplica la muestra | qué hay que hacer | ¿el dato existe ya? |");
console.log("|---|---|---|---|");
console.log("| **1 · más horas de entrada** | ×6 a ×10 | los ficheros de `gex-2026` traen la cadena cada **5 minutos** desde las 09:30. " +
            "Hoy se usa UNA marca (11:00) de ~78 que hay. Repetir el cóndor entrando a 10:00, 10:30, 11:30, 12:00, 13:00 y 14:00 " +
            "da 7 caminos por día → ~4.500 operaciones y ~45 días en el 1% | **SÍ, en disco** |");
console.log("| **2 · más años de SPXW** | ×2 a ×4 | bajar 2016–2023 de ThetaData. La cola de 2018 (volmageddon) y la de 2020 " +
            "son justo las que faltan: la muestra de hoy no tiene NI UN crash de verdad | no, hay que descargarlo |");
console.log("| **3 · más anchos y distancias** | ×4 a ×6 | el mismo día con ±20/±30/±40 y alas de 25/50/75 son colas distintas " +
            "del MISMO camino de precio. No son independientes, pero sí dicen si la forma de la cola cambia con el ajuste | **SÍ, en disco** |");
console.log("\n  Los tres caminos dan observaciones CORRELACIONADAS, no independientes: 7 entradas del mismo día");
console.log("  comparten el mismo camino de precio. Hay que decirlo al medir y agrupar el error por DÍA");
console.log("  (errores agrupados), o el n se infla y volvemos al error de [gex-0dte-primera-medicion].");

console.log("\n## Lo único que sí está probado y se puede usar mañana\n");
console.log("| hecho | número | consecuencia operativa |\n|---|---|---|");
console.log("| las pérdidas NO se agrupan | z de rachas −0,38 · racha real 4, barajada 4 | **no montar nada que reaccione a la pérdida de ayer** |");
console.log("| la magnitud SÍ se agrupa | r(1)=0,265 · t=6,76 | el riesgo de mañana es previsible aunque la dirección no |");
console.log("| la media es plana entre regímenes | 17 filtros + 5 señales, ninguna pasa | no hay «hoy no» por volatilidad |");
console.log("| la pérdida máxima es (50 − crédito)×100 | el peor día, −$4.900, cobró $100 | **el desastre vive en la calma, no en el pánico** |");
console.log("| el tamaño escala LINEAL en las dos direcciones | 2 fijo: " + eur(met([...Array(n).keys()], () => 2).anual) +
            "/año y " + eur(met([...Array(n).keys()], () => 2).dd) + " de caída | duplicar tamaño duplica la caída, exacto |");
console.log("\n  Con " + eur(CAPITAL) + " de capital, la caída del contrato fijo (" + eur(met([...Array(n).keys()], () => 1).dd) +
            ") ya es el " + ((-met([...Array(n).keys()], () => 1).dd / CAPITAL) * 100).toFixed(0) + "% de la cuenta.");
console.log("  A 2 contratos son el " + ((-met([...Array(n).keys()], () => 2).dd / CAPITAL) * 100).toFixed(0) +
            "%. Esa cuenta sí está cerrada y no depende de ninguna regla de las que fallaron.");
