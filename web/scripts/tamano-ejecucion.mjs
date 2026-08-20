// EL TAMAÑO — lo único que Lester controla del todo.
//
// Sobre la serie de 1.121 días (scripts/tamano-serie.mjs) y su cuenta REAL:
//   total $56.389 · efectivo $7.977 · 500 HOOD ≈ $48.412 · poder de compra $73.874 · margen 5%
//   colateral Robinhood $5.000 por cóndor (una vertical al ancho completo, comprobado en pantalla)
//
// DOS VISTAS, y no se mezclan:
//   A · ARITMÉTICA PURA — k × el resultado del día. Escala lineal, sin cuenta que la frene.
//       Sirve para ver el precio del tamaño: cuánto ingreso cuesta cada dólar de caída quitado.
//   B · LA CUENTA REAL — efectivo, débito al 5%, poder de compra, y recorte forzoso cuando no
//       cabe. Sirve para una sola pregunta: ¿sobrevive o le llaman al margen?
//
// MODELO DE CUENTA (declarado, no escondido):
//   · El colateral sale del PODER DE COMPRA. Las pérdidas salen del EFECTIVO.
//   · Efectivo negativo = débito de margen al 5% anual, cobrado por días naturales.
//   · Poder de compra ligado al efectivo a razón de 2×1 (Reg-T): poder = 73.874 + 2×(efectivo−7.977).
//     Calibrado con sus dos cifras reales. Con el efectivo en −$29.047 el poder llega a CERO:
//     eso es la llamada de margen y la venta forzosa de HOOD.
//   · HOOD se mantiene CONSTANTE a $48.412. No se mezcla su riesgo con el de la estrategia.
//     Si HOOD cae, el poder de compra cae con él y todo esto empeora. NO está medido aquí.
//
// REGLA DE HIERRO: el tamaño se elige en un período y se prueba en el otro. Y al revés.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-ejecucion.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const TOTAL0 = 56389, EFECTIVO0 = 7977, HOOD = TOTAL0 - EFECTIVO0, PODER0 = 73874;
const COLATERAL = 5000, INTERES = 0.05;
const PODER = (efe) => PODER0 + 2 * (efe - EFECTIVO0);
const PRUEBAS = 30;
const LISTON = listonT(PRUEBAS);

const dias = JSON.parse(readFileSync("scripts/tamano-serie.json", "utf8"));
radiografia(dias, ["pl", "credito", "riesgo", "mov"], "serie del cóndor");

const D22 = dias.filter((d) => d.fecha < "2024-01-01");
const D24 = dias.filter((d) => d.fecha >= "2024-01-01");

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);
const tDe = (v) => { const m = med(v), s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };

// ── VISTA A · ARITMÉTICA PURA ────────────────────────────────────────────────────────────────
function puro(serie, k) {
  const pls = serie.map((d) => d.pl * k);
  let eq = TOTAL0, pico = TOTAL0, peor = 0, iPico = 0, tramo = null, iFin = 0;
  serie.forEach((d, i) => {
    eq += pls[i];
    if (eq > pico) { pico = eq; iPico = i; }
    if (pico - eq > peor) { peor = pico - eq; tramo = [iPico >= 0 ? (iPico === 0 ? serie[0].fecha : serie[iPico].fecha) : serie[0].fecha, d.fecha]; iFin = i; }
  });
  // ¿se recuperó el pico después del fondo?
  let recuperado = null, e2 = TOTAL0;
  const objetivo = pico;
  for (let i = 0; i < serie.length; i++) { e2 += pls[i]; if (i > iFin && e2 >= objetivo) { recuperado = serie[i].fecha; break; } }
  const total = pls.reduce((a, x) => a + x, 0), anos = serie.length / 252;
  return {
    k, n: serie.length, total, porAno: total / anos, medioDia: total / serie.length,
    ganados: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), mejorDia: Math.max(...pls), p1: perc(pls, 0.01), p5: perc(pls, 0.05),
    peorRacha: peor, caida: peor / TOTAL0, tramo, recuperado, t: tDe(pls), pls,
  };
}

// ── VISTA B · LA CUENTA REAL ─────────────────────────────────────────────────────────────────
function cuenta(serie, politica) {
  let efectivo = EFECTIVO0, interesTotal = 0, pico = TOTAL0, peorRacha = 0;
  let peorEfectivo = EFECTIVO0, diasEnDebito = 0, recortes = 0, llamada = null, primerDebito = null;
  let contratosMax = 0, contratosMin = Infinity, sumaContratos = 0, diasOperados = 0;
  for (let i = 0; i < serie.length; i++) {
    const d = serie[i];
    if (i > 0 && efectivo < 0) {
      const int = -efectivo * INTERES * (difDias(serie[i - 1].fecha, d.fecha) / 365);
      interesTotal += int; efectivo -= int;
    }
    const poder = PODER(efectivo);
    if (poder <= 0 && !llamada) llamada = d.fecha;
    let n = Math.max(0, Math.floor(politica({ equity: HOOD + efectivo, efectivo, poder })));
    const cabe = Math.max(0, Math.floor(poder / COLATERAL));
    if (n > cabe) { recortes++; n = cabe; }
    efectivo += n * d.pl;
    if (n > 0) { diasOperados++; sumaContratos += n; contratosMax = Math.max(contratosMax, n); contratosMin = Math.min(contratosMin, n); }
    if (efectivo < 0) { diasEnDebito++; if (!primerDebito) primerDebito = d.fecha; }
    peorEfectivo = Math.min(peorEfectivo, efectivo);
    const eq = HOOD + efectivo;
    pico = Math.max(pico, eq); peorRacha = Math.max(peorRacha, pico - eq);
  }
  const anos = serie.length / 252, neto = efectivo - EFECTIVO0;
  return {
    neto, porAno: neto / anos, interesTotal, peorEfectivo, diasEnDebito, primerDebito, recortes, llamada,
    peorRacha, caida: peorRacha / TOTAL0, diasOperados,
    contratosMin: contratosMin === Infinity ? 0 : contratosMin, contratosMax,
    contratosMedios: diasOperados ? sumaContratos / diasOperados : 0,
    capitalFinal: TOTAL0 + neto, sobrevive: !llamada && recortes === 0,
  };
}

// ═══ 0 · LA MATERIA PRIMA ════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n0 · LA MATERIA PRIMA · UN contrato, sin filtro ninguno, ${dias.length} días (${dias[0].fecha} → ${dias.at(-1).fecha})\n${"═".repeat(100)}\n`);
console.log("| período | días | $/día | $/año | ganados | peor día | p1 | p5 | peor racha | caída | t |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [et, s] of [["2022-2023", D22], ["2024-2026", D24], ["**TODO 2022-2026**", dias]]) {
  const r = puro(s, 1);
  console.log(`| ${et} | ${r.n} | ${eur(r.medioDia)} | ${eur(r.porAno)} | ${pc(r.ganados)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${r.t.toFixed(2)} |`);
}
console.log(`\n  listón de |t| con ${PRUEBAS} pruebas declaradas (Bonferroni): ${LISTON}\n`);
console.log("| año | días | ganados | total del año | peor día | crédito medio |");
console.log("|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.fecha.startsWith(a)); if (!g.length) continue;
  const r = puro(g, 1);
  console.log(`| ${a} | ${r.n} | ${pc(r.ganados)} | ${eur(r.total)} | ${eur(r.peorDia)} | ${eur(med(g.map((x) => x.credito)))} |`);
}

// ═══ 1 · TAMAÑO FIJO — ARITMÉTICA PURA ═══════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n1 · TAMAÑO FIJO · vista A, aritmética pura (sin frenos de cuenta) · 2022-2026 completo\n${"═".repeat(100)}\n`);
const FIJOS = [1, 2, 3, 4, 5];
const A = {};
console.log("| contratos | colateral | $/año | peor día | p1 | p5 | peor racha | caída sobre la cuenta | ¿recupera el pico? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const k of FIJOS) {
  const r = puro(dias, k); A[k] = r;
  console.log(`| ${k} | ${eur(k * COLATERAL)} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${r.recuperado ?? "NUNCA en la muestra"} |`);
}

// ═══ 2 · TAMAÑO FIJO — LA CUENTA REAL ════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n2 · TAMAÑO FIJO · vista B, la cuenta real (efectivo, margen al 5%, poder de compra)\n${"═".repeat(100)}\n`);
console.log("| contratos | $/año NETO de intereses | intereses pagados | efectivo mínimo | 1er día en débito | días en débito | ¿llamada de margen? | ¿SOBREVIVE? |");
console.log("|---|---|---|---|---|---|---|---|");
const B = {};
for (const k of FIJOS) {
  const r = cuenta(dias, () => k); B[k] = r;
  console.log(`| ${k} | ${eur(r.porAno)} | ${eur(-r.interesTotal)} | ${eur(r.peorEfectivo)} | ${r.primerDebito ?? "—"} | ${r.diasEnDebito} | ${r.llamada ?? "no"} | ${r.sobrevive ? "sí" : "**NO**"} |`);
}
console.log(`\n  EL CUELLO DE BOTELLA, en una línea: el peor día de UN solo contrato es ${eur(A[1].peorDia)} y él tiene`);
console.log(`  ${eur(EFECTIVO0)} de efectivo. Con 2 contratos, UN SOLO día malo (${eur(A[2].peorDia)}) ya lo mete en débito.`);
console.log(`  El colateral (${eur(COLATERAL)}/contrato contra ${eur(PODER0)} de poder) da para 14 contratos. El EFECTIVO da para 1.`);

// ═══ 3 · EL PRECIO DEL TAMAÑO ════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n3 · LA MÉTRICA QUE DECIDE · $ de ingreso perdidos por cada $ de caída eliminado\n${"═".repeat(100)}\n`);
console.log("| bajar de → a | ingreso que pierde | caída que quita | $ de ingreso por $ de caída |");
console.log("|---|---|---|---|");
for (let i = FIJOS.length - 1; i > 0; i--) {
  const alto = A[FIJOS[i]], bajo = A[FIJOS[i - 1]];
  const dI = alto.porAno - bajo.porAno, dC = alto.peorRacha - bajo.peorRacha;
  console.log(`| ${FIJOS[i]} → ${FIJOS[i - 1]} | ${eur(dI)}/año | ${eur(dC)} | ${(dI / dC).toFixed(3)} |`);
}
console.log(`\n  Y en cada período por separado (el ratio es la PENDIENTE, y es constante por construcción):`);
for (const [et, s] of [["2022-2023", D22], ["2024-2026", D24], ["TODO", dias]]) {
  const r1 = puro(s, 1);
  console.log(`    ${et.padEnd(10)} cada contrato añade ${eur(r1.porAno).padStart(9)}/año de ingreso y ${eur(r1.peorRacha).padStart(9)} de caída` +
    ` → ratio ${(r1.porAno / r1.peorRacha).toFixed(3)}`);
}
console.log(`\n  Ese ratio es EL PRECIO JUSTO de la caída. Ningún filtro de los 47 medidos lo ha batido:`);
console.log(`  todos cobraban más ingreso del que quitaban de caída. Encoger es el único que cobra lo justo.`);

// ═══ 4 · PROPORCIONAL AL CAPITAL, COMPUESTO ══════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n4 · TAMAÑO PROPORCIONAL · % del capital como colateral, capital compuesto día a día\n${"═".repeat(100)}\n`);
console.log(`  LA GRANULARIDAD MANDA: ${eur(COLATERAL)} de colateral sobre ${eur(TOTAL0)} = 8,9% de la cuenta POR CONTRATO.`);
console.log(`  El tamaño no es continuo. Va 0 → 8,9% → 17,7% → 26,6%. Un objetivo del 5% redondea a CERO.\n`);
console.log("| % objetivo | contratos que salen | $/año neto | capital final | peor racha | caída | efectivo mínimo | ¿sobrevive? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const p of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]) {
  const r = cuenta(dias, ({ equity }) => (p * equity) / COLATERAL);
  const rango = r.contratosMax === 0 ? "0 — NUNCA opera" : r.contratosMin === r.contratosMax ? `${r.contratosMin}` : `${r.contratosMin}–${r.contratosMax}`;
  console.log(`| ${pc(p)} | ${rango} | ${eur(r.porAno)} | ${eur(r.capitalFinal)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${eur(r.peorEfectivo)} | ${r.sobrevive ? "sí" : "**NO**"} |`);
}

// ═══ 5 · EL TAMAÑO MÁXIMO CON LA CAÍDA ACOTADA, Y LA PRUEBA CRUZADA ══════════════════════════
console.log(`\n${"═".repeat(100)}\n5 · ¿QUÉ TAMAÑO MAXIMIZA EL DINERO SIN QUE LA CAÍDA PASE DEL 15%? ¿Y DEL 25%?\n${"═".repeat(100)}`);
const mayorQueCabe = (serie, techo) => {
  let mejor = 0;
  for (let k = 1; k <= 14; k++) { if (puro(serie, k).caida <= techo) mejor = k; else break; }
  return mejor;
};
const cruces = [];
for (const techo of [0.15, 0.25]) {
  console.log(`\n### techo: la caída no pasa del ${pc(techo)} de la cuenta = ${eur(techo * TOTAL0)}\n`);
  console.log("| se elige mirando | tamaño que sale | caída ahí | $/año ahí | → se aplica a | caída FUERA | $/año FUERA | ¿aguanta el techo FUERA? |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [etA, SA, etB, SB] of [["2022-2023", D22, "2024-2026", D24], ["2024-2026", D24, "2022-2023", D22]]) {
    const k = mayorQueCabe(SA, techo);
    if (k === 0) { console.log(`| ${etA} | **0 — ni un contrato cabe** | — | — | ${etB} | — | — | — |`); cruces.push({ techo, etA, k: 0, ok: false }); continue; }
    const rA = puro(SA, k), rB = puro(SB, k), ok = rB.caida <= techo;
    console.log(`| ${etA} | **${k}** | ${pc(rA.caida)} | ${eur(rA.porAno)} | ${etB} | ${pc(rB.caida)} | ${eur(rB.porAno)} | ${ok ? "SÍ" : "**NO**"} |`);
    cruces.push({ techo, etA, k, ok, caidaFuera: rB.caida, anoFuera: rB.porAno, anoDentro: rA.porAno });
  }
  const kT = mayorQueCabe(dias, techo);
  console.log(`\n  sobre los 1.121 días juntos: **${kT} contrato(s)**` + (kT ? ` · caída ${pc(puro(dias, kT).caida)} · ${eur(puro(dias, kT).porAno)}/año` : " — ni uno solo cabe bajo ese techo"));
}
console.log(`\n  La caída de UN contrato sobre los 1.121 días es ${eur(A[1].peorRacha)} = ${pc(A[1].caida)} de su cuenta.`);
console.log(`  Como la caída escala LINEAL con el tamaño, el techo dicta el tamaño directamente:`);
for (const techo of [0.15, 0.25, 0.5, 0.75]) {
  console.log(`     techo ${pc(techo)} (${eur(techo * TOTAL0)}) → ${(techo * TOTAL0 / A[1].peorRacha).toFixed(2)} contratos ⇒ ${Math.floor(techo * TOTAL0 / A[1].peorRacha)} entero(s)`);
}

// ═══ 6 · DÓNDE DUELE ═════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n6 · DÓNDE DUELE · la peor racha y los peores días, con fechas\n${"═".repeat(100)}\n`);
for (const k of [1, 2, 3]) {
  const r = A[k];
  console.log(`  ${k} contrato(s) · peor racha ${eur(-r.peorRacha)} (${pc(r.caida)}) del ${r.tramo[0]} al ${r.tramo[1]} · recupera: ${r.recuperado ?? "NUNCA en la muestra"}`);
}
console.log(`\n  Los 10 peores días (1 contrato) y cuánto se movió el índice desde las 11:00:`);
for (const d of [...dias].sort((a, b) => a.pl - b.pl).slice(0, 10))
  console.log(`    ${d.fecha}  ${eur(d.pl).padStart(8)}  movimiento ${(d.movPct >= 0 ? "+" : "") + d.movPct.toFixed(2)}%  crédito cobrado ${eur(d.credito)}`);
console.log(`\n  Reparto de días perdedores por tamaño del golpe (1 contrato):`);
const cubos = [[-Infinity, -4000], [-4000, -3000], [-3000, -2000], [-2000, -1000], [-1000, 0], [0, Infinity]];
for (const [a, b] of cubos) {
  const g = dias.filter((d) => d.pl > a && d.pl <= b);
  console.log(`    ${(a === -Infinity ? "peor que −$4.000" : b === Infinity ? "en ganancia" : `entre ${eur(a)} y ${eur(b)}`).padEnd(24)} ${String(g.length).padStart(4)} días (${pc(g.length / dias.length)})  suma ${eur(g.reduce((s, x) => s + x.pl, 0))}`);
}

// ═══ 7 · EL DIAL QUE FALTABA · EL ANCHO DEL ALA ══════════════════════════════════════════════
// Un contrato entero ya es el 8,9% de su cuenta. Por debajo de eso el tamaño no existe... con el
// ala de 50. Pero el colateral de Robinhood es el ancho de la vertical × 100: un ala de 25 son
// $2.500, un ala de 10 son $1.000. Es un dial de TAMAÑO, no una idea nueva de estrategia.
const ALAS = [10, 15, 20, 25, 30, 40, 50];
function puroAla(serie, ala, k = 1) {
  const s = serie.filter((d) => d.porAla[ala] && d.porAla[ala].credito > 0);
  const pls = s.map((d) => d.porAla[ala].pl * k);
  let eq = TOTAL0, pico = TOTAL0, peor = 0;
  for (const p of pls) { eq += p; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq); }
  const total = pls.reduce((a, x) => a + x, 0);
  const col = med(s.map((d) => d.porAla[ala].colateral)) * k;
  return { n: s.length, total, porAno: total / (s.length / 252), peorDia: Math.min(...pls),
    p1: perc(pls, 0.01), p5: perc(pls, 0.05), peorRacha: peor, caida: peor / TOTAL0,
    colateral: col, pctCuenta: col / TOTAL0, ratio: peor > 0 ? (total / (s.length / 252)) / peor : NaN,
    ganados: pls.filter((x) => x > 0).length / pls.length };
}
console.log(`\n${"═".repeat(100)}\n7 · EL DIAL QUE FALTABA · EL ANCHO DEL ALA · cómo comprar MENOS de un contrato\n${"═".repeat(100)}\n`);
console.log(`  Mismas patas cortas (spot±25, 11:00). Sólo cambia lo que se COMPRA de protección.`);
console.log(`  Colateral Robinhood = ancho de la vertical × 100. Es el dial de tamaño fino que no existía.\n`);
console.log("| ala | colateral / contrato | % de su cuenta | $/año | ganados | peor día | p1 | p5 | peor racha | caída | ratio ingreso/caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const a of ALAS) {
  const r = puroAla(dias, a);
  console.log(`| ${a} | ${eur(r.colateral)} | ${pc(r.pctCuenta)} | ${eur(r.porAno)} | ${pc(r.ganados)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${r.ratio.toFixed(3)} |`);
}
console.log(`\n  El mismo cuadro en los DOS períodos, para ver si el dial se comporta igual en los dos:\n`);
console.log("| ala | 22-23 $/año | 22-23 caída | 22-23 ratio | 24-26 $/año | 24-26 caída | 24-26 ratio | ¿mismo signo? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of ALAS) {
  const x = puroAla(D22, a), y = puroAla(D24, a);
  console.log(`| ${a} | ${eur(x.porAno)} | ${pc(x.caida)} | ${x.ratio.toFixed(3)} | ${eur(y.porAno)} | ${pc(y.caida)} | ${y.ratio.toFixed(3)} | ${Math.sign(x.porAno) === Math.sign(y.porAno) ? "sí" : "**NO**"} |`);
}

// La prueba cruzada del ANCHO: se elige el ala en un período y se aplica al otro.
console.log(`\n  PRUEBA CRUZADA DEL ANCHO — se elige el ala que da mejor ratio en un período, se aplica al otro:\n`);
console.log("| se elige mirando | ala elegida | ratio ahí | → aplicada a | ratio FUERA | ¿sigue siendo la mejor FUERA? |");
console.log("|---|---|---|---|---|---|");
for (const [etA, SA, etB, SB] of [["2022-2023", D22, "2024-2026", D24], ["2024-2026", D24, "2022-2023", D22]]) {
  const rk = ALAS.map((a) => ({ a, r: puroAla(SA, a).ratio })).sort((p, q) => q.r - p.r);
  const mejorA = rk[0].a;
  const rkB = ALAS.map((a) => ({ a, r: puroAla(SB, a).ratio })).sort((p, q) => q.r - p.r);
  console.log(`| ${etA} | ${mejorA} | ${rk[0].r.toFixed(3)} | ${etB} | ${puroAla(SB, mejorA).ratio.toFixed(3)} | ${rkB[0].a === mejorA ? "SÍ" : `**NO** — ahí la mejor es ${rkB[0].a}`} |`);
}

// ═══ 8 · EL OTRO DIAL FINO · LA FRECUENCIA ═══════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n8 · EL OTRO DIAL FINO · OPERAR MENOS DÍAS · sin elegir cuáles (eso sería un filtro, y todos murieron)\n${"═".repeat(100)}\n`);
console.log(`  Uno de cada N días de mercado, por calendario puro. NO mira nada del día: no puede sobreajustar.\n`);
console.log("| cadencia | días operados | $/año | peor día | peor racha | caída | ratio ingreso/caída | 22-23 $/año | 24-26 $/año |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const N of [1, 2, 3, 4, 5]) {
  const sub = (s) => s.filter((_, i) => i % N === 0);
  const r = puro(sub(dias), 1), x = puro(sub(D22), 1), y = puro(sub(D24), 1);
  const anos = dias.length / 252;   // se anualiza sobre el calendario COMPLETO, no sobre los días operados
  const aa = r.total / anos, ax = x.total / (D22.length / 252), ay = y.total / (D24.length / 252);
  console.log(`| 1 de cada ${N} | ${r.n} | ${eur(aa)} | ${eur(r.peorDia)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${(aa / r.peorRacha).toFixed(3)} | ${eur(ax)} | ${eur(ay)} |`);
}

// ═══ 9 · LA TABLA PARA DECIDIR ═══════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n9 · LA TABLA PARA DECIDIR · combinaciones que su EFECTIVO de $7.977 aguanta de verdad\n${"═".repeat(100)}\n`);
console.log("| combinación | colateral | % cuenta | peor día | ¿lo cubre el efectivo? | caída 22-26 | caída 22-23 | caída 24-26 | $/año 22-26 | $/año 22-23 | $/año 24-26 | veredicto |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const COMBOS = [
  ["1 cóndor ala 50", 50, 1], ["1 cóndor ala 30", 30, 1], ["1 cóndor ala 25", 25, 1],
  ["1 cóndor ala 20", 20, 1], ["1 cóndor ala 15", 15, 1], ["1 cóndor ala 10", 10, 1],
  ["2 cóndores ala 25", 25, 2], ["2 cóndores ala 50", 50, 2], ["3 cóndores ala 50", 50, 3],
];
for (const [et, ala, k] of COMBOS) {
  const r = puroAla(dias, ala, k), x = puroAla(D22, ala, k), y = puroAla(D24, ala, k);
  const cubre = Math.abs(r.peorDia) <= EFECTIVO0;
  const ok = cubre && r.porAno > 0 && x.porAno > 0 && y.porAno > 0;
  console.log(`| ${et} | ${eur(r.colateral)} | ${pc(r.pctCuenta)} | ${eur(r.peorDia)} | ${cubre ? "sí" : "**NO**"} | ${pc(r.caida)} | ${pc(x.caida)} | ${pc(y.caida)} | ${eur(r.porAno)} | ${eur(x.porAno)} | ${eur(y.porAno)} | ${ok ? "candidata" : x.porAno <= 0 ? "**pierde en 22-23**" : "**no lo cubre el efectivo**"} |`);
}

console.log(`\n${"═".repeat(100)}`);
console.log(`RECUENTO DE PRUEBAS DECLARADAS: 5 tamaños × 3 períodos = 15 · 6 niveles proporcionales = 6 ·`);
console.log(`2 techos × 3 direcciones = 6 · 7 alas × 3 períodos = 21 · 5 cadencias = 5.  Total 53 lecturas.`);
console.log(`Se declaran ${PRUEBAS}; con 53 el listón de |t| sería ${listonT(53)} y con ${PRUEBAS} es ${LISTON}.`);
console.log(`El |t| de la estrategia sobre los 1.121 días es ${puro(dias, 1).t.toFixed(2)} — por debajo de los DOS listones.`);
console.log("═".repeat(100));
