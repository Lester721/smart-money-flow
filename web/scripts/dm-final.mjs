import { readFileSync } from "node:fs";

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const media = (v) => (v.length ? suma(v) / v.length : 0);
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);
const serie = (vid, fm) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && !(fm && d.finMes)) ? r.pl : 0; });
const dt = (a, b) => { const va = suma(a.map((x) => (x - media(a)) ** 2)) / (a.length - 1), vb = suma(b.map((x) => (x - media(b)) ** 2)) / (b.length - 1);
  const se = Math.sqrt(va / a.length + vb / b.length); return se > 0 ? (media(a) - media(b)) / se : 0; };

// ── A · CONTROL: ¿es la SIGMA o es el ALA? p25/ala30 contra 0,80sig/ala30 (mismo ala)
console.log("=== A - CONTROL: aisla la SIGMA del ANCHO DE ALA (las dos con ala 30) ===");
const anos = [...new Set(D.map((d) => d.ano))].sort();
function linea(nom, s) {
  const porAno = anos.map((a) => suma(D.map((d, i) => (d.ano === a ? s[i] : 0))));
  let acc = 0, pico = 0, dd = 0;
  for (const x of s) { acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; }
  const op = s.filter((x) => x !== 0);
  console.log(`${nom.padEnd(32)} | ${porAno.map((x) => x.toFixed(0).padStart(7)).join(" | ")} | ${(suma(s) / AN_T).toFixed(0).padStart(7)} | ${Math.min(...s).toFixed(0).padStart(7)} | ${(-dd).toFixed(0).padStart(8)} | ${(op.filter((x) => x > 0).length / op.length * 100).toFixed(1)}%`);
}
console.log("configuracion                    | " + anos.map((a) => String(a).padStart(7)).join(" | ") + " |   $/ano | peor dia |   racha | acierto");
linea("+-25 PUNTOS / ala 50 (HOY)", serie("p25_a50", false));
linea("+-25 PUNTOS / ala 30", serie("p25_a30", false));
linea("+-0,80 SIGMA / ala 30", serie("s0.80_a30", false));
linea("+-0,80 SIGMA / ala 30 + finmes", serie("s0.80_a30", true));
linea("+-25 PUNTOS / ala 30 + finmes", serie("p25_a30", true));

// ── B · el corto en 0,80 sigma, ¿cuanto se cobra y cuanto se rompe?
console.log("\n=== B - LA POSICION: distancia, credito y rotura ===");
for (const id of ["p25_a50", "p25_a30", "s0.80_a30"]) {
  const rs = V[id].serie.map((r, i) => r && ({ ...r, i })).filter(Boolean);
  const cr = rs.map((r) => r.credito), dist = rs.map((r) => r.distC), rot = rs.map((r) => r.rompe);
  const dsig = rs.map((r) => r.distC / D[r.i].sigma);
  const orden = [...cr].sort((a, b) => a - b);
  console.log(`${id.padEnd(11)} credito mediano $${orden[orden.length >> 1].toFixed(0).padStart(4)} (medio $${media(cr).toFixed(0)}) - distancia media ${media(dist).toFixed(0)} pts = ${media(dsig).toFixed(2)} sigma - rompe un corto ${(media(rot) * 100).toFixed(1)}% de los dias - credito/riesgo ${(media(cr) / media(rs.map((r) => r.colateral)) * 100).toFixed(1)}%`);
}
// estabilidad de la distancia en % del indice, por ano
console.log("\n   distancia del corto en % del indice, por ano (la unidad importa):");
for (const a of anos) {
  const sub = D.map((d, i) => (d.ano === a ? i : -1)).filter((i) => i >= 0);
  const p25 = media(sub.map((i) => 25 / D[i].sp11 * 100));
  const s08 = media(sub.filter((i) => V["s0.80_a30"].serie[i]).map((i) => V["s0.80_a30"].serie[i].distC / D[i].sp11 * 100));
  const dentro = media(sub.filter((i) => V["s0.80_a30"].serie[i]).map((i) => 1 - V["s0.80_a30"].serie[i].rompe)) * 100;
  const dentro25 = media(sub.map((i) => 1 - V["p25_a50"].serie[i].rompe)) * 100;
  console.log(`   ${a}: +-25 pts = ${p25.toFixed(2)}% (cierra dentro ${dentro25.toFixed(0)}%)   |   +-0,80sig = ${s08.toFixed(2)}% (cierra dentro ${dentro.toFixed(0)}%)`);
}

// ── C · la REGLA DE MESA sin calculadora: 0,80 sigma contra el precio REAL del straddle del dinero
console.log("\n=== C - REGLA DE MESA SIN CALCULADORA: 0,80*sigma contra el straddle REAL del dinero a las 11:00 ===");
const cerca = (arr, o) => arr.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
const rz = [];
for (const d of D) {
  const c = CAD[d.fecha]; if (!c) continue;
  const aC = cerca(c.C, d.sp11), aP = cerca(c.P, d.sp11);
  const strad = (aC[1] + aC[2]) / 2 + (aP[1] + aP[2]) / 2;
  if (strad > 0) rz.push({ f: d.fecha, ano: d.ano, r: (0.80 * d.sigma) / strad, strad, obj: 0.80 * d.sigma });
}
const rr = rz.map((x) => x.r).sort((a, b) => a - b);
console.log(`   0,80*sigma / straddle REAL: mediana ${rr[rr.length >> 1].toFixed(2)} - p10 ${rr[Math.floor(rr.length * .1)].toFixed(2)} - p90 ${rr[Math.floor(rr.length * .9)].toFixed(2)} (n=${rr.length})`);
for (const a of anos) { const s = rz.filter((x) => x.ano === a).map((x) => x.r).sort((x, y) => x - y); console.log(`   ${a}: mediana ${s[s.length >> 1].toFixed(2)}`); }
console.log("   => REGLA: vender el call y la put a una distancia igual al PRECIO DEL STRADDLE del dinero (mediana 1,02x).");

// ── D · el peor mes, el peor trimestre y el peor semestre
console.log("\n=== D - EL PEOR MES / TRIMESTRE / SEMESTRE MOVIL (1 contrato de SPX) ===");
function ventanas(s, dias) {
  let peor = 0, cuando = "";
  for (let i = 0; i + dias <= N; i++) { const v = suma(s.slice(i, i + dias)); if (v < peor) { peor = v; cuando = `${D[i].fecha}->${D[i + dias - 1].fecha}`; } }
  return { peor, cuando };
}
for (const [nom, s] of [["+-25/50 (HOY)", serie("p25_a50", false)], ["+-0,80sig/30 + finmes", serie("s0.80_a30", true)], ["+-0,80sig/30 sin finmes", serie("s0.80_a30", false)]]) {
  const m = ventanas(s, 21), t = ventanas(s, 63), se = ventanas(s, 126);
  console.log(`${nom.padEnd(26)} | mes $${m.peor.toFixed(0).padStart(7)} (${m.cuando}) | trim $${t.peor.toFixed(0).padStart(7)} | sem $${se.peor.toFixed(0).padStart(7)} (${se.cuando})`);
}

// ── E · DES-APALANCAR en vez de PARAR (la parada por caja se demostro trampa)
console.log("\n=== E - DES-APALANCAR EN VEZ DE PARAR: al perder X% del efectivo, se opera a la MITAD ===");
const EFECTIVO = 7977;
function degear(s, mult, gatillo) {
  let c = EFECTIVO, m = mult, minC = c, opera = 0, mitad = 0;
  let acc = 0, pico = 0, dd = 0;
  for (let i = 0; i < N; i++) {
    if (gatillo && c < EFECTIVO * gatillo) m = mult / 2; else m = mult;
    const pl = s[i] * m; if (s[i] !== 0) { opera++; if (m < mult) mitad++; }
    c += pl; acc += pl; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; if (c < minC) minC = c;
  }
  return { anual: (c - EFECTIVO) / AN_T, racha: -dd, minC, opera, mitad };
}
console.log("gatillo      | $/ano | peor racha | caja minima | dias a media posicion");
for (const g of [null, 0.85, 0.75, 0.60]) {
  const r = degear(serie("s0.80_a30", true), 1, g);
  console.log(`${(g ? `<${(g * 100).toFixed(0)}% del efectivo` : "sin des-apalancar").padEnd(12)} | ${r.anual.toFixed(0).padStart(5)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(11)} | ${r.mitad}`);
}

// ── F · dos controles de honestidad sobre el fin de mes
console.log("\n=== F - CONTROL: saltar 12 dias AL AZAR al ano en vez del ultimo del mes (2.000 sorteos) ===");
const s08 = serie("s0.80_a30", false);
const base08 = suma(s08) / AN_T;
const conFM = suma(serie("s0.80_a30", true)) / AN_T;
const nFM = D.filter((d) => d.finMes).length;
let mejores = 0; const muestras = [];
for (let it = 0; it < 2000; it++) {
  const idx = new Set(); while (idx.size < nFM) idx.add(Math.floor(Math.random() * N));
  const v = suma(D.map((d, i) => (idx.has(i) ? 0 : s08[i]))) / AN_T;
  muestras.push(v); if (v >= conFM) mejores++;
}
muestras.sort((a, b) => a - b);
console.log(`   sin saltar nada: $${base08.toFixed(0)}/ano - saltando el ultimo dia del mes: $${conFM.toFixed(0)}/ano`);
console.log(`   saltando ${nFM} dias al azar: mediana $${muestras[1000].toFixed(0)} - p95 $${muestras[1900].toFixed(0)} - solo ${mejores} de 2000 sorteos (${(mejores / 20).toFixed(1)}%) igualan o baten al fin de mes`);
const fmv = D.map((d, i) => (d.finMes ? s08[i] : null)).filter((x) => x !== null);
const rev = D.map((d, i) => (d.finMes ? null : s08[i])).filter((x) => x !== null);
console.log(`   sobre ESTA geometria: fin de mes $${media(fmv).toFixed(0)} (n=${fmv.length}) vs resto $${media(rev).toFixed(0)} - t=${dt(fmv, rev).toFixed(2)}`);
