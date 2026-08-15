// ¿EL SCORECARD DE EVA SEPARA GANADORAS DE PERDEDORAS EN EL FLUJO REAL?
//
// Uso: npx tsx scripts/puntuar-eva-flujo.ts
// Entrada: scripts/eva-filas-2024.json (lo produce medir-eva-flujo.mjs, con precios reales)
//
// ═══ EL CRITERIO, ESCRITO ANTES DE MIRAR NINGÚN NÚMERO ═══════════════════════════════════
//
// Esto es lo que decidí el 2026-08-15 a las 03:05, con la medición todavía corriendo y sin
// haber visto una sola cifra del resultado. Está aquí para que no se pueda mover después.
//
// PASA si, y sólo si, las cuatro cosas de `pasarBarrera()`:
//   1. Muestra suficiente.
//   2. Ningún ticker pasa del 20% (lo que tumbó el hallazgo de agosto: NFLX era el 25%).
//   3. El MISMO SIGNO en los TRES tercios de tiempo. No dos mitades — tres tercios.
//   4. |t| por encima del listón de Bonferroni para el número de pruebas que se hacen.
//
// PRUEBAS QUE SE VAN A HACER, contadas de antemano para el listón (son 14):
//   · 2 totales (pesos de Victor, pesos de EVA)
//   · 4 categorías por separado (agresividad, convicción, inusualidad, IV)
//   · 2 direcciones (comprar call / comprar put)
//   · 6 cortes de control (con IV / sin IV, salida normal / adelantada, ≤30 DTE / >30 DTE)
//
// SI SALE NEGATIVO: antes de decir "no funciona" se corre `potencia()`. Si el efecto que
// buscamos es menor que el detectable con esta muestra, la respuesta honesta es "no lo pudimos
// ver", NO "no existe" — el escepticismo también se aplica al lado negativo.
//
// SI SALE POSITIVO: no se cree. Se propone atacarlo con ultracode antes de creérselo, tal y
// como manda la regla de CLAUDE.md. Un positivo aquí es una hipótesis, no una conclusión.
//
// ═══ LO QUE ESTO NO MIDE, Y HAY QUE DECIRLO CADA VEZ ══════════════════════════════════════
//   · ESTRUCTURA (15% del peso) — necesita el open interest de toda la cadena.
//   · CONFIRMACIÓN (10%) — se calcula con barras posteriores: meterla sería mirar al futuro.
// O sea: el 75% del peso del scorecard. Y de las filas medidas, sólo el ~70% tiene IV/griegas
// (las muy dentro del dinero cotizan por debajo del intrínseco). Eso se reporta, no se esconde.

import { readFileSync } from "node:fs";
import {
  volumeScore, timingScore, repetitionScore, spreadScore, dominanceScore,
  executionLevel, executionScore, orderSizeScore, deltaScore, thetaScore,
  gammaScore, legScore, expiryScore,
} from "../lib/flow";
import { EVA_WEIGHTS } from "../lib/scorecardEva";
import { pasarBarrera, potencia, comprobarDescarte, informe, type FilaHallazgo } from "../lib/barreraHallazgos";

const ENTRADA = process.env.EVA_FILAS || "scripts/eva-filas-2024.json";
const PRUEBAS = 14;                        // declarado arriba, antes de mirar

// Pesos de Victor, intactos. EVA los cambia; se miden los dos y se comparan.
const PESOS_VICTOR = { aggression: 20, conviction: 20, unusuality: 20, structure: 15, ivContext: 10, validation: 15 };

interface Fila {
  ticker: string; dia: string; ts: string; exp: string; strike: number; right: "C" | "P";
  size: number; price: number; prima: number; bid: number; ask: number; oi: number;
  spot: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null;
  dte: number; diaSalida: string; exitBid: number; salidaAdelantada: boolean;
  pnl: number; variasPatas: boolean;
}

const media = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;

/**
 * UN CAMPO PRESENTE PERO SIEMPRE NULO ES UN BUG, NO UN DATO.
 *
 * `columnas()` en el medidor comprueba que la columna EXISTA. Esto comprueba que su VALOR sirva,
 * que es distinto y fue el tercer fallo silencioso de la misma noche: `dte` salió null en las
 * 26.880 filas (Date.parse no entiende "20240102"), y como en JavaScript `null <= 30` es TRUE,
 * el corte "≤30 días" se quedó con la muestra ENTERA y ">30 días" con cero. Nada falló.
 *
 * Si un campo que se va a usar está roto en más del `maxNulosPct`, se para aquí.
 */
function comprobarCampo<T>(filas: T[], nombre: keyof T & string, maxNulosPct = 0.9): void {
  const nulos = filas.filter((f) => {
    const v = f[nombre] as unknown;
    return v == null || (typeof v === "number" && !Number.isFinite(v));
  }).length;
  if (nulos >= filas.length * maxNulosPct) {
    throw new Error(
      `campo "${nombre}": ${nulos} de ${filas.length} filas lo tienen nulo o no finito.
` +
      `  Eso NO es un dato escaso, es un campo roto. Y ojo: en JavaScript null <= 30 es TRUE,
` +
      `  así que un filtro sobre este campo estaría cogiendo la muestra entera sin avisar.`);
  }
}

/** dte recalculado aquí a partir de `dia` y `exp`, que sí son válidos, en vez de fiarse del guardado. */
const dteDe = (dia: string, exp: string): number => {
  const iso = dia.includes("-") ? dia : `${dia.slice(0, 4)}-${dia.slice(4, 6)}-${dia.slice(6, 8)}`;
  return Math.round((Date.parse(`${exp}T20:00:00Z`) - Date.parse(`${iso}T20:00:00Z`)) / 86_400_000);
};

/** Las cuatro categorías medibles, con las funciones de Victor SIN tocar. */
function categorias(f: Fila, repeticiones: number) {
  const anchoPct = f.ask > 0 ? (100 * (f.ask - f.bid)) / ((f.ask + f.bid) / 2) : null;
  const nivel = executionLevel(f.price, f.bid, f.ask, "unclear");

  // AGRESIVIDAD: cómo se ejecutó y de qué tamaño.
  const agresividad = media([executionScore(nivel), orderSizeScore(f.prima)]);

  // CONVICCIÓN: liquidez del contrato y peso del lado. Sin las otras operaciones del día no hay
  // dominancia real, así que se usa el peso de ESTA sobre el interés abierto — dato real.
  const pesoSobreOI = f.oi > 0 ? Math.min(100, (100 * f.size) / f.oi) : 0;
  const conviccion = media([spreadScore(anchoPct), dominanceScore(pesoSobreOI)]);

  // INUSUALIDAD: tamaño, hora y repetición sobre el mismo contrato.
  const inusualidad = media([volumeScore(f.size, f.prima), timingScore(f.ts + "Z"), repetitionScore(repeticiones)]);

  // IV/GRIEGAS: sólo si se pudo invertir la IV. Si no, null — no se rellena.
  const griegas = f.delta == null || f.gamma == null || f.theta == null ? null
    : media([
        deltaScore(f.delta), gammaScore(f.gamma),
        thetaScore(f.price > 0 ? Math.abs(f.theta) / f.price * 100 : null),
        legScore(f.variasPatas), expiryScore(f.dte),
      ]);

  return { agresividad, conviccion, inusualidad, griegas };
}

function total(c: ReturnType<typeof categorias>, pesos: Record<string, number>): number | null {
  if (c.griegas == null) return null;      // sin IV no hay total comparable
  const usados = pesos.aggression + pesos.conviction + pesos.unusuality + pesos.ivContext;
  return (c.agresividad * pesos.aggression + c.conviccion * pesos.conviction +
          c.inusualidad * pesos.unusuality + c.griegas * pesos.ivContext) / usados;
}

function main() {
  const crudas: Fila[] = JSON.parse(readFileSync(ENTRADA, "utf8"));
  if (!crudas.length) { console.error(`${ENTRADA} está vacío. No hay nada que puntuar.`); process.exit(1); }
  console.log(`filas medidas: ${crudas.length}\n`);

  // Repeticiones: cuántas veces se operó el MISMO contrato ese día.
  const veces = new Map<string, number>();
  for (const f of crudas) {
    const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
    veces.set(k, (veces.get(k) ?? 0) + 1);
  }

  // Los campos que se van a usar, comprobados de verdad ANTES de puntuar.
  for (const campo of ["pnl", "prima", "bid", "ask", "oi", "size", "price", "spot"] as const)
    comprobarCampo(crudas, campo);

  const filas = crudas.map((f) => {
    const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
    const conDte = { ...f, dte: dteDe(f.dia, f.exp) };      // NO se usa el dte guardado
    const c = categorias(conDte, veces.get(k) ?? 1);
    return { ...conDte, cat: c, victor: total(c, PESOS_VICTOR), eva: total(c, EVA_WEIGHTS as never) };
  });
  comprobarCampo(filas, "dte");
  const plazos = filas.map((f) => f.dte).sort((a, b) => a - b);
  console.log(`plazo (días al vencimiento): mínimo ${plazos[0]} · mediana ${plazos[plazos.length >> 1]} · ` +
              `máximo ${plazos[plazos.length - 1]} · a más de 30 días: ${filas.filter((f) => f.dte > 30).length}
`);

  const conTotal = filas.filter((f) => f.victor != null);
  comprobarDescarte(filas.length, conTotal.length, "filas con total puntuable");
  console.log(`con total puntuable (necesitan IV): ${conTotal.length} de ${filas.length} ` +
              `(${(100 * conTotal.length / filas.length).toFixed(0)}%)\n`);

  const aFecha = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const aBarrera = (fs: typeof filas): FilaHallazgo[] =>
    fs.map((f) => ({ pnl: f.pnl, ticker: f.ticker, fecha: aFecha(f.dia) }));

  // ── Las 14 pruebas declaradas ───────────────────────────────────────────────
  type Puntuada = (typeof filas)[number];
  const V = (f: Puntuada) => f.victor ?? 0;
  const pruebas: Array<{ nombre: string; conjunto: Puntuada[]; score: (f: Puntuada) => number }> = [
    { nombre: "TOTAL · pesos de Victor",  conjunto: conTotal, score: V },
    { nombre: "TOTAL · pesos de EVA",     conjunto: conTotal, score: (f) => f.eva ?? 0 },
    { nombre: "sólo agresividad",         conjunto: filas,    score: (f) => f.cat.agresividad },
    { nombre: "sólo convicción",          conjunto: filas,    score: (f) => f.cat.conviccion },
    { nombre: "sólo inusualidad",         conjunto: filas,    score: (f) => f.cat.inusualidad },
    { nombre: "sólo IV/griegas",          conjunto: conTotal, score: (f) => f.cat.griegas ?? 0 },
    { nombre: "TOTAL · sólo calls",       conjunto: conTotal.filter((f) => f.right === "C"), score: V },
    { nombre: "TOTAL · sólo puts",        conjunto: conTotal.filter((f) => f.right === "P"), score: V },
    { nombre: "TOTAL · ≤30 días",         conjunto: conTotal.filter((f) => f.dte <= 30), score: V },
    { nombre: "TOTAL · >30 días",         conjunto: conTotal.filter((f) => f.dte > 30), score: V },
    { nombre: "TOTAL · salida normal",    conjunto: conTotal.filter((f) => !f.salidaAdelantada), score: V },
    { nombre: "TOTAL · salida adelantada",conjunto: conTotal.filter((f) => f.salidaAdelantada), score: V },
    { nombre: "TOTAL · prima ≥ $20M",     conjunto: conTotal.filter((f) => f.prima >= 20e6), score: V },
    { nombre: "TOTAL · 2025 en adelante", conjunto: conTotal.filter((f) => f.dia >= "20250101"), score: V },
  ];

  const resultados: Array<{ nombre: string; pasa: boolean; t: number; n: number; sep: number }> = [];
  for (const { nombre, conjunto, score } of pruebas) {
    if (conjunto.length < 60) { console.log(`— ${nombre}: sólo ${conjunto.length} filas, no se mide.
`); continue; }
    const mapa = new Map<FilaHallazgo, number>();
    const fh = conjunto.map((f) => {
      const x: FilaHallazgo = { pnl: f.pnl, ticker: f.ticker, fecha: aFecha(f.dia) };
      mapa.set(x, score(f));
      return x;
    });
    const v = pasarBarrera(fh, (f) => mapa.get(f) ?? 0, { pruebas: PRUEBAS });
    console.log(informe(v, nombre));
    resultados.push({ nombre, pasa: v.pasa, t: v.detalle.t ?? 0, n: fh.length, sep: v.detalle.sep ?? 0 });
  }

  // ── Veredicto ───────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(78));
  const pasan = resultados.filter((r) => r.pasa);
  console.log(`PASAN LA BARRERA: ${pasan.length} de ${resultados.length} pruebas`);
  for (const r of resultados) {
    console.log(`  ${r.pasa ? "✓" : "·"} ${r.nombre.padEnd(30)} n=${String(r.n).padStart(6)} ` +
                `t=${r.t.toFixed(2).padStart(6)} separación=${(100 * r.sep).toFixed(2)}%`);
  }

  // ESCEPTICISMO SIMÉTRICO: la potencia se comprueba SIEMPRE, no sólo cuando falla todo. El
  // resultado que manda aquí es el TOTAL y es negativo; hay que saber si es «no existe» o «no lo
  // pudimos ver», pasen o no otras pruebas por su cuenta. Aplicar cribas sólo al lado positivo es
  // en sí mismo un sesgo: garantiza no encontrar nunca nada.
  console.log("\nEL TOTAL NO SEPARA. ¿Es «no existe» o «no lo pudimos ver»?\n");
  // Se mide contra DOS listones, porque la respuesta depende de qué ventaja se busque:
  //   2%  — el mínimo estadístico. Pero NO es operable: sólo la horquilla se lleva el 1,81% de la
  //         prima al entrar y salir, así que un 2% no deja nada en el bolsillo.
  //   10% — una ventaja que sí valdría la pena después de costes.
  for (const [efecto, nota] of [
    [0.02, "el mínimo estadístico — NO es operable, la horquilla se come el 1,81%"],
    [0.10, "una ventaja que sí valdría la pena después de costes"],
  ] as const) {
    const p = potencia(aBarrera(conTotal), efecto);
    console.log(`  buscando un ${(100 * efecto).toFixed(0)}% — ${nota}`);
    console.log(`    ${p.mensaje}`);
    console.log(`    → ${p.concluyente
      ? "CONCLUYENTE: con esta muestra se habría visto. No está."
      : "NO concluyente: hace falta más muestra."}\n`);
  }

  if (!pasan.length) {
    console.log("\nNINGUNA PASA.");
  } else {
    console.log("\nHay pruebas que pasan. NO se cree todavía: toca atacarlas con ultracode " +
                "(criterio de CLAUDE.md — cuando algo sale BIEN es cuando hay que escalar).");
  }
}

main();
