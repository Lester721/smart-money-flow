// 2023 · EL MECANISMO — por qué fue el peor año, y si eso es de 2023 o de la VARA DE MEDIR.
//
// Lo que salió del retrato (scripts/regimen-2023-retrato.mjs) y hay que perseguir:
//   · La prima NO estaba barata en 2023: razón |mov|/straddle = 0,99 contra 0,97 del resto, t=0,27.
//   · 2023 rompió una pata el 27,3% de los días — EMPATE con 2024 (27,8%), que ganó $17.708.
//   · Lo que cambió es lo que TE PAGAN: $376/día de crédito contra $462 en 2024 y $868 en 2026.
//   · ±25 puntos fueron 1,45 straddles en 2023 (el más lejos de los 5 años) y 0,92 en 2022.
//
// Hipótesis a medir: 2023 no fue un mal año para vender prima 0DTE. Fue un mal año para una
// vara de medir FIJA en puntos, sobre un índice bajo y con la prima pequeña. Se comprueba
// normalizando TODO por el straddle y volviendo a mirar los cinco años.
//
// LA REGLA DE HIERRO: la geometría se elige en UNA mitad y se aplica TAL CUAL a la otra, en las
// DOS direcciones. Y se elige POR RIESGO (media del 5% peor), nunca por $/año.
//
// Precios reales en las cuatro patas: bid al vender, ask al comprar. $0,03/pata. Sin modelo.
// Uso: node --import tsx --max-old-space-size=10240 scripts/regimen-2023-mecanismo.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ─── PRUEBAS DECLARADAS ────────────────────────────────────────────────────────────────────
// Rejilla de geometría: 6 múltiplos del straddle × 2 anchos de ala = 12, en 2 direcciones = 24.
const PRUEBAS_HOY = 24;
const PRUEBAS_ACUMULADAS = 242 + 16 + 10 + PRUEBAS_HOY;
const LISTON = listonT(PRUEBAS_ACUMULADAS);

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const CUENTA = 56389;
const MULT = [1.5, 1.8, 2.0, 2.3, 2.6, 3.0];
const ALAS = [30, 50];

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const eur = (x) => (!Number.isFinite(x) ? "—" : (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES"));
const pc1 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const racha = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; };
/** RIESGO = media del 5% peor de los días. Es la métrica que SE HEREDA entre períodos (ρ=+0,98). */
const riesgo = (v) => { const s = [...v].sort((a, b) => a - b); return media(s.slice(0, Math.max(1, Math.round(s.length * 0.05)))); };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = []; let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const dias = [];
const fuera = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { fuera.push(fecha); continue; }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) { fuera.push(fecha); continue; }
  const kA = cerca(C.filas, sp11);
  const pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;
  if (!(straddle > 0)) { fuera.push(fecha); continue; }
  const S = C.cierre;

  /** El cóndor a una distancia en PUNTOS y un ancho de ala. Precios reales, cuatro patas. */
  const condor = (dist, ala) => {
    if (!(dist > 0)) return null;
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const aC = cL.K - cC.K, aP = pC.K - pL.K;
    const dC = Math.min(Math.max(S - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - S, 0), aP);
    return {
      pl: (cred - dC - dP) * 100 - 8 * COMM,
      credito: cred * 100,
      perdidaMax: (Math.max(aC, aP) - cred) * 100,   // = colateral en Robinhood
      rompe: S > cC.K || S < pC.K ? 1 : 0,
      distReal: (cC.K - pC.K) / 2,
    };
  };

  const fila = { fecha, ano: fecha.slice(0, 4), sp11, cierre: S, straddle, mov: Math.abs(S - sp11) };
  fila.razon = fila.mov / straddle;
  let ok = true;
  // El cóndor FIJO de hoy: ±25 puntos, alas 50.
  const fijo = condor(25, 50);
  if (!fijo) ok = false; else { fila.fijoPl = fijo.pl; fila.fijoCred = fijo.credito; fila.fijoMax = fijo.perdidaMax; fila.fijoRompe = fijo.rompe; }
  // Y la rejilla en múltiplos del straddle.
  for (const m of MULT) for (const a of ALAS) {
    const r = condor(m * straddle, a);
    if (!r) { ok = false; break; }
    fila[`m${m}_a${a}`] = r.pl;
    fila[`c${m}_a${a}`] = r.credito;
    fila[`x${m}_a${a}`] = r.perdidaMax;
    fila[`r${m}_a${a}`] = r.rompe;
  }
  if (!ok) { fuera.push(fecha); continue; }
  fila.vara = 25 / straddle;        // ±25 en múltiplos del straddle · OBSERVABLE a las 11:00
  dias.push(fila);
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

console.log("═".repeat(118));
console.log("2023 · EL MECANISMO — ¿fue el año, o fue la VARA DE MEDIR?");
console.log("═".repeat(118));
console.log(`\nDías con las 13 geometrías completas: ${dias.length} de ${fechas.length} fechas en disco.`);
if (fuera.length) console.log(`SE DICE, NO SE RELLENA — ${fuera.length} fecha(s) fuera por no tener cadena completa en alguna geometría.`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);
radiografia(dias, ["fijoPl", "fijoCred", "straddle", "vara", "razon", "m2.3_a30", "c2.3_a30"], "mecanismo 2023", { maxCeros: 0.25 });

const anos = [...new Set(dias.map((d) => d.ano))].sort();
const porAno = Object.fromEntries(anos.map((a) => [a, dias.filter((d) => d.ano === a)]));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 0 · LA CORRECCIÓN DE LA PREMISA — "2022 ganó $7.084" es el año SIN sus primeros 51 días
// ═══════════════════════════════════════════════════════════════════════════════════════════
const g22 = porAno["2022"];
const corte = g22.findIndex((d) => d.fecha >= "2022-04-27");
console.log(`\n\n${"═".repeat(118)}\n0 · LA PREMISA, CORREGIDA — hay que decirlo antes de comparar nada\n${"═".repeat(118)}\n`);
console.log(`El "+$7.084 de 2022" sale de comparar-tres-por-ano.mjs, que descarta los primeros 50 días por el`);
console.log(`calentamiento de la media móvil. El año 2022 ENTERO, con las mismas reglas y los mismos precios:\n`);
console.log("| tramo de 2022 | días | P&L del cóndor ±25 |");
console.log("|---|---|---|");
console.log(`| 2022-01-03 → 2022-04-26 (los 51 días que el calentamiento se come) | ${corte} | ${eur(suma(g22.slice(0, corte).map((d) => d.fijoPl)))} |`);
console.log(`| 2022-04-27 → 2022-12-30 (lo que se reporta como "2022") | ${g22.length - corte} | ${eur(suma(g22.slice(corte).map((d) => d.fijoPl)))} |`);
console.log(`| **2022 ENTERO** | **${g22.length}** | **${eur(suma(g22.map((d) => d.fijoPl)))}** |`);
console.log(`\n**2022 NO ganó. Perdió ${eur(suma(g22.map((d) => d.fijoPl)))}.** El peor año del cóndor ±25 no es 2023: es 2022.`);
console.log(`2023 (${eur(suma(porAno["2023"].map((d) => d.fijoPl)))}) es el SEGUNDO peor. La pregunta sigue viva, pero cambia de forma:`);
console.log(`ya no es "2023 fue raro y 2022 no", es "los dos años del índice BAJO perdieron y los tres del índice ALTO ganaron".`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA ASIMETRÍA — te pagan en PRIMA (que encoge) y arriesgas en PUNTOS (que no)
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 10 · LA RELACIÓN RIESGO/PREMIO DEL ±25 FIJO — lo que de verdad separa a 2023\n${"─".repeat(118)}\n`);
console.log("| año | SPX medio | straddle 11:00 (pts) | ±25 en straddles | crédito medio | pérdida máx. | premio:riesgo | % roturas real | % roturas de equilibrio | margen |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const eq = {};
for (const a of anos) {
  const g = porAno[a];
  const cr = media(g.map((d) => d.fijoCred)), mx = media(g.map((d) => d.fijoMax));
  const rot = media(g.map((d) => d.fijoRompe));
  // Coste medio de una rotura, medido: cuánto se pierde de media el día que rompe.
  const rotos = g.filter((d) => d.fijoRompe);
  const costeRot = rotos.length ? media(rotos.map((d) => d.fijoCred - d.fijoPl)) : NaN;
  const equil = costeRot > 0 ? cr / costeRot : NaN;   // % de roturas que el crédito puede absorber
  eq[a] = { cr, mx, rot, equil, costeRot };
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${Math.round(media(g.map((d) => d.sp11)))} | ${media(g.map((d) => d.straddle)).toFixed(1)} | **${n2(media(g.map((d) => d.vara)))}** | ${eur(cr)} | ${eur(mx)} | 1:${n2(mx / cr)} | ${pc1(rot)} | ${pc1(equil)} | ${equil > rot ? "+" : ""}${pc1(equil - rot)} |`);
}
console.log(`\nLectura: "% de roturas de equilibrio" = crédito medio ÷ coste medio del día que rompe. Es el`);
console.log(`porcentaje de roturas que el crédito de ese año podía pagar. Si la rotura REAL lo supera, el año pierde.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · TODO NORMALIZADO POR EL STRADDLE — ¿sigue 2023 siendo raro?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(118)}\nTABLA 11 · EN UNIDADES DE STRADDLE — se le quita el nivel de volatilidad y de índice a los cinco años\n${"─".repeat(118)}\n`);
console.log("| año | crédito / straddle | daño / straddle | P&L / straddle | razón |mov|/straddle (mediana) | ¿la prima estaba barata? |");
console.log("|---|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a];
  const cS = media(g.map((d) => d.fijoCred / (d.straddle * 100)));
  const dS = media(g.map((d) => (d.fijoCred - d.fijoPl - 8 * COMM) / (d.straddle * 100)));
  const pS = media(g.map((d) => d.fijoPl / (d.straddle * 100)));
  const rz = q(g.map((d) => d.razon), 0.5);
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${n2(cS)} | ${n2(dS)} | ${n2(pS)} | ${n2(rz)} | ${rz > 0.85 ? "sí, algo" : "no"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA REJILLA POR STRADDLE — el mismo cóndor con la vara que NO encoge
// ═══════════════════════════════════════════════════════════════════════════════════════════
function stats(g, campo) {
  const v = g.map((d) => d[campo]);
  return { alAno: suma(v) / (g.length / 252), riesgo: riesgo(v), peor: Math.min(...v), racha: racha(v), acierto: v.filter((x) => x > 0).length / v.length, n: g.length };
}
console.log(`\n\n${"─".repeat(118)}\nTABLA 12 · LA REJILLA ENTERA, AÑO A AÑO — $/año de cada geometría (1 contrato)\n${"─".repeat(118)}\n`);
const GEOS = [["±25 pts FIJO · alas 50", "fijoPl"], ...MULT.flatMap((m) => ALAS.map((a) => [`${m}× straddle · alas ${a}`, `m${m}_a${a}`]))];
console.log(`| geometría | ${anos.map((a) => (a === "2023" ? `**${a}**` : a)).join(" | ")} | TODO $/año | RIESGO (5% peor) | ¿2023 es el peor año? |`);
console.log(`|---|${anos.map(() => "---").join("|")}|---|---|---|`);
for (const [nom, campo] of GEOS) {
  const cel = anos.map((a) => stats(porAno[a], campo).alAno);
  const t = stats(dias, campo);
  const peorAno = anos[cel.indexOf(Math.min(...cel))];
  console.log(`| ${nom} | ${cel.map(eur).join(" | ")} | ${eur(t.alAno)} | ${eur(t.riesgo)} | ${peorAno === "2023" ? "**SÍ**" : "no (" + peorAno + ")"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA REGLA DE HIERRO — la geometría se elige POR RIESGO en una mitad y se aplica a la otra
// ═══════════════════════════════════════════════════════════════════════════════════════════
const mitad = Math.floor(dias.length / 2);
const H1 = dias.slice(0, mitad), H2 = dias.slice(mitad);
const CAMPOS = GEOS.map(([, c]) => c);
const NOMBRE = Object.fromEntries(GEOS.map(([n, c]) => [c, n]));
/** Elige la geometría con MENOS riesgo (media del 5% peor). NUNCA por $/año: ρ($/año) = −0,66. */
function eligePorRiesgo(g) {
  let mejor = null;
  for (const c of CAMPOS) { const s = stats(g, c); if (!mejor || s.riesgo > mejor.s.riesgo) mejor = { c, s }; }
  return mejor;
}
function eligePorDinero(g) {
  let mejor = null;
  for (const c of CAMPOS) { const s = stats(g, c); if (!mejor || s.alAno > mejor.s.alAno) mejor = { c, s }; }
  return mejor;
}
console.log(`\n\n${"═".repeat(118)}\nTABLA 13 · LA REGLA DE HIERRO — elegir en UNA mitad, aplicar TAL CUAL a la otra, en las DOS direcciones\nMitad 1: ${H1[0].fecha} → ${H1[H1.length - 1].fecha} (${H1.length} días) · Mitad 2: ${H2[0].fecha} → ${H2[H2.length - 1].fecha} (${H2.length} días)\n${"═".repeat(118)}\n`);
console.log("| criterio de elección | elegida en M1 | riesgo M1 | riesgo en M2 (fuera) | $/año M2 | elegida en M2 | riesgo M2 | riesgo en M1 (fuera) | $/año M1 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [nomC, fn] of [["POR RIESGO (lo que se hereda, ρ=+0,98)", eligePorRiesgo], ["por $/año (lo que va INVERTIDO, ρ=−0,66)", eligePorDinero]]) {
  const e1 = fn(H1), e2 = fn(H2);
  const f1en2 = stats(H2, e1.c), f2en1 = stats(H1, e2.c);
  console.log(`| ${nomC} | ${NOMBRE[e1.c]} | ${eur(e1.s.riesgo)} | ${eur(f1en2.riesgo)} | ${eur(f1en2.alAno)} | ${NOMBRE[e2.c]} | ${eur(e2.s.riesgo)} | ${eur(f2en1.riesgo)} | ${eur(f2en1.alAno)} |`);
}
const gan1 = eligePorRiesgo(H1), gan2 = eligePorRiesgo(H2);
const COINCIDE = gan1.c === gan2.c;
console.log(`\n¿Las dos mitades eligen la MISMA geometría por riesgo? **${COINCIDE ? "SÍ — " + NOMBRE[gan1.c] : "NO (" + NOMBRE[gan1.c] + " contra " + NOMBRE[gan2.c] + ")"}**`);

// El ranking de riesgo, mitad contra mitad: la correlación que dice si el riesgo se hereda AQUÍ.
const rk = (g) => CAMPOS.map((c) => stats(g, c).riesgo);
const r1 = rk(H1), r2 = rk(H2);
const rankOf = (v) => v.map((x) => v.filter((y) => y < x).length);
const spear = (a, b) => { const ra = rankOf(a), rb = rankOf(b), ma = media(ra), mb = media(rb); return suma(ra.map((x, i) => (x - ma) * (rb[i] - mb))) / Math.sqrt(suma(ra.map((x) => (x - ma) ** 2)) * suma(rb.map((x) => (x - mb) ** 2))); };
const d1 = CAMPOS.map((c) => stats(H1, c).alAno), d2 = CAMPOS.map((c) => stats(H2, c).alAno);
console.log(`Correlación de rangos entre mitades · RIESGO ρ = ${n2(spear(r1, r2))}  ·  $/año ρ = ${n2(spear(d1, d2))}   (${CAMPOS.length} geometrías)`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5 · ¿SE VEÍA A LAS 11:00? — la vara ±25/straddle es OBSERVABLE, no necesita mirar atrás
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"═".repeat(118)}\nTABLA 14 · LO QUE SÍ SE VEÍA — ±25 ÷ straddle de HOY a las 11:00. No es una media móvil: es el\ndato de hoy, antes de entrar. Se ordenan los 1.121 días en quintiles por esa cifra.\n${"═".repeat(118)}\n`);
const orden = [...dias].sort((a, b) => a.vara - b.vara);
const k5 = Math.floor(orden.length / 5);
console.log("| quintil de ±25/straddle | rango de la vara | días | crédito medio | % roturas | P&L medio/día | $/año si sólo operas aquí | % de esos días que son de 2023 |");
console.log("|---|---|---|---|---|---|---|---|");
for (let i = 0; i < 5; i++) {
  const g = orden.slice(i * k5, i === 4 ? orden.length : (i + 1) * k5);
  const v = g.map((d) => d.fijoPl);
  console.log(`| Q${i + 1} | ${n2(g[0].vara)} → ${n2(g[g.length - 1].vara)} | ${g.length} | ${eur(media(g.map((d) => d.fijoCred)))} | ${pc1(media(g.map((d) => d.fijoRompe)))} | ${eur(media(v))} | ${eur(media(v) * 252)} | ${pc1(g.filter((d) => d.ano === "2023").length / g.length)} |`);
}
const v23 = porAno["2023"].map((d) => d.vara), vOtros = dias.filter((d) => d.ano !== "2023").map((d) => d.vara);
const tW = (a, b) => (media(a) - media(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
console.log(`\nLA VARA · 2023 (${n2(media(v23))} straddles) contra los otros 4 años (${n2(media(vOtros))}): t = ${n2(tW(v23, vOtros))} (listón ${LISTON})`);
console.log(`El crédito · 2023 (${eur(media(porAno["2023"].map((d) => d.fijoCred)))}) contra los otros (${eur(media(dias.filter((d) => d.ano !== "2023").map((d) => d.fijoCred)))}): t = ${n2(tW(porAno["2023"].map((d) => d.fijoCred), dias.filter((d) => d.ano !== "2023").map((d) => d.fijoCred)))}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6 · LA COMPARACIÓN FINAL — el ±25 fijo contra la geometría elegida por riesgo, en dinero
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ELEGIDA = COINCIDE ? gan1.c : (stats(H2, gan1.c).riesgo > stats(H1, gan2.c).riesgo ? gan1.c : gan2.c);
console.log(`\n\n${"═".repeat(118)}\nTABLA 15 · EN DINERO SOBRE ${eur(CUENTA)} — ±25 fijo contra ${NOMBRE[ELEGIDA]} (1 contrato SPXW)\n${"═".repeat(118)}\n`);
console.log("| | ±25 pts FIJO · alas 50 | " + NOMBRE[ELEGIDA] + " |");
console.log("|---|---|---|");
const A = stats(dias, "fijoPl"), B = stats(dias, ELEGIDA);
const M = [
  ["$/año (todo el período)", (s) => eur(s.alAno)],
  ["  · en % de la cuenta", (s) => pc1(s.alAno / CUENTA)],
  ["acierto", (s) => pc1(s.acierto)],
  ["RIESGO — media del 5% peor", (s) => eur(s.riesgo)],
  ["peor día", (s) => eur(s.peor)],
  ["  · en % de la cuenta", (s) => pc1(Math.abs(s.peor) / CUENTA)],
  ["peor racha de todo el período", (s) => eur(s.racha)],
  ["  · CAÍDA en % de la cuenta", (s) => pc1(Math.abs(s.racha) / CUENTA)],
];
for (const [nom, fn] of M) console.log(`| ${nom} | ${fn(A)} | ${fn(B)} |`);
console.log(`\n| año | ±25 pts FIJO $/año | ${NOMBRE[ELEGIDA]} $/año | ±25 caída del año | ${NOMBRE[ELEGIDA]} caída del año |`);
console.log("|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a];
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${eur(stats(g, "fijoPl").alAno)} | ${eur(stats(g, ELEGIDA).alAno)} | ${eur(racha(g.map((d) => d.fijoPl)))} | ${eur(racha(g.map((d) => d[ELEGIDA])))} |`);
}
// ¿es medible la diferencia? t pareada diaria.
const dif = dias.map((d) => d[ELEGIDA] - d.fijoPl);
const tPar = media(dif) / (sd(dif) / Math.sqrt(dif.length));
console.log(`\nDiferencia diaria media ${eur(media(dif))} (${eur(media(dif) * 252)}/año) · t pareada = ${n2(tPar)} · listón ${LISTON} → ${Math.abs(tPar) >= LISTON ? "SUPERA el listón" : "**NO supera el listón**"}`);

writeFileSync("scripts/regimen-2023-mecanismo.json", JSON.stringify({
  n: dias.length, liston: LISTON, pruebas: PRUEBAS_ACUMULADAS,
  correccion2022: { entero: suma(g22.map((d) => d.fijoPl)), desde0427: suma(g22.slice(corte).map((d) => d.fijoPl)), diasCortados: corte },
  elegidaPorRiesgo: { M1: NOMBRE[gan1.c], M2: NOMBRE[gan2.c], coincide: COINCIDE, final: NOMBRE[ELEGIDA] },
  rhoRiesgo: spear(r1, r2), rhoDinero: spear(d1, d2),
  porAnoFijo: Object.fromEntries(anos.map((a) => [a, stats(porAno[a], "fijoPl")])),
  porAnoElegida: Object.fromEntries(anos.map((a) => [a, stats(porAno[a], ELEGIDA)])),
  tParEada: tPar,
}, null, 2));
console.log(`\nGuardado en scripts/regimen-2023-mecanismo.json`);
