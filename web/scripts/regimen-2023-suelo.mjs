// 2023 · EL SUELO DE LA VARA — cerrar los dos cabos sueltos del puente.
//
// CABO 1 · El puente eligió la banda [0,9 · ∞] y 0,9 era EL BORDE de la rejilla de suelos
//   (0,6 / 0,7 / 0,8 / 0,9). Una elección en el borde significa que la rejilla puede no contener
//   el sitio. Se amplía el suelo hasta 1,6 y se vuelve a partir la muestra en las dos direcciones.
//
// CABO 2 · Los días medidos NO son los mismos en los dos informes previos: el retrato pide sólo
//   la cadena del ±25 (1.121 días) y el puente pide las 25 geometrías completas (1.114). En 2022
//   la diferencia son 6 días y ${} de P&L. Hay que decir cuál es el número bueno del ±25.
//
// Precios reales, cuatro patas, bid al vender / ask al comprar, $0,03 por pata. Sin modelo.
// Uso: node --import tsx --max-old-space-size=10240 scripts/regimen-2023-suelo.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const SUELOS = [0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.6];
const PRUEBAS_HOY = SUELOS.length * 2;                 // 10 suelos × 2 direcciones del corte
const PRUEBAS_ACUMULADAS = 388 + PRUEBAS_HOY;
const LISTON = listonT(PRUEBAS_ACUMULADAS);

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50, DIST = 25;
const CUENTA = 56389, EFECTIVO = 7977;

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
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
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;
  const kA = cerca(C.filas, sp11);
  const pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;
  if (!(straddle > 0)) continue;
  const cC = cerca(C.filas, sp11 + DIST), pC = cerca(P.filas, sp11 - DIST);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) continue;
  const S = C.cierre, aC = cL.K - cC.K, aP = pC.K - pL.K;
  const dC = Math.min(Math.max(S - cC.K, 0), aC), dP = Math.min(Math.max(pC.K - S, 0), aP);
  dias.push({
    fecha, ano: fecha.slice(0, 4), sp11, straddle, vara: DIST / straddle,
    pl: (cred - dC - dP) * 100 - 8 * COMM, credito: cred * 100,
    rompe: S > cC.K || S < pC.K ? 1 : 0,
    // ¿tenía este día la rejilla de 25 geometrías completa? (para el CABO 2)
    tieneRejilla: cerca(C.filas, sp11 + 3 * straddle).K > cC.K && cerca(P.filas, sp11 - 3 * straddle).K < pC.K,
  });
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));

console.log("═".repeat(118));
console.log("2023 · EL SUELO DE LA VARA — se amplía la rejilla más allá del borde y se vuelve a partir la muestra");
console.log("═".repeat(118));
console.log(`\nDías con el cóndor ±25 · alas 50 completo: ${dias.length} de ${fechas.length} fechas en disco.`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);
radiografia(dias, ["pl", "credito", "vara", "straddle"], "suelo 2023", { maxCeros: 0.25 });

const anos = [...new Set(dias.map((d) => d.ano))].sort();
const porAno = Object.fromEntries(anos.map((a) => [a, dias.filter((d) => d.ano === a)]));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CABO 2 · ¿CUÁL ES EL NÚMERO BUENO DEL ±25 EN CADA AÑO?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"═".repeat(118)}\nCABO 2 · EL NÚMERO BUENO DEL ±25 — las dos muestras y qué se pierde al exigir la rejilla completa\n${"═".repeat(118)}\n`);
console.log("| año | días con ±25 (la muestra buena) | P&L | días con las 25 geometrías | P&L | días que la rejilla se come | su P&L |");
console.log("|---|---|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a], con = g.filter((d) => d.tieneRejilla), sin = g.filter((d) => !d.tieneRejilla);
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${g.length} | **${eur(suma(g.map((d) => d.pl)))}** | ${con.length} | ${eur(suma(con.map((d) => d.pl)))} | ${sin.length} | ${eur(suma(sin.map((d) => d.pl)))} |`);
}
console.log(`\nEl número que hay que usar para el ±25 es la columna en negrita: exigir que exista un strike a 3 straddles`);
console.log(`de distancia es una condición de la REJILLA, no de la estrategia, y quita días de pánico (que son los caros).`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CABO 1 · EL SUELO, AMPLIADO Y PARTIDO EN DOS
// ═══════════════════════════════════════════════════════════════════════════════════════════
function evalua(g, suelo) {
  const cal = g.map((d) => (d.vara >= suelo ? d.pl : 0));
  const op = g.filter((d) => d.vara >= suelo);
  const v = op.map((d) => d.pl);
  return {
    suelo, n: op.length, diasAno: op.length / (g.length / 252),
    alAno: suma(cal) / (g.length / 252), riesgo: v.length ? riesgo(v) : NaN,
    peor: v.length ? Math.min(...v) : NaN, racha: racha(cal),
    acierto: v.length ? v.filter((x) => x > 0).length / v.length : NaN,
    credito: op.length ? media(op.map((d) => d.credito)) : NaN, cal,
  };
}
console.log(`\n\n${"═".repeat(118)}\nCABO 1 · EL SUELO ENTERO — "no operar si ±25 está a MENOS de N straddles". Todo el período.\n${"═".repeat(118)}\n`);
console.log("| suelo | días operados | días/año | $/año | RIESGO 5% peor | peor día | CAÍDA | acierto | crédito medio |");
console.log("|---|---|---|---|---|---|---|---|---|");
const todos = evalua(dias, 0);
console.log(`| sin suelo | ${todos.n} | 252 | ${eur(todos.alAno)} | ${eur(todos.riesgo)} | ${eur(todos.peor)} | ${eur(todos.racha)} | ${pc1(todos.acierto)} | ${eur(todos.credito)} |`);
for (const s of SUELOS) {
  const r = evalua(dias, s);
  console.log(`| vara ≥ ${s} | ${r.n} | ${r.diasAno.toFixed(0)} | ${eur(r.alAno)} | ${eur(r.riesgo)} | ${eur(r.peor)} | ${eur(r.racha)} | ${pc1(r.acierto)} | ${eur(r.credito)} |`);
}
const rr = SUELOS.map((s) => evalua(dias, s).riesgo);
let mono = true; for (let i = 1; i < rr.length; i++) if (rr[i] < rr[i - 1]) mono = false;
console.log(`\n¿El RIESGO mejora de forma MONÓTONA al subir el suelo? **${mono ? "SÍ" : "no"}** — ${rr.map(eur).join(" → ")}`);

// ── la regla de hierro, en las dos direcciones ─────────────────────────────────────────────
const mitad = Math.floor(dias.length / 2);
const H1 = dias.slice(0, mitad), H2 = dias.slice(mitad);
const elige = (g, porQue) => SUELOS.map((s) => evalua(g, s)).filter((r) => r.n >= g.length * 0.25)
  .sort((a, b) => (porQue === "riesgo" ? b.riesgo - a.riesgo : b.alAno - a.alAno))[0];
console.log(`\n${"─".repeat(118)}\nLA REGLA DE HIERRO — el suelo se elige en UNA mitad y se aplica TAL CUAL a la otra\nMitad 1: ${H1[0].fecha} → ${H1[H1.length - 1].fecha} (${H1.length}) · Mitad 2: ${H2[0].fecha} → ${H2[H2.length - 1].fecha} (${H2.length})\n${"─".repeat(118)}\n`);
const b1 = evalua(H1, 0), b2 = evalua(H2, 0);
console.log("| criterio | suelo elegido en M1 | riesgo en M2 | base M2 | $/año M2 | base M2 | suelo elegido en M2 | riesgo en M1 | base M1 | $/año M1 | base M1 | ¿mejor RIESGO en las dos? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const res = {};
for (const porQue of ["riesgo", "dinero"]) {
  const e1 = elige(H1, porQue), e2 = elige(H2, porQue);
  const f1 = evalua(H2, e1.suelo), f2 = evalua(H1, e2.suelo);
  const ok = f1.riesgo > b2.riesgo && f2.riesgo > b1.riesgo;
  res[porQue] = { e1: e1.suelo, e2: e2.suelo, ok, f1, f2 };
  console.log(`| por ${porQue} | ≥ ${e1.suelo} | ${eur(f1.riesgo)} | ${eur(b2.riesgo)} | ${eur(f1.alAno)} | ${eur(b2.alAno)} | ≥ ${e2.suelo} | ${eur(f2.riesgo)} | ${eur(b1.riesgo)} | ${eur(f2.alAno)} | ${eur(b1.alAno)} | ${ok ? "**SÍ**" : "no"} |`);
}
// El corte por años, la dirección real del tiempo.
const V = dias.filter((d) => d.ano <= "2023"), N = dias.filter((d) => d.ano >= "2024");
const bV = evalua(V, 0), bN = evalua(N, 0);
console.log(`\n| criterio | suelo de 2022-23 | riesgo 2024-26 | base | $/año 2024-26 | base | suelo de 2024-26 | riesgo 2022-23 | base | $/año 2022-23 | base |`);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const porQue of ["riesgo", "dinero"]) {
  const eV = elige(V, porQue), eN = elige(N, porQue);
  const aN = evalua(N, eV.suelo), aV = evalua(V, eN.suelo);
  console.log(`| por ${porQue} | ≥ ${eV.suelo} | ${eur(aN.riesgo)} | ${eur(bN.riesgo)} | ${eur(aN.alAno)} | ${eur(bN.alAno)} | ≥ ${eN.suelo} | ${eur(aV.riesgo)} | ${eur(bV.riesgo)} | ${eur(aV.alAno)} | ${eur(bV.alAno)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// EL SUELO ELEGIDO POR RIESGO EN LAS DOS MITADES · AÑO A AÑO Y EN DINERO
// ═══════════════════════════════════════════════════════════════════════════════════════════
const S1 = res.riesgo.e1, S2 = res.riesgo.e2, SUELO = Math.min(S1, S2);   // el más conservador de los dos = el que las DOS aceptan
console.log(`\n\n${"═".repeat(118)}\nEL SUELO QUE SOBREVIVE — M1 eligió ≥ ${S1} y M2 eligió ≥ ${S2}. Se usa el MENOR (${SUELO}): el que las dos mitades aceptan.\n${"═".repeat(118)}\n`);
const R = evalua(dias, SUELO);
console.log("| año | días operados / totales | ±25 sin suelo $/año | con suelo $/año | sin suelo CAÍDA | con suelo CAÍDA | vara media del año |");
console.log("|---|---|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a], r = evalua(g, SUELO), b = evalua(g, 0);
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${r.n} / ${g.length} | ${eur(b.alAno)} | ${eur(r.alAno)} | ${eur(b.racha)} | ${eur(r.racha)} | ${n2(media(g.map((d) => d.vara)))} |`);
}
console.log(`| **TODO** | ${R.n} / ${dias.length} | ${eur(todos.alAno)} | ${eur(R.alAno)} | ${eur(todos.racha)} | ${eur(R.racha)} | ${n2(media(dias.map((d) => d.vara)))} |`);
const dif = R.cal.map((x, i) => x - todos.cal[i]);
const tPar = media(dif) / (sd(dif) / Math.sqrt(dif.length));
console.log(`\n¿Se pierde ingreso de forma MEDIBLE? diferencia ${eur(media(dif) * 252)}/año · t pareada = ${n2(tPar)} · listón ${LISTON} → ${Math.abs(tPar) >= LISTON ? "**SÍ, se pierde**" : "**no es medible**"}`);

console.log(`\n${"─".repeat(118)}\nEN DINERO SOBRE ${eur(CUENTA)} · 1 contrato SPXW · colateral ${eur(5000)} · EFECTIVO LIBRE ${eur(EFECTIVO)} (de ahí salen las pérdidas)\n${"─".repeat(118)}\n`);
console.log("| | ±25 todos los días | ±25 con vara ≥ " + SUELO + " |");
console.log("|---|---|---|");
for (const [nom, fn] of [
  ["$/año", (s) => eur(s.alAno)], ["  · % de la cuenta", (s) => pc1(s.alAno / CUENTA)],
  ["días operados / año", (s) => s.diasAno.toFixed(0)], ["acierto", (s) => pc1(s.acierto)],
  ["crédito medio", (s) => eur(s.credito)],
  ["RIESGO — media del 5% peor", (s) => eur(s.riesgo)],
  ["peor día", (s) => eur(s.peor)], ["  · % del EFECTIVO", (s) => pc1(Math.abs(s.peor) / EFECTIVO)],
  ["CAÍDA máxima", (s) => eur(s.racha)], ["  · % de la cuenta", (s) => pc1(Math.abs(s.racha) / CUENTA)],
]) console.log(`| ${nom} | ${fn({ ...todos, diasAno: 252 })} | ${fn(R)} |`);

writeFileSync("scripts/regimen-2023-suelo.json", JSON.stringify({
  n: dias.length, liston: LISTON, pruebas: PRUEBAS_ACUMULADAS, monotono: mono,
  suelos: SUELOS.map((s) => { const r = evalua(dias, s); return { suelo: s, n: r.n, alAno: r.alAno, riesgo: r.riesgo, racha: r.racha }; }),
  eleccion: { M1: res.riesgo.e1, M2: res.riesgo.e2, usado: SUELO, sobrevive: res.riesgo.ok },
  base: { alAno: todos.alAno, riesgo: todos.riesgo, racha: todos.racha },
  conSuelo: { alAno: R.alAno, riesgo: R.riesgo, racha: R.racha, diasAno: R.diasAno },
  tPareada: tPar,
  porAno: Object.fromEntries(anos.map((a) => {
    const g = porAno[a], r = evalua(g, SUELO), b = evalua(g, 0);
    return [a, { n: g.length, sinSuelo: b.alAno, conSuelo: r.alAno, plTotal: suma(g.map((d) => d.pl)), caidaSin: b.racha, caidaCon: r.racha, vara: media(g.map((d) => d.vara)) }];
  })),
}, null, 2));
console.log(`\nGuardado en scripts/regimen-2023-suelo.json`);
