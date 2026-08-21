// LA MISMA SEÑAL, PERO PREGUNTADA BIEN.
//
// ═══ EL FALLO DE DISEÑO QUE ARREGLA ═════════════════════════════════════════════════════════
//
// "Prima lejos del dinero" ordenada entre tickers es CASI ESTÁTICA: NVDA cae en el tercio alto
// 127 meses de 130. Así que no estaba detectando un momento — estaba comparando acciones
// volátiles contra acciones tranquilas. Es una lista, no una señal.
//
// Y eso explica los dos síntomas: el t honesto baja a 2,34 y sólo el 54% de los meses van a
// favor. Una apuesta estática repetida no acumula evidencia; acumula la misma evidencia.
//
// ═══ LAS TRES FORMAS DE PREGUNTARLO ═════════════════════════════════════════════════════════
//
//   nivel    la de siempre: prima lejos / precio          ← estática, ya medida (t 2,34)
//   forma    prima lejos / prima cercana                  ← quita el nivel de volatilidad y deja
//                                                            sólo la FORMA de la cadena
//   propia   z de la prima lejos contra su propia historia ← "¿es mucho PARA ESTA acción, HOY?"
//                                                            se mueve en el tiempo: n de verdad
//
// La tercera es la que cambiaría todo: convierte una lista de nombres en una señal que entra y
// sale. Si funciona, cada mes es una apuesta distinta y las 127 observaciones son reales.
//
// LA VENTANA es de 12 meses HACIA ATRÁS, nunca centrada: un z calculado con la media de toda la
// historia mete el futuro por la puerta de atrás — el fallo que ya nos costó un hallazgo entero.
//
// Uso: node --import tsx scripts/prima-lejos-forma.mjs

import { readFileSync } from "node:fs";

const PANEL = "scripts/cache-theta/panel-prima-lejos.json";
const VENTANA = 12;              // meses de historia propia; SIEMPRE hacia atrás
const MIN_HIST = 8;              // sin al menos esto, no hay z fiable

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => (x * 100).toFixed(1) + "%";

const filas = JSON.parse(readFileSync(PANEL, "utf8"));
console.log(`\n## ${filas.length} filas · ${new Set(filas.map((f) => f.sym)).size} tickers · ${new Set(filas.map((f) => f.mes)).size} meses\n`);

// ── las tres versiones de la señal ──────────────────────────────────────────
const porTicker = new Map();
for (const f of filas.slice().sort((a, b) => (a.sym === b.sym ? a.mes.localeCompare(b.mes) : a.sym.localeCompare(b.sym)))) {
  if (!porTicker.has(f.sym)) porTicker.set(f.sym, []);
  const h = porTicker.get(f.sym);
  f.nivel = f.primaLejos;
  f.forma = f.ivProxy > 0 ? f.primaLejos / f.ivProxy : null;
  // EL Z CONTRA SU PROPIA HISTORIA — sólo con lo que ya había pasado ese mes
  const prev = h.slice(-VENTANA).map((x) => x.primaLejos);
  f.propia = prev.length >= MIN_HIST && sd(prev) > 0 ? (f.primaLejos - media(prev)) / sd(prev) : null;
  h.push(f);
}
const conZ = filas.filter((f) => f.propia != null).length;
console.log(`  con z propio calculable: ${conZ} de ${filas.length} (las primeras ${MIN_HIST} de cada ticker no tienen historia)\n`);

// ── la unidad honesta sigue siendo el mes ───────────────────────────────────
function serie(campo, veh, sub = filas) {
  const porMes = new Map();
  for (const f of sub) {
    if (f[campo] == null || !isFinite(f[campo])) continue;
    if (!porMes.has(f.mes)) porMes.set(f.mes, []);
    porMes.get(f.mes).push(f);
  }
  const out = [];
  for (const [mes, g] of [...porMes].sort()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    out.push({ mes, dif: media(o.slice(0, k).map((x) => x[veh])) - media(o.slice(-k).map((x) => x[veh])) });
  }
  return out;
}

const NOM = { nivel: "nivel (la estática)", forma: "forma (lejos/cerca)", propia: "propia (z de 12m)" };

console.log("=".repeat(80));
console.log("  LAS TRES, MEDIDAS IGUAL — cono, y cada mes cuenta una vez");
console.log("=".repeat(80) + "\n");
console.log("| cómo se pregunta | n meses | separación | t honesto | meses a favor |");
console.log("|---|---|---|---|---|");
const resultados = {};
for (const campo of ["nivel", "forma", "propia"]) {
  const d = serie(campo, "cono").map((x) => x.dif);
  if (d.length < 20) { console.log(`| ${NOM[campo]} | ${d.length} | muestra corta | | |`); continue; }
  resultados[campo] = d;
  console.log(`| ${NOM[campo]} | ${d.length} | ${pct(media(d))} | **${tDe(d).toFixed(2)}** | ${Math.round((d.filter((x) => x > 0).length / d.length) * 100)}% |`);
}

// ── ¿SIGUE SIENDO LA MISMA LISTA DE NOMBRES? ────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log("  ¿ES UNA SEÑAL O SIGUE SIENDO UNA LISTA?");
console.log("=".repeat(80) + "\n");
console.log("| cómo se pregunta | el nombre más repetido | los 6 juntos | tickers distintos |");
console.log("|---|---|---|---|");
for (const campo of ["nivel", "forma", "propia"]) {
  const porMes = new Map();
  for (const f of filas) { if (f[campo] == null || !isFinite(f[campo])) continue; if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  const cuenta = new Map(); let total = 0;
  for (const g of porMes.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    for (const x of o.slice(0, k)) { cuenta.set(x.sym, (cuenta.get(x.sym) ?? 0) + 1); total++; }
  }
  const top = [...cuenta].sort((a, b) => b[1] - a[1]);
  if (!top.length) continue;
  console.log(`| ${NOM[campo]} | ${top[0][0]} ${((top[0][1] / total) * 100).toFixed(1)}% | ${((top.slice(0, 6).reduce((a, x) => a + x[1], 0) / total) * 100).toFixed(1)}% | ${cuenta.size} |`);
}

// ── mitades cruzadas para la que gane ───────────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log("  MITADES CRUZADAS");
console.log("=".repeat(80) + "\n");
const meses = [...new Set(filas.map((f) => f.mes))].sort();
const corte = meses[Math.floor(meses.length / 2)];
console.log(`  corte en ${corte}\n`);
console.log("| cómo se pregunta | primera mitad | segunda mitad | ¿mismo signo y tamaño? |");
console.log("|---|---|---|---|");
for (const campo of ["nivel", "forma", "propia"]) {
  const a = serie(campo, "cono", filas.filter((f) => f.mes < corte)).map((x) => x.dif);
  const b = serie(campo, "cono", filas.filter((f) => f.mes >= corte)).map((x) => x.dif);
  if (a.length < 15 || b.length < 15) continue;
  const ok = Math.sign(media(a)) === Math.sign(media(b)) && Math.min(Math.abs(media(a)), Math.abs(media(b))) > 0.01;
  console.log(`| ${NOM[campo]} | ${pct(media(a))} (t ${tDe(a).toFixed(2)}) | ${pct(media(b))} (t ${tDe(b).toFixed(2)}) | ${ok ? "**sí**" : "NO"} |`);
}

// ── quintiles ───────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(80));
console.log("  QUINTILES DEL CONO");
console.log("=".repeat(80) + "\n");
for (const campo of ["nivel", "forma", "propia"]) {
  const acum = Array.from({ length: 5 }, () => []);
  const porMes = new Map();
  for (const f of filas) { if (f[campo] == null || !isFinite(f[campo])) continue; if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
  for (const g of porMes.values()) {
    if (g.length < 10) continue;
    const o = [...g].sort((a, b) => a[campo] - b[campo]);
    o.forEach((x, i) => acum[Math.min(4, Math.floor((i / o.length) * 5))].push(x.cono));
  }
  if (acum.some((q) => !q.length)) continue;
  console.log(`  ${NOM[campo].padEnd(22)} ` + acum.map((q, i) => `Q${i + 1} ${pct(media(q)).padStart(6)}`).join("  ·  "));
}
console.log("");
