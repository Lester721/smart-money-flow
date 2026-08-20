// COSTE-REAL - LA REGLA DE HIERRO aplicada a lo unico que quedo en pie: EL TAMANO.
// El tamano se elige mirando SOLO un periodo y se aplica TAL CUAL al otro. Las dos direcciones.
// Granularidad XSP ($500 de riesgo por contrato) para que la respuesta no se cuantice a 1 SPX.
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos.ts";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05, CUENTA = 56389, COMIS = 0.12;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const ddf = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; if (a > p) p = a; w = Math.min(w, a - p); } return w; };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");

// N = numero de condores XSP (riesgo $500 cada uno). N=10 equivale a 1 condor SPX.
const serie = (g, N) => g.filter((f) => f.porAncho[50]).map((f) => ({ fecha: f.fecha, pl: N * ((f.porAncho[50].pl + COMIS) / 10 - COMIS) }));
function caja(g, N) {
  const s = serie(g, N); let ef = EFECTIVO0, int = 0, maxPrest = 0, llamada = null, acum = 0;
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && ef < 0) { const d = dias(s[i - 1].fecha, s[i].fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    if (ef < HOOD * (0.30 - 1)) { llamada ??= s[i].fecha; break; }
    if (N * 500 > PC0 + 1.31 * (ef - EFECTIVO0)) continue;
    ef += s[i].pl; acum += s[i].pl; if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
  }
  const anos = dias(g[0].fecha, g[g.length - 1].fecha) / 365.25;
  return { neto: acum - int, alAno: (acum - int) / anos, maxPrest, llamada, dd: ddf(s.map((x) => x.pl)), interes: int };
}
// criterio de supervivencia, fijado ANTES de mirar: ni llamada de margen, ni una racha que se
// coma todo el efectivo. Es el criterio de Lester, no uno elegido por el resultado.
const sobrevive = (r) => !r.llamada && -r.dd <= EFECTIVO0;
function maxN(g) { let m = 0; for (let N = 1; N <= 40; N++) { if (!sobrevive(caja(g, N))) break; m = N; } return m; }

console.log("=== LA REGLA DE HIERRO SOBRE EL TAMANO ===");
console.log(`criterio de supervivencia fijado de antemano: SIN llamada de margen Y peor racha <= efectivo (${eur(EFECTIVO0)})`);
console.log(`unidad: condores XSP de $500 de riesgo. 10 XSP = 1 SPX.\n`);
const nA = maxN(A), nB = maxN(B), nT = maxN(F);
console.log("| se ajusta en | tamano maximo que sobrevive | = en SPX | se prueba en | sobrevive? | $/ano fuera de muestra | peor racha | prestamo max |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nomA, n, nomB, g] of [["2022-2023", nA, "2024-2026", B], ["2024-2026", nB, "2022-2023", A]]) {
  const r = caja(g, n);
  console.log(`| ${nomA} | ${n} XSP (${eur(n * 500)}/dia) | ${(n / 10).toFixed(1)} | ${nomB} | ${sobrevive(r) ? "**SI**" : "NO"} | ${eur(r.alAno)} | ${eur(r.dd)} | ${eur(r.maxPrest)} |`);
}
const cruzaA = caja(B, nA), cruzaB = caja(A, nB);
const pasa = sobrevive(cruzaA) && sobrevive(cruzaB);
console.log(`\nSOBREVIVE EL CRUCE EN LAS DOS DIRECCIONES: ${pasa ? "SI" : "NO"}`);
console.log(`tamano seguro en toda la muestra de una vez: ${nT} XSP = ${eur(nT * 500)} de riesgo al dia = ${(nT / 10).toFixed(1)} condores SPX`);
console.log(`el MENOR de los dos ajustes (que es el unico que se puede usar sin saber el futuro): ${Math.min(nA, nB)} XSP\n`);

console.log("| tamano | $/ano en 2022-23 | $/ano en 2024-26 | $/ano en TODO | peor racha total | % del efectivo | interes total | %/ano sobre $56.389 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const N of [1, 2, Math.min(nA, nB), nT, 10]) {
  if (N < 1) continue;
  const t = caja(F, N);
  console.log(`| ${N} XSP${N === 10 ? " (=1 SPX)" : ""} | ${eur(caja(A, N).alAno)} | ${eur(caja(B, N).alAno)} | ${eur(t.alAno)} | ${eur(t.dd)} | ${(-t.dd / EFECTIVO0 * 100).toFixed(0)}% | ${eur(-t.interes)} | ${(t.alAno / CUENTA * 100).toFixed(2)}% |`);
}
console.log(`\npruebas totales declaradas en toda la anatomia: ~120 -> liston de |t| de Bonferroni = ${listonT(120)}`);
