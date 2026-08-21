// LA SEÑAL, DENTRO DEL UNIVERSO QUE DE VERDAD SE PUEDE OPERAR.
//
// ═══ EL FALLO QUE ARREGLA ═══════════════════════════════════════════════════════════════════
//
// La medición anterior comparaba un cono de $2.746 (tercio alto) contra uno de $358 (tercio bajo).
// Eso no es una prueba de señal: es una prueba de tamaño. El tercio alto son SPY, QQQ, NVDA — con
// horquilla del 3,2% — y el bajo son nombres con horquilla del 6,5%.
//
// Y se notó: de los 8,1% que separaba, 3,2 puntos eran peaje. Lo que quedaba (4,9%, t 1,31) es ruido.
//
// ═══ LA PREGUNTA BIEN HECHA ═════════════════════════════════════════════════════════════════
//
// Dentro de lo que Lester PUEDE operar —contratos con horquilla estrecha— ¿hay algo en la cadena
// que diga cuál se va a mover más de lo que cuesta?
//
// Se prueba sobre el universo filtrado por horquilla, y con las señales medidas a PUNTO MEDIO
// además de a precios reales, para que nunca vuelva a colarse el peaje disfrazado de señal.
//
// Uso: node --import tsx scripts/prima-lejos-universo-operable.mjs
//      (necesita scripts/cache-theta/panel-liquidez.json, que ya está en disco)

import { readFileSync } from "node:fs";

const filas = JSON.parse(readFileSync("scripts/cache-theta/panel-liquidez.json", "utf8"));

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => (x * 100).toFixed(1) + "%";

console.log(`\n## ${filas.length} filas · ${new Set(filas.map((f) => f.sym)).size} tickers\n`);

// ── el universo operable: horquilla por debajo de la mediana ────────────────
const hs = filas.map((f) => f.horquilla).sort((a, b) => a - b);
const CORTE = hs[Math.floor(hs.length / 2)];
const operable = filas.filter((f) => f.horquilla <= CORTE);
console.log(`  corte de horquilla: ${pct(CORTE)} → ${operable.length} filas operables`);
console.log(`  coste medio del cono en ese universo: $${Math.round(media(operable.map((f) => f.primaUSD)))}`);
console.log(`  horquilla media: ${pct(media(operable.map((f) => f.horquilla)))}`);
console.log(`  tickers que sobreviven: ${[...new Set(operable.map((f) => f.sym))].sort().join(" ")}\n`);

// ── el listón: qué da comprar al azar DENTRO de ese universo ────────────────
console.log("=".repeat(80));
console.log("  EL LISTÓN DENTRO DEL UNIVERSO OPERABLE");
console.log("=".repeat(80) + "\n");
console.log(`  comprar el cono al azar aquí: **${pct(media(operable.map((f) => f.conoReal)))}** real · ${pct(media(operable.map((f) => f.conoMedio)))} a punto medio`);
console.log(`  (una señal tiene que separar más que eso para que valga la pena)\n`);

// ── las señales, dentro del universo operable ───────────────────────────────
function serie(campo, veh, sub) {
  const porMes = new Map();
  for (const f of sub) {
    if (f[campo] == null || !isFinite(f[campo])) continue;
    if (!porMes.has(f.mes)) porMes.set(f.mes, []);
    porMes.get(f.mes).push(f);
  }
  const out = [];
  for (const [, g] of [...porMes].sort()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b[campo] - a[campo]); const k = Math.floor(o.length / 3);
    out.push(media(o.slice(0, k).map((x) => x[veh])) - media(o.slice(-k).map((x) => x[veh])));
  }
  return out;
}

// dentro del universo operable, "prima lejos" ya no puede ser un proxy de tamaño:
// todos son cadenas grandes. Se prueba también normalizada por el propio recuento.
for (const f of operable) {
  f.porContrato = f.nLejos > 0 ? f.primaLejos / f.nLejos : null;   // prima media por contrato lejano
  f.anchura = f.strikesDistintos;                                   // control: puro tamaño de cadena
  f.coste = f.primaUSD;                                             // control: puro precio del cono
}

console.log("=".repeat(80));
console.log("  LAS SEÑALES, DENTRO DEL UNIVERSO OPERABLE");
console.log("=".repeat(80) + "\n");
console.log("| señal | n meses | REAL (bid/ask) | t | PUNTO MEDIO | t |");
console.log("|---|---|---|---|---|---|");
for (const [campo, nom] of [
  ["primaLejos", "prima lejos (la de antes)"],
  ["porContrato", "prima MEDIA por contrato lejano"],
  ["horquilla", "horquilla (control)"],
  ["anchura", "ancho de cadena (control)"],
  ["coste", "coste del cono (control)"],
]) {
  const r = serie(campo, "conoReal", operable), m = serie(campo, "conoMedio", operable);
  if (r.length < 20) { console.log(`| ${nom} | ${r.length} | muestra corta | | | |`); continue; }
  console.log(`| ${nom} | ${r.length} | ${pct(media(r))} | ${tDe(r).toFixed(2)} | **${pct(media(m))}** | **${tDe(m).toFixed(2)}** |`);
}

console.log("\n" + "=".repeat(80));
console.log("  LO QUE DECIDE: la columna de PUNTO MEDIO. Ahí el peaje no puede disfrazarse de");
console.log("  señal. Si una fila separa >2% con |t| ≥ 2 a punto medio, hay algo que medir en");
console.log("  serio (mitades cruzadas + control contra el azar). Si no, no lo hay.");
console.log("=".repeat(80) + "\n");
