// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 3 (tercera parte) — EL PUENTE: «no es un movimiento GRANDE, es un movimiento INUSUAL»
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ SE MIDE Y POR QUÉ, EN CRISTIANO
// La autopsia de la regla del 2% deja dos cosas claras:
//   · el ACIERTO sube de verdad y sube en las tres puertas de entrada (18.9% → 22.5%), pero
//   · el RATIO no la sigue, porque las GANADORAS ENCOGEN: la señal elige días en que la cadena ya
//     cobra más (la cuna en el dinero pasa del 8.2% al 11.2% del precio, la opción del 1.2% al
//     2.3%). Se compra más movimiento, sí, pero pagándolo.
// Y en la doble clasificación se ve dónde SÍ sale a cuenta: en los valores TRANQUILOS, donde un
// día del 2% es una sorpresa de verdad y la cadena todavía no lo ha subido de precio.
//
// De ahí sale el puente, que es UNA idea y se escribe en una línea: medir el movimiento de ayer
// en unidades del propio vaivén reciente del valor, no en porcentaje absoluto. Un 2% en KO es un
// terremoto; un 2% en TSLA es un martes.
//
//     medida = |movimiento de ayer| / (desviación de los 20 días anteriores)
//
// Los 20 días TERMINAN EL DÍA ANTES de la compra: no entra ni un dato posterior a la decisión.
// No hay percentiles ni cortes móviles calculados con la historia entera; sólo una división.
//
// PUERTAS QUE SE ABREN AQUÍ, DICHAS DE ANTEMANO: tres cortes (2, 2.5 y 3 veces el vaivén) × 2
// envases, sobre las TRES puertas de entrada del mes ya fijadas. Se enseña la escalera entera,
// no la mejor casilla.
//
// ── LAS REGLAS DE LA CASA ─────────────────────────────────────────────────────────────────────
//  · SE COMPRA AL ASK Y SE VENDE AL BID (heredado del fichero de operaciones ya medido).
//  · NINGÚN MODELO DE PRECIOS: el vaivén se calcula con retornos de precios que existen.
//  · UN HUECO NO ES UN CERO: sin retorno de ayer o sin 18 retornos en la ventana, no hay entrada.
//  · SÓLO EL PASADO: ventana cerrada el día anterior.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y3-lente3c-el-puente-movimiento-inusual.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";
const CACHE_FILAS = "scripts/cache-theta/_y3l3b-filas.json";
const APUESTA = 1000;
const MIN_DIAS_TICKER = 400;

const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort().filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);

const SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8"));
// vaivén de 20 días, cerrado EL DÍA ANTES, por (ticker, día)
const VAIVEN = new Map();
for (const sym of TICKERS) {
  const s = SPOT[sym], dias = diasPorSim.get(sym), n = s.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) x = 0;
    r[i] = x;
  }
  for (let i = 21; i < n; i++) {
    const w = r.slice(i - 20, i).filter((x) => x != null);
    if (w.length < 18) continue;
    const v = sd(w);
    if (v > 0) VAIVEN.set(`${sym}|${dias[i]}`, v);
  }
}

const { filas } = JSON.parse(readFileSync(CACHE_FILAS, "utf8"));
let sinVaiven = 0;
for (const f of filas) {
  const v = VAIVEN.get(`${f.sym}|${f.dia}`);
  f.vaiven = v ?? null;
  f.z = v ? f.movAyer / v : null;
  if (!v) sinVaiven++;
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);
const rr = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");
const mide = (fs) => { const a = acc(); for (const f of fs) suma(a, APUESTA * f.ret); return a; };

console.log(`\n${"═".repeat(102)}`);
console.log("  EL PUENTE — «movimiento INUSUAL» en vez de «movimiento grande»");
console.log(`${"═".repeat(102)}`);
console.log(`  operaciones heredadas del fichero de las tres puertas: ${num(filas.length)} · sin vaivén calculable: ${num(sinVaiven)}`);
console.log(`  PUERTAS ABIERTAS AQUÍ: 3 cortes (2, 2.5 y 3 veces el vaivén) × 2 envases. Se enseña la escalera entera.`);

for (const env of ["A", "B"]) {
  const F = filas.filter((f) => f.env === env && f.z != null);
  const b = mide(F);
  console.log(`\n${"═".repeat(102)}`);
  console.log(`  ENVASE ${env} — las TRES puertas de entrada del mes juntas`);
  console.log(`${"═".repeat(102)}`);
  console.log(`  sin ninguna regla: ratio ${rr(b)} · acierta ${pct(acierto(b))} · ganador ${dol(ganMedio(b))} · perdedor ${dol(perMedio(b))} · n=${num(b.n)}`);
  console.log(`\n  | regla | n | ratio | acierta | ganador medio | perdedor medio | ops/año |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  const viejo = mide(F.filter((f) => f.movAyer > 0.02));
  console.log(`  | la del hallazgo: ayer > 2% en bruto | ${num(viejo.n)} | **${rr(viejo)}** | ${pct(acierto(viejo))} | ${dol(ganMedio(viejo))} | ${dol(perMedio(viejo))} | ${num(viejo.n / 11)} |`);
  for (const z of [2, 2.5, 3]) {
    const c = mide(F.filter((f) => f.z > z));
    console.log(`  | ayer > ${z.toFixed(1)} veces su propio vaivén | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${dol(ganMedio(c))} | ${dol(perMedio(c))} | ${num(c.n / 11)} |`);
  }
  for (const z of [2, 2.5, 3]) {
    const c = mide(F.filter((f) => f.z > z && f.movAyer > 0.02));
    console.log(`  | ayer > 2% Y > ${z.toFixed(1)} veces su vaivén | ${num(c.n)} | **${rr(c)}** | ${pct(acierto(c))} | ${dol(ganMedio(c))} | ${dol(perMedio(c))} | ${num(c.n / 11)} |`);
  }
}

// desglose de la mejor idea del puente, puerta a puerta y año a año
console.log(`\n${"═".repeat(102)}`);
console.log("  EL PUENTE, PUERTA A PUERTA (envase A) — lo importante es que las tres se parezcan");
console.log(`${"═".repeat(102)}`);
{
  const F = filas.filter((f) => f.env === "A" && f.z != null);
  const NOM = ["1ª sesión del mes", "11ª sesión del mes", "21ª sesión del mes"];
  console.log(`  | puerta | n sin regla | ratio sin | ayer>2%: n / ratio | ayer>2.5×vaivén: n / ratio |`);
  console.log(`  |---|---|---|---|---|`);
  for (let p = 0; p < 3; p++) {
    const t = F.filter((f) => f.puerta === p);
    const b = mide(t), v = mide(t.filter((f) => f.movAyer > 0.02)), z = mide(t.filter((f) => f.z > 2.5));
    console.log(`  | ${NOM[p]} | ${num(b.n)} | ${rr(b)} | ${num(v.n)} / **${rr(v)}** | ${num(z.n)} / **${rr(z)}** |`);
  }
  const ANOS = [...new Set(F.map((f) => f.ano))].sort();
  const z = ANOS.map((a) => mide(F.filter((f) => f.ano === a && f.z > 2.5)));
  console.log(`\n  año a año de «> 2.5 veces su vaivén» (tres puertas juntas):`);
  console.log(`  | año | ${ANOS.join(" | ")} |`);
  console.log(`  |---|${ANOS.map(() => "---").join("|")}|`);
  console.log(`  | n | ${z.map((x) => num(x.n)).join(" | ")} |`);
  console.log(`  | ratio | ${z.map((x) => rr(x)).join(" | ")} |`);
  console.log(`  | acierta | ${z.map((x) => pct(acierto(x))).join(" | ")} |`);
  console.log(`  años por debajo de 1 (≥20 operaciones): ${z.filter((x) => x.n >= 20 && ratio(x) < 1).length} de ${z.filter((x) => x.n >= 20).length}`);
  const m1 = mide(F.filter((f) => Number(f.ano) <= 2020 && f.z > 2.5)), m2 = mide(F.filter((f) => Number(f.ano) > 2020 && f.z > 2.5));
  console.log(`  mitades: 2016-2020 ${rr(m1)} (n=${num(m1.n)}) · 2021-2026 ${rr(m2)} (n=${num(m2.n)})`);
  console.log(`  calls ${rr(mide(F.filter((f) => f.z > 2.5 && f.tipo === "C")))} · puts ${rr(mide(F.filter((f) => f.z > 2.5 && f.tipo === "P")))}`);

  // el barajado del puente, 20 veces
  const porTk = new Map();
  for (const f of F) { if (!porTk.has(f.sym)) porTk.set(f.sym, new Map()); porTk.get(f.sym).set(f.dia, f); }
  const diasTk = new Map(), idxTk = new Map();
  for (const [sym, m] of porTk) { const ds = [...m.keys()].sort(); diasTk.set(sym, ds); idxTk.set(sym, new Map(ds.map((d, i) => [d, i]))); }
  const rs = [];
  for (let k = 1; k <= 20; k++) {
    const sel = [];
    for (const f of F) {
      const ds = diasTk.get(f.sym), j = idxTk.get(f.sym).get(f.dia) - k;
      if (j < 0) continue;
      const o = porTk.get(f.sym).get(ds[j]);
      if (o && o.z > 2.5) sel.push(f);
    }
    rs.push(mide(sel));
  }
  const real = mide(F.filter((f) => f.z > 2.5));
  const ord = rs.map((x) => ratio(x)).sort((a, b) => a - b);
  console.log(`\n  BARAJADO ×20 del puente: mínimo ${ord[0].toFixed(2)} · mediana ${ord[10].toFixed(2)} · máximo ${ord[19].toFixed(2)}  ·  de verdad ${ratio(real).toFixed(2)}`);
  console.log(`  barajados que igualan o pasan a la señal: ${ord.filter((x) => x >= ratio(real)).length} de 20 · que llegan a 1.40: ${ord.filter((x) => x >= 1.40).length} de 20`);
}
console.log(`\n${"═".repeat(102)}\n`);
