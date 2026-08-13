// EVA COMO VETO SOBRE LA PUT SEMANAL DE QQQ — prueba 1 de las tres.
//
// Por qué esta primero: es la única que se monta encima de algo que YA gana dinero
// (la put semanal de QQQ al 3%, 13,5%/año con 7% de caída, 315 semanas de precios reales).
//
// La hipótesis viene de leer juntas las dos pruebas de EVA que sobrevivieron:
//   · el movimiento MEDIO real/implícito es 0,98 en los tres tercios -> EVA no predice el tamaño
//   · pero con spreads a 1,5σ el tercio alto acierta 94% y el bajo 87% -> EVA SÍ predice la COLA
// O sea: EVA no dice cuánto se va a mover, dice cuándo NO se rompe el nivel.
//
// La put semanal se rompe el 14% de las semanas. Si EVA anticipa esas roturas, filtrarlas sube
// el resultado sin cambiar nada más.
//
// Uso: node --import tsx scripts/eva-veto-put-semanal.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta";
const NOCHE = `${DIR}/noche-2026-08-10`;
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return null; } };

// ── 1. las señales de EVA para QQQ ────────────────────────────────────────────
function señalesQQQ(): Map<string, number> {
  // OJO con las firmas reales: DBar es { time: string; close: number } (no `t`), y
  // classifyFlow(raw, now) devuelve { rows }, no un array.
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) if (f.startsWith("QQQ_barsPAR_y_")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));

  const trades: unknown[] = [];
  for (const f of readdirSync(DIR)) if (f.startsWith("QQQ_y_") && f.endsWith(".json")) {
    const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y);
  }
  if (bars.length < 300 || !trades.length) return new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigs: Signal[] = signals(classifyFlow(trades as any, new Date()).rows, bars);
  const m = new Map<string, number>();
  for (const s of sigs) m.set(bars[s.entryIdx].time, s.evaComp);
  return m;
}

// ── 2. las operaciones de la put semanal ──────────────────────────────────────
interface Op { rolo: string; exp: string; ret: number; K: number; cobro: number; S0: number; ST: number }

(async () => {
  const eva = señalesQQQ();
  console.log(`señales de EVA para QQQ: ${eva.size} días`);
  if (eva.size < 200) { console.log("✗ muy pocas señales — revisar la caché de flujo"); return; }

  const M = await import(`file://${process.cwd().replace(/\\/g, "/")}/scripts/gex-2026/intradia-lib.mjs`) as {
    res: Map<string, Op[]>; met: (o: Op[]) => { n: number; anual: number; dd: number; win: number } | null;
  };
  const ops = M.res.get("12:00") ?? [];
  console.log(`operaciones de la put semanal: ${ops.length}`);

  // cruce: la señal de EVA del viernes de entrada (o la más reciente anterior)
  const dias = [...eva.keys()].sort();
  const evaDe = (d: string): number | null => {
    if (eva.has(d)) return eva.get(d)!;
    for (let i = dias.length - 1; i >= 0; i--) if (dias[i] < d) {
      return (Date.parse(d) - Date.parse(dias[i])) / 864e5 <= 5 ? eva.get(dias[i])! : null;
    }
    return null;
  };

  const conEva = ops.map((o) => ({ ...o, eva: evaDe(o.rolo) })).filter((o) => o.eva != null) as (Op & { eva: number })[];
  console.log(`cruzadas con EVA: ${conEva.length} de ${ops.length}\n`);
  if (conEva.length < 100) { console.log("✗ cruce insuficiente"); return; }

  const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
  const anualiza = (g: (Op & { eva: number })[]) => {
    if (!g.length) return null;
    const orden = [...g].sort((a, b) => (a.rolo < b.rolo ? -1 : 1));
    let eq = 1, pico = 1, dd = 0;
    for (const o of orden) { eq *= 1 + o.ret; pico = Math.max(pico, eq); dd = Math.max(dd, 1 - eq / pico); }
    // el capital está parado las semanas vetadas: se anualiza sobre el CALENDARIO completo
    const años = (Date.parse(orden[orden.length - 1].exp) - Date.parse(orden[0].rolo)) / 365 / 864e5;
    return { n: g.length, anual: (eq ** (1 / años) - 1) * 100, dd: dd * 100,
             win: g.filter((o) => o.ret > 0).length / g.length, media: media(g.map((o) => o.ret)) * 100 };
  };

  const f = (nom: string, g: (Op & { eva: number })[]) => {
    const m = anualiza(g);
    if (!m) { console.log(`${nom.padEnd(34)} —`); return; }
    console.log(`${nom.padEnd(34)} n=${String(m.n).padStart(3)}  acierto ${(m.win * 100).toFixed(0)}%  ` +
      `media ${m.media.toFixed(3)}%  ANUAL ${m.anual.toFixed(1).padStart(6)}%  caída ${m.dd.toFixed(0).padStart(3)}%`);
  };

  console.log("═══ ¿EVA anticipa las semanas que rompen la put? ═══\n");
  f("todas (sin filtro)", conEva);
  const orden = [...conEva].sort((a, b) => a.eva - b.eva);
  const k = Math.floor(orden.length / 3);
  f("  tercio BAJO de convicción", orden.slice(0, k));
  f("  tercio medio", orden.slice(k, 2 * k));
  f("  tercio ALTO de convicción", orden.slice(2 * k));

  console.log("\n═══ el veto: saltarse el tercio bajo ═══\n");
  f("saltando el tercio bajo", orden.slice(k));
  f("saltando la mitad baja", orden.slice(Math.floor(orden.length / 2)));

  console.log("\n═══ ¿predice las ROTURAS? (la hipótesis de la cola) ═══\n");
  const rotas = conEva.filter((o) => o.ST < o.K);
  const enteras = conEva.filter((o) => o.ST >= o.K);
  console.log(`   semanas que ROMPIERON el strike: ${rotas.length}  ·  EVA media ${media(rotas.map((o) => o.eva)).toFixed(1)}`);
  console.log(`   semanas que aguantaron:          ${enteras.length}  ·  EVA media ${media(enteras.map((o) => o.eva)).toFixed(1)}`);
  const va = media(rotas.map((o) => o.eva)), vb = media(enteras.map((o) => o.eva));
  const sd = (a: number[]) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
  const t = (va - vb) / Math.sqrt(sd(rotas.map((o) => o.eva)) ** 2 / rotas.length + sd(enteras.map((o) => o.eva)) ** 2 / enteras.length);
  console.log(`   diferencia: ${(va - vb).toFixed(2)} puntos de convicción   t=${t.toFixed(2)}   ${Math.abs(t) > 2 ? "<<< SIGNIFICATIVA" : "no significativa"}`);

  console.log("\n═══ partida de la muestra (el filtro se elige mirando el resultado) ═══\n");
  for (const [nom, a, b] of [["2020-2022", "2020-01-01", "2022-12-31"], ["2023-2026", "2023-01-01", "2099"]] as const) {
    const sub = orden.filter((o) => o.rolo >= a && o.rolo <= b);
    const kk = Math.floor(sub.length / 3);
    const m1 = anualiza(sub), m2 = anualiza(sub.slice(kk));
    if (m1 && m2) console.log(`   ${nom}:  sin filtro ${m1.anual.toFixed(1)}%  ·  con veto ${m2.anual.toFixed(1)}%  (n=${m1.n})`);
  }
})();
