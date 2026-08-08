// P2 — ¿DE DÓNDE VIENE NUESTRO EDGE? ¿De vender prima o de acertar la dirección?
//
// LA SOSPECHA. P2 nació para contrastar a Euan Sinclair: la IV supera a la volatilidad realizada
// en índices, y normalmente NO en acciones sueltas. Pero al ir a medirlo apareció algo antes:
// `creditSpreadPnl` valora el spread con bsPrice(..., rv, ...) — usa la VOLATILIDAD REALIZADA
// como si fuera la IV.
//
// Si eso es así, la prima de riesgo de varianza en nuestro backtest es CERO POR CONSTRUCCIÓN:
// cobramos exactamente lo que el movimiento va a costar. Y entonces el +3,2% no puede venir de
// vender prima — solo puede venir de la DIRECCIÓN.
//
// LA PRUEBA, que no admite interpretación:
//   (a) dirección de EVA  → lo que medimos hoy
//   (b) dirección INVERTIDA → si el edge es direccional, debe salir simétricamente NEGATIVO
//   (c) dirección AL AZAR   → debe salir ~0
//
// Si (b) y (c) dan lo esperado, entonces:
//   1. el edge es 100% direccional, no de venta de prima;
//   2. la pregunta de Sinclair NO se puede responder con este backtest — la asumimos resuelta;
//   3. en real cobraríamos ADEMÁS la prima (IV > rv), que aquí no contamos → el backtest
//      SUBESTIMA lo que daría en vivo, sobre todo en índices.
//
// Uso: node --import tsx scripts/mejora-p2-de-donde-viene-el-edge.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta";
const INDICES = ["SPY", "QQQ"];
const ACCIONES = ["AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = 5, SIGMA = 1;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

// Generador reproducible: la dirección "al azar" tiene que ser la MISMA en cada ejecución, o el
// resultado cambiaría solo. (Math.random haría irrepetible la prueba.)
let semilla = 12345;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

/**
 * `soloTop` = true devuelve la POBLACIÓN DE LA ESTRATEGIA (Top⅓ + IV/rv<1,1).
 * `soloTop` = false devuelve TODAS las señales — imprescindible para la auditoría: si se
 * parte en tercios lo que ya es el tercio superior, el "Bottom⅓" resultante es en realidad
 * el percentil 33-44 de todo, y la separación desaparece por construcción. Ese error dio
 * +3,73% vs +2,85% cuando lo conocido era +2,3% vs −3,7%; el desajuste lo delató.
 */
function cargar(tickers: string[], soloTop = true) {
  const out: { sig: Signal; bars: DBar[] }[] = [];
  for (const t of tickers) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (bars.length < 300 || !trades.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    if (!soloTop) { for (const sig of sigs) out.push({ sig, bars }); continue; }
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);
    for (const sig of top) out.push({ sig, bars });
  }
  return out;
}

function evaluar(pares: { sig: Signal; bars: DBar[] }[], modo: "eva" | "inversa" | "azar") {
  const rets: number[] = [];
  for (const { sig, bars } of pares) {
    const dir: 1 | -1 = modo === "eva" ? sig.dir : modo === "inversa" ? ((-sig.dir) as 1 | -1) : (rnd() < 0.5 ? 1 : -1);
    const r = creditSpreadPnl({ ...sig, dir }, bars, DTE, SIGMA);
    if (r != null) rets.push(r);
  }
  return { n: rets.length, media: media(rets) * 100, win: (rets.filter((x) => x > 0).length / Math.max(1, rets.length)) * 100 };
}

(async () => {
  console.log(`\n## P2 — ¿De dónde viene el edge? · ${DTE}d @${SIGMA}σ · Top⅓ EVA + IV/rv<1,1\n`);
  console.log(`El backtest valora el spread con bsPrice(..., rv, ...): cobra la volatilidad REALIZADA`);
  console.log(`como si fuera la IV. Si eso anula la prima, el edge tiene que ser direccional.\n`);

  for (const [nombre, tickers] of [["ÍNDICES (SPY+QQQ)", INDICES], ["ACCIONES (6)", ACCIONES], ["TODO", [...INDICES, ...ACCIONES]]] as const) {
    const pares = cargar(tickers as string[]);
    if (pares.length < 100) continue;
    semilla = 12345;   // misma semilla para cada universo → comparable
    const a = evaluar(pares, "eva"), b = evaluar(pares, "inversa"), c = evaluar(pares, "azar");
    console.log(`### ${nombre} — ${a.n} operaciones\n`);
    console.log("| Dirección | Media | Win |");
    console.log("|---|---|---|");
    console.log(`| **EVA (la nuestra)** | **${a.media >= 0 ? "+" : ""}${a.media.toFixed(2)}%** | ${a.win.toFixed(0)}% |`);
    console.log(`| INVERTIDA | ${b.media >= 0 ? "+" : ""}${b.media.toFixed(2)}% | ${b.win.toFixed(0)}% |`);
    console.log(`| AL AZAR | ${c.media >= 0 ? "+" : ""}${c.media.toFixed(2)}% | ${c.win.toFixed(0)}% |`);
    const simetrico = Math.abs(a.media + b.media) < Math.abs(a.media) * 0.6;
    const azarNeutro = Math.abs(c.media) < Math.abs(a.media) * 0.5;
    console.log(`\n   invertida ≈ −EVA: ${simetrico ? "SÍ" : "no"}   ·   azar ≈ 0: ${azarNeutro ? "SÍ" : "no"}`);
    console.log(`   → ${simetrico && azarNeutro
      ? "El edge es DIRECCIONAL. No estamos cobrando prima: la asumimos justa."
      : "NO es puramente direccional — hay algo más en el vehículo (asimetría del payoff)."}\n`);
  }

  // ── AUDITORÍA OBLIGADA ──────────────────────────────────────────────────────────────────
  // El resultado de arriba choca con algo que SÍ medimos y que aguantó cuatro versiones de la
  // prueba: el Top⅓ de convicción rinde +2,3% y el Bottom⅓ −3,7%. Si la dirección no aporta,
  // ¿qué separaba esos dos tercios?
  //
  // HIPÓTESIS: EVA tiene DOS cosas dentro y las hemos tratado como una sola.
  //   (1) CONVICCIÓN — qué días operar. Puede funcionar.
  //   (2) DIRECCIÓN  — de qué lado ponerse. Puede no aportar nada.
  // Se separan poniendo la dirección AL AZAR en los dos tercios: si el Top⅓ sigue ganando al
  // Bottom⅓ con dirección aleatoria, la convicción vale por sí sola y lo que no vale es el lado.
  console.log(`### AUDITORÍA — ¿convicción o dirección? (dirección AL AZAR en ambos tercios)\n`);
  const todos = cargar([...INDICES, ...ACCIONES], false);   // TODAS las señales, sin prefiltrar
  const ordenados = [...todos].sort((a, b) => a.sig.evaComp - b.sig.evaComp);
  const k3 = Math.floor(ordenados.length / 3);
  const bottom = ordenados.slice(0, k3), top = ordenados.slice(ordenados.length - k3);
  console.log("| Tercio de convicción | dirección de EVA | dirección AL AZAR |");
  console.log("|---|---|---|");
  for (const [nombre, grupo] of [["Top⅓ (alta)", top], ["Bottom⅓ (baja)", bottom]] as const) {
    semilla = 999;
    const conEva = evaluar(grupo, "eva");
    semilla = 999;
    const conAzar = evaluar(grupo, "azar");
    console.log(`| ${nombre} | ${conEva.media >= 0 ? "+" : ""}${conEva.media.toFixed(2)}% | ${conAzar.media >= 0 ? "+" : ""}${conAzar.media.toFixed(2)}% |`);
  }
  semilla = 999; const tAz = evaluar(top, "azar");
  semilla = 999; const bAz = evaluar(bottom, "azar");
  console.log(`\n   Con dirección al azar, el Top⅓ ${tAz.media > bAz.media ? "SIGUE ganando" : "YA NO gana"} al Bottom⅓`);
  console.log(`   (${tAz.media.toFixed(2)}% vs ${bAz.media.toFixed(2)}%)`);
  console.log(`   → ${tAz.media > bAz.media
    ? "La CONVICCIÓN vale por sí sola (elige los días buenos). Lo que no aporta es el LADO."
    : "Sin la dirección de EVA, la convicción tampoco separa: el filtro entero está en duda."}\n`);

  // ── VALIDACIÓN DEL HALLAZGO ─────────────────────────────────────────────────────────────
  // "El azar le gana a EVA" es una afirmación fuerte y una sola tirada de dados no la sostiene:
  // podría ser una semilla afortunada. Se repite con 25 semillas y se parte por fecha en dos
  // mitades. Para que valga, EVA tiene que quedar por debajo de la MEDIA del azar en AMBAS.
  console.log(`### VALIDACIÓN — 25 semillas distintas, y partido por fecha\n`);
  const estrategia = cargar([...INDICES, ...ACCIONES]);   // la población real de la estrategia
  const porFecha = [...estrategia].sort((a, b) => a.sig.entryMs - b.sig.entryMs);
  const mit = Math.floor(porFecha.length / 2);
  const mitades: [string, typeof porFecha][] = [
    ["COMPLETO", porFecha], ["mitad VIEJA", porFecha.slice(0, mit)], ["mitad NUEVA", porFecha.slice(mit)],
  ];
  console.log("| Tramo | EVA | azar (media de 25) | azar (mín – máx) | ¿EVA por debajo? |");
  console.log("|---|---|---|---|---|");
  let fallaAlguna = false;
  for (const [nombre, grupo] of mitades) {
    const eva = evaluar(grupo, "eva").media;
    const muestras: number[] = [];
    for (let s = 0; s < 25; s++) { semilla = 1000 + s * 7919; muestras.push(evaluar(grupo, "azar").media); }
    const mAzar = media(muestras), mn = Math.min(...muestras), mx = Math.max(...muestras);
    const peor = eva < mAzar;
    if (peor && nombre !== "COMPLETO") fallaAlguna = true;
    console.log(`| ${nombre} | ${eva >= 0 ? "+" : ""}${eva.toFixed(2)}% | ${mAzar >= 0 ? "+" : ""}${mAzar.toFixed(2)}% | ${mn.toFixed(2)}% – ${mx.toFixed(2)}% | ${peor ? "**SÍ, peor**" : "no"} |`);
  }
  console.log(`\n   → ${fallaAlguna
    ? "CONFIRMADO: la DIRECCIÓN de EVA resta. Elegir el lado al azar rinde más, en las dos mitades."
    : "No confirmado: EVA aguanta contra el azar en alguna mitad."}`);
  console.log(`   (Ojo: esto NO toca la CONVICCIÓN, que sigue separando +3,1% vs −4,0%.)\n`);

  console.log(`### Qué significa para P2\n`);
  console.log(`   Si el edge es direccional, la tesis de Sinclair (prima en índices sí, en acciones no)`);
  console.log(`   NO se puede contrastar con este backtest: le pusimos IV = rv, o sea prima cero.`);
  console.log(`   Y en real cobraríamos ADEMÁS esa prima — que este backtest NO cuenta. Es decir,`);
  console.log(`   los números que hemos venido dando son un SUELO, no un techo, sobre todo en índices.`);
})();
