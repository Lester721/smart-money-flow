// EL PUENTE — si ninguna PARADA toca el peor día, ¿qué lo toca?
//
// ═══ DE DÓNDE SALE ══════════════════════════════════════════════════════════════════════════
// La auditoría de las 35 reglas de parada deja una cosa clara y mecánica: el peor día del cóndor
// NO es un día especial del mercado. Es una identidad contable:
//
//        pérdida máxima = ancho del ala × 100 − crédito cobrado
//
// Con alas de 50 puntos eso son $5.000 − crédito. El peor día de los 653 (2024-04-04, −$4.900)
// es sencillamente el día en que el crédito fue más pequeño ($100) y el mercado atravesó el ala.
// Ninguna regla que decida SI operar puede mover ese número: sólo puede evitar el día entero, y
// para eso habría que saber cuál es. Lo único que mueve el tope es el ANCHO DEL ALA.
//
// Así que se mide. Misma entrada (11:00), mismos strikes vendidos (±25), mismos precios reales
// (bid al vender, ask al comprar, las cuatro patas), misma liquidación contra el cierre de las
// 16:00, misma comisión. Lo ÚNICO que cambia es a qué distancia se compra el ala.
//
// NO HAY NADA QUE ADIVINAR AQUÍ: no es una señal, es geometría. Por eso no entra en el divisor
// de Bonferroni de las 35 pruebas de parada — no se está buscando un régimen, se está midiendo
// el precio de un seguro que ya se está comprando.

import { readFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", SEP = 25, COMM = 0.03, DIAS_ANO = 252;
const ALAS = [50, 40, 30, 25, 20, 15, 10];
const CACHE = "scripts/cola-alas-filas.json";

const eur = (x) => (x == null || !isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = []; let ultSpot = 0, spot11 = 0, primerSpot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) { ultSpot = sp; if (!primerSpot) primerSpot = sp; if (h === HORA && !spot11) spot11 = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask });
  }
  return enHora.length ? { filas: enHora, spot11, cierre: ultSpot } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

let filas;
if (existsSync(CACHE)) {
  filas = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## " + filas.length + " días leídos de caché");
} else {
  const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  console.log("## leyendo " + fechas.length + " días de cadenas reales…");
  filas = [];
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 100 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P) continue;
    const sp11 = C.spot11, cierre = C.cierre;
    if (!(sp11 > 0) || !(cierre > 0)) continue;
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const fila = { fecha, sp11, cierre };
    let completo = true;
    for (const ala of ALAS) {
      const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
      // El ala tiene que existir DE VERDAD y por encima/debajo del strike vendido.
      // Si la cadena no tiene ese strike, NO se inventa: el día queda sin ese ancho y se dice.
      if (cL.K <= cC.K || pL.K >= pC.K) { completo = false; fila["pl" + ala] = null; fila["cr" + ala] = null; continue; }
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(cred > 0)) { fila["pl" + ala] = null; fila["cr" + ala] = null; completo = false; continue; }
      const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
                       - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * COMM;
      fila["pl" + ala] = pl; fila["cr" + ala] = cred * 100;
      fila["anchoC" + ala] = cL.K - cC.K; fila["anchoP" + ala] = pC.K - pL.K;
    }
    filas.push(fila);
  }
  writeFileSync(CACHE, JSON.stringify(filas), "utf8");
  console.log("   guardado: " + filas.length + " días");
}

// sólo los días en que TODOS los anchos existen — comparar peras con peras
const antes = filas.length;
const completos = filas.filter((f) => ALAS.every((a) => f["pl" + a] != null && isFinite(f["pl" + a])));
console.log("   días con los " + ALAS.length + " anchos disponibles: " + completos.length + " de " + antes +
            (antes - completos.length ? "  ·  " + (antes - completos.length) + " descartados porque la cadena NO tenía algún ala (no se rellena)" : ""));
if (completos.length < antes * 0.9) console.log("   ⚠️ se pierde más del 10% de los días: mirar qué anchos faltan antes de leer la tabla");

radiografia(completos, ALAS.flatMap((a) => ["pl" + a, "cr" + a]), "cóndores por ancho de ala", { maxCeros: 0.2 });

function metricas(pls) {
  let acum = 0, pico = 0, dd = 0;
  for (const x of pls) { acum += x; if (acum > pico) pico = acum; if (pico - acum > dd) dd = pico - acum; }
  const o = [...pls].sort((a, b) => a - b);
  const q = (p) => o[Math.min(o.length - 1, Math.floor(o.length * p))];
  const tot = pls.reduce((a, b) => a + b, 0);
  return { tot, porAno: (tot / pls.length) * DIAS_ANO, porOp: tot / pls.length,
           acierto: pls.filter((x) => x > 0).length / pls.length,
           peorDia: o[0], p1: q(0.01), p5: q(0.05), dd };
}

console.log("\n" + "═".repeat(118));
console.log("  EL ANCHO DEL ALA · " + completos.length + " días · mismos strikes vendidos (±" + SEP + "), mismos precios reales, misma liquidación");
console.log("═".repeat(118) + "\n");
console.log("| ala | tope teórico de pérdida | crédito medio | $/año | $/op | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA | $/año por cada $1.000 de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const res = {};
for (const a of ALAS) {
  const pls = completos.map((f) => f["pl" + a]);
  const m = metricas(pls); res[a] = m;
  const cr = media(completos.map((f) => f["cr" + a]));
  console.log("| **" + a + "** | " + eur(a * 100 - cr) + " | " + eur(cr) + " | " + eur(m.porAno) + " | " + eur(m.porOp) +
    " | " + (m.acierto * 100).toFixed(1) + "% | **" + eur(m.peorDia) + "** | " + eur(m.p1) + " | " + eur(m.p5) +
    " | **" + eur(m.dd) + "** | " + (m.porAno / (m.dd / 1000)).toFixed(0) + " |");
}

console.log("\n## EL INTERCAMBIO CONTRA EL ALA DE 50 (lo que se opera hoy)\n");
console.log("| ala | Δ$/año | Δ peor día | Δ peor racha | $ de caída eliminada por cada $1 de renta anual cedida |");
console.log("|---|---|---|---|---|");
const B = res[50];
for (const a of ALAS) {
  if (a === 50) continue;
  const m = res[a];
  const cedido = B.porAno - m.porAno, ahorroDia = B.peorDia - m.peorDia, ahorroDD = B.dd - m.dd;
  console.log("| " + a + " | " + eur(m.porAno - B.porAno) + " | " + eur(ahorroDia) + " | " + eur(ahorroDD) +
    " | " + (cedido > 0 ? (ahorroDD / cedido).toFixed(2) : (ahorroDD > 0 ? "∞ (gratis)" : "—")) + " |");
}

// ¿el resultado vive en un tercio? — mismo criterio de tercios que usa la barrera
console.log("\n## POR TERCIOS DEL PERÍODO — $/año de cada ancho\n");
const k = Math.floor(completos.length / 3);
console.log("| tercio | " + ALAS.map((a) => "ala " + a).join(" | ") + " |");
console.log("|---" + ALAS.map(() => "|---").join("") + "|");
const porTercio = {};
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? completos.slice(i * k, (i + 1) * k) : completos.slice(2 * k);
  const cel = ALAS.map((a) => { const m = metricas(g.map((f) => f["pl" + a])); porTercio[a] = porTercio[a] || []; porTercio[a].push(m.porAno); return eur(m.porAno); });
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + cel.join(" | ") + " |");
}
console.log("\n| tercio | " + ALAS.map((a) => "ala " + a).join(" | ") + " |  ← PEOR DÍA");
console.log("|---" + ALAS.map(() => "|---").join("") + "|");
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? completos.slice(i * k, (i + 1) * k) : completos.slice(2 * k);
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + ALAS.map((a) => eur(metricas(g.map((f) => f["pl" + a])).peorDia)).join(" | ") + " |");
}

// LA COMPROBACIÓN QUE IMPORTA: ¿es una identidad contable o una casualidad del período?
console.log("\n## ¿ES GEOMETRÍA O ES SUERTE? — el tope de pérdida contra el peor día realizado\n");
console.log("| ala | tope teórico (ala×100 − crédito del día) | peor día realizado | ¿coinciden? |");
console.log("|---|---|---|---|");
for (const a of ALAS) {
  const peorIdx = completos.reduce((b, f, i) => (f["pl" + a] < completos[b]["pl" + a] ? i : b), 0);
  const f = completos[peorIdx];
  const tope = a * 100 - f["cr" + a] - 8 * COMM;
  console.log("| " + a + " | " + eur(-tope) + " (día " + f.fecha + ", crédito " + eur(f["cr" + a]) + ") | " + eur(f["pl" + a]) +
    " | " + (Math.abs(-tope - f["pl" + a]) < 1 ? "**sí, exacto**" : "no") + " |");
}

writeFileSync("scripts/cola-alas-resultado.json", JSON.stringify({ n: completos.length, res, porTercio }, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-alas-resultado.json");
