// ¿SEPARA ALGO CUANDO SE COMPRA Y SE AGUANTA MESES? — el puntuador del test de largo plazo.
//
// Uso: npx tsx scripts/eva-comprar-largo-puntuar.ts
// Entrada: scripts/eva-largo-filas.json (lo produce eva-comprar-largo.mjs)
//
// El criterio completo está escrito en la cabecera de `eva-comprar-largo.mjs`, antes de que
// existiera ningún número. Aquí sólo se ejecuta.
//
// ═══ QUÉ SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// El resultado de cada fila NO es su retorno, es su retorno MENOS el de su cubo de control:
//
//        pnl = retorno(contrato que compró el dinero grande) − retorno(medio del cubo comparable)
//
// Así, si el mercado subió, subió el cubo también y la resta lo cancela. Lo que queda es sólo si
// eligieron MEJOR contrato que el promedio de contratos parecidos del mismo día.
//
// DOS BRAZOS, dos criterios de ordenación:
//
//   A) LA PUNTUACIÓN DE EVA — con las funciones de Victor sin tocar (lib/flow.ts). Tres de las
//      seis categorías: agresividad, convicción e inusualidad. Las otras tres no se pueden:
//      IV/griegas necesita invertir la IV (no está en el flujo), Estructura necesita el OI de toda
//      la cadena, y Confirmación usa barras posteriores (sería mirar al futuro). Se mide el ~50%
//      del peso y SE DICE, no se disimula.
//
//   B) DÓNDE CAYÓ EL PRECIO DENTRO DE LA HORQUILLA — (precio − bid) / (ask − bid). Cerca de 1 es
//      comprar contra la oferta: agresivo, alguien con prisa por entrar. Cerca de 0 es vender
//      contra la demanda. ESTE INGREDIENTE EVA NO LO TIENE, y es lo que uno diría que significa
//      "dinero inteligente entrando". Se mide aparte para ver si vale más que el scorecard entero.
//
// Las 12 pruebas declaradas: 4 horizontes × 2 brazos, más los 4 cortes call/put a 180 días.

import { readFileSync } from "node:fs";
import {
  volumeScore, timingScore, repetitionScore, spreadScore, dominanceScore,
  executionLevel, executionScore, orderSizeScore,
} from "../lib/flow";
import { EVA_WEIGHTS } from "../lib/scorecardEva";
import { pasarBarrera, potencia, comprobarDescarte, informe, tWelch, type FilaHallazgo } from "../lib/barreraHallazgos";
import { isMultiLegCondition } from "../lib/conditions";

const ENTRADA = process.env.EVA_LARGO_FILAS || "scripts/eva-largo-filas.json";
const PRUEBAS = 12;                       // declaradas de antemano, en la cabecera del medidor
const HORIZONTES = [30, 90, 180, 365];
const EFECTO_QUE_IMPORTA = 0.10;          // 10 puntos de ventaja sobre el cubo: lo que valdría la pena

interface Medida { t: number; c: number; d: number; n: number; ausenteT: boolean; ausentesC: number; diaSal: string }
interface Fila {
  ticker: string; dia: string; exp: string; strike: number; right: "C" | "P";
  ts: string; condition: number; dte: number; prima: number; size: number; oi: number;
  lado: string; askEnt: number; bidEnt: number; spreadRel: number | null;
  precioOper: number; bidOper: number; askOper: number; cubo: number;
  h: Record<string, Medida>;
}

const media = (x: number[]) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : 0);
const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(2)}%`;

/**
 * UN CAMPO PRESENTE PERO SIEMPRE NULO ES UN BUG, NO UN DATO. La misma comprobación que salvó la
 * medición de agosto, donde `dte` salió null en las 26.880 filas y `null <= 30` (que en JavaScript
 * es TRUE) dejó el filtro "≤30 días" quedándose con la muestra entera sin que fallara nada.
 */
function comprobarCampo<T>(filas: T[], nombre: keyof T & string, maxNulosPct = 0.9): void {
  const nulos = filas.filter((f) => {
    const v = f[nombre] as unknown;
    return v == null || (typeof v === "number" && !Number.isFinite(v));
  }).length;
  if (nulos >= filas.length * maxNulosPct)
    throw new Error(`campo "${nombre}": ${nulos} de ${filas.length} nulos o no finitos. Es un campo roto, no un dato escaso.`);
}

/** Las tres categorías que se pueden calcular sin griegas, con las funciones de Victor sin tocar. */
function puntuarEva(f: Fila, repeticiones: number): number {
  const anchoPct = f.askOper > 0 ? (100 * (f.askOper - f.bidOper)) / ((f.askOper + f.bidOper) / 2) : null;
  const nivel = executionLevel(f.precioOper, f.bidOper, f.askOper, "unclear");
  const agresividad = media([executionScore(nivel), orderSizeScore(f.prima)]);
  const pesoSobreOI = f.oi > 0 ? Math.min(100, (100 * f.size) / f.oi) : 0;
  const conviccion = media([spreadScore(anchoPct), dominanceScore(pesoSobreOI)]);
  const inusualidad = media([volumeScore(f.size, f.prima), timingScore(f.ts + "Z"), repetitionScore(repeticiones)]);
  const w = EVA_WEIGHTS as Record<string, number>;
  const usados = w.aggression + w.conviction + w.unusuality;
  return (agresividad * w.aggression + conviccion * w.conviction + inusualidad * w.unusuality) / usados;
}

/** Dónde cayó el precio dentro de la horquilla: 1 = contra la oferta, 0 = contra la demanda. */
function nivelHorquilla(f: Fila): number | null {
  const ancho = f.askOper - f.bidOper;
  if (!(f.bidOper > 0) || !(f.askOper > 0) || !(ancho > 0)) return null;
  return Math.max(0, Math.min(1, (f.precioOper - f.bidOper) / ancho));
}

function main() {
  const crudas: Fila[] = JSON.parse(readFileSync(ENTRADA, "utf8"));
  if (!crudas.length) { console.error(`${ENTRADA} vacío.`); process.exit(1); }
  console.log(`filas medidas: ${crudas.length.toLocaleString("es-ES")}\n`);

  for (const c of ["prima", "size", "oi", "precioOper", "bidOper", "askOper", "dte"] as const) comprobarCampo(crudas, c);

  // Repeticiones del MISMO contrato el mismo día — entrada de inusualidad.
  const veces = new Map<string, number>();
  for (const f of crudas) {
    const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`;
    veces.set(k, (veces.get(k) ?? 0) + 1);
  }

  const conPuntuacion = crudas.map((f) => ({
    f,
    eva: puntuarEva(f, veces.get(`${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`) ?? 1),
    horq: nivelHorquilla(f),
    variasPatas: isMultiLegCondition(f.condition),
  }));

  // ── Contexto descriptivo (NO pasa por la barrera, y se dice) ──────────────
  console.log("═══ CONTEXTO · seguir al flujo, sin ordenar por nada ═══");
  console.log("   (esto NO es un hallazgo: es la media cruda, sin las cuatro cribas)\n");
  console.log("horiz     n      retorno del flujo   retorno del cubo   DIFERENCIA    t vs cero");
  for (const H of HORIZONTES) {
    const m = conPuntuacion.filter((x) => x.f.h[H]).map((x) => x.f.h[H]);
    if (!m.length) continue;
    const d = m.map((x) => x.d);
    const sd = Math.sqrt(d.reduce((a, x) => a + (x - media(d)) ** 2, 0) / (d.length - 1));
    const tCero = (media(d) / (sd / Math.sqrt(d.length)));
    console.log(`${String(H).padStart(4)} d ${String(m.length).padStart(7)}   ` +
                `${pct(media(m.map((x) => x.t))).padStart(12)}   ${pct(media(m.map((x) => x.c))).padStart(14)}   ` +
                `${pct(media(d)).padStart(10)}   ${tCero.toFixed(2).padStart(8)}`);
  }

  // ── LA DIFERENCIA PAREADA, SOMETIDA A LAS MISMAS CRIBAS ───────────────────
  //
  // Lo de arriba es la media cruda y no vale como hallazgo. Si "seguir al flujo bate a su cubo"
  // va a decirse en voz alta, tiene que pasar lo mismo que le exigimos a todo lo demás:
  // tercios del mismo signo, ningún ticker por encima del 20%, y |t| sobre el listón.
  // `pasarBarrera` compara dos grupos ordenados por un criterio; aquí la pregunta es de UNA
  // muestra contra cero, así que las cribas se aplican a mano, con los mismos umbrales.
  console.log("\n\n═══ ¿AGUANTA \"SEGUIR AL FLUJO BATE A SU CUBO\" LAS CUATRO CRIBAS? ═══\n");
  const liston = 2.87;                       // Bonferroni para 12 pruebas, igual que arriba
  for (const H of HORIZONTES) {
    const sel = conPuntuacion.filter((x) => x.f.h[H]);
    if (sel.length < 200) continue;
    const filas = sel.map((x) => ({
      d: x.f.h[H].d, ticker: x.f.ticker,
      fecha: `${x.f.dia.slice(0, 4)}-${x.f.dia.slice(4, 6)}-${x.f.dia.slice(6, 8)}`,
    }));
    const tDeCero = (v: number[]) => {
      const m = media(v);
      const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
      return m / (sd / Math.sqrt(v.length));
    };
    const motivos: string[] = [];

    if (filas.length < 200) motivos.push(`muestra de ${filas.length}`);

    const cuenta = new Map<string, number>();
    for (const f of filas) cuenta.set(f.ticker, (cuenta.get(f.ticker) ?? 0) + 1);
    const mayores = [...cuenta].map(([t, n]) => ({ t, pct: n / filas.length })).sort((a, b) => b.pct - a.pct);
    if (mayores[0].pct > 0.2)
      motivos.push(`${mayores[0].t} es el ${(mayores[0].pct * 100).toFixed(1)}% (máximo 20%)`);

    const ord = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const k = Math.floor(ord.length / 3);
    const tercios = [0, 1, 2].map((i) => (i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k)));
    const mt = tercios.map((g) => media(g.map((x) => x.d)));
    if (!(Math.sign(mt[0]) === Math.sign(mt[1]) && Math.sign(mt[1]) === Math.sign(mt[2])))
      motivos.push(`el signo no se repite en los tres tercios (${mt.map((x) => pct(x)).join(" · ")})`);

    const t = tDeCero(filas.map((x) => x.d));
    if (Math.abs(t) < liston) motivos.push(`t = ${t.toFixed(2)} por debajo de ${liston}`);

    // Sin los dos tickers que dominan: si el efecto vive ahí, no es del criterio.
    const sinDos = filas.filter((f) => f.ticker !== "NVDA" && f.ticker !== "TSLA");
    const tSin = sinDos.length > 30 ? tDeCero(sinDos.map((x) => x.d)) : NaN;

    console.log(`${String(H).padStart(4)} d  ${motivos.length ? "⛔ NO PASA" : "✅ PASA"}  ` +
                `· media ${pct(media(filas.map((x) => x.d)))} · t ${t.toFixed(2)}`);
    console.log(`        tercios: ${mt.map((x) => pct(x)).join(" · ")}`);
    console.log(`        mayor ticker: ${mayores[0].t} ${(mayores[0].pct * 100).toFixed(1)}%` +
                ` · 2º ${mayores[1].t} ${(mayores[1].pct * 100).toFixed(1)}%`);
    console.log(`        sin NVDA ni TSLA: n=${sinDos.length} · media ${pct(media(sinDos.map((x) => x.d)))}` +
                ` · t ${Number.isFinite(tSin) ? tSin.toFixed(2) : "—"}`);
    for (const m of motivos) console.log(`        ✗ ${m}`);
  }

  // ── Las 12 pruebas declaradas ─────────────────────────────────────────────
  const resultados: { nombre: string; v: ReturnType<typeof pasarBarrera>; n: number }[] = [];

  const correr = (nombre: string, sel: typeof conPuntuacion, H: number, criterio: "eva" | "horq") => {
    const antes = sel.length;
    const filas: FilaHallazgo[] = [];
    const claves: number[] = [];
    for (const x of sel) {
      const m = x.f.h[H];
      if (!m) continue;
      const k = criterio === "eva" ? x.eva : x.horq;
      if (k == null || !Number.isFinite(k)) continue;
      filas.push({ pnl: m.d, ticker: x.f.ticker, fecha: `${x.f.dia.slice(0, 4)}-${x.f.dia.slice(4, 6)}-${x.f.dia.slice(6, 8)}` });
      claves.push(k);
    }
    // Si el filtro se comió casi todo, es un bug, no un resultado.
    comprobarDescarte(antes, filas.length || 1, `${nombre} (selección)`, 0.97);
    if (filas.length < 50) { console.log(`\n⚠ ${nombre}: sólo ${filas.length} filas, no se corre`); return; }
    const idx = new Map(filas.map((f, i) => [f, claves[i]]));
    const v = pasarBarrera(filas, (f) => idx.get(f)!, { pruebas: PRUEBAS, nMinimo: 200 });
    resultados.push({ nombre, v, n: filas.length });
  };

  for (const H of HORIZONTES) {
    correr(`A · EVA · ${H} d`, conPuntuacion, H, "eva");
    correr(`B · horquilla · ${H} d`, conPuntuacion, H, "horq");
  }
  const calls = conPuntuacion.filter((x) => x.f.right === "C");
  const puts = conPuntuacion.filter((x) => x.f.right === "P");
  correr("A · EVA · 180 d · calls", calls, 180, "eva");
  correr("A · EVA · 180 d · puts", puts, 180, "eva");
  correr("B · horquilla · 180 d · calls", calls, 180, "horq");
  correr("B · horquilla · 180 d · puts", puts, 180, "horq");

  console.log(`\n\n═══ LAS ${PRUEBAS} PRUEBAS DECLARADAS ═══`);
  console.log(`(listón de Bonferroni para ${PRUEBAS} pruebas: |t| ≥ ${resultados[0]?.v.detalle.listonT ?? "?"})\n`);
  console.log("prueba                             n        separación        t     ¿pasa?");
  for (const r of resultados) {
    const d = r.v.detalle;
    console.log(`${r.nombre.padEnd(32)} ${String(r.n).padStart(6)}   ${(d.sep == null ? "—" : pct(d.sep)).padStart(10)}   ` +
                `${(d.t == null ? "—" : d.t.toFixed(2)).padStart(6)}     ${r.v.pasa ? "✅ SÍ" : "no"}`);
  }

  const pasan = resultados.filter((r) => r.v.pasa);
  console.log(`\n${pasan.length} de ${resultados.length} pasan las cuatro cribas.`);
  for (const r of pasan) console.log("\n" + informe(r.v, r.nombre));

  // ── SI NO PASA NADA: ¿tenía fuerza la prueba? ─────────────────────────────
  if (!pasan.length) {
    console.log("\n═══ POTENCIA · ¿podía esta muestra ver un efecto que valiera la pena? ═══");
    console.log("(el escepticismo también se aplica al negativo: un 'no hay nada' con muestra");
    console.log(" pequeña significa 'no lo pudimos ver', que no es lo mismo)\n");
    for (const H of HORIZONTES) {
      const filas: FilaHallazgo[] = conPuntuacion.filter((x) => x.f.h[H]).map((x) => ({
        pnl: x.f.h[H].d, ticker: x.f.ticker,
        fecha: `${x.f.dia.slice(0, 4)}-${x.f.dia.slice(4, 6)}-${x.f.dia.slice(6, 8)}`,
      }));
      if (filas.length < 50) continue;
      const p = potencia(filas, EFECTO_QUE_IMPORTA);
      console.log(`  ${String(H).padStart(3)} d · n=${String(filas.length).padStart(6)} · detectable ${pct(p.detectable)} · ` +
                  `${p.concluyente ? "CONCLUYENTE (un 10% se habría visto)" : "NO concluyente"}`);
    }
  }

  // ── Reparto, para que se vea de dónde sale la muestra ─────────────────────
  console.log("\n═══ REPARTO DE LA MUESTRA (180 d) ═══");
  const m180 = conPuntuacion.filter((x) => x.f.h[180]);
  const porTicker = new Map<string, number>();
  for (const x of m180) porTicker.set(x.f.ticker, (porTicker.get(x.f.ticker) ?? 0) + 1);
  for (const [t, n] of [...porTicker].sort((a, b) => b[1] - a[1]))
    console.log(`  ${t.padEnd(6)} ${String(n).padStart(6)}  ${((n / m180.length) * 100).toFixed(1)}%`);
  const porLado = new Map<string, number>();
  for (const x of m180) porLado.set(x.f.lado, (porLado.get(x.f.lado) ?? 0) + 1);
  console.log("  ── lado ──");
  for (const [l, n] of [...porLado].sort((a, b) => b[1] - a[1]))
    console.log(`  ${l.padEnd(10)} ${String(n).padStart(6)}  ${((n / m180.length) * 100).toFixed(1)}%`);
}

main();
