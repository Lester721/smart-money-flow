import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const idxA = [], idxB = [];
D.forEach((d, i) => (d.ano <= 2023 ? idxA : idxB).push(i));
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const media = (v) => (v.length ? suma(v) / v.length : 0);
const dt = (a, b) => {
  if (a.length < 3 || b.length < 3) return 0;
  const va = suma(a.map((x) => (x - media(a)) ** 2)) / (a.length - 1), vb = suma(b.map((x) => (x - media(b)) ** 2)) / (b.length - 1);
  const se = Math.sqrt(va / a.length + vb / b.length);
  return se > 0 ? (media(a) - media(b)) / se : 0;
};
const AN_A = anosEntre(D[idxA[0]].fecha, D[idxA[idxA.length - 1]].fecha);
const AN_B = anosEntre(D[idxB[0]].fecha, D[idxB[idxB.length - 1]].fecha);
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);

function met(pls, idx, anos) {
  const sub = idx.map((i) => pls[i]);
  const op = sub.filter((x) => x !== 0);
  let acc = 0, pico = 0, dd = 0;
  for (const x of sub) { acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; }
  const so = [...op].sort((a, b) => a - b), k = Math.max(1, Math.floor(so.length * 0.05));
  return { anual: suma(sub) / anos, total: suma(sub), peorDia: Math.min(0, ...sub), es5: suma(so.slice(0, k)) / k,
           p5: so[Math.floor(so.length * 0.05)] ?? 0, racha: -dd, opera: op.length };
}
const serie = (vid, filtro = () => true) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && filtro(d, r)) ? r.pl : 0; });
const ids = Object.keys(V).filter((k) => V[k].tipo === "sigma");

// 1 - EL RETRATO DEL DIA MALO, A CONTRA B, EN LA UNIDAD ESTABLE
console.log("\n=== 1 - QUE TIENEN EN COMUN LOS DIAS MALOS (condor de hoy, +-25 pts / ala 50) ===");
const base = serie("p25_a50");
function retrato(idx) {
  const ord = idx.map((i) => ({ i, pl: base[i] })).sort((a, b) => a.pl - b.pl);
  const k = Math.floor(ord.length * 0.05);
  const malos = ord.slice(0, k).map((o) => o.i), resto = ord.slice(k).map((o) => o.i);
  const f = (s, sel) => sel.map((i) => s(D[i]));
  const r = {
    n: k,
    movSig: media(f((d) => d.movSig, malos)), movSigResto: media(f((d) => d.movSig, resto)),
    movPts: media(f((d) => d.mov, malos)), movPtsResto: media(f((d) => d.mov, resto)),
    iv: media(f((d) => d.iv, malos)), ivResto: media(f((d) => d.iv, resto)),
    cred: media(malos.map((i) => V["p25_a50"].serie[i].credito)), credResto: media(resto.map((i) => V["p25_a50"].serie[i].credito)),
    rangoMan: media(f((d) => d.rangoMan, malos)), rangoManResto: media(f((d) => d.rangoMan, resto)),
    dist25sig: media(f((d) => 25 / d.sigma, malos)), dist25sigResto: media(f((d) => 25 / d.sigma, resto)),
    pctCall: malos.filter((i) => D[i].dir > 0).length / k,
    pct25pctIdx: media(f((d) => 2500 / d.sp11, malos)),
    dano: suma(malos.map((i) => base[i])), restoTot: suma(resto.map((i) => base[i])),
  };
  return { r, malos, resto };
}
const RA = retrato(idxA), RB = retrato(idxB);
console.log("variable (media del 5% PEOR vs el resto)      | 2022-23          | 2024-26          | t entre periodos");
const filas = [
  ["movimiento tarde / sigma", "movSig", "movSigResto", (d) => d.movSig, 2],
  ["movimiento tarde en PUNTOS", "movPts", "movPtsResto", (d) => d.mov, 1],
  ["rango de la manana / sigma", "rangoMan", "rangoManResto", (d) => d.rangoMan, 2],
  ["IV del dinero a las 11:00", "iv", "ivResto", (d) => d.iv, 3],
  ["los +-25 pts, medidos en sigma", "dist25sig", "dist25sigResto", (d) => 25 / d.sigma, 2],
];
for (const [nom, ka, kr, sel, dec] of filas) {
  const t = dt(RA.malos.map((i) => sel(D[i])), RB.malos.map((i) => sel(D[i])));
  console.log(`${nom.padEnd(44)} | ${RA.r[ka].toFixed(dec).padStart(6)} vs ${RA.r[kr].toFixed(dec).padStart(6)} | ${RB.r[ka].toFixed(dec).padStart(6)} vs ${RB.r[kr].toFixed(dec).padStart(6)} | t = ${t.toFixed(2)}`);
}
{ const t = dt(RA.malos.map((i) => V["p25_a50"].serie[i].credito), RB.malos.map((i) => V["p25_a50"].serie[i].credito));
  console.log(`${"credito cobrado ($)".padEnd(44)} | ${RA.r.cred.toFixed(0).padStart(6)} vs ${RA.r.credResto.toFixed(0).padStart(6)} | ${RB.r.cred.toFixed(0).padStart(6)} vs ${RB.r.credResto.toFixed(0).padStart(6)} | t = ${t.toFixed(2)}`); }
console.log(`${"% de los malos que rompe por CALL".padEnd(44)} | ${(RA.r.pctCall*100).toFixed(0).padStart(6)}%           | ${(RB.r.pctCall*100).toFixed(0).padStart(6)}%           |`);
console.log(`${"los +-25 pts como % del indice".padEnd(44)} | ${RA.r.pct25pctIdx.toFixed(2).padStart(6)}%           | ${RB.r.pct25pctIdx.toFixed(2).padStart(6)}%           | t = ${dt(RA.malos.map((i)=>2500/D[i].sp11), RB.malos.map((i)=>2500/D[i].sp11)).toFixed(2)}`);
console.log(`dano del 5% peor: A $${RA.r.dano.toFixed(0)} (el resto suma $${RA.r.restoTot.toFixed(0)}) - B $${RB.r.dano.toFixed(0)} (el resto suma $${RB.r.restoTot.toFixed(0)})`);

const bin = base.map((x) => (x < 0 ? 1 : 0));
function autocorr(v, lag) { const a = v.slice(0, v.length - lag), b = v.slice(lag); const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i]-ma)*(b[i]-mb); da += (a[i]-ma)**2; db += (b[i]-mb)**2; } return n/Math.sqrt(da*db); }
console.log(`autocorrelacion del P&L: lag1 ${autocorr(base,1).toFixed(3)} - lag2 ${autocorr(base,2).toFixed(3)} - lag5 ${autocorr(base,5).toFixed(3)}`);
console.log(`autocorrelacion de "hoy pierde": lag1 ${autocorr(bin,1).toFixed(3)} - lag2 ${autocorr(bin,2).toFixed(3)}`);

// 2 - ELEGIR POR RIESGO
console.log("\n=== 2 - CRUCE - la geometria se elige SOLO por riesgo (presupuesto de ES5 puesto por la CUENTA) ===");
const M = {}; for (const id of ids) M[id] = { A: met(serie(id), idxA, AN_A), B: met(serie(id), idxB, AN_B), T: met(serie(id), D.map((_,i)=>i), AN_T) };
const PRES = [-3000, -2000, -1500, -1000, -750, -500];
console.log("presup.ES5 | elige en A     | aplicado a B: $/ano    ES5     racha  | elige en B     | aplicado a A: $/ano    ES5     racha");
for (const p of PRES) {
  const eA = ids.filter((id) => M[id].A.es5 >= p && M[id].A.opera > idxA.length * 0.8).sort((x, y) => M[x].A.es5 - M[y].A.es5)[0];
  const eB = ids.filter((id) => M[id].B.es5 >= p && M[id].B.opera > idxB.length * 0.8).sort((x, y) => M[x].B.es5 - M[y].B.es5)[0];
  const l = (id, per) => id ? `$${M[id][per].anual.toFixed(0).padStart(6)}  ${M[id][per].es5.toFixed(0).padStart(6)} ${M[id][per].racha.toFixed(0).padStart(7)}` : "   (ninguna)";
  console.log(`${String(p).padStart(10)} | ${(eA||"-").padEnd(14)} | ${l(eA,"B")} | ${(eB||"-").padEnd(14)} | ${l(eB,"A")}`);
}

// 3 - FIN DE MES
console.log("\n=== 3 - NO OPERAR EL ULTIMO DIA NEGOCIADO DEL MES - encima de cada geometria, en los dos sentidos ===");
console.log("geometria   | A sin    A con   D/ano | B sin    B con   D/ano | T sin    T con   D/ano | Dracha T");
for (const id of ["p25_a50", "s0.60_a50", "s0.80_a30", "s0.80_a50", "s1.00_a30"]) {
  const sin = serie(id), con = serie(id, (d) => !d.finMes);
  const r = (idx, an) => [met(sin, idx, an), met(con, idx, an)];
  const [a0, a1] = r(idxA, AN_A), [b0, b1] = r(idxB, AN_B), [t0, t1] = r(D.map((_, i) => i), AN_T);
  console.log(`${id.padEnd(11)} | ${a0.anual.toFixed(0).padStart(6)} ${a1.anual.toFixed(0).padStart(7)} ${(a1.anual-a0.anual).toFixed(0).padStart(6)} | ${b0.anual.toFixed(0).padStart(6)} ${b1.anual.toFixed(0).padStart(7)} ${(b1.anual-b0.anual).toFixed(0).padStart(6)} | ${t0.anual.toFixed(0).padStart(6)} ${t1.anual.toFixed(0).padStart(7)} ${(t1.anual-t0.anual).toFixed(0).padStart(6)} | ${(t1.racha-t0.racha).toFixed(0).padStart(7)}`);
}
const fm = idxA.concat(idxB).filter((i) => D[i].finMes), nofm = idxA.concat(idxB).filter((i) => !D[i].finMes);
console.log(`P&L medio: fin de mes $${media(fm.map((i)=>base[i])).toFixed(0)} (n=${fm.length}) vs resto $${media(nofm.map((i)=>base[i])).toFixed(0)} - t=${dt(fm.map((i)=>base[i]), nofm.map((i)=>base[i])).toFixed(2)}`);
console.log(`movimiento tarde/sigma: fin de mes ${media(fm.map((i)=>D[i].movSig)).toFixed(3)} vs resto ${media(nofm.map((i)=>D[i].movSig)).toFixed(3)} - t=${dt(fm.map((i)=>D[i].movSig), nofm.map((i)=>D[i].movSig)).toFixed(2)}`);
console.log(`IV cobrada 11:00: fin de mes ${media(fm.map((i)=>D[i].iv)).toFixed(4)} vs resto ${media(nofm.map((i)=>D[i].iv)).toFixed(4)} - t=${dt(fm.map((i)=>D[i].iv), nofm.map((i)=>D[i].iv)).toFixed(2)}`);
const AA = idxA.filter((i)=>D[i].finMes), AR = idxA.filter((i)=>!D[i].finMes), BB = idxB.filter((i)=>D[i].finMes), BR = idxB.filter((i)=>!D[i].finMes);
console.log(`  A: fin de mes $${media(AA.map((i)=>base[i])).toFixed(0)} vs $${media(AR.map((i)=>base[i])).toFixed(0)} (n=${AA.length}) - B: $${media(BB.map((i)=>base[i])).toFixed(0)} vs $${media(BR.map((i)=>base[i])).toFixed(0)} (n=${BB.length})`);
console.log(`liston Bonferroni para 90 pruebas declaradas -> |t| >= ${listonT(90)}`);
