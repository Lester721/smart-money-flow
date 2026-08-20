// ¿QUÉ TENÍA 2023 DE DISTINTO? — el retrato anual del cóndor 0DTE sobre SPXW.
//
// LA PREGUNTA DE LESTER, LITERAL. 2023 es el peor año del cóndor (−$6.718 con ±25, −$9.052 con
// el filtro de amplitud). 2022, con mercado bajista y el índice cayendo un 25%, GANÓ $7.084.
// Aquí se caracteriza 2023 contra los otros cuatro años con TODO lo que es observable, y después
// se contesta lo único que importa de verdad:
//
//        ¿era 2023 distinguible MIENTRAS OCURRÍA, o sólo al mirar atrás?
//
// ═══ DE DÓNDE SALE CADA NÚMERO ════════════════════════════════════════════════════════════
// · Cadenas 0DTE de SPXW cada 5 min: scripts/cache-theta/gex-2026/iv_AAAA-MM-DD_{C,P}.csv
// · Precios REALES en las cuatro patas: bid al vender, ask al comprar. $0,03 por pata.
// · El spot de SPX sale de la propia cadena (columna underlying_price), no de otra serie: NO se
//   cruzan feeds distintos (la trampa de las etiquetas de tiempo).
// · La serie de cierres diarios de SPX se construye con el ÚLTIMO underlying_price de cada día.
// · NO hay VIX antes de 2024 en disco (scripts/cache-theta/vol-indices/VIX.json empieza el
//   2024-01-02). SE DICE. La volatilidad implícita de este informe sale de la PROPIA cadena:
//   el straddle del dinero a las 11:00, que es lo que de verdad te pagan.
//
// ═══ NADA OBSERVABLE DESPUÉS DE DECIDIR ENTRA EN LA DECISIÓN ══════════════════════════════
// Las medias móviles causales usan SÓLO días ESTRICTAMENTE anteriores (D−1 hacia atrás). Lo
// único del día D que entra en una señal es lo que ya se ve a las 11:00 (spot y primas).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/regimen-2023-retrato.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ─── PRUEBAS DECLARADAS ────────────────────────────────────────────────────────────────────
// El retrato anual NO es una prueba: es descripción, no se elige nada con él.
// Las pruebas son las 5 señales causales × 2 direcciones del corte = 10.
// Sobre estos MISMOS días el proyecto lleva ~242 declaradas (síntesis del cóndor) + 16 regímenes.
const PRUEBAS_HOY = 10;
const PRUEBAS_ACUMULADAS = 242 + 16 + PRUEBAS_HOY;
const LISTON = listonT(PRUEBAS_ACUMULADAS);

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50, DIST = 25;
const CUENTA = 56389;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const eur = (x) => (!Number.isFinite(x) ? "—" : (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES"));
const pc1 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");
const pc2 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(2) + "%" : "—");
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const racha = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; };

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · LECTOR — el mismo de comparar-tres-por-ano.mjs, ampliado para devolver el CAMINO intradía
// ═══════════════════════════════════════════════════════════════════════════════════════════
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"].map((c) => cab.indexOf(c));
  // Un campo que no existe se lee como 0. Aquí LANZA.
  if (idx.slice(0, 5).some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU, iIV] = idx;
  const enHora = [];
  const camino = new Map();          // hora -> spot (para la excursión intradía)
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) { if (h >= hFin) { hFin = h; cierre = sp; } if (!camino.has(h)) camino.set(h, sp); }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    const iv = iIV >= 0 ? Number(c[iIV]) : NaN;
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp, iv });
  }
  return enHora.length ? { filas: enHora, cierre, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();

const dias = [];
const descartes = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartes.push([fecha, "sin cadena a las " + HORA]); continue; }
  if (!(C.cierre > 0)) { descartes.push([fecha, "sin cierre del subyacente"]); continue; }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) { descartes.push([fecha, "spot de las 11:00 = 0"]); continue; }

  // EL PRECIO DE LA VOLATILIDAD, sin modelo: el straddle del dinero a las 11:00.
  const kA = cerca(C.filas, sp11);
  const pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;
  if (!(straddle > 0)) { descartes.push([fecha, "straddle del dinero <= 0"]); continue; }
  // La IV que publica el proveedor, cuando la publica. Tiene HUECOS: se cuenta y se dice.
  const ivATM = Number.isFinite(kA.iv) && kA.iv > 0 && Number.isFinite(pA.iv) && pA.iv > 0 ? (kA.iv + pA.iv) / 2 : NaN;

  // EL CÓNDOR ±25 · alas 50 — precios reales en las cuatro patas.
  const cC = cerca(C.filas, sp11 + DIST), pC = cerca(P.filas, sp11 - DIST);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { descartes.push([fecha, "no hay ala completa"]); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { descartes.push([fecha, "crédito no positivo"]); continue; }
  const S = C.cierre;
  const danoCall = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
  const danoPut = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
  const pl = (cred - danoCall - danoPut) * 100 - 8 * COMM;

  // EL CAMINO de 11:00 al cierre — cuánto llegó a acercarse a las patas aunque volviera.
  const horas = [...C.camino.entries()].filter(([h]) => h >= HORA).sort((a, b) => a[0].localeCompare(b[0]));
  const path = horas.map(([, s]) => s);
  const maxIntra = path.length ? Math.max(...path) : S;
  const minIntra = path.length ? Math.min(...path) : S;

  dias.push({
    fecha, ano: fecha.slice(0, 4), sp11, cierre: S,
    straddle, primaPct: straddle / sp11, ivATM,
    credito: cred * 100, pl, danoCall: danoCall * 100, danoPut: danoPut * 100,
    kCall: cC.K, kPut: pC.K,
    mov: S - sp11, movAbs: Math.abs(S - sp11), movPct: Math.abs(S - sp11) / sp11,
    // ¿te pagaron por el movimiento que ocurrió? >1 = la prima estaba BARATA ese día.
    razon: Math.abs(S - sp11) / straddle,
    rompeCall: S > cC.K ? 1 : 0, rompePut: S < pC.K ? 1 : 0,
    rompe: S > cC.K || S < pC.K ? 1 : 0,
    // TOCADO: llegó a pasar la pata en algún momento aunque cerrara dentro.
    tocaCall: maxIntra > cC.K ? 1 : 0, tocaPut: minIntra < pC.K ? 1 : 0,
    toca: maxIntra > cC.K || minIntra < pC.K ? 1 : 0,
    excCall: (maxIntra - sp11) / sp11, excPut: (sp11 - minIntra) / sp11,
    rango: (maxIntra - minIntra) / sp11,
    anchoPct: DIST / sp11,          // la vara que se encoge sola: ±25 como % del índice
    ptos: 1,
  });
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ─── SERIE DE CIERRES DIARIOS DE SPX (del propio fichero de cadenas) ───────────────────────
for (let i = 0; i < dias.length; i++) {
  dias[i].retD = i === 0 ? NaN : dias[i].cierre / dias[i - 1].cierre - 1;
}

console.log("═".repeat(118));
console.log("¿QUÉ TENÍA 2023 DE DISTINTO? — retrato anual del cóndor de hierro 0DTE sobre SPXW (±25 · alas 50 · entrada 11:00 ET)");
console.log("═".repeat(118));
console.log(`\nDías con cadena utilizable: ${dias.length} de ${fechas.length} fechas en disco.`);
if (descartes.length) {
  const porQue = {};
  for (const [, m] of descartes) porQue[m] = (porQue[m] || 0) + 1;
  console.log(`SE DICE, NO SE RELLENA — ${descartes.length} fecha(s) fuera: ${Object.entries(porQue).map(([k, v]) => `${v} por ${k}`).join(" · ")}`);
}
const covIV = dias.filter((d) => Number.isFinite(d.ivATM)).length;
console.log(`SE DICE — el VIX en disco EMPIEZA EN 2024 (vol-indices/VIX.json). No se usa: no cubre 2022 ni 2023.`);
console.log(`SE DICE — implied_vol del proveedor sólo está en ${covIV} de ${dias.length} días (${pc1(covIV / dias.length)}). Se informa aparte y no decide nada.`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas sobre estos mismos días: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);

radiografia(dias, ["pl", "credito", "straddle", "primaPct", "movAbs", "movPct", "razon", "rango", "anchoPct"], "retrato 2023", { maxCeros: 0.25 });

const anos = [...new Set(dias.map((d) => d.ano))].sort();
const porAno = Object.fromEntries(anos.map((a) => [a, dias.filter((d) => d.ano === a)]));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL RETRATO — todo lo observable, año a año
// ═══════════════════════════════════════════════════════════════════════════════════════════
const FILAS = [
  ["días medidos", (g) => String(g.length), "n"],
  ["primer día → último", (g) => `${g[0].fecha} → ${g[g.length - 1].fecha}`, ""],
  ["— RESULTADO —", () => "", ""],
  ["P&L del año (1 contrato)", (g) => eur(suma(g.map((d) => d.pl))), "$"],
  ["$/año normalizado a 252 sesiones", (g) => eur(suma(g.map((d) => d.pl)) / (g.length / 252)), "$"],
  ["acierto (días en verde)", (g) => pc1(g.filter((d) => d.pl > 0).length / g.length), ""],
  ["peor día", (g) => eur(Math.min(...g.map((d) => d.pl))), "$"],
  ["peor racha del año", (g) => eur(racha(g.map((d) => d.pl))), "$"],
  ["— LO QUE TE PAGAN —", () => "", ""],
  ["crédito medio del cóndor", (g) => eur(media(g.map((d) => d.credito))), "$"],
  ["straddle del dinero a las 11:00", (g) => "$" + media(g.map((d) => d.straddle)).toFixed(1), "pts"],
  ["  · como % del índice", (g) => pc2(media(g.map((d) => d.primaPct))), ""],
  ["  · rango (p10 → p90) del % ", (g) => `${pc2(q(g.map((d) => d.primaPct), 0.1))} → ${pc2(q(g.map((d) => d.primaPct), 0.9))}`, ""],
  ["  · desviación típica del %", (g) => pc2(sd(g.map((d) => d.primaPct))), ""],
  ["IV del dinero (proveedor, con huecos)", (g) => { const v = g.map((d) => d.ivATM).filter(Number.isFinite); return v.length ? `${pc1(media(v))} (n=${v.length})` : "sin dato"; }, ""],
  ["— LO QUE OCURRE —", () => "", ""],
  ["movimiento medio 11:00 → cierre", (g) => media(g.map((d) => d.movAbs)).toFixed(1), "pts"],
  ["  · como % del índice", (g) => pc2(media(g.map((d) => d.movPct))), ""],
  ["  · p90 del movimiento %", (g) => pc2(q(g.map((d) => d.movPct), 0.9)), ""],
  ["rango intradía medio 11:00 → cierre", (g) => pc2(media(g.map((d) => d.rango))), ""],
  ["vol. realizada close-to-close anualizada", (g) => pc1(sd(g.map((d) => d.retD).filter(Number.isFinite)) * Math.sqrt(252)), ""],
  ["días de movimiento GRANDE (>1% en 5h)", (g) => `${g.filter((d) => d.movPct > 0.01).length} (${pc1(g.filter((d) => d.movPct > 0.01).length / g.length)})`, ""],
  ["— DÓNDE PEGA —", () => "", ""],
  ["días que ROMPEN una pata al cierre", (g) => `${suma(g.map((d) => d.rompe))} (${pc1(media(g.map((d) => d.rompe)))})`, ""],
  ["  · por arriba (call)", (g) => `${suma(g.map((d) => d.rompeCall))} (${pc1(media(g.map((d) => d.rompeCall)))})`, ""],
  ["  · por abajo (put)", (g) => `${suma(g.map((d) => d.rompePut))} (${pc1(media(g.map((d) => d.rompePut)))})`, ""],
  ["días que TOCAN una pata (aunque vuelvan)", (g) => `${suma(g.map((d) => d.toca))} (${pc1(media(g.map((d) => d.toca)))})`, ""],
  ["daño medio por la call", (g) => eur(media(g.map((d) => d.danoCall))), "$"],
  ["daño medio por la put", (g) => eur(media(g.map((d) => d.danoPut))), "$"],
  ["— LA PRIMA CONTRA EL MOVIMIENTO —", () => "", ""],
  ["razón |movimiento| / straddle · MEDIA", (g) => n2(media(g.map((d) => d.razon))), ""],
  ["razón |movimiento| / straddle · MEDIANA", (g) => n2(q(g.map((d) => d.razon), 0.5)), ""],
  ["días con razón > 1 (la prima NO cubrió)", (g) => `${g.filter((d) => d.razon > 1).length} (${pc1(g.filter((d) => d.razon > 1).length / g.length)})`, ""],
  ["— EL ÍNDICE —", () => "", ""],
  ["SPX: primer cierre → último cierre", (g) => `${Math.round(g[0].cierre)} → ${Math.round(g[g.length - 1].cierre)}`, ""],
  ["  · variación del período medido", (g) => pc1(g[g.length - 1].cierre / g[0].cierre - 1), ""],
  ["  · % de días al alza (cierre a cierre)", (g) => pc1(g.filter((d) => d.retD > 0).length / g.filter((d) => Number.isFinite(d.retD)).length), ""],
  ["± 25 puntos como % del índice", (g) => pc2(media(g.map((d) => d.anchoPct))), ""],
  ["±25 en múltiplos del straddle", (g) => n2(media(g.map((d) => DIST / d.straddle))), ""],
];

console.log(`\n\n${"─".repeat(118)}\nTABLA 1 · EL RETRATO ANUAL — todo lo observable, año a año. **2023 es la columna que hay que explicar.**\n${"─".repeat(118)}\n`);
console.log(`| | ${anos.map((a) => (a === "2023" ? `**${a}**` : a)).join(" | ")} |`);
console.log(`|---|${anos.map(() => "---").join("|")}|`);
for (const [nom, fn] of FILAS) {
  if (nom.startsWith("—")) { console.log(`| **${nom.replace(/—/g, "").trim()}** |${anos.map(() => " ").join("|")}|`); continue; }
  console.log(`| ${nom} | ${anos.map((a) => fn(porAno[a])).join(" | ")} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA DESCOMPOSICIÓN — el P&L es crédito menos daño. ¿2023 cobró poco o pagó mucho?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 2 · ¿COBRÓ POCO O PAGÓ MUCHO? — el P&L diario es CRÉDITO − DAÑO − comisión. Se abre en dos.\n${"─".repeat(118)}\n`);
console.log("| año | crédito cobrado (año) | daño pagado (año) | P&L | crédito medio/día | daño medio/día | daño / crédito |");
console.log("|---|---|---|---|---|---|---|");
const desc = {};
for (const a of anos) {
  const g = porAno[a];
  const cr = suma(g.map((d) => d.credito)), da = suma(g.map((d) => d.danoCall + d.danoPut));
  desc[a] = { cr, da, ratio: da / cr };
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${eur(cr)} | ${eur(-da)} | ${eur(suma(g.map((d) => d.pl)))} | ${eur(cr / g.length)} | ${eur(-da / g.length)} | **${n2(da / cr)}** |`);
}

// El contrafactual honesto: 2023 con el crédito medio de CADA otro año, y al revés.
console.log(`\n\nTABLA 2b · EL CONTRAFACTUAL — se sustituye una pieza a la vez y se ve cuál mueve el resultado.\n`);
console.log("| escenario | P&L de 2023 | diferencia contra el 2023 real |");
console.log("|---|---|---|");
const g23 = porAno["2023"];
const real23 = suma(g23.map((d) => d.pl));
const otros = dias.filter((d) => d.ano !== "2023");
const credOtros = media(otros.map((d) => d.credito));
const danoOtros = media(otros.map((d) => d.danoCall + d.danoPut));
console.log(`| 2023 real | ${eur(real23)} | — |`);
const conCredOtros = suma(g23.map((d) => credOtros - (d.danoCall + d.danoPut) - 8 * COMM));
console.log(`| 2023 con el CRÉDITO medio de los otros 4 años (${eur(credOtros)}/día), su propio daño | ${eur(conCredOtros)} | ${eur(conCredOtros - real23)} |`);
const conDanoOtros = suma(g23.map((d) => d.credito - danoOtros - 8 * COMM));
console.log(`| 2023 con su propio crédito, el DAÑO medio de los otros 4 años (${eur(danoOtros)}/día) | ${eur(conDanoOtros)} | ${eur(conDanoOtros - real23)} |`);
console.log(`\n(no es una simulación de otra estrategia: es aritmética sobre los MISMOS días, para ver qué pieza pesa)`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA COLA — el año no lo hacen los 250 días, lo hacen 5
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 3 · ¿ES EL AÑO O SON CINCO DÍAS? — se quitan los N peores días de cada año.\n${"─".repeat(118)}\n`);
console.log("| año | P&L real | sin el peor día | sin los 3 peores | sin los 5 peores | sin los 10 peores | P&L de los 5 peores |");
console.log("|---|---|---|---|---|---|---|");
for (const a of anos) {
  const g = [...porAno[a]].sort((x, y) => x.pl - y.pl);
  const tot = suma(g.map((d) => d.pl));
  const quita = (k) => eur(suma(g.slice(k).map((d) => d.pl)));
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${eur(tot)} | ${quita(1)} | ${quita(3)} | ${quita(5)} | ${quita(10)} | ${eur(suma(g.slice(0, 5).map((d) => d.pl)))} |`);
}

console.log(`\n\nLOS 10 PEORES DÍAS DE 2023 — con lo que se veía a las 11:00 al lado.\n`);
console.log("| fecha | P&L | crédito | straddle 11:00 | movimiento real | razón mov/straddle | rompió |");
console.log("|---|---|---|---|---|---|---|");
for (const d of [...g23].sort((a, b) => a.pl - b.pl).slice(0, 10))
  console.log(`| ${d.fecha} | ${eur(d.pl)} | ${eur(d.credito)} | ${d.straddle.toFixed(1)} pts (${pc2(d.primaPct)}) | ${d.mov > 0 ? "+" : "−"}${d.movAbs.toFixed(1)} pts (${pc2(d.movPct)}) | ${n2(d.razon)} | ${d.rompeCall ? "CALL" : d.rompePut ? "PUT" : "no"} |`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5 · MES A MES — para ver si 2023 fue el año entero o un tramo
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 4 · 2023 MES A MES — ¿el año entero o un tramo?\n${"─".repeat(118)}\n`);
console.log("| mes | días | P&L | crédito medio | straddle medio (% índice) | mov. medio (% índice) | razón media | rompen |");
console.log("|---|---|---|---|---|---|---|---|");
const meses = [...new Set(g23.map((d) => d.fecha.slice(0, 7)))].sort();
for (const m of meses) {
  const g = g23.filter((d) => d.fecha.startsWith(m));
  console.log(`| ${m} | ${g.length} | ${eur(suma(g.map((d) => d.pl)))} | ${eur(media(g.map((d) => d.credito)))} | ${pc2(media(g.map((d) => d.primaPct)))} | ${pc2(media(g.map((d) => d.movPct)))} | ${n2(media(g.map((d) => d.razon)))} | ${suma(g.map((d) => d.rompe))} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6 · LA PREGUNTA QUE IMPORTA — ¿era distinguible MIENTRAS OCURRÍA?
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Cinco señales causales. Todas se calculan con días ESTRICTAMENTE anteriores (D−1 hacia atrás),
// salvo la prima de HOY, que ya se ve a las 11:00 antes de entrar.
for (let i = 0; i < dias.length; i++) {
  const prev = dias.slice(Math.max(0, i - 20), i);      // D−20 … D−1
  const prev60 = dias.slice(Math.max(0, i - 60), i);
  dias[i].listo = i >= 60;
  if (!dias[i].listo) continue;
  dias[i].razon20 = media(prev.map((d) => d.razon));                 // ¿venía cara o barata la prima?
  dias[i].mov20 = media(prev.map((d) => d.movPct));                  // ¿venía moviéndose mucho?
  dias[i].primaRel = dias[i].primaPct / media(prev.map((d) => d.primaPct));  // prima de hoy vs las 20 últimas
  dias[i].pl20 = media(prev.map((d) => d.pl));                       // ¿venía perdiendo la estrategia?
  dias[i].rompe20 = media(prev60.map((d) => d.rompe));               // frecuencia reciente de roturas
}
const M = dias.filter((d) => d.listo);
radiografia(M, ["razon20", "mov20", "primaRel", "pl20", "rompe20", "pl"], "señales causales", { maxCeros: 0.25 });

console.log(`\n\n${"═".repeat(118)}\n¿ERA 2023 DISTINGUIBLE MIENTRAS OCURRÍA?\n${"═".repeat(118)}`);
console.log(`\nMuestra con 60 sesiones de calentamiento: ${M.length} días · ${M[0].fecha} → ${M[M.length - 1].fecha}`);

// ── 6a · ¿se veía el régimen en la ventana móvil? Media de cada señal por año. ──────────────
const SENALES = [
  ["razón mov/straddle de los 20 días previos", "razon20", n2],
  ["movimiento medio % de los 20 previos", "mov20", pc2],
  ["prima de hoy / prima media de 20 previos", "primaRel", n2],
  ["P&L medio del cóndor en los 20 previos", "pl20", eur],
  ["% de roturas en los 60 previos", "rompe20", pc1],
];
console.log(`\n${"─".repeat(118)}\nTABLA 5 · LAS SEÑALES CAUSALES, AÑO A AÑO — sólo miran hacia atrás. Si 2023 no destaca aquí, no se veía.\n${"─".repeat(118)}\n`);
const anosM = [...new Set(M.map((d) => d.ano))].sort();
console.log(`| señal (sólo datos de D−1 hacia atrás) | ${anosM.map((a) => (a === "2023" ? `**${a}**` : a)).join(" | ")} | ¿2023 es el extremo? |`);
console.log(`|---|${anosM.map(() => "---").join("|")}|---|`);
for (const [nom, campo, fmt] of SENALES) {
  const vals = anosM.map((a) => media(M.filter((d) => d.ano === a).map((d) => d[campo])));
  const v23 = vals[anosM.indexOf("2023")];
  const esMax = v23 === Math.max(...vals), esMin = v23 === Math.min(...vals);
  console.log(`| ${nom} | ${vals.map(fmt).join(" | ")} | ${esMax ? "SÍ (el mayor)" : esMin ? "SÍ (el menor)" : "**no**"} |`);
}

// ── 6b · EL CORTE HONESTO — se elige el umbral en una mitad, se aplica TAL CUAL a la otra ───
// Y además la prueba que de verdad contesta la pregunta: AJUSTAR SÓLO CON 2022 (antes de que
// 2023 existiera) y aplicarlo a 2023. Ésa es la dirección real del tiempo.
function evalMask(g, mask) {
  const cal = g.map((d, i) => (mask[i] ? d.pl : 0));
  const op = g.filter((_, i) => mask[i]);
  const anosN = g.length / 252;
  return { n: op.length, alAno: suma(cal) / anosN, total: suma(cal), racha: racha(cal), peor: op.length ? Math.min(...op.map((d) => d.pl)) : NaN, p5: op.length ? q(op.map((d) => d.pl), 0.05) : NaN, cal };
}
/** Devuelve el mejor umbral (por $/año) de la rejilla, ajustado SÓLO sobre `g`. */
function ajusta(g, campo, sentido, rejilla) {
  let mejor = null;
  for (const u of rejilla) {
    const mask = g.map((d) => (sentido === ">" ? d[campo] > u : d[campo] < u));
    const nOp = mask.filter(Boolean).length;
    if (nOp < g.length * 0.3) continue;      // una regla que opera <30% de los días no es comparable
    const r = evalMask(g, mask);
    if (!mejor || r.alAno > mejor.r.alAno) mejor = { u, r };
  }
  return mejor;
}
const REJ = {
  razon20: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
  mov20: [0.0025, 0.003, 0.0035, 0.004, 0.0045, 0.005, 0.006],
  primaRel: [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3],
  pl20: [-100, -50, 0, 50, 100, 150],
  rompe20: [0.10, 0.15, 0.20, 0.25, 0.30, 0.35],
};
const SENT = { razon20: "<", mov20: "<", primaRel: ">", pl20: ">", rompe20: "<" };

const mitad = Math.floor(M.length / 2);
const H1 = M.slice(0, mitad), H2 = M.slice(mitad);
console.log(`\n\n${"─".repeat(118)}\nTABLA 6 · LA REGLA DE HIERRO — el umbral se elige en UNA mitad y se aplica TAL CUAL a la otra.\nMitad 1: ${H1[0].fecha} → ${H1[H1.length - 1].fecha} (${H1.length} días) · Mitad 2: ${H2[0].fecha} → ${H2[H2.length - 1].fecha} (${H2.length} días)\nBase (operar todos los días): M1 ${eur(evalMask(H1, H1.map(() => true)).alAno)}/año · M2 ${eur(evalMask(H2, H2.map(() => true)).alAno)}/año\n${"─".repeat(118)}\n`);
console.log("| señal | umbral ajustado en M1 | $/año en M1 (ajuste) | $/año en M2 (aplicado) | base M2 | ¿mejora fuera? | umbral ajustado en M2 | $/año en M1 (aplicado) | base M1 | ¿mejora fuera? | ¿LAS DOS? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const baseH1 = evalMask(H1, H1.map(() => true)), baseH2 = evalMask(H2, H2.map(() => true));
const sobreviven = [];
for (const [campo, sent] of Object.entries(SENT)) {
  const a1 = ajusta(H1, campo, sent, REJ[campo]);
  const a2 = ajusta(H2, campo, sent, REJ[campo]);
  if (!a1 || !a2) { console.log(`| ${campo} | — | — | — | — | — | — | — | — | — | sin rejilla válida |`); continue; }
  const fueraB = evalMask(H2, H2.map((d) => (sent === ">" ? d[campo] > a1.u : d[campo] < a1.u)));
  const fueraA = evalMask(H1, H1.map((d) => (sent === ">" ? d[campo] > a2.u : d[campo] < a2.u)));
  const ok1 = fueraB.alAno > baseH2.alAno, ok2 = fueraA.alAno > baseH1.alAno;
  if (ok1 && ok2) sobreviven.push(campo);
  console.log(`| ${campo} ${sent} u | ${a1.u} | ${eur(a1.r.alAno)} | ${eur(fueraB.alAno)} | ${eur(baseH2.alAno)} | ${ok1 ? "sí" : "**no**"} | ${a2.u} | ${eur(fueraA.alAno)} | ${eur(baseH1.alAno)} | ${ok2 ? "sí" : "**no**"} | ${ok1 && ok2 ? "**SÍ**" : "no"} |`);
}
console.log(`\nSeñales que mejoran en LAS DOS DIRECCIONES: ${sobreviven.length ? sobreviven.join(", ") : "**NINGUNA**"}`);

// ── 6c · LA PRUEBA EN LA DIRECCIÓN DEL TIEMPO: ajustar con 2022, aplicar a 2023 ─────────────
const g22 = M.filter((d) => d.ano === "2022"), g23m = M.filter((d) => d.ano === "2023");
const g2426 = M.filter((d) => d.ano >= "2024");
console.log(`\n\n${"─".repeat(118)}\nTABLA 7 · LA DIRECCIÓN DEL TIEMPO — se ajusta con 2022 SOLO (cuando 2023 aún no existía) y se aplica a 2023.\nAjuste: ${g22.length} días de 2022 · Aplicación: ${g23m.length} días de 2023 (base ${eur(evalMask(g23m, g23m.map(() => true)).alAno)}/año)\n${"─".repeat(118)}\n`);
console.log("| señal | umbral elegido con 2022 | $/año en 2022 (ajuste) | días operados en 2023 | $/año en 2023 | base 2023 | ¿habría salvado 2023? |");
console.log("|---|---|---|---|---|---|---|");
const base23 = evalMask(g23m, g23m.map(() => true));
let salvan = 0;
for (const [campo, sent] of Object.entries(SENT)) {
  const a = ajusta(g22, campo, sent, REJ[campo]);
  if (!a) { console.log(`| ${campo} | sin rejilla válida en 2022 | — | — | — | — | — |`); continue; }
  const ap = evalMask(g23m, g23m.map((d) => (sent === ">" ? d[campo] > a.u : d[campo] < a.u)));
  const ok = ap.alAno > base23.alAno;
  if (ok) salvan++;
  console.log(`| ${campo} ${sent} u | ${a.u} | ${eur(a.r.alAno)} | ${ap.n} de ${g23m.length} | ${eur(ap.alAno)} | ${eur(base23.alAno)} | ${ok ? "sí, +" + eur(ap.alAno - base23.alAno) : "**no**"} |`);
}
console.log(`\nDe las 5 señales ajustadas SÓLO con 2022, ${salvan} habrían mejorado 2023. (Mejorar 2023 no basta: hay que mirar la Tabla 6.)`);

// ── 6d · ¿tiene el régimen memoria? autocorrelación mensual y t del pl20 ────────────────────
const pl20v = M.map((d) => d.pl20), plv = M.map((d) => d.pl);
const corr = (a, b) => { const ma = media(a), mb = media(b); return suma(a.map((x, i) => (x - ma) * (b[i] - mb))) / Math.sqrt(suma(a.map((x) => (x - ma) ** 2)) * suma(b.map((x) => (x - mb) ** 2))); };
const rPl = corr(pl20v, plv);
const tPl = rPl * Math.sqrt((M.length - 2) / (1 - rPl * rPl));
const rRaz = corr(M.map((d) => d.razon20), plv);
const tRaz = rRaz * Math.sqrt((M.length - 2) / (1 - rRaz * rRaz));
const rMov = corr(M.map((d) => d.mov20), plv);
const tMov = rMov * Math.sqrt((M.length - 2) / (1 - rMov * rMov));
console.log(`\n\n${"─".repeat(118)}\nTABLA 8 · ¿TIENE MEMORIA EL RÉGIMEN? — correlación de la señal causal con el P&L del MISMO día (listón |t| ≥ ${LISTON})\n${"─".repeat(118)}\n`);
console.log("| señal (sólo pasado) | ρ con el P&L de hoy | t | ¿supera el listón? |");
console.log("|---|---|---|---|");
for (const [nom, r, t] of [["P&L medio de los 20 días previos", rPl, tPl], ["razón mov/straddle de los 20 previos", rRaz, tRaz], ["movimiento medio de los 20 previos", rMov, tMov]])
  console.log(`| ${nom} | ${n2(r)} | ${n2(t)} | ${Math.abs(t) >= LISTON ? "SÍ" : "**no**"} |`);

// ── 6e · ¿es 2023 estadísticamente distinto? t de la razón contra el resto ──────────────────
const raz23 = g23.map((d) => d.razon), razOtros = otros.map((d) => d.razon);
const tW = (a, b) => (media(a) - media(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
console.log(`\nRAZÓN mov/straddle · 2023 (${n2(media(raz23))}) contra los otros 4 años (${n2(media(razOtros))}): t = ${n2(tW(raz23, razOtros))} (listón ${LISTON})`);
const prima23 = g23.map((d) => d.primaPct), primaOtros = otros.map((d) => d.primaPct);
console.log(`PRIMA % del índice   · 2023 (${pc2(media(prima23))}) contra los otros 4 años (${pc2(media(primaOtros))}): t = ${n2(tW(prima23, primaOtros))}`);
const mov23 = g23.map((d) => d.movPct), movOtros = otros.map((d) => d.movPct);
console.log(`MOVIMIENTO % 11→cierre · 2023 (${pc2(media(mov23))}) contra los otros 4 años (${pc2(media(movOtros))}): t = ${n2(tW(mov23, movOtros))}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 7 · EN DÓLARES AL AÑO Y EN % DE LA CUENTA
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 9 · EN DINERO — sobre la cuenta de ${eur(CUENTA)}, 1 contrato SPXW\n${"─".repeat(118)}\n`);
console.log("| año | $/año | % de la cuenta | peor racha del año | caída en % de la cuenta | peor día | peor día en % de la cuenta |");
console.log("|---|---|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a], tot = suma(g.map((d) => d.pl)) / (g.length / 252), rr = racha(g.map((d) => d.pl)), pd = Math.min(...g.map((d) => d.pl));
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${eur(tot)} | ${pc1(tot / CUENTA)} | ${eur(rr)} | ${pc1(Math.abs(rr) / CUENTA)} | ${eur(pd)} | ${pc1(Math.abs(pd) / CUENTA)} |`);
}
const todoPl = dias.map((d) => d.pl);
console.log(`| **TODO** | ${eur(suma(todoPl) / (dias.length / 252))} | ${pc1(suma(todoPl) / (dias.length / 252) / CUENTA)} | ${eur(racha(todoPl))} | ${pc1(Math.abs(racha(todoPl)) / CUENTA)} | ${eur(Math.min(...todoPl))} | ${pc1(Math.abs(Math.min(...todoPl)) / CUENTA)} |`);

writeFileSync("scripts/regimen-2023-retrato.json", JSON.stringify({
  n: dias.length, liston: LISTON, pruebas: PRUEBAS_ACUMULADAS,
  porAno: Object.fromEntries(anos.map((a) => {
    const g = porAno[a];
    return [a, {
      n: g.length, pl: suma(g.map((d) => d.pl)), alAno: suma(g.map((d) => d.pl)) / (g.length / 252),
      racha: racha(g.map((d) => d.pl)), peorDia: Math.min(...g.map((d) => d.pl)),
      credito: media(g.map((d) => d.credito)), primaPct: media(g.map((d) => d.primaPct)),
      movPct: media(g.map((d) => d.movPct)), razon: media(g.map((d) => d.razon)),
      rompe: media(g.map((d) => d.rompe)), daño: media(g.map((d) => d.danoCall + d.danoPut)),
      anchoPct: media(g.map((d) => d.anchoPct)),
    }];
  })),
  sobrevivenCorte: sobreviven,
}, null, 2));
console.log(`\nFilas guardadas en scripts/regimen-2023-retrato.json`);
