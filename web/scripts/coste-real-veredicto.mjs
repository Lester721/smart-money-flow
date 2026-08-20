// COSTE-REAL - el veredicto. Precios reales, 1.121 dias, y PARTIENDO LA MUESTRA.
import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05, CUENTA = 56389;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const dd = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; if (a > p) p = a; w = Math.min(w, a - p); } return w; };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");

radiografia(F, ["credito", "pl", "sigmaPts", "sigmasCorto", "creditoEnSigma", "rangoMananaPts", "recorridoPts", "rvManana"], "condor +-25 - 1.121 dias");
console.log(`A = 2022-2023 - ${A.length} dias (${A[0].fecha} a ${A[A.length - 1].fecha})`);
console.log(`B = 2024-2026 - ${B.length} dias (${B[0].fecha} a ${B[B.length - 1].fecha})`);

// 1. EL ANCHO DEL ALA
console.log(`\n=== 1 - QUE CUESTA CADA ANCHO (patas vendidas SIEMPRE a +-25; 1 contrato) ===`);
console.log("| ala | colateral RH | dias | credito medio | $/ano 2022-23 | $/ano 2024-26 | $/ano TODO | peor dia | p1 | p5 | peor racha | acierto |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const anchos = [10, 20, 30, 50];
for (const W of anchos) {
  const g = F.filter((f) => f.porAncho[W]);
  const pl = g.map((f) => f.porAncho[W].pl);
  const gA = g.filter((f) => f.fecha < "2024-01-01"), gB = g.filter((f) => f.fecha >= "2024-01-01");
  const yr = (x) => x.reduce((a, b) => a + b.porAncho[W].pl, 0) / (dias(x[0].fecha, x[x.length - 1].fecha) / 365.25);
  console.log(`| ${W} | $${(W * 100).toLocaleString("es-ES")} | ${g.length} | $${(g.reduce((a, b) => a + b.porAncho[W].credito, 0) / g.length * 100).toFixed(0)} | ${eur(yr(gA))} | ${eur(yr(gB))} | ${eur(yr(g))} | ${eur(Math.min(...pl))} | ${eur(pct(pl, 0.01))} | ${eur(pct(pl, 0.05))} | ${eur(dd(pl))} | ${(pl.filter((x) => x > 0).length / pl.length * 100).toFixed(0)}% |`);
}

// 2. LA CAJA
function simular(filas, N, W = 50, { mant = 0.30, lambda = 1.31, hood = HOOD } = {}) {
  let ef = EFECTIVO0, int = 0, acum = 0, pico = 0, peorDD = 0, maxPrest = 0, sinEf = null, llamada = null, sinPoder = 0, ops = 0;
  const linea = hood * (mant - 1);
  const curva = [];
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], a = f.porAncho[W];
    if (!a) { curva.push({ fecha: f.fecha, ef }); continue; }
    if (i > 0 && ef < 0) { const d = dias(filas[i - 1].fecha, f.fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    if (ef < linea) { llamada ??= f.fecha; break; }
    const pc = PC0 + lambda * (ef - EFECTIVO0);
    if (N * W * 100 > pc) { sinPoder++; curva.push({ fecha: f.fecha, ef }); continue; }
    const pl = N * a.pl; ef += pl; ops++; acum += pl; if (acum > pico) pico = acum; peorDD = Math.min(peorDD, acum - pico);
    if (ef < 0 && !sinEf) sinEf = f.fecha;
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    curva.push({ fecha: f.fecha, ef, pl });
  }
  const anos = dias(filas[0].fecha, filas[filas.length - 1].fecha) / 365.25;
  return { N, W, ops, bruto: acum, interes: int, neto: acum - int, alAno: (acum - int) / anos, sinEf, llamada, maxPrest, peorDD, sinPoder, efFinal: ef, curva, linea };
}

console.log(`\n=== 2 - LA CAJA DE LESTER - ala de 50 - en ORDEN, empezando en enero de 2022 ===`);
console.log(`efectivo inicial ${eur(EFECTIVO0)} - poder de compra ${eur(PC0)} - llamada de margen si el efectivo baja de ${eur(HOOD * (0.30 - 1))} (mantenimiento 30% sobre HOOD fijo en ${eur(HOOD)})\n`);
console.log("| contratos | colateral | dias operados | bruto | interes pagado | NETO | $/ano | %/ano | 1er dia en rojo | prestamo maximo | LLAMADA |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const N of [1, 2, 3, 4, 5, 6, 8]) {
  const r = simular(F, N);
  console.log(`| ${N} | ${eur(N * 5000)} | ${r.ops} | ${eur(r.bruto)} | ${eur(-r.interes)} | ${eur(r.neto)} | ${eur(r.alAno)} | ${(r.alAno / CUENTA * 100).toFixed(1)}% | ${r.sinEf ?? "nunca"} | ${eur(r.maxPrest)} | ${r.llamada ? "**" + r.llamada + "**" : "no"} |`);
}
console.log(`\nsensibilidad al mantenimiento que Robinhood exija sobre HOOD (no es observable en mis datos):`);
console.log("| contratos | m=25% | m=30% | m=35% | m=50% |");
console.log("|---|---|---|---|---|");
for (const N of [1, 2, 3]) console.log(`| ${N} | ${[0.25, 0.30, 0.35, 0.50].map((m) => simular(F, N, 50, { mant: m }).llamada ?? "sobrevive").join(" | ")} |`);

// 3. SECUENCIA
console.log(`\n=== 3 - SECUENCIA - el mismo tamano, arrancando en cada uno de los dias (252 sesiones por delante) ===`);
console.log("| ala | contratos | riesgo total | arranques | % que sobreviven el ano | % que acaban en rojo | peor ano | ano mediano | mejor ano |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [W, N] of [[50, 1], [50, 2], [30, 1], [30, 2], [20, 1], [20, 2], [20, 3], [10, 2], [10, 5]]) {
  let viven = 0, rojo = 0, tot = 0; const netos = [];
  for (let i = 0; i + 252 <= F.length; i++) {
    const r = simular(F.slice(i, i + 252), N, W); tot++;
    if (!r.llamada) viven++; if (r.sinEf) rojo++; netos.push(r.neto);
  }
  console.log(`| ${W} | ${N} | ${eur(N * W * 100)} | ${tot} | ${(viven / tot * 100).toFixed(0)}% | ${(rojo / tot * 100).toFixed(0)}% | ${eur(Math.min(...netos))} | ${eur(pct(netos, 0.5))} | ${eur(Math.max(...netos))} |`);
}

// 4. LA REGLA DE HIERRO
console.log(`\n=== 4 - PARTIR LA MUESTRA - el tamano maximo se ELIGE en un periodo y se APLICA al otro ===`);
function maxN(filas, W) { let mejor = 0; for (let N = 1; N <= 25; N++) { const r = simular(filas, N, W); if (r.llamada || r.sinPoder > 0) break; mejor = N; } return mejor; }
console.log("| ala | N max elegido en 2022-23 | aplicado a 2024-26 | $/ano | N max elegido en 2024-26 | aplicado a 2022-23 | $/ano | SOBREVIVE EL CRUCE |");
console.log("|---|---|---|---|---|---|---|---|");
for (const W of anchos) {
  const nA = maxN(A, W), nB = maxN(B, W);
  const apB = nA > 0 ? simular(B, nA, W) : null;
  const apA = nB > 0 ? simular(A, nB, W) : null;
  const ok = nA > 0 && nB > 0 && !apB.llamada && !apA.llamada;
  console.log(`| ${W} | ${nA || "ninguno"} | ${nA ? (apB.llamada ? "LLAMADA " + apB.llamada : "sobrevive") : "-"} | ${nA ? eur(apB.alAno) : "-"} | ${nB || "ninguno"} | ${nB ? (apA.llamada ? "**LLAMADA " + apA.llamada + "**" : "sobrevive") : "-"} | ${nB ? eur(apA.alAno) : "-"} | ${ok ? "SI" : "NO"} |`);
}

// 5. RACHAS
console.log(`\n=== 5 - EL MAL VIENE EN RACHA - peor racha real contra 2.000 barajados (ala 50, 1 contrato) ===`);
const pl50 = F.map((f) => f.porAncho[50].pl);
const ddReal = dd(pl50); const sims = [];
let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
for (let s = 0; s < 2000; s++) { const v = [...pl50]; for (let i = v.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = v[i]; v[i] = v[j]; v[j] = t; } sims.push(dd(v)); }
sims.sort((a, b) => a - b);
const cola = sims.filter((x) => x <= ddReal).length / sims.length;
console.log(`peor racha REAL: ${eur(ddReal)} - barajado: p5 ${eur(pct(sims, 0.05))} - mediana ${eur(pct(sims, 0.5))} - p95 ${eur(pct(sims, 0.95))}`);
console.log(`solo el ${(cola * 100).toFixed(1)}% de los ordenes barajados da una racha igual o peor  ->  ${cola < 0.05 ? "SI se apelotona" : "la racha real cabe dentro del azar"}`);
const m = pl50.reduce((a, b) => a + b, 0) / pl50.length;
for (const lag of [1, 2, 5]) {
  let num = 0, den = 0;
  for (let i = 0; i < pl50.length; i++) { den += (pl50[i] - m) ** 2; if (i >= lag) num += (pl50[i] - m) * (pl50[i - lag] - m); }
  console.log(`  autocorrelacion lag ${lag}: ${(num / den).toFixed(3)}`);
}
for (const [nom, g] of [["2022-23", A], ["2024-26", B]]) {
  const tras = [], trasG = [];
  for (let i = 1; i < g.length; i++) (g[i - 1].porAncho[50].pl < 0 ? tras : trasG).push(g[i].porAncho[50].pl);
  console.log(`  ${nom}: tras dia PERDEDOR ${eur(tras.reduce((a, b) => a + b, 0) / tras.length)}/dia (n=${tras.length}) - tras dia ganador ${eur(trasG.reduce((a, b) => a + b, 0) / trasG.length)}/dia (n=${trasG.length}) - t=${tWelch(tras, trasG).toFixed(2)}`);
}
console.log(`  liston de Bonferroni con 20 pruebas declaradas: ${listonT(20)}`);
