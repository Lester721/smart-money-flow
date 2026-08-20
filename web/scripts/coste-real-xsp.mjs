// COSTE-REAL - el cierre. Si el contrato mas pequeno de SPX ya es 10 veces grande para su caja,
// el vehiculo que si cabe es XSP: el MISMO indice a la decima parte (XSP 770,8 vs SPX 7.707,98,
// comprobado hoy en su cuenta; can_open_position=true, vencimiento diario, indice europeo en efectivo).
//
// LO QUE ESTO ES: la misma serie de 1.121 dias dividida por 10, con la comision entera encima.
// LO QUE ESTO NO ES: una medicion de la horquilla de XSP. Esa NO la tengo y se dice abajo.
import { readFileSync } from "node:fs";
const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, HOOD = 48412, TASA = 0.05, CUENTA = 56389, COMIS = 4 * 0.03;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const ddf = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; if (a > p) p = a; w = Math.min(w, a - p); } return w; };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const ANOS = dias(F[0].fecha, F[F.length - 1].fecha) / 365.25;

// P&L por dia de cada vehiculo. El BRUTO se escala; la COMISION no (son 4 patas cueste lo que cueste).
function serie(vehiculo, N, W = 50) {
  const div = vehiculo === "XSP" ? 10 : 1;
  return F.filter((f) => f.porAncho[W]).map((f) => ({ fecha: f.fecha, pl: N * ((f.porAncho[W].pl + COMIS) / div - COMIS) }));
}
function caja(s, riesgoDia) {
  let ef = EFECTIVO0, int = 0, maxPrest = 0, llamada = null, sinEf = null, acum = 0;
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && ef < 0) { const d = dias(s[i - 1].fecha, s[i].fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    if (ef < HOOD * (0.30 - 1)) { llamada ??= s[i].fecha; break; }
    if (riesgoDia > PC0 + 1.31 * (ef - EFECTIVO0)) continue;
    ef += s[i].pl; acum += s[i].pl;
    if (ef < 0 && !sinEf) sinEf = s[i].fecha; if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
  }
  return { bruto: acum, interes: int, neto: acum - int, alAno: (acum - int) / ANOS, maxPrest, llamada, sinEf, efFinal: ef };
}

console.log("=== EL VEHICULO: mismo indice, mismo condor, decima parte del tamano ===");
console.log(`XSP = 770,8 y SPX = 7.707,98 al cierre de ayer -> exactamente 1/10. Condor equivalente:`);
console.log(`  SPX: vender +-25 puntos, alas 50 puntos mas alla  ->  riesgo $5.000 por contrato`);
console.log(`  XSP: vender +-2,5 puntos, alas 5 puntos mas alla   ->  riesgo   $500 por contrato\n`);
console.log("| vehiculo | contratos | riesgo del dia | $/ano NETO | %/ano | peor dia | p1 | p5 | peor racha | racha / efectivo | prestamo max | interes total | LLAMADA |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const filas = [];
for (const [v, N] of [["SPX", 1], ["SPX", 2], ["XSP", 1], ["XSP", 2], ["XSP", 3], ["XSP", 5], ["XSP", 10]]) {
  const s = serie(v, N), pl = s.map((x) => x.pl);
  const riesgo = N * (v === "XSP" ? 500 : 5000);
  const c = caja(s, riesgo);
  filas.push({ v, N, riesgo, c, pl });
  console.log(`| ${v} | ${N} | ${eur(riesgo)} | ${eur(c.alAno)} | ${(c.alAno / CUENTA * 100).toFixed(2)}% | ${eur(Math.min(...pl))} | ${eur(pctl(pl, 0.01))} | ${eur(pctl(pl, 0.05))} | ${eur(ddf(pl))} | ${(ddf(pl) / -EFECTIVO0 * 100).toFixed(0)}% | ${eur(c.maxPrest)} | ${eur(-c.interes)} | ${c.llamada ? "**" + c.llamada + "**" : "no"} |`);
}

console.log(`\n=== LA METRICA QUE DECIDE: $ de ingreso perdidos al ano por cada $ de PEOR RACHA eliminado ===`);
const base = filas.find((x) => x.v === "SPX" && x.N === 1);
console.log(`punto de partida: SPX 1 contrato -> ${eur(base.c.alAno)}/ano con una peor racha de ${eur(ddf(base.pl))}\n`);
console.log("| alternativa | $/ano | peor racha | ingreso perdido/ano | racha eliminada | $ perdidos por $ de racha |");
console.log("|---|---|---|---|---|---|");
const cand = [];
for (const W of [30, 20, 10]) {
  const s = F.filter((f) => f.porAncho[W]).map((f) => ({ fecha: f.fecha, pl: f.porAncho[W].pl }));
  const c = caja(s, W * 100);
  cand.push({ nom: `SPX 1 contrato, alas de ${W} en vez de 50`, alAno: c.alAno, dd: ddf(s.map((x) => x.pl)) });
}
for (const N of [1, 2, 3, 5]) { const r = filas.find((x) => x.v === "XSP" && x.N === N); cand.push({ nom: `XSP ${N} contrato${N > 1 ? "s" : ""}`, alAno: r.c.alAno, dd: ddf(r.pl) }); }
const ddBase = ddf(base.pl);
for (const c of cand) {
  const perdido = base.c.alAno - c.alAno, quitado = c.dd - ddBase;
  console.log(`| ${c.nom} | ${eur(c.alAno)} | ${eur(c.dd)} | ${eur(perdido)} | ${eur(quitado)} | ${quitado > 0 ? "**$" + (perdido / quitado).toFixed(2) + "**" : "no quita racha"} |`);
}

console.log(`\n=== LO QUE LA HORQUILLA SE LLEVA YA EN SPX ===`);
console.log(`peaje medido: 2,8% del credito = $19 por condor y dia = ${eur(19 * 252)}/ano con 1 contrato.`);
console.log(`Es DECIR: la horquilla se lleva mas al ano (${eur(19 * 252)}) que lo que la estrategia deja neto (${eur(base.c.alAno)}).`);
console.log(`\nEn XSP la horquilla NO esta medida. Lo unico observado (ayer al cierre, vencimiento de hoy):`);
console.log(`  XSP 773 call, delta 0,29: bid 0,72 / ask 0,74 -> horquilla 2,7% de la prima, volumen 2.310 contratos`);
console.log(`  XSP 778 call, delta 0,04: bid 0,05 / ask 0,06 -> horquilla 18% de la prima, volumen 1.319 contratos`);
console.log(`  Son DOS cotizaciones, no una distribucion. Para decidir hace falta la cadena intradia de XSP.`);
