// 2023 · EL TECHO — la única palanca que apuntaba a arreglar 2023, sometida a la regla de hierro.
//
// LO QUE YA SE SABE (scripts/regimen-2023-suelo.mjs):
//   · El SUELO de la vara (no operar si ±25 está CERCA del dinero) baja el riesgo de forma
//     monótona en los 10 escalones... y a 2023 lo EMPEORA: −$6.794 → −$12.515. Es la palanca
//     equivocada para este año, porque la vara de 2023 era 1,45: alta, no baja.
//   · La palanca que apunta a 2023 es la contraria: un TECHO. "No operar si ±25 está DEMASIADO
//     LEJOS, porque el crédito ya no paga el ala." En la tabla de quintiles el Q5 (vara ≥ 1,57)
//     daba −$8.539/año y el 43% de esos días eran de 2023.
//   · Pero cuando el techo entró en la rejilla del puente, las dos mitades eligieron techos
//     INCOMPATIBLES. Aquí se mide el techo SOLO, y se declara.
//
// Y se cierra la aritmética que explica el año: el coste medio del día que rompe una pata contra
// el crédito que se cobró, año a año. Ahí está el mecanismo entero.
//
// Precios reales, cuatro patas, bid al vender / ask al comprar, $0,03 por pata. Sin modelo.
// Uso: node --import tsx --max-old-space-size=10240 scripts/regimen-2023-techo.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const TECHOS = [0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 1.7, 2.0];
const PRUEBAS_HOY = TECHOS.length * 2;
const PRUEBAS_ACUMULADAS = 408 + PRUEBAS_HOY;
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
    dano: (dC + dP) * 100, rompe: S > cC.K || S < pC.K ? 1 : 0,
  });
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const anos = [...new Set(dias.map((d) => d.ano))].sort();
const porAno = Object.fromEntries(anos.map((a) => [a, dias.filter((d) => d.ano === a)]));

console.log("═".repeat(118));
console.log("2023 · EL TECHO DE LA VARA — la palanca que apunta a 2023, y la aritmética que explica el año");
console.log("═".repeat(118));
console.log(`\nDías con el cóndor ±25 · alas 50: ${dias.length} de ${fechas.length} fechas en disco.`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);
radiografia(dias, ["pl", "credito", "dano", "vara", "straddle"], "techo 2023", { maxCeros: 0.5, cerosLegitimos: ["dano"] });

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA ARITMÉTICA DEL AÑO — crédito contra coste de la rotura
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"═".repeat(118)}\nTABLA 16 · LA ARITMÉTICA QUE EXPLICA CADA AÑO — la ecuación entera del cóndor ±25, en cuatro números\n${"═".repeat(118)}\n`);
console.log("| año | crédito medio (todos los días) | % de días que ROMPEN | coste medio del día que rompe | crédito que hace falta | crédito real − necesario | P&L/día real |");
console.log("|---|---|---|---|---|---|---|");
const arit = {};
for (const a of anos) {
  const g = porAno[a], rotos = g.filter((d) => d.rompe);
  const cr = media(g.map((d) => d.credito));
  const p = media(g.map((d) => d.rompe));
  const coste = media(rotos.map((d) => d.dano));
  const nec = p * coste;                                    // crédito necesario para empatar
  arit[a] = { cr, p, coste, nec, pl: media(g.map((d) => d.pl)) };
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${eur(cr)} | ${pc1(p)} | ${eur(coste)} | ${eur(nec)} | ${eur(cr - nec)} | ${eur(media(g.map((d) => d.pl)))} |`);
}
console.log(`\nLa ecuación: **P&L por día ≈ crédito − (probabilidad de rotura × coste de la rotura) − $0,24 de comisión.**`);
console.log(`2023 y 2024 rompen casi lo MISMO (${pc1(arit["2023"].p)} contra ${pc1(arit["2024"].p)}) y el golpe cuesta casi lo mismo`);
console.log(`(${eur(arit["2023"].coste)} contra ${eur(arit["2024"].coste)}). Lo único que cambia es el CRÉDITO: ${eur(arit["2023"].cr)} contra ${eur(arit["2024"].cr)}.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL TECHO — "no operar si ±25 está a MÁS de N straddles"
// ═══════════════════════════════════════════════════════════════════════════════════════════
function evalua(g, techo) {
  const cal = g.map((d) => (d.vara <= techo ? d.pl : 0));
  const op = g.filter((d) => d.vara <= techo);
  const v = op.map((d) => d.pl);
  return {
    techo, n: op.length, diasAno: op.length / (g.length / 252),
    alAno: suma(cal) / (g.length / 252), riesgo: v.length ? riesgo(v) : NaN,
    peor: v.length ? Math.min(...v) : NaN, racha: racha(cal),
    acierto: v.length ? v.filter((x) => x > 0).length / v.length : NaN,
    credito: op.length ? media(op.map((d) => d.credito)) : NaN, cal,
  };
}
const base = evalua(dias, 99);
console.log(`\n\n${"═".repeat(118)}\nTABLA 17 · EL TECHO ENTERO — "no operar si el ±25 está a MÁS de N straddles". Todo el período.\n${"═".repeat(118)}\n`);
console.log("| techo | días operados | días/año | $/año | RIESGO 5% peor | peor día | CAÍDA | acierto | crédito medio | 2023 $/año |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
console.log(`| sin techo | ${base.n} | 252 | ${eur(base.alAno)} | ${eur(base.riesgo)} | ${eur(base.peor)} | ${eur(base.racha)} | ${pc1(base.acierto)} | ${eur(base.credito)} | ${eur(evalua(porAno["2023"], 99).alAno)} |`);
for (const t of TECHOS) {
  const r = evalua(dias, t), r23 = evalua(porAno["2023"], t);
  console.log(`| vara ≤ ${t} | ${r.n} | ${r.diasAno.toFixed(0)} | ${eur(r.alAno)} | ${eur(r.riesgo)} | ${eur(r.peor)} | ${eur(r.racha)} | ${pc1(r.acierto)} | ${eur(r.credito)} | ${eur(r23.alAno)} |`);
}
const rr = TECHOS.map((t) => evalua(dias, t).riesgo);
console.log(`\nRiesgo al bajar el techo: ${rr.map(eur).join(" → ")}  → el techo **${rr.every((x, i) => i === 0 || x <= rr[i - 1]) ? "EMPEORA" : "no mejora de forma monótona"}** el riesgo.`);

// ── la regla de hierro sobre el techo ──────────────────────────────────────────────────────
const mitad = Math.floor(dias.length / 2);
const H1 = dias.slice(0, mitad), H2 = dias.slice(mitad);
const elige = (g, porQue) => TECHOS.map((t) => evalua(g, t)).filter((r) => r.n >= g.length * 0.25)
  .sort((a, b) => (porQue === "riesgo" ? b.riesgo - a.riesgo : b.alAno - a.alAno))[0];
const b1 = evalua(H1, 99), b2 = evalua(H2, 99);
console.log(`\n${"─".repeat(118)}\nTABLA 18 · REGLA DE HIERRO SOBRE EL TECHO\nMitad 1: ${H1[0].fecha} → ${H1[H1.length - 1].fecha} (${H1.length}) · Mitad 2: ${H2[0].fecha} → ${H2[H2.length - 1].fecha} (${H2.length})\n${"─".repeat(118)}\n`);
console.log("| criterio | techo en M1 | riesgo en M2 | base M2 | $/año M2 | base M2 | techo en M2 | riesgo en M1 | base M1 | $/año M1 | base M1 | ¿el mismo techo? | ¿mejor en las dos? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const veredicto = {};
for (const porQue of ["riesgo", "dinero"]) {
  const e1 = elige(H1, porQue), e2 = elige(H2, porQue);
  const f1 = evalua(H2, e1.techo), f2 = evalua(H1, e2.techo);
  const metric = porQue === "riesgo" ? "riesgo" : "alAno";
  const ok = f1[metric] > b2[metric] && f2[metric] > b1[metric];
  veredicto[porQue] = { M1: e1.techo, M2: e2.techo, mismo: e1.techo === e2.techo, ok };
  console.log(`| por ${porQue} | ≤ ${e1.techo} | ${eur(f1.riesgo)} | ${eur(b2.riesgo)} | ${eur(f1.alAno)} | ${eur(b2.alAno)} | ≤ ${e2.techo} | ${eur(f2.riesgo)} | ${eur(b1.riesgo)} | ${eur(f2.alAno)} | ${eur(b1.alAno)} | ${e1.techo === e2.techo ? "**SÍ**" : "**no**"} | ${ok ? "**SÍ**" : "no"} |`);
}
// El corte por años.
const V = dias.filter((d) => d.ano <= "2023"), N = dias.filter((d) => d.ano >= "2024");
const bV = evalua(V, 99), bN = evalua(N, 99);
console.log(`\n| criterio | techo de 2022-23 | $/año 2024-26 | base | riesgo 2024-26 | base | techo de 2024-26 | $/año 2022-23 | base | riesgo 2022-23 | base |`);
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const porQue of ["riesgo", "dinero"]) {
  const eV = elige(V, porQue), eN = elige(N, porQue);
  const aN = evalua(N, eV.techo), aV = evalua(V, eN.techo);
  console.log(`| por ${porQue} | ≤ ${eV.techo} | ${eur(aN.alAno)} | ${eur(bN.alAno)} | ${eur(aN.riesgo)} | ${eur(bN.riesgo)} | ≤ ${eN.techo} | ${eur(aV.alAno)} | ${eur(bV.alAno)} | ${eur(aV.riesgo)} | ${eur(bV.riesgo)} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL VEREDICTO EN DINERO
// ═══════════════════════════════════════════════════════════════════════════════════════════
const TC = veredicto.dinero.M1;
console.log(`\n\n${"═".repeat(118)}\nTABLA 19 · SI SE APLICARA EL TECHO QUE ELIGIÓ EL DINERO EN M1 (≤ ${TC}) — año a año\n${"═".repeat(118)}\n`);
const R = evalua(dias, TC);
console.log("| año | días operados / totales | sin techo $/año | con techo $/año | sin techo CAÍDA | con techo CAÍDA |");
console.log("|---|---|---|---|---|---|");
for (const a of anos) {
  const g = porAno[a], r = evalua(g, TC), b = evalua(g, 99);
  console.log(`| ${a === "2023" ? "**2023**" : a} | ${r.n} / ${g.length} | ${eur(b.alAno)} | ${eur(r.alAno)} | ${eur(b.racha)} | ${eur(r.racha)} |`);
}
console.log(`| **TODO** | ${R.n} / ${dias.length} | ${eur(base.alAno)} | ${eur(R.alAno)} | ${eur(base.racha)} | ${eur(R.racha)} |`);
const dif = R.cal.map((x, i) => x - base.cal[i]);
const tPar = media(dif) / (sd(dif) / Math.sqrt(dif.length));
console.log(`\nDiferencia ${eur(media(dif) * 252)}/año · t pareada = ${n2(tPar)} · listón ${LISTON} → ${Math.abs(tPar) >= LISTON ? "**SUPERA el listón**" : "**NO supera el listón**"}`);
console.log(`\nEn dinero sobre ${eur(CUENTA)} (efectivo libre ${eur(EFECTIVO)}, de donde salen las pérdidas):`);
console.log(`  · sin techo:  ${eur(base.alAno)}/año (${pc1(base.alAno / CUENTA)}) · caída ${eur(base.racha)} (${pc1(Math.abs(base.racha) / CUENTA)} de la cuenta) · peor día ${eur(base.peor)} (${pc1(Math.abs(base.peor) / EFECTIVO)} del efectivo)`);
console.log(`  · con techo:  ${eur(R.alAno)}/año (${pc1(R.alAno / CUENTA)}) · caída ${eur(R.racha)} (${pc1(Math.abs(R.racha) / CUENTA)} de la cuenta) · peor día ${eur(R.peor)} (${pc1(Math.abs(R.peor) / EFECTIVO)} del efectivo)`);

writeFileSync("scripts/regimen-2023-techo.json", JSON.stringify({
  n: dias.length, liston: LISTON, pruebas: PRUEBAS_ACUMULADAS,
  aritmetica: arit, veredictoTecho: veredicto,
  techos: TECHOS.map((t) => { const r = evalua(dias, t); return { techo: t, n: r.n, alAno: r.alAno, riesgo: r.riesgo, racha: r.racha, pl2023: evalua(porAno["2023"], t).alAno }; }),
  base: { alAno: base.alAno, riesgo: base.riesgo, racha: base.racha, peor: base.peor },
  tPareada: tPar,
}, null, 2));
console.log(`\nGuardado en scripts/regimen-2023-techo.json`);
