// 2023 · EL PUENTE — la vara (±25 ÷ straddle) sometida a la REGLA DE HIERRO.
//
// DE DÓNDE VIENE. En scripts/regimen-2023-mecanismo.mjs, al ordenar los 1.114 días por
// "±25 dividido entre el straddle del dinero a las 11:00" (un número OBSERVABLE antes de entrar,
// sin medias móviles ni memoria), los quintiles salieron así:
//
//     Q1 0,19–0,81 →  −$849/año   crédito $1.544   roturas 55,4%
//     Q2 0,81–1,03 → +$28.837/año crédito   $831   roturas 39,6%
//     Q3 1,03–1,25 →  +$5.476/año crédito   $518   roturas 37,8%
//     Q4 1,25–1,57 →  +$3.953/año crédito   $307   roturas 23,4%
//     Q5 1,57–4,26 →  −$8.539/año crédito   $145   roturas 16,8%
//
// y 2023 vive el 43% en Q5 y el 28% en Q4 (su vara media: 1,45 contra 1,12 del resto, t=11,8).
//
// ESO ES UNA TABLA DENTRO DE MUESTRA Y NO VALE NADA TODAVÍA. Una U invertida con el óptimo en el
// segundo quintil es exactamente la forma que tiene el sobreajuste. Aquí se parte la muestra.
//
// Dos puentes distintos, los dos partidos en dos direcciones:
//   A · LA GEOMETRÍA — poner los strikes a un múltiplo FIJO del straddle (la vara que no encoge).
//       La rejilla del script anterior empezaba en 1,5×; los quintiles dicen que el sitio está
//       cerca de 1,0×. Se amplía la rejilla a donde apuntan los datos: 0,8× … 3,0×.
//   B · EL FILTRO — dejar el ±25 fijo y no operar cuando la vara se sale de una banda.
//
// Se elige POR RIESGO (media del 5% peor), que es lo que se hereda entre períodos (ρ=+0,98 aquí),
// y se informa también qué habría elegido el dinero (ρ=−0,84 aquí: va INVERTIDO).
//
// Precios reales, cuatro patas, bid al vender / ask al comprar, $0,03 por pata. Sin modelo.
// Uso: node --import tsx --max-old-space-size=10240 scripts/regimen-2023-puente.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ─── PRUEBAS DECLARADAS ────────────────────────────────────────────────────────────────────
// A: 12 múltiplos × 2 alas = 24 geometrías, elegidas en 2 direcciones = 48.
// B: 4 suelos × 6 techos = 24 bandas, en 2 direcciones = 48.
const PRUEBAS_HOY = 48 + 48;
const PRUEBAS_ACUMULADAS = 292 + PRUEBAS_HOY;
const LISTON = listonT(PRUEBAS_ACUMULADAS);

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const CUENTA = 56389, EFECTIVO = 7977;
const MULT = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.8, 2.0, 2.3, 2.6, 3.0];
const ALAS = [30, 50];
const SUELOS = [0.6, 0.7, 0.8, 0.9];
const TECHOS = [1.0, 1.1, 1.2, 1.3, 1.5, 99];

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const eur = (x) => (!Number.isFinite(x) ? "—" : (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES"));
const pc1 = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");
const n2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const racha = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; };
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
const fuera = {};
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { fuera["sin cadena/cierre"] = (fuera["sin cadena/cierre"] || 0) + 1; continue; }
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) { fuera["sin spot 11:00"] = (fuera["sin spot 11:00"] || 0) + 1; continue; }
  const kA = cerca(C.filas, sp11);
  const pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;
  if (!(straddle > 0)) { fuera["straddle<=0"] = (fuera["straddle<=0"] || 0) + 1; continue; }
  const S = C.cierre;
  const condor = (dist, ala) => {
    if (!(dist > 0)) return null;
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const aC = cL.K - cC.K, aP = pC.K - pL.K;
    const dC = Math.min(Math.max(S - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - S, 0), aP);
    return { pl: (cred - dC - dP) * 100 - 8 * COMM, credito: cred * 100, colateral: (Math.max(aC, aP) - cred) * 100, rompe: S > cC.K || S < pC.K ? 1 : 0 };
  };
  const fila = { fecha, ano: fecha.slice(0, 4), sp11, cierre: S, straddle, vara: 25 / straddle };
  const fijo = condor(25, 50);
  if (!fijo) { fuera["±25 sin cadena"] = (fuera["±25 sin cadena"] || 0) + 1; continue; }
  fila.fijoPl = fijo.pl; fila.fijoCred = fijo.credito; fila.fijoRompe = fijo.rompe; fila.fijoCol = fijo.colateral;
  let ok = true;
  for (const m of MULT) for (const a of ALAS) {
    const r = condor(m * straddle, a);
    if (!r) { ok = false; break; }
    fila[`m${m}_a${a}`] = r.pl; fila[`c${m}_a${a}`] = r.credito; fila[`k${m}_a${a}`] = r.colateral;
  }
  if (!ok) { fuera["rejilla incompleta"] = (fuera["rejilla incompleta"] || 0) + 1; continue; }
  dias.push(fila);
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

console.log("═".repeat(118));
console.log("2023 · EL PUENTE — la vara (±25 ÷ straddle) contra la regla de hierro");
console.log("═".repeat(118));
console.log(`\nDías con las ${MULT.length * ALAS.length + 1} geometrías completas: ${dias.length} de ${fechas.length} fechas en disco.`);
console.log(`SE DICE, NO SE RELLENA — fuera: ${Object.entries(fuera).map(([k, v]) => `${v} por ${k}`).join(" · ") || "ninguna"}`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);
radiografia(dias, ["fijoPl", "fijoCred", "vara", "straddle", "m1_a30", "c1_a30", "m2.3_a30"], "puente 2023", { maxCeros: 0.25 });

const anos = [...new Set(dias.map((d) => d.ano))].sort();
const porAno = Object.fromEntries(anos.map((a) => [a, dias.filter((d) => d.ano === a)]));
const mitad = Math.floor(dias.length / 2);
const H1 = dias.slice(0, mitad), H2 = dias.slice(mitad);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A · LA GEOMETRÍA — la rejilla ampliada a donde apuntan los quintiles
// ═══════════════════════════════════════════════════════════════════════════════════════════
function stats(g, campo, mask) {
  const cal = g.map((d, i) => (mask && !mask[i] ? 0 : d[campo]));
  const op = mask ? g.filter((_, i) => mask[i]) : g;
  const opv = op.map((d) => d[campo]);
  return {
    n: op.length, diasAno: op.length / (g.length / 252),
    alAno: suma(cal) / (g.length / 252), total: suma(cal),
    riesgo: opv.length ? riesgo(opv) : NaN, peor: opv.length ? Math.min(...opv) : NaN,
    racha: racha(cal), acierto: opv.length ? opv.filter((x) => x > 0).length / opv.length : NaN,
    credito: opv.length ? media(op.map((d) => d[campo.replace(/^m/, "c").replace(/^fijoPl$/, "fijoCred")])) : NaN,
    cal,
  };
}
const GEOS = [["±25 pts FIJO · alas 50", "fijoPl"], ...MULT.flatMap((m) => ALAS.map((a) => [`${m}× straddle · alas ${a}`, `m${m}_a${a}`]))];
const CAMPOS = GEOS.map(([, c]) => c);
const NOMBRE = Object.fromEntries(GEOS.map(([n, c]) => [c, n]));

console.log(`\n\n${"═".repeat(118)}\nA · LA GEOMETRÍA — la rejilla AMPLIADA (0,8× … 3,0× del straddle). Antes empezaba en 1,5×.\n${"═".repeat(118)}\n`);
console.log(`| geometría | ${anos.map((a) => (a === "2023" ? `**${a}**` : a)).join(" | ")} | TODO $/año | RIESGO 5% peor | peor día | caída total | acierto | colateral |`);
console.log(`|---|${anos.map(() => "---").join("|")}|---|---|---|---|---|---|`);
for (const [nom, campo] of GEOS) {
  const t = stats(dias, campo);
  const col = campo === "fijoPl" ? media(dias.map((d) => d.fijoCol)) : media(dias.map((d) => d[campo.replace(/^m/, "k")]));
  console.log(`| ${nom} | ${anos.map((a) => eur(stats(porAno[a], campo).alAno)).join(" | ")} | ${eur(t.alAno)} | ${eur(t.riesgo)} | ${eur(t.peor)} | ${eur(t.racha)} | ${pc1(t.acierto)} | ${eur(col)} |`);
}

const eligeRiesgo = (g) => CAMPOS.map((c) => ({ c, s: stats(g, c) })).sort((a, b) => b.s.riesgo - a.s.riesgo)[0];
const eligeDinero = (g) => CAMPOS.map((c) => ({ c, s: stats(g, c) })).sort((a, b) => b.s.alAno - a.s.alAno)[0];
console.log(`\n${"─".repeat(118)}\nA · REGLA DE HIERRO SOBRE LA GEOMETRÍA\nMitad 1: ${H1[0].fecha} → ${H1[H1.length - 1].fecha} (${H1.length}) · Mitad 2: ${H2[0].fecha} → ${H2[H2.length - 1].fecha} (${H2.length})\n${"─".repeat(118)}\n`);
console.log("| criterio | elegida en M1 | su riesgo en M2 | su $/año en M2 | elegida en M2 | su riesgo en M1 | su $/año en M1 | ¿la misma? |");
console.log("|---|---|---|---|---|---|---|---|");
const gr = {};
for (const [nomC, fn] of [["POR RIESGO", eligeRiesgo], ["por $/año", eligeDinero]]) {
  const e1 = fn(H1), e2 = fn(H2);
  gr[nomC] = { e1, e2 };
  console.log(`| ${nomC} | ${NOMBRE[e1.c]} | ${eur(stats(H2, e1.c).riesgo)} | ${eur(stats(H2, e1.c).alAno)} | ${NOMBRE[e2.c]} | ${eur(stats(H1, e2.c).riesgo)} | ${eur(stats(H1, e2.c).alAno)} | ${e1.c === e2.c ? "**SÍ**" : "no"} |`);
}
const rankOf = (v) => v.map((x) => v.filter((y) => y < x).length);
const spear = (a, b) => { const ra = rankOf(a), rb = rankOf(b), ma = media(ra), mb = media(rb); return suma(ra.map((x, i) => (x - ma) * (rb[i] - mb))) / Math.sqrt(suma(ra.map((x) => (x - ma) ** 2)) * suma(rb.map((x) => (x - mb) ** 2))); };
console.log(`\nCorrelación de rangos M1↔M2 sobre las ${CAMPOS.length} geometrías · RIESGO ρ = **${n2(spear(CAMPOS.map((c) => stats(H1, c).riesgo), CAMPOS.map((c) => stats(H2, c).riesgo)))}** · $/año ρ = **${n2(spear(CAMPOS.map((c) => stats(H1, c).alAno), CAMPOS.map((c) => stats(H2, c).alAno)))}**`);
console.log(`(el hallazgo que ordena el proyecto, reproducido aquí con la rejilla ampliada)`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// B · EL FILTRO DE LA VARA — se deja el ±25 fijo y se elige la BANDA en una mitad
// ═══════════════════════════════════════════════════════════════════════════════════════════
const BANDAS = [];
for (const lo of SUELOS) for (const hi of TECHOS) if (hi > lo) BANDAS.push([lo, hi]);
const maskBanda = (g, lo, hi) => g.map((d) => d.vara >= lo && d.vara <= hi);
function evalBanda(g, lo, hi) {
  const m = maskBanda(g, lo, hi);
  const s = stats(g, "fijoPl", m);
  return { lo, hi, ...s };
}
const baseTodo = stats(dias, "fijoPl");
console.log(`\n\n${"═".repeat(118)}\nB · EL FILTRO DE LA VARA — se mantiene el ±25 fijo y sólo se opera si la vara cae en la banda.\nLa vara (25 ÷ straddle de las 11:00) es OBSERVABLE antes de entrar: ni media móvil, ni memoria, ni futuro.\n${"═".repeat(118)}\n`);
console.log("| banda de la vara | días operados | días/año | $/año | RIESGO 5% peor | peor día | caída total | acierto | crédito medio |");
console.log("|---|---|---|---|---|---|---|---|---|");
console.log(`| sin filtro (todos) | ${baseTodo.n} | 252 | ${eur(baseTodo.alAno)} | ${eur(baseTodo.riesgo)} | ${eur(baseTodo.peor)} | ${eur(baseTodo.racha)} | ${pc1(baseTodo.acierto)} | ${eur(media(dias.map((d) => d.fijoCred)))} |`);
const evTodo = BANDAS.map(([lo, hi]) => evalBanda(dias, lo, hi)).filter((r) => r.n >= 150);
for (const r of [...evTodo].sort((a, b) => b.riesgo - a.riesgo).slice(0, 8)) {
  const op = dias.filter((d) => d.vara >= r.lo && d.vara <= r.hi);
  console.log(`| ${r.lo} ≤ vara ≤ ${r.hi === 99 ? "∞" : r.hi} | ${r.n} | ${r.diasAno.toFixed(0)} | ${eur(r.alAno)} | ${eur(r.riesgo)} | ${eur(r.peor)} | ${eur(r.racha)} | ${pc1(r.acierto)} | ${eur(media(op.map((d) => d.fijoCred)))} |`);
}
console.log(`\n(sólo se listan las 8 de menor riesgo con al menos 150 días operados; las 24 se evalúan igual)`);

function eligeBanda(g, porQue) {
  const cand = BANDAS.map(([lo, hi]) => evalBanda(g, lo, hi)).filter((r) => r.n >= g.length * 0.25);
  if (!cand.length) return null;
  return cand.sort((a, b) => (porQue === "riesgo" ? b.riesgo - a.riesgo : b.alAno - a.alAno))[0];
}
console.log(`\n${"─".repeat(118)}\nB · REGLA DE HIERRO SOBRE LA BANDA — se elige en una mitad y se aplica TAL CUAL a la otra\n${"─".repeat(118)}\n`);
console.log("| criterio | banda elegida en M1 | riesgo M1 | riesgo en M2 | $/año M2 | base M2 | ¿mejor riesgo fuera? | banda elegida en M2 | riesgo en M1 | $/año M1 | base M1 | ¿mejor riesgo fuera? | ¿LAS DOS? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const bH1 = stats(H1, "fijoPl"), bH2 = stats(H2, "fijoPl");
const supervivientes = [];
for (const porQue of ["riesgo", "dinero"]) {
  const e1 = eligeBanda(H1, porQue), e2 = eligeBanda(H2, porQue);
  if (!e1 || !e2) { console.log(`| ${porQue} | sin banda válida | | | | | | | | | | | |`); continue; }
  const f1 = evalBanda(H2, e1.lo, e1.hi), f2 = evalBanda(H1, e2.lo, e2.hi);
  const ok1 = f1.riesgo > bH2.riesgo, ok2 = f2.riesgo > bH1.riesgo;
  if (ok1 && ok2) supervivientes.push({ porQue, e1, e2 });
  console.log(`| elegida por ${porQue} | [${e1.lo}, ${e1.hi === 99 ? "∞" : e1.hi}] | ${eur(e1.riesgo)} | ${eur(f1.riesgo)} | ${eur(f1.alAno)} | ${eur(bH2.alAno)} | ${ok1 ? "sí" : "**no**"} | [${e2.lo}, ${e2.hi === 99 ? "∞" : e2.hi}] | ${eur(f2.riesgo)} | ${eur(f2.alAno)} | ${eur(bH1.alAno)} | ${ok2 ? "sí" : "**no**"} | ${ok1 && ok2 ? "**SÍ**" : "no"} |`);
}
// Y lo mismo con el DINERO como criterio de éxito fuera de muestra (lo que Lester quiere cobrar).
console.log(`\n| criterio | banda elegida en M1 | $/año M1 | $/año en M2 | base M2 | ¿gana más fuera? | banda elegida en M2 | $/año en M1 | base M1 | ¿gana más fuera? | ¿LAS DOS? |`);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
let dineroDobles = 0;
for (const porQue of ["riesgo", "dinero"]) {
  const e1 = eligeBanda(H1, porQue), e2 = eligeBanda(H2, porQue);
  if (!e1 || !e2) continue;
  const f1 = evalBanda(H2, e1.lo, e1.hi), f2 = evalBanda(H1, e2.lo, e2.hi);
  const ok1 = f1.alAno > bH2.alAno, ok2 = f2.alAno > bH1.alAno;
  if (ok1 && ok2) dineroDobles++;
  console.log(`| elegida por ${porQue} | [${e1.lo}, ${e1.hi === 99 ? "∞" : e1.hi}] | ${eur(e1.alAno)} | ${eur(f1.alAno)} | ${eur(bH2.alAno)} | ${ok1 ? "sí" : "**no**"} | [${e2.lo}, ${e2.hi === 99 ? "∞" : e2.hi}] | ${eur(f2.alAno)} | ${eur(bH1.alAno)} | ${ok2 ? "sí" : "**no**"} | ${ok1 && ok2 ? "**SÍ**" : "no"} |`);
}

// ── el corte por AÑOS, la dirección real del tiempo: 2022+2023 → 2024-2026 y al revés ───────
const VIEJO = dias.filter((d) => d.ano <= "2023"), NUEVO = dias.filter((d) => d.ano >= "2024");
console.log(`\n${"─".repeat(118)}\nB · EL CORTE POR AÑOS — ajustar con 2022-2023 y aplicar a 2024-2026, y al revés\n(${VIEJO.length} días contra ${NUEVO.length} días)\n${"─".repeat(118)}\n`);
const bV = stats(VIEJO, "fijoPl"), bN = stats(NUEVO, "fijoPl");
console.log("| criterio | banda de 2022-23 | $/año 2024-26 | base 2024-26 | riesgo 2024-26 | base | banda de 2024-26 | $/año 2022-23 | base 2022-23 | riesgo 2022-23 | base |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const porQue of ["riesgo", "dinero"]) {
  const eV = eligeBanda(VIEJO, porQue), eN = eligeBanda(NUEVO, porQue);
  if (!eV || !eN) continue;
  const aN = evalBanda(NUEVO, eV.lo, eV.hi), aV = evalBanda(VIEJO, eN.lo, eN.hi);
  console.log(`| por ${porQue} | [${eV.lo}, ${eV.hi === 99 ? "∞" : eV.hi}] | ${eur(aN.alAno)} | ${eur(bN.alAno)} | ${eur(aN.riesgo)} | ${eur(bN.riesgo)} | [${eN.lo}, ${eN.hi === 99 ? "∞" : eN.hi}] | ${eur(aV.alAno)} | ${eur(bV.alAno)} | ${eur(aV.riesgo)} | ${eur(bV.riesgo)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// C · LO QUE SOBREVIVE, AÑO A AÑO Y EN DINERO
// ═══════════════════════════════════════════════════════════════════════════════════════════
// La banda que eligen LAS DOS mitades por riesgo, si coinciden; si no, se dice que no coinciden.
const e1r = eligeBanda(H1, "riesgo"), e2r = eligeBanda(H2, "riesgo");
const e1d = eligeBanda(H1, "dinero"), e2d = eligeBanda(H2, "dinero");
console.log(`\n\n${"═".repeat(118)}\nC · QUÉ ELIGE CADA MITAD\n${"═".repeat(118)}`);
console.log(`Por RIESGO: M1 elige [${e1r.lo}, ${e1r.hi === 99 ? "∞" : e1r.hi}] · M2 elige [${e2r.lo}, ${e2r.hi === 99 ? "∞" : e2r.hi}] → ${e1r.lo === e2r.lo && e1r.hi === e2r.hi ? "**COINCIDEN**" : "**NO coinciden**"}`);
console.log(`Por DINERO: M1 elige [${e1d.lo}, ${e1d.hi === 99 ? "∞" : e1d.hi}] · M2 elige [${e2d.lo}, ${e2d.hi === 99 ? "∞" : e2d.hi}] → ${e1d.lo === e2d.lo && e1d.hi === e2d.hi ? "**COINCIDEN**" : "**NO coinciden**"}`);

// La banda de consenso, definida SIN mirar el resultado: la intersección de las dos elegidas por riesgo.
const LO = Math.max(e1r.lo, e2r.lo), HI = Math.min(e1r.hi, e2r.hi);
const usable = HI > LO;
console.log(`\nBANDA DE CONSENSO (intersección de lo que eligió cada mitad por riesgo): [${LO}, ${HI === 99 ? "∞" : HI}] ${usable ? "" : "— VACÍA, no hay consenso"}`);

if (usable) {
  const mAll = maskBanda(dias, LO, HI);
  const sAll = stats(dias, "fijoPl", mAll);
  console.log(`\n${"─".repeat(118)}\nAÑO A AÑO — ±25 sin filtro contra ±25 con la banda de consenso [${LO}, ${HI === 99 ? "∞" : HI}]\n${"─".repeat(118)}\n`);
  console.log("| año | días operados | días totales | ±25 sin filtro $/año | con la banda $/año | sin filtro caída | con la banda caída |");
  console.log("|---|---|---|---|---|---|---|");
  for (const a of anos) {
    const g = porAno[a], m = maskBanda(g, LO, HI);
    const s = stats(g, "fijoPl", m), b = stats(g, "fijoPl");
    console.log(`| ${a === "2023" ? "**2023**" : a} | ${s.n} | ${g.length} | ${eur(b.alAno)} | ${eur(s.alAno)} | ${eur(b.racha)} | ${eur(s.racha)} |`);
  }
  console.log(`| **TODO** | ${sAll.n} | ${dias.length} | ${eur(baseTodo.alAno)} | ${eur(sAll.alAno)} | ${eur(baseTodo.racha)} | ${eur(sAll.racha)} |`);
  const dif = sAll.cal.map((x, i) => x - baseTodo.cal[i]);
  const tPar = media(dif) / (sd(dif) / Math.sqrt(dif.length));
  console.log(`\nDiferencia diaria media ${eur(media(dif))} → ${eur(media(dif) * 252)}/año · t pareada = ${n2(tPar)} · listón ${LISTON} → ${Math.abs(tPar) >= LISTON ? "**SUPERA el listón**" : "**NO supera el listón**"}`);

  console.log(`\n${"─".repeat(118)}\nEN DINERO SOBRE ${eur(CUENTA)} · 1 contrato SPXW · alas 50 pts = ${eur(5000)} de colateral · efectivo libre ${eur(EFECTIVO)}\n${"─".repeat(118)}\n`);
  console.log("| | ±25 sin filtro | ±25 con la banda |");
  console.log("|---|---|---|");
  const F = [
    ["$/año", (s) => eur(s.alAno)], ["  · % de la cuenta", (s) => pc1(s.alAno / CUENTA)],
    ["días operados / año", (s) => s.diasAno.toFixed(0)],
    ["acierto", (s) => pc1(s.acierto)],
    ["RIESGO — media del 5% peor", (s) => eur(s.riesgo)],
    ["peor día", (s) => eur(s.peor)], ["  · % de la cuenta", (s) => pc1(Math.abs(s.peor) / CUENTA)],
    ["  · % del EFECTIVO (de donde salen las pérdidas)", (s) => pc1(Math.abs(s.peor) / EFECTIVO)],
    ["CAÍDA máxima acumulada", (s) => eur(s.racha)], ["  · % de la cuenta", (s) => pc1(Math.abs(s.racha) / CUENTA)],
  ];
  for (const [nom, fn] of F) console.log(`| ${nom} | ${fn(baseTodo)} | ${fn(sAll)} |`);
}

writeFileSync("scripts/regimen-2023-puente.json", JSON.stringify({
  n: dias.length, liston: LISTON, pruebas: PRUEBAS_ACUMULADAS,
  geometriaPorRiesgo: { M1: NOMBRE[gr["POR RIESGO"].e1.c], M2: NOMBRE[gr["POR RIESGO"].e2.c] },
  geometriaPorDinero: { M1: NOMBRE[gr["por $/año"].e1.c], M2: NOMBRE[gr["por $/año"].e2.c] },
  bandaRiesgo: { M1: [e1r.lo, e1r.hi], M2: [e2r.lo, e2r.hi] },
  bandaDinero: { M1: [e1d.lo, e1d.hi], M2: [e2d.lo, e2d.hi] },
  consenso: usable ? [LO, HI] : null,
  supervivientesRiesgo: supervivientes.map((s) => s.porQue), dineroDobles,
}, null, 2));
console.log(`\nGuardado en scripts/regimen-2023-puente.json`);
