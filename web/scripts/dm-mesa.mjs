import { readFileSync, writeFileSync } from "node:fs";

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const media = (v) => (v.length ? suma(v) / v.length : 0);
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);
const serie = (vid, fm) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && !(fm && d.finMes)) ? r.pl : 0; });

// ── 0 · ¿se puede operar 0,80 sigma SIN calcular nada? el straddle del dinero como regla de mesa
console.log("=== 0 - REGLA DE MESA: 0,80 sigma vs el PRECIO DEL STRADDLE del dinero ===");
console.log("   E|movimiento| = sigma*raiz(2/pi) = 0,798*sigma  ->  0,80*sigma ~= precio del straddle ATM");
const rat = D.map((d) => (0.80 * d.sigma) / (d.sigma * Math.sqrt(2 / Math.PI)));
console.log(`   0,80*sigma / straddle teorico: ${media(rat).toFixed(3)} (constante por construccion)`);
const distMed = media(D.map((d) => 0.80 * d.sigma));
console.log(`   distancia media del corto: ${distMed.toFixed(1)} pts de SPX (${(distMed / 10).toFixed(2)} pts de XSP) - mediana ${(0.80 * 63.2).toFixed(0)} pts`);
console.log(`   en % del indice: ${(media(D.map((d) => (0.80 * d.sigma) / d.sp11)) * 100).toFixed(2)}% - 2022 ${(media(D.filter((d)=>d.ano===2022).map((d)=>0.80*d.sigma/d.sp11))*100).toFixed(2)}% - 2026 ${(media(D.filter((d)=>d.ano===2026).map((d)=>0.80*d.sigma/d.sp11))*100).toFixed(2)}%`);

// ── 1 · AÑO A AÑO, sin promediar
console.log("\n=== 1 - ANO A ANO, 1 CONTRATO DE SPX (sin promediar) ===");
const cfgs = [
  ["condor de HOY  +-25pts/ala50", serie("p25_a50", false)],
  ["+-25pts/ala50 + salta finmes", serie("p25_a50", true)],
  ["+-0,80sig/ala30", serie("s0.80_a30", false)],
  ["+-0,80sig/ala30 + salta finmes", serie("s0.80_a30", true)],
  ["+-1,00sig/ala30 + salta finmes", serie("s1.00_a30", true)],
];
const anos = [...new Set(D.map((d) => d.ano))].sort();
console.log("configuracion                  | " + anos.map((a) => String(a).padStart(8)).join(" | ") + " |    TOTAL |   $/ano");
for (const [nom, s] of cfgs) {
  const porAno = anos.map((a) => suma(D.map((d, i) => (d.ano === a ? s[i] : 0))));
  console.log(`${nom.padEnd(30)} | ${porAno.map((x) => x.toFixed(0).padStart(8)).join(" | ")} | ${suma(porAno).toFixed(0).padStart(8)} | ${(suma(porAno) / AN_T).toFixed(0).padStart(8)}`);
}

// ── 2 · SIMULADOR DE CAJA (el cuello de botella real)
const EFECTIVO = 7977, HOOD = 500 * 96.82, LINEA = -0.70 * HOOD, INT = 0.05;
console.log(`\n=== 2 - LA CAJA - efectivo $${EFECTIVO}, HOOD $${HOOD.toFixed(0)}, linea de llamada (mant. 30%) $${LINEA.toFixed(0)}, interes ${INT * 100}% ===`);
function caja(s, mult, sueloParar = null, sueloVolver = null) {
  let c = EFECTIVO, minC = c, interes = 0, parado = false, saltados = 0, opera = 0, fechaMin = "", llamada = null;
  let acc = 0, pico = 0, dd = 0, peorDia = 0;
  let prev = D[0].fecha;
  for (let i = 0; i < N; i++) {
    const dias = Math.max(1, (new Date(D[i].fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = D[i].fecha;
    if (c < 0) { const it = c * INT * dias / 365; interes += it; c += it; }
    if (sueloParar !== null) { if (!parado && c < sueloParar) parado = true; if (parado && c >= sueloVolver) parado = false; }
    const pl = parado ? 0 : s[i] * mult;
    if (parado && s[i] !== 0) saltados++;
    if (!parado && s[i] !== 0) opera++;
    c += pl; acc += pl;
    if (pl < peorDia) peorDia = pl;
    if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc;
    if (c < minC) { minC = c; fechaMin = D[i].fecha; }
    if (c < LINEA && !llamada) llamada = D[i].fecha;
  }
  return { final: c, minC, fechaMin, interes, llamada, saltados, opera, peorDia, racha: -dd, bruto: acc, neto: c - EFECTIVO, anual: (c - EFECTIVO) / AN_T };
}
console.log("configuracion                       | contratos |  $/ano neto | peor dia | peor racha | caja minima (fecha)     | interes | LLAMADA");
const SPX = [
  ["condor de HOY (SPX +-25/50)", serie("p25_a50", false), 1, "SPX"],
  ["SPX +-25/50 + salta finmes", serie("p25_a50", true), 1, "SPX"],
  ["SPX +-0,80sig/ala30 + finmes", serie("s0.80_a30", true), 1, "SPX"],
];
for (const [nom, s, m] of SPX) {
  const r = caja(s, m);
  console.log(`${nom.padEnd(35)} | ${String(m).padStart(9)} | ${r.anual.toFixed(0).padStart(11)} | ${r.peorDia.toFixed(0).padStart(8)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(8)} (${r.fechaMin}) | ${r.interes.toFixed(0).padStart(7)} | ${r.llamada || "no"}`);
}
// XSP = mismo indice a 1/10. SUPUESTO DECLARADO: horquilla proporcional (no medida: no hay cadena de XSP en disco).
console.log("\n   --- XSP (1/10). SUPUESTO: horquilla proporcional a la de SPX. NO MEDIDO: no hay cadena de XSP en disco. ---");
const filasXSP = [];
for (const nC of [1, 2, 3, 4, 5, 6, 8, 10]) {
  const r = caja(serie("s0.80_a30", true), nC / 10);
  filasXSP.push({ nC, ...r });
  console.log(`${("XSP +-0,80sig/ala3 + finmes").padEnd(35)} | ${String(nC).padStart(9)} | ${r.anual.toFixed(0).padStart(11)} | ${r.peorDia.toFixed(0).padStart(8)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(8)} (${r.fechaMin}) | ${r.interes.toFixed(0).padStart(7)} | ${r.llamada || "no"}`);
}
console.log("   (control) XSP con la geometria de HOY, +-2,5 pts / ala 5:");
for (const nC of [1, 2, 3, 5]) {
  const r = caja(serie("p25_a50", true), nC / 10);
  console.log(`${("XSP +-2,5pts/ala5 + finmes").padEnd(35)} | ${String(nC).padStart(9)} | ${r.anual.toFixed(0).padStart(11)} | ${r.peorDia.toFixed(0).padStart(8)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(8)} (${r.fechaMin}) | ${r.interes.toFixed(0).padStart(7)} | ${r.llamada || "no"}`);
}

// ── 3 · PARADA POR CAJA (nunca medido)
console.log("\n=== 3 - PARADA POR CAJA (no por resultado): dejar de abrir si el efectivo baja del suelo ===");
console.log("suelo/vuelta | contratos XSP | $/ano | peor racha | caja minima | dias saltados | dias operados");
for (const nC of [4, 6, 8]) {
  for (const [sp, sv] of [[null, null], [6000, 7000], [5000, 6500], [4000, 6000]]) {
    const r = caja(serie("s0.80_a30", true), nC / 10, sp, sv);
    console.log(`${(sp ? `${sp}/${sv}` : "sin parada").padEnd(12)} | ${String(nC).padStart(13)} | ${r.anual.toFixed(0).padStart(5)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(11)} | ${String(r.saltados).padStart(13)} | ${String(r.opera).padStart(13)}`);
  }
}

// ── 4 · LA METRICA QUE DECIDE: $ de ingreso perdido por $1 de caida eliminada (sobre 1.121 dias)
console.log("\n=== 4 - $ DE INGRESO PERDIDO POR CADA $1 DE CAIDA ELIMINADA (base = condor de hoy, 1 SPX) ===");
const b = caja(serie("p25_a50", false), 1);
const opciones = [
  ["saltar el ultimo dia del mes", serie("p25_a50", true), 1],
  ["geometria +-0,80sig/ala30", serie("s0.80_a30", false), 1],
  ["geometria +-0,80sig/ala30 + finmes", serie("s0.80_a30", true), 1],
  ["geometria +-1,00sig/ala30 + finmes", serie("s1.00_a30", true), 1],
  ["bajar tamano a 1/2 SPX", serie("p25_a50", false), 0.5],
  ["bajar tamano a 1/4 SPX", serie("p25_a50", false), 0.25],
  ["bajar tamano a 1/10 (= 1 XSP)", serie("p25_a50", false), 0.1],
];
console.log("palanca                             |  $/ano | D$/ano | peor racha | Dracha | $ perdidos por $1 de caida");
for (const [nom, s, m] of opciones) {
  const r = caja(s, m);
  const dI = r.anual - b.anual, dR = r.racha - b.racha;
  console.log(`${nom.padEnd(35)} | ${r.anual.toFixed(0).padStart(6)} | ${dI.toFixed(0).padStart(6)} | ${r.racha.toFixed(0).padStart(10)} | ${dR.toFixed(0).padStart(6)} | ${dR > 0 ? (-dI / dR).toFixed(2) : "n/a"}`);
}

// ── 5 · concentracion del efecto fin de mes
console.log("\n=== 5 - HONESTIDAD SOBRE EL FIN DE MES: cuanto depende de sus peores dias ===");
const bs = serie("p25_a50", false);
const fmIdx = D.map((d, i) => (d.finMes ? i : -1)).filter((i) => i >= 0).sort((x, y) => bs[x] - bs[y]);
console.log(`   55 dias de fin de mes - media $${media(fmIdx.map((i) => bs[i])).toFixed(0)} - mediana $${bs[fmIdx[Math.floor(fmIdx.length/2)]].toFixed(0)}`);
for (const k of [1, 3, 5]) console.log(`   quitando sus ${k} peores: media $${media(fmIdx.slice(k).map((i) => bs[i])).toFixed(0)} (el resto del mes: $${media(D.map((d,i)=>d.finMes?null:bs[i]).filter((x)=>x!==null)).toFixed(0)})`);
console.log(`   los 5 peores fin de mes: ${fmIdx.slice(0, 5).map((i) => `${D[i].fecha} $${bs[i].toFixed(0)}`).join(" - ")}`);
const porAnoFM = {};
for (const i of fmIdx) (porAnoFM[D[i].ano] = porAnoFM[D[i].ano] || []).push(bs[i]);
console.log("   ano a ano (suma de los dias de fin de mes): " + Object.entries(porAnoFM).map(([a, v]) => `${a} $${suma(v).toFixed(0)} (n=${v.length})`).join(" - "));
writeFileSync("scripts/dm-mesa.json", JSON.stringify({ filasXSP }), "utf8");
