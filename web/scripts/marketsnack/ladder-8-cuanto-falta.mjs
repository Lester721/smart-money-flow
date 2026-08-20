// ═══ GAMMA LADDER · PASO 8 — QUÉ LE FALTA PARA PODER RESPONDERSE ═══════════════════════
//
// ─── RETRACTACIÓN, PRIMERO ────────────────────────────────────────────────────────────────
// En el paso 7 dije que el cierre de MRNA del 2026-08-19 (174,38 viniendo de 62,96) era un valor
// CORRUPTO de MarketSnack. ERA MÍO EL ERROR. Lo "verifiqué" contra una barra del bróker marcada
// `interpolated:true` con volumen 0 — que es relleno de hueco y no lleva información. El cierre
// liquidado oficial, pedido por la ruta correcta (get_equity_quotes), es 174,38: EXACTO al de
// MarketSnack. El +177% es real. La serie de precios NO está corrupta y el paso 7 queda retirado.
//
// ─── LO QUE SÍ QUEDA EN PIE ───────────────────────────────────────────────────────────────
//   · el flujo histórico NO tiene contratos vencidos (82 días de 82) -> escalera imposible por ahí
//   · la escalera publicada por MarketSnack sí sirve, pero son 19 días x 36 tickers
//   · ninguna de las 28 pruebas pasa, y la potencia dice que NINGÚN negativo es concluyente
//
// ─── LO QUE HACE ESTE PASO ────────────────────────────────────────────────────────────────
// Traducir "no se pudo ver" en un número accionable: CUÁNTOS días y CUÁNTOS tickers de fotos de
// GEX hacen falta para que la pregunta tenga respuesta, y cuánto tendría que separar la señal
// para que pagara algo después del peaje. Si el efecto que hace falta para ganar dinero es más
// pequeño que el que la muestra puede ver, el trabajo es CONSEGUIR MUESTRA, no seguir midiendo.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-8-cuanto-falta.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const GEXDIR = path.join(BASE, "aux", "gex", "2026-08-19");
const CHART = path.join(BASE, "aux", "chart-all");
const leer = (p) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
const PRUEBAS = 28, LISTON = listonT(PRUEBAS);
const CUENTA = 56389;                      // la cuenta real de Lester

// ── horquillas REALES medidas con el broker el 2026-08-19 ────────────────────────────────
// Tomadas FUERA de sesion, asi que son MAS ANCHAS que las de media sesion: el peaje que sale
// aqui esta SOBREESTIMADO, y eso juega a favor de la estrategia, no en contra.
const HORQUILLAS = {
  AAPL: [316.91, 316.95], AMD: [471.98, 471.99], AMZN: [266.65, 266.70], APP: [312.75, 312.89],
  AVGO: [367.50, 367.65], BAC: [63.12, 63.29], COIN: [165.43, 165.64], GLD: [412.16, 412.30],
  GOOGL: [345.60, 345.68], HOOD: [98.32, 98.40], INTC: [93.97, 94.00], IWM: [302.08, 302.11],
  JNJ: [271.90, 273.25], META: [550.51, 550.68], MRNA: [163.45, 163.86], MSFT: [484.47, 484.53],
  MSTR: [108.11, 108.16], MU: [952.72, 952.99],
};
const relSpread = Object.entries(HORQUILLAS).map(([T, [b, a]]) => ({ T, s: (a - b) / ((a + b) / 2) }));
relSpread.sort((x, y) => x.s - y.s);
const medianaSpread = relSpread[Math.floor(relSpread.length / 2)].s;
console.log("═".repeat(100));
console.log("EL PEAJE — horquilla relativa REAL de " + relSpread.length + " de los 36 tickers (medida con el broker)");
console.log("═".repeat(100));
for (const r of relSpread) console.log("  " + r.T.padEnd(7) + (r.s * 10000).toFixed(2).padStart(8) + " pb");
console.log("  mediana: " + (medianaSpread * 10000).toFixed(2) + " pb  (fuera de sesion: SOBREESTIMA el coste real de media sesion)");

// ── reconstruccion de la serie diaria de separacion (la metrica menos mala) ──────────────
const cierre = new Map();
for (const f of fs.readdirSync(CHART)) {
  const j = leer(path.join(CHART, f));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const d = p.t.slice(0, 10); if (v.has(d)) continue; idx.set(d, fechas.length); fechas.push(d); v.set(d, p.v); }
  cierre.set(f.slice(0, -8), { fechas, v, idx });
}
function retorno(T, d, n, desf) {
  const s = cierre.get(T); if (!s) return null;
  const i0 = s.idx.get(d); if (i0 == null) return null;
  const i = i0 + desf, j = i + n;
  if (i < 0 || j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  return (a > 0 && b > 0) ? b / a - 1 : null;
}
const filas = [];
for (const fich of fs.readdirSync(GEXDIR)) {
  const T = fich.replace(".json.gz", "");
  if (!cierre.has(T)) continue;
  for (const p of leer(path.join(GEXDIR, fich))["1m"]?.data ?? []) {
    const S = p.asset_price, d = p.t.slice(0, 10);
    if (!(S > 0) || p.call_wall == null || p.put_wall == null) continue;
    filas.push({ ticker: T, fecha: d, distPutWall: (p.put_wall - S) / S, r5_1: retorno(T, d, 5, 1) });
  }
}
const porDia = new Map();
for (const f of filas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
const serie = [];
for (const d of [...porDia.keys()].sort()) {
  const g = porDia.get(d).filter((f) => f.r5_1 != null);
  if (g.length < 12) continue;
  const media = g.reduce((s, f) => s + f.r5_1, 0) / g.length;
  const ord = g.slice().sort((a, b) => b.distPutWall - a.distPutWall);
  const k = Math.floor(ord.length / 3);
  serie.push(ord.slice(0, k).reduce((s, f) => s + f.r5_1 - media, 0) / k - ord.slice(-k).reduce((s, f) => s + f.r5_1 - media, 0) / k);
}
const media = serie.reduce((a, b) => a + b, 0) / serie.length;
const sd = Math.sqrt(serie.reduce((a, x) => a + (x - media) ** 2, 0) / (serie.length - 1));
const tickersPorDia = Math.round(filas.length / porDia.size);
console.log("\n" + "═".repeat(100));
console.log("LA CANDIDATA MENOS MALA — distPutWall a 5 dias, entrada al cierre de D+1");
console.log("(la unica con el MISMO SIGNO en los tres tercios; se cae por el liston, no por el signo)");
console.log("═".repeat(100));
console.log("  dias con corte transversal: " + serie.length + "  ·  tickers por dia: ~" + tickersPorDia);
console.log("  separacion media por operacion: " + (media * 100).toFixed(3) + "%   desviacion tipica dia a dia: " + (sd * 100).toFixed(3) + "%");
console.log("  |t| observada: " + Math.abs(media / (sd / Math.sqrt(serie.length))).toFixed(2) + "   ·   liston con " + PRUEBAS + " pruebas: " + LISTON);

// ── cuanto tiene que separar para PAGAR ALGO ────────────────────────────────────────────
console.log("\n" + "═".repeat(100));
console.log("CUANTO TIENE QUE SEPARAR PARA PAGAR ALGO  (vehiculo: largo el tercio alto / corto el bajo)");
console.log("═".repeat(100));
const GROSS = CUENTA * 0.5;               // $28.194 en juego, mitad a cada lado
const REBAL = 252 / 5;                    // horizonte de 5 dias -> ~50 rotaciones al ano
console.log("  cuenta: $" + CUENTA.toLocaleString("es-ES") + "  ·  capital comprometido: $" + GROSS.toLocaleString("es-ES") + " (mitad largo, mitad corto)");
console.log("  rotaciones al ano con horizonte de 5 dias: " + REBAL.toFixed(0));
const peajePorRot = medianaSpread;        // cruzar la horquilla entera por vuelta completa, cada lado
const peajeAnual = peajePorRot * REBAL;
console.log("  peaje por rotacion: " + (peajePorRot * 10000).toFixed(2) + " pb  ->  al ano: " + (peajeAnual * 100).toFixed(2) + "% del capital comprometido = $" + (peajeAnual * GROSS).toFixed(0));
const sepBreakEven = peajePorRot;
console.log("\n  SEPARACION DE EQUILIBRIO (donde no se gana ni se pierde): " + (sepBreakEven * 100).toFixed(3) + "% por operacion");
for (const obj of [2000, 5000, 10000]) {
  const nec = (obj / (GROSS / 2) / REBAL) + sepBreakEven;
  console.log("  para ganar $" + obj.toLocaleString("es-ES") + "/ano hace falta separar " + (nec * 100).toFixed(3) + "% por operacion");
}

// ── LA MUESTRA QUE FALTA ────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(100));
console.log("LA MUESTRA QUE FALTA — dias de fotos de GEX necesarios, segun cuantos tickers se fotografien");
console.log("═".repeat(100));
console.log("La desviacion de la separacion diaria baja con la raiz del numero de tickers del corte:");
console.log("  sd(N tickers) = sd(" + tickersPorDia + ") x raiz(" + tickersPorDia + "/N)");
console.log("Y los dias necesarios para llegar al liston |t|=" + LISTON + " con un efecto E son  D = (liston x sd / E)^2\n");
const objetivos = [
  { nom: "equilibrio (no perder)", E: sepBreakEven },
  { nom: "$2.000/ano", E: (2000 / (GROSS / 2) / REBAL) + sepBreakEven },
  { nom: "$5.000/ano", E: (5000 / (GROSS / 2) / REBAL) + sepBreakEven },
];
console.log("objetivo                  efecto E    | dias necesarios con 36 / 100 / 250 / 434 tickers fotografiados");
console.log("─".repeat(100));
for (const o of objetivos) {
  const fila = [36, 100, 250, 434].map((N) => {
    const sdN = sd * Math.sqrt(tickersPorDia / N);
    const D = Math.ceil((LISTON * sdN / o.E) ** 2);
    return D > 5000 ? ">5000" : String(D);
  });
  console.log(o.nom.padEnd(24) + (o.E * 100).toFixed(3) + "%   |" + fila.map((x) => x.padStart(12)).join(""));
}
console.log("\n(434 tickers = todos los que tienen serie de precio en la API. Las fotos de GEX se piden");
console.log(" ticker a ticker, asi que fotografiar 434 al dia es una corrida nocturna, no un problema.)");

console.log("\n" + "═".repeat(100));
console.log("Y LO QUE NO SE ARREGLA CON MUESTRA");
console.log("═".repeat(100));
console.log("  · la retencion de /gex es de 27 dias: lo que no se fotografie HOY no existe manana.");
console.log("    Cada dia sin cron es un dia de muestra perdido para siempre.");
console.log("  · SPX, SPXW, NDX y VIX tienen escalera publicada pero NO precio en esta API. Son justo");
console.log("    donde la gamma manda mas. Su retorno hay que traerlo de otra fuente (ThetaData).");
console.log("  · la escalera del dia D solo se conoce al CIERRE de D (medido, paso 5). Cualquier");
console.log("    estrategia intradia sobre este dato necesita otra fuente, no esta.");

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-8-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), medianaSpread, tickersPorDia, diasSerie: serie.length,
  sepMedia: media, sdDiaria: sd, tObservada: media / (sd / Math.sqrt(serie.length)), liston: LISTON,
  sepBreakEven, objetivos: objetivos.map((o) => ({ ...o, dias: [36, 100, 250, 434].map((N) => Math.ceil((LISTON * sd * Math.sqrt(tickersPorDia / N) / o.E) ** 2)) })),
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-8-salida.json");
