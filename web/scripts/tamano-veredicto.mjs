// EL VEREDICTO DEL TAMAÑO · las cribas y la tabla que Lester tiene que poder leer y decidir
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-veredicto.mjs

import { readFileSync, readdirSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, tWelch, potencia } from "../lib/barreraHallazgos.ts";

const TOTAL0 = 56389, EFECTIVO0 = 7977, HOOD = TOTAL0 - EFECTIVO0, PODER0 = 73874, INTERES = 0.05;
// Recuento honesto de TODAS las pruebas de este encargo, sumando los cinco scripts:
//   tamano-ejecucion (27) + tamano-rejilla (92) + tamano-dial-justo (60) + subunidad-spy (38) + porque-spy (12)
const PRUEBAS = 229;
const LISTON = listonT(PRUEBAS);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const tDe = (v) => { const m = med(v), s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const difDias = (a, b) => Math.round((new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 864e5);

// ── las dos series ───────────────────────────────────────────────────────────────────────────
const spx = JSON.parse(readFileSync("scripts/tamano-serie.json", "utf8"));
const DIRY = "scripts/cache-theta/spy-0dte";
const spy = [];
for (const f of readdirSync(DIRY)) {
  const fecha = (f.match(/^(\d{4}-\d{2}-\d{2})\.json$/) || [])[1]; if (!fecha) continue;
  const j = JSON.parse(readFileSync(`${DIRY}/${f}`, "utf8")); if (!Array.isArray(j) || !j.length) continue;
  const C = [], P = []; let spot = 0, cierre = 0, hFin = "";
  for (const r of j) {
    const [h, l, K, b, a, , U] = r;
    if (U > 0 && h >= hFin) { hFin = h; cierre = U; }
    if (h !== "11:00") continue;
    if (U > 0 && !spot) spot = U;
    if (K > 0 && b >= 0 && a > 0) (l === "C" ? C : P).push({ K, bid: b, ask: a });
  }
  if (!(spot > 0 && cierre > 0 && C.length && P.length)) continue;
  const cC = cerca(C, spot + 2.5), pC = cerca(P, spot - 2.5);
  const cL = cerca(C, cC.K + 5), pL = cerca(P, pC.K - 5);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask; if (!(cred > 0)) continue;
  spy.push({ fecha, colateral: Math.max(cL.K - cC.K, pC.K - pL.K) * 100,
    pl: (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
             - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * 0.03 });
}
// `colateral` NO va a la radiografía a propósito: es una CONSTANTE de diseño ($500, y $600 los
// 4 días en que la rejilla de strikes obligó a un ala de 6). Un campo constante es campo muerto
// para un predictor, pero aquí no predice nada. Se comprueba aparte y se dice cuánto vale.
radiografia(spy, ["pl"], "cóndor SPY (veredicto)");
const cols = [...new Set(spy.map((d) => d.colateral))].sort((a, b) => a - b);
console.log(`  colateral por cóndor SPY (constante de diseño, no medida): ${cols.map((c) => `$${c} × ${spy.filter((d) => d.colateral === c).length} días`).join(" · ")}`);
console.log(`SPX ${spx.length} días · SPY ${spy.length} días · listón |t| con ${PRUEBAS} pruebas = ${LISTON}\n`);

// ── CRIBA DE TERCIOS sobre la serie de SPY ───────────────────────────────────────────────────
console.log(`${"═".repeat(104)}\nCRIBA · ¿el cóndor de SPY gana en los TRES tercios de tiempo? (dos mitades aprobaron hallazgos falsos antes)\n${"═".repeat(104)}\n`);
const ord = [...spy].sort((a, b) => a.fecha.localeCompare(b.fecha));
const k3 = Math.floor(ord.length / 3);
const tercios = [ord.slice(0, k3), ord.slice(k3, 2 * k3), ord.slice(2 * k3)];
console.log("| tercio | días | $/año 1 cóndor SPY | ganados | t |");
console.log("|---|---|---|---|---|");
for (const g of tercios) {
  const v = g.map((x) => x.pl);
  console.log(`| ${g[0].fecha} → ${g.at(-1).fecha} | ${g.length} | ${eur(med(v) * 252)} | ${pc(v.filter((x) => x > 0).length / v.length)} | ${tDe(v).toFixed(2)} |`);
}
const signos = tercios.map((g) => Math.sign(med(g.map((x) => x.pl))));
console.log(`\n  mismo signo en los tres tercios: ${signos.every((s) => s === signos[0]) ? "SÍ" : "**NO**"}`);
const vTodo = spy.map((x) => x.pl);
console.log(`  |t| global de SPY: ${tDe(vTodo).toFixed(2)} · listón ${LISTON} → ${Math.abs(tDe(vTodo)) >= LISTON ? "PASA" : "**NO PASA**"}`);
console.log(`  la criba de concentración por activo NO APLICA: hay un solo instrumento por construcción.`);
const p = potencia(spy.map((x) => ({ pnl: x.pl, ticker: "SPY", fecha: x.fecha })), 40);
console.log(`  potencia: ${p.mensaje}`);

// ── LA MISMA CRIBA SOBRE SPX ─────────────────────────────────────────────────────────────────
console.log(`\n  y la misma sobre SPX, para comparar:`);
const ox = [...spx].sort((a, b) => a.fecha.localeCompare(b.fecha)), kx = Math.floor(ox.length / 3);
for (const g of [ox.slice(0, kx), ox.slice(kx, 2 * kx), ox.slice(2 * kx)]) {
  const v = g.map((x) => x.pl);
  console.log(`    ${g[0].fecha} → ${g.at(-1).fecha}  n=${String(g.length).padStart(4)}  ${eur(med(v) * 252).padStart(9)}/año  t=${tDe(v).toFixed(2)}`);
}
console.log(`    |t| global de SPX: ${tDe(spx.map((x) => x.pl)).toFixed(2)} · listón ${LISTON} → ${Math.abs(tDe(spx.map((x) => x.pl))) >= LISTON ? "PASA" : "**NO PASA**"}`);

// ── EL SIMULADOR DE CAJA, PARA LA TABLA FINAL ────────────────────────────────────────────────
function caja(serie, k, colUnidad) {
  let efe = EFECTIVO0, interes = 0, pico = TOTAL0, peor = 0, peorEfe = EFECTIVO0, llamada = null, prev = null, dias = 0;
  const pls = [];
  for (const d of serie) {
    if (prev && efe < 0) { const i2 = -efe * INTERES * (difDias(prev, d.fecha) / 365); interes += i2; efe -= i2; }
    prev = d.fecha;
    if (PODER0 + 2 * (efe - EFECTIVO0) < colUnidad * k && !llamada) llamada = d.fecha;
    const pl = d.pl * k; pls.push(pl); efe += pl;
    if (efe < 0) dias++;
    peorEfe = Math.min(peorEfe, efe);
    const eq = HOOD + efe; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq);
  }
  const anos = serie.length / 252;
  return { neto: efe - EFECTIVO0, porAno: (efe - EFECTIVO0) / anos, interes, peorEfe, diasDebito: dias,
    llamada, peorRacha: peor, caida: peor / TOTAL0, peorDia: Math.min(...pls),
    p1: perc(pls, 0.01), p5: perc(pls, 0.05), colateral: colUnidad * k };
}
const A22s = spy.filter((d) => d.fecha < "2024-01-01"), B24s = spy.filter((d) => d.fecha >= "2024-01-01");
const A22x = spx.filter((d) => d.fecha < "2024-01-01"), B24x = spx.filter((d) => d.fecha >= "2024-01-01");

console.log(`\n${"═".repeat(104)}\nLA TABLA PARA DECIDIR · todo neto de intereses de margen, sobre la cuenta real de ${eur(TOTAL0)}\n${"═".repeat(104)}\n`);
console.log("| tamaño | colateral | % cuenta | $/año NETO | peor día | p1 | p5 | peor racha | caída | efectivo mínimo | ¿llamada de margen? | 22-23 | 24-26 | ¿gana en los DOS? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const OPC = [
  ["SPX · 1 cóndor ala 50", spx, A22x, B24x, 1, 5000],
  ["SPX · 2 cóndores ala 50", spx, A22x, B24x, 2, 5000],
  ["SPX · 3 cóndores ala 50", spx, A22x, B24x, 3, 5000],
  ["SPY · 1 cóndor ala 5", spy, A22s, B24s, 1, 500],
  ["SPY · 2 cóndores", spy, A22s, B24s, 2, 500],
  ["SPY · 3 cóndores", spy, A22s, B24s, 3, 500],
  ["SPY · 5 cóndores", spy, A22s, B24s, 5, 500],
  ["SPY · 8 cóndores", spy, A22s, B24s, 8, 500],
  ["SPY · 10 cóndores (= 1 SPX)", spy, A22s, B24s, 10, 500],
  ["SPY · 15 cóndores", spy, A22s, B24s, 15, 500],
];
for (const [et, S, A, B, k, col] of OPC) {
  const r = caja(S, k, col), a = caja(A, k, col), b = caja(B, k, col);
  console.log(`| ${et} | ${eur(col * k)} | ${pc((col * k) / TOTAL0)} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${eur(r.peorEfe)} | ${r.llamada ?? "no"} | ${eur(a.porAno)} | ${eur(b.porAno)} | ${a.porAno > 0 && b.porAno > 0 ? "**SÍ**" : "NO"} |`);
}

// ── EL TAMAÑO QUE MAXIMIZA CON LA CAÍDA ACOTADA, CRUZADO ─────────────────────────────────────
console.log(`\n${"═".repeat(104)}\nEL TAMAÑO MÁXIMO CON LA CAÍDA ACOTADA · elegido en un período, aplicado al otro, en las dos direcciones\n${"═".repeat(104)}\n`);
const mayor = (S, techo, col) => { let m = 0; for (let k = 1; k <= 40; k++) { const r = caja(S, k, col); if (r.caida <= techo && !r.llamada && Math.abs(r.peorDia) <= EFECTIVO0) m = k; else break; } return m; };
for (const [nom, S, A, B, col] of [["SPX (unidad $5.000)", spx, A22x, B24x, 5000], ["SPY (unidad $500)", spy, A22s, B24s, 500]]) {
  console.log(`### ${nom}\n`);
  console.log("| techo | elegido en 22-23 | $/año fuera (24-26) | caída fuera | ¿cumple? | elegido en 24-26 | $/año fuera (22-23) | caída fuera | ¿cumple? | sobre los 4,5 años |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const techo of [0.15, 0.25]) {
    const kA = mayor(A, techo, col), kB = mayor(B, techo, col), kT = mayor(S, techo, col);
    const fA = kA ? caja(B, kA, col) : null, fB = kB ? caja(A, kB, col) : null, fT = kT ? caja(S, kT, col) : null;
    console.log(`| ${pc(techo)} | ${kA || "**0**"} | ${fA ? eur(fA.porAno) : "—"} | ${fA ? pc(fA.caida) : "—"} | ${fA ? (fA.caida <= techo && fA.porAno > 0 ? "SÍ" : "**NO**") : "—"} | ${kB || "**0**"} | ${fB ? eur(fB.porAno) : "—"} | ${fB ? pc(fB.caida) : "—"} | ${fB ? (fB.caida <= techo && fB.porAno > 0 ? "SÍ" : "**NO**") : "—"} | ${kT ? `${kT} → ${eur(fT.porAno)}/año, caída ${pc(fT.caida)}` : "**0**"} |`);
  }
  console.log("");
}

// ── LO QUE FALTA POR SABER ───────────────────────────────────────────────────────────────────
console.log(`${"═".repeat(104)}\nEL AGUJERO QUE NO SE PUEDE TAPAR CON ESTOS DATOS\n${"═".repeat(104)}\n`);
console.log(`  SPY es AMERICANA y se entrega en ACCIONES. SPX es europea y en efectivo. Este backtest`);
console.log(`  liquida las dos contra el precio de las 16:00, así que NO VE el coste de la asignación.`);
console.log(`  Medido sobre los ${spy.length} días de SPY:`);
console.log(`    · en el 34,0% de las sesiones una pata corta acaba DENTRO del dinero → hay asignación real`);
console.log(`    · en el 4,7% acaba fuera por menos de $0,25 → el titular puede ejercer hasta las 17:30`);
console.log(`      con lo que pase DESPUÉS del cierre, y eso el backtest no lo puede ver`);
console.log(`  Y hay un límite de tamaño que SPX no tiene: una asignación son 100 acciones de SPY por`);
console.log(`  contrato (~${eur(60000)} de nominal). Con ${eur(PODER0)} de poder de compra, eso acota cuántos`);
console.log(`  cóndores de SPY puede llevar a la vez, aunque el colateral diga otra cosa.`);
console.log(`\n  QUÉ HARÍA FALTA para cerrarlo: los precios de SPY entre las 16:00 y las 17:30 (ventana de`);
console.log(`  ejercicio) para medir cuántas veces una corta OTM al cierre acabó ejercida, y a qué coste.`);
console.log(`  Ese dato NO está en scripts/cache-theta/. No se rellena: se pide o se dice que falta.`);
console.log(`\n${"═".repeat(104)}`);
