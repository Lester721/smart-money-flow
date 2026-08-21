// LA CINTA, SEPARANDO LAS PATAS DE SPREAD — lo único que quedaba sin medir de MarketSnack.
//
// ═══ POR QUÉ MURIERON LAS 11 MÉTRICAS ANTERIORES ════════════════════════════════════════════
//
// Medimos once herramientas de MarketSnack y las once salieron planas. La causa que encontramos:
// **sólo el 41% de los prints son de una pata sola.** El otro 59% son patas de una estructura —
// un spread, un cóndor, un collar— donde la pata comprada y la vendida se anulan.
//
// Y las métricas los contaban a todos por igual. Leer la pata comprada de un spread como si fuera
// una apuesta direccional es leer ruido con signo. No es raro que no separara nada.
//
// **Lo que nunca hicimos: medir SÓLO el 41% que va solo.** Eso es esto.
//
// ═══ CÓMO SE SEPARAN ════════════════════════════════════════════════════════════════════════
//
// Las patas de una misma estructura se imprimen a la vez y por el mismo tamaño. Así que un print
// es "pata de spread" si existe otro print con:
//   · el mismo subyacente
//   · el mismo tamaño de contratos
//   · a menos de 2 segundos
// Todo lo que no tiene hermano es una pata sola: alguien tomó una posición direccional limpia.
//
// ═══ LA DIRECCIÓN SE CALCULA, NO SE COPIA ═══════════════════════════════════════════════════
//
// El campo `sentiment` es el de MarketSnack, y su score ya salió que no predice (t=0,62 sobre
// 3.321 eventos). Aquí se deduce del lado y del tipo, que es dato duro:
//
//     compra call (ASKSIDE)  = alcista        vende call (BIDSIDE) = bajista
//     compra put  (ASKSIDE)  = bajista        vende put  (BIDSIDE) = alcista
//
// ═══ LA MEDIDA ══════════════════════════════════════════════════════════════════════════════
//
// Por (subyacente, día): prima alcista menos prima bajista, dividida por la prima total del día.
// Va de −1 (todo bajista) a +1 (todo alcista). Después, el retorno del subyacente a 1, 5 y 10 días.
//
// Y las TRES poblaciones a la vez, que es lo que decide:
//   patas solas   ·   patas de spread   ·   todo junto (lo que ya medimos y salió plano)
//
// Si las patas solas separan y las de spread no, la explicación de por qué murió todo se confirma
// y hay señal. Si las tres salen igual, la cinta no predice y se cierra.
//
// Uso: node --import tsx --max-old-space-size=8192 scripts/cinta-patas-solas.mjs

import { readFileSync, existsSync, createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const CINTA = "data/marketsnack/flujo-prima1000k.jsonl";
const CIERRES = "data/marketsnack/cierres";
const VENTANA_MS = 2000;          // dos prints a menos de esto y del mismo tamaño = misma estructura
const MIN_PRIMA_DIA = 3_000_000;  // por debajo de esto un día no dice nada

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tDe = (v) => media(v) / (sd(v) / Math.sqrt(v.length));
const pct = (x) => (x * 100).toFixed(2) + "%";

/** EWY260918P00160000 → { root:'EWY', right:'P' }. La raíz es todo lo anterior a la fecha. */
function parseSimbolo(s) {
  const m = String(s || "").match(/^([A-Z]+)(\d{6})([CP])(\d{8})$/);
  return m ? { root: m[1], right: m[3] } : null;
}

/** Alcista si se COMPRA una call o se VENDE una put. El lado manda. */
function direccion(side, right) {
  const compra = side === "ASKSIDE" || side === "ABOVE_ASK" || side === "AT_ASK";
  const vende = side === "BIDSIDE" || side === "BELOW_BID" || side === "AT_BID";
  if (!compra && !vende) return 0;                      // MIDMKT: no se sabe quién inició
  const alcistaSiCompra = right === "C";
  return compra === alcistaSiCompra ? 1 : -1;
}

// ── leer la cinta ───────────────────────────────────────────────────────────
console.log(`\n## Leyendo la cinta\n`);
const prints = [];
{
  const rl = createInterface({ input: createReadStream(CINTA) });
  for await (const linea of rl) {
    if (!linea.trim()) continue;
    let o; try { o = JSON.parse(linea); } catch { continue; }
    const p = parseSimbolo(o.symbol);
    if (!p || !o.timestamp || !(o.premium > 0)) continue;
    const dir = direccion(o.side, p.right);
    if (!dir) continue;
    prints.push({ root: p.root, dia: o.timestamp.slice(0, 10), ts: Date.parse(o.timestamp), size: o.size, premium: o.premium, dir });
  }
}
console.log(`  ${prints.length.toLocaleString("es-ES")} prints con lado y dirección deducibles\n`);

// ── separar patas solas de patas de estructura ──────────────────────────────
// Se agrupa por (subyacente, tamaño) y dentro se busca vecino a menos de 2 s.
const grupos = new Map();
for (const p of prints) {
  const k = `${p.root}|${p.size}`;
  if (!grupos.has(k)) grupos.set(k, []);
  grupos.get(k).push(p);
}
let sola = 0, acompanada = 0;
for (const g of grupos.values()) {
  g.sort((a, b) => a.ts - b.ts);
  for (let i = 0; i < g.length; i++) {
    const antes = i > 0 && g[i].ts - g[i - 1].ts <= VENTANA_MS;
    const despues = i < g.length - 1 && g[i + 1].ts - g[i].ts <= VENTANA_MS;
    g[i].pataSola = !antes && !despues;
    if (g[i].pataSola) sola++; else acompanada++;
  }
}
console.log(`  patas solas: ${sola.toLocaleString("es-ES")} (${((sola / prints.length) * 100).toFixed(1)}%)`);
console.log(`  patas de estructura: ${acompanada.toLocaleString("es-ES")} (${((acompanada / prints.length) * 100).toFixed(1)}%)\n`);

// ── precios de cierre ───────────────────────────────────────────────────────
const cierres = new Map();
function serieDe(root) {
  if (cierres.has(root)) return cierres.get(root);
  const f = `${CIERRES}/${root}.json`;
  let v = null;
  if (existsSync(f)) {
    try {
      const a = JSON.parse(readFileSync(f, "utf8"));
      v = { dias: a.map((x) => x[0]), precios: a.map((x) => x[1]), idx: new Map(a.map((x, i) => [x[0], i])) };
    } catch { v = null; }
  }
  cierres.set(root, v);
  return v;
}

// ── el desbalance por (subyacente, día) ─────────────────────────────────────
function construir(filtro) {
  const agg = new Map();
  for (const p of prints) {
    if (!filtro(p)) continue;
    const k = `${p.root}|${p.dia}`;
    const e = agg.get(k) ?? { root: p.root, dia: p.dia, alcista: 0, bajista: 0 };
    if (p.dir > 0) e.alcista += p.premium; else e.bajista += p.premium;
    agg.set(k, e);
  }
  const out = [];
  for (const e of agg.values()) {
    const total = e.alcista + e.bajista;
    if (total < MIN_PRIMA_DIA) continue;
    const s = serieDe(e.root);
    if (!s) continue;
    const i = s.idx.get(e.dia);
    if (i == null) continue;
    const fila = { root: e.root, dia: e.dia, desbalance: (e.alcista - e.bajista) / total, primaTotal: total };
    let sirve = false;
    for (const h of [1, 5, 10]) {
      if (i + h < s.precios.length && s.precios[i] > 0) { fila[`r${h}`] = s.precios[i + h] / s.precios[i] - 1; sirve = true; }
    }
    if (sirve) out.push(fila);
  }
  return out;
}

// ── medir: tercio más alcista contra tercio más bajista, por día ────────────
function medir(filas, h) {
  const porDia = new Map();
  for (const f of filas) {
    if (f[`r${h}`] == null) continue;
    if (!porDia.has(f.dia)) porDia.set(f.dia, []);
    porDia.get(f.dia).push(f);
  }
  const difs = [];
  for (const g of porDia.values()) {
    if (g.length < 6) continue;
    const o = [...g].sort((a, b) => b.desbalance - a.desbalance);
    const k = Math.floor(o.length / 3);
    difs.push(media(o.slice(0, k).map((x) => x[`r${h}`])) - media(o.slice(-k).map((x) => x[`r${h}`])));
  }
  return difs;
}

const POBLACIONES = [
  ["patas SOLAS", (p) => p.pataSola],
  ["patas de ESTRUCTURA", (p) => !p.pataSola],
  ["TODO junto (lo ya medido)", () => true],
];

console.log("=".repeat(84));
console.log("  ¿PREDICE LA CINTA? — tercio más alcista contra tercio más bajista, cada día");
console.log("=".repeat(84) + "\n");
console.log("| población | filas | 1 día | t | 5 días | t | 10 días | t |");
console.log("|---|---|---|---|---|---|---|---|");
const guardado = {};
for (const [nom, filtro] of POBLACIONES) {
  const filas = construir(filtro);
  guardado[nom] = filas;
  const celdas = [];
  for (const h of [1, 5, 10]) {
    const d = medir(filas, h);
    celdas.push(d.length >= 15 ? `${pct(media(d))} | ${tDe(d).toFixed(2)}` : "— | —");
  }
  console.log(`| ${nom} | ${filas.length} | ${celdas.join(" | ")} |`);
}

// ── mitades, para lo que separe ─────────────────────────────────────────────
console.log("\n" + "=".repeat(84));
console.log("  LAS DOS MITADES — sin esto no cuenta");
console.log("=".repeat(84) + "\n");
const todosDias = [...new Set(prints.map((p) => p.dia))].sort();
const corte = todosDias[Math.floor(todosDias.length / 2)];
console.log(`  corte en ${corte}\n`);
console.log("| población | horizonte | primera mitad | segunda mitad | ¿mismo signo? |");
console.log("|---|---|---|---|---|");
for (const [nom] of POBLACIONES) {
  const filas = guardado[nom];
  for (const h of [1, 5, 10]) {
    const a = medir(filas.filter((f) => f.dia < corte), h);
    const b = medir(filas.filter((f) => f.dia >= corte), h);
    if (a.length < 10 || b.length < 10) continue;
    const ok = Math.sign(media(a)) === Math.sign(media(b));
    console.log(`| ${nom} | ${h}d | ${pct(media(a))} (t ${tDe(a).toFixed(2)}) | ${pct(media(b))} (t ${tDe(b).toFixed(2)}) | ${ok ? "**sí**" : "NO"} |`);
  }
}
console.log("");

// ── ¿PREDICEN MEJOR LOS PRINTS MÁS GRANDES? ────────────────────────────────
// La idea: $1M es el suelo del fichero, pero hay prints de $50M. Si el dinero grande sabe algo,
// el corte por tamaño tendría que hacer subir la separación, no bajarla.
console.log("=".repeat(84));
console.log("  ¿PREDICE MEJOR EL DINERO MÁS GRANDE?  (5 días, todas las patas)");
console.log("=".repeat(84) + "\n");
console.log("| suelo de prima por print | prints | filas | separación 5d | t |");
console.log("|---|---|---|---|---|");
for (const suelo of [1e6, 3e6, 5e6, 10e6, 25e6]) {
  const n = prints.filter((p) => p.premium >= suelo).length;
  const filas = construir((p) => p.premium >= suelo);
  const d = medir(filas, 5);
  console.log(`| $${(suelo / 1e6).toFixed(0)}M | ${n.toLocaleString("es-ES")} | ${filas.length} | ${d.length >= 15 ? pct(media(d)) : "—"} | ${d.length >= 15 ? tDe(d).toFixed(2) : "—"} |`);
}
console.log("");
