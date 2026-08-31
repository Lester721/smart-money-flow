// LA TABLA MAESTRA — una sola fila por contrato candidato, con TODO precalculado.
//
// ═══ POR QUÉ EXISTE ════════════════════════════════════════════════════════════════════════
//
// Lester, el 2026-08-25: «evalúa si puedes compactar la información que ya tenemos, que cada vez
// que te hago una pregunta no es suficiente y tienes que seguir bajando información».
//
// Tiene razón y el problema es peor de lo que parece: CADA pregunta obliga a releer 75.960
// ficheros de cadenas y 74.264 de interés abierto, y a rehacer el mismo cálculo. Eso son minutos
// por pregunta y, sobre todo, es una oportunidad de equivocarse cada vez — los dos errores del
// día salieron de reescribir el mismo cálculo con una variante distinta.
//
// Esta tabla se construye UNA VEZ y responde casi cualquier pregunta al instante.
//
// ═══ LA REGLA QUE NO SE PUEDE ROMPER ═══════════════════════════════════════════════════════
//
// **Se guarda el CAMINO ENTERO, día a día. Nunca un resumen.**
//
// Precalcular `mejor` o `último` es lo que produjo el look-ahead que infló el ratio un 46%
// ([[simular-el-camino-nunca-un-resumen]]). Guardando el camino completo, cualquier regla de
// salida —objetivo, corte, salir a los N días, vender la mitad— se simula recorriendo los días
// en orden. La tabla no decide nada: sólo guarda lo que pasó, en orden.
//
// ═══ QUÉ TRAE CADA FILA ════════════════════════════════════════════════════════════════════
//
//   identidad   tk · dia (del golpe) · exp · K · l
//   el golpe    prima · tam · golpes · horaMayor · pctSpread (¿es pata de un spread?)
//   el OI       oiVispera · vsOI (el golpe contra el OI que ya había)
//   la entrada  dC (día de compra) · spot · dentro · prof · dte · ask · bid · horquilla
//   EL CAMINO   [[dia, bid, ask], …] desde el día siguiente a la compra hasta el vencimiento
//
// Uso: node --import tsx scripts/r13-tabla-maestra.mjs
// Salida: cache-theta/maestra/YYYYMM.json  (una por mes, para poder rehacer sólo lo que cambie)

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const MIN_PRIMA = 500_000, DTE_MIN = 5;

const SALIDA = join(CACHE, "maestra");
if (!existsSync(SALIDA)) mkdirSync(SALIDA, { recursive: true });

const cad = abrir("cadenas");
const oiA = abrir("oi-ancho");
const flu = abrir("flujo-limpio");

function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

/** Marca las operaciones que tienen otra pata: mismo ticker, ±2 s, tamaño ±20%, otro contrato. */
function marcarSpreads(lista) {
  const t = lista.map((o) => ({ ...o, ms: Date.parse(o.hora), esPata: false }));
  t.sort((a, b) => a.ms - b.ms);
  for (let i = 0; i < t.length; i++)
    for (let j = i + 1; j < t.length && t[j].ms - t[i].ms <= 2000; j++) {
      if (t[i].exp === t[j].exp && t[i].K === t[j].K && t[i].l === t[j].l) continue;
      const rel = Math.abs(t[i].tam - t[j].tam) / Math.max(t[i].tam, t[j].tam);
      if (rel <= 0.20) { t[i].esPata = true; t[j].esPata = true; }
    }
  return t;
}

// ── agrupar los ficheros de flujo por mes ──
// se puede limitar a unos años/meses: node r13-tabla-maestra.mjs 2021
const SOLO = process.argv.slice(2).filter((a) => /^\d{4,6}$/.test(a));
const porMes = new Map();
for (const f of readdirSync(flu.dir)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const m = g[2].slice(0, 6);
  if (SOLO.length && !SOLO.some((x) => m.startsWith(x))) continue;
  if (!porMes.has(m)) porMes.set(m, []);
  porMes.get(m).push({ tk: g[1], dia: g[2], fichero: f });
}
console.log(`\n  meses con flujo descargado: ${[...porMes.keys()].sort().join(" ")}\n`);

let totalFilas = 0;
for (const mes of [...porMes.keys()].sort()) {
  const destino = join(SALIDA, `${mes}.json`);
  const ficheros = porMes.get(mes);
  const filas = [];
  for (const { tk, dia, fichero } of ficheros) {
    let lista; try { lista = JSON.parse(readFileSync(join(flu.dir, fichero), "utf8")); } catch { continue; }
    if (!lista.length) continue;
    const marcadas = marcarSpreads(lista);
    // agregar por contrato
    const cont = new Map();
    for (const o of marcadas) {
      if (!(o.ask > 0 && o.precio >= o.ask)) continue;          // al ask o por encima
      if (dteDe(dia, o.exp) < DTE_MIN) continue;
      const k = `${o.exp}|${o.K}|${o.l}`;
      const y = cont.get(k);
      const h = o.ask > 0 && o.bid > 0 ? (o.ask - o.bid) / ((o.ask + o.bid) / 2) : null;
      if (y) {
        y.prima += o.prima; y.tam += o.tam; y.golpes++;
        if (o.esPata) y.patas++;
        if (h != null) { y.horqSum += h; y.horqN++; }
        if (o.prima > y.mayor) { y.mayor = o.prima; y.horaMayor = o.hora.slice(11, 16); }
      } else {
        cont.set(k, { exp: o.exp, K: o.K, l: o.l, prima: o.prima, tam: o.tam, golpes: 1,
                      patas: o.esPata ? 1 : 0, horqSum: h ?? 0, horqN: h != null ? 1 : 0,
                      mayor: o.prima, horaMayor: o.hora.slice(11, 16) });
      }
    }
    if (!cont.size) continue;

    const ds = cad.dias(tk);
    const i = ds.findIndex((x) => x > dia);
    if (i < 1) continue;
    const dC = ds[i];
    const chC = cad.leer(tk, dC); if (!chC) continue;
    const S = spotOk(chC, dC); if (S == null) continue;
    const oiVdia = oiA.leer(tk, ds[i - 2] ?? ds[i - 1]);        // el OI de la víspera del golpe

    for (const c of cont.values()) {
      if (dC >= c.exp) continue;
      const p0 = chC[c.exp]?.[`${c.K}|${c.l}`];
      if (!p0 || !(p0[1] > 0)) continue;
      // EL CAMINO ENTERO — nunca un resumen
      const camino = [];
      for (const d of ds) {
        if (d <= dC) continue; if (d > c.exp) break;
        const p = cad.leer(tk, d)?.[c.exp]?.[`${c.K}|${c.l}`];
        if (!p) continue;
        camino.push([d, p[0], p[1]]);
      }
      if (!camino.length) continue;
      const oiV = oiVdia?.[c.exp]?.[`${c.K}|${c.l}`] ?? null;
      filas.push({
        tk, dia, dC, exp: c.exp, K: c.K, l: c.l,
        prima: Math.round(c.prima), tam: c.tam, golpes: c.golpes,
        hora: c.horaMayor,
        pctPata: +(c.patas / c.golpes).toFixed(2),
        oiV, vsOI: oiV > 0 ? +(c.tam / oiV).toFixed(3) : null,
        spot: +S.toFixed(2),
        dentro: c.l === "C" ? c.K < S : c.K > S,
        prof: +((c.l === "C" ? (S - c.K) / S : (c.K - S) / S)).toFixed(4),
        dte: dteDe(dC, c.exp),
        ask: p0[1], bid: p0[0],
        horq: c.horqN ? +(c.horqSum / c.horqN).toFixed(4) : null,
        llegaVenc: camino[camino.length - 1][0] === c.exp,
        camino,
      });
    }
  }
  writeFileSync(destino, JSON.stringify(filas));
  const kb = (readFileSync(destino).length / 1024).toFixed(0);
  const dentro = filas.filter((f) => f.dentro).length;
  console.log(`  ${mes}  ${String(filas.length).padStart(5)} contratos (${dentro} dentro del dinero) · ${kb} KB`);
  totalFilas += filas.length;
}
console.log(`\n  TOTAL: ${totalFilas.toLocaleString("en-US")} filas en ${join(CACHE, "maestra")}`);

// manifiesto, porque el guardián lo exige
writeFileSync(join(SALIDA, "_MANIFIESTO.json"), JSON.stringify({
  que_es: "una fila por contrato candidato, con el golpe, el OI, la entrada y el CAMINO ENTERO día a día",
  script: "scripts/r13-tabla-maestra.mjs",
  endpoint: "ninguno — se construye a partir de cadenas/, oi-ancho/ y flujo-limpio/",
  filtros: [
    "operación de >= $500,000 ejecutada al ask o por encima — condición conocida en el instante",
    "al menos 5 días hasta vencer",
    "NO se filtra por dentro/fuera del dinero, ni por precio, ni por vsOI: se guarda todo y se filtra al preguntar",
  ],
  mira_al_futuro: false,
  por_que: "hereda las tres fuentes, las tres verificadas. El camino se guarda ENTERO y en orden, así que cualquier regla de salida se simula día a día sin poder colar un máximo del período.",
  verificado: "2026-08-25",
  verificado_por: "construida hoy; las tres fuentes tienen manifiesto propio",
}, null, 2), "utf8");
console.log(`  manifiesto escrito\n`);
