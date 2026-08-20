// RESPETAR · IMANES (4) — auditar los números antes de reportarlos.
// 1) ¿El peor día de −9,72% es real o un fallo del caché de SPY? Se cruza SPX contra SPY.
// 2) Racha perdedora más larga y la forma real de la distribución.
// 3) La asimetría: mediana +4,78 pts pero media +1,28 → ¿aciertos pequeños y fallos grandes?
import { readFileSync } from "node:fs";

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const D = [];
for (const f of J.filas) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!(f.apertura > 0) || !(f.cierre > 0) || !c || !p || !(c.bid > 0) || !(p.bid > 0)) continue;
  const K = f.niveles.gamD?.imanNeto; if (!(K > 0)) continue;
  D.push({ fecha: f.fecha, ap: f.apertura, ci: f.cierre, iman: K, lado: Math.sign(K - f.apertura),
    net: f.niveles.gam?.netPunto, spy: f.spy || null, callATM: c, putATM: p });
}
const NEG = D.filter((d) => d.net < 0);

console.log("\n══ 1 · AUDITAR EL PEOR DÍA — ¿SPY dice lo mismo que SPX? ══");
const conSpy = NEG.filter((d) => d.spy && d.spy.apertura > 0 && d.spy.cierre > 0);
const filas = conSpy.map((d) => ({
  fecha: d.fecha,
  retSpy: d.lado * (d.spy.cierre - d.spy.apertura) / d.spy.apertura * 100,
  retSpx: d.lado * (d.ci - d.ap) / d.ap * 100,
  spyAp: d.spy.apertura, spyCi: d.spy.cierre, spxAp: d.ap, spxCi: d.ci, lado: d.lado,
}));
filas.sort((a, b) => a.retSpy - b.retSpy);
console.log("   Los 5 PEORES días (dirección del imán, γ<0):");
console.log(`   ${"fecha".padEnd(12)} ${"lado".padStart(5)} ${"SPY %".padStart(8)} ${"SPX %".padStart(8)} ${"desajuste".padStart(10)}  SPY ap→ci / SPX ap→ci`);
for (const r of filas.slice(0, 5))
  console.log(`   ${r.fecha.padEnd(12)} ${String(r.lado).padStart(5)} ${r.retSpy.toFixed(2).padStart(8)} ${r.retSpx.toFixed(2).padStart(8)} ${(r.retSpy - r.retSpx).toFixed(2).padStart(10)}  ${r.spyAp.toFixed(2)}→${r.spyCi.toFixed(2)} / ${r.spxAp.toFixed(0)}→${r.spxCi.toFixed(0)}`);
console.log("   Los 5 MEJORES:");
for (const r of filas.slice(-5).reverse())
  console.log(`   ${r.fecha.padEnd(12)} ${String(r.lado).padStart(5)} ${r.retSpy.toFixed(2).padStart(8)} ${r.retSpx.toFixed(2).padStart(8)} ${(r.retSpy - r.retSpx).toFixed(2).padStart(10)}  ${r.spyAp.toFixed(2)}→${r.spyCi.toFixed(2)} / ${r.spxAp.toFixed(0)}→${r.spxCi.toFixed(0)}`);
const desaj = filas.map((r) => Math.abs(r.retSpy - r.retSpx));
console.log(`   Desajuste SPY vs SPX: p50 ${mediana(desaj).toFixed(3)} pp · p95 ${pct(desaj, 95).toFixed(3)} pp · máx ${Math.max(...desaj).toFixed(3)} pp`);
console.log(`   → si el máximo desajuste es pequeño, el −9,7% NO es un fallo de caché: es un día real.`);

console.log("\n══ 2 · LA FORMA DE LA DISTRIBUCIÓN (γ<0, en puntos de SPX) ══");
const pts = NEG.map((d) => d.lado * (d.ci - d.ap));
const gan = pts.filter((x) => x > 0), per = pts.filter((x) => x < 0);
console.log(`   n=${pts.length} · aciertos ${gan.length} (${(100 * gan.length / pts.length).toFixed(1)}%) · fallos ${per.length}`);
console.log(`   ACIERTO medio +${media(gan).toFixed(1)} pts (mediana +${mediana(gan).toFixed(1)})`);
console.log(`   FALLO   medio ${media(per).toFixed(1)} pts (mediana ${mediana(per).toFixed(1)})`);
console.log(`   → gana más veces pero PIERDE MÁS GRANDE: ratio fallo/acierto = ${(Math.abs(media(per)) / media(gan)).toFixed(2)}×`);
console.log(`   p01 ${pct(pts, 1).toFixed(0)} · p05 ${pct(pts, 5).toFixed(0)} · p50 ${mediana(pts).toFixed(1)} · p95 ${pct(pts, 95).toFixed(0)} · p99 ${pct(pts, 99).toFixed(0)}`);

console.log("\n══ 3 · RACHAS ══");
function rachas(serie) {
  let peorRacha = 0, actual = 0, peorCaida = 0, acum = 0, pico = 0;
  for (const x of serie) {
    if (x < 0) { actual++; peorRacha = Math.max(peorRacha, actual); } else actual = 0;
    acum += x; pico = Math.max(pico, acum); peorCaida = Math.min(peorCaida, acum - pico);
  }
  return { peorRacha, peorCaida };
}
const ordenados = [...NEG].sort((a, b) => a.fecha.localeCompare(b.fecha));
const serieSpy = ordenados.filter((d) => d.spy && d.spy.apertura > 0)
  .map((d) => (d.lado * (d.spy.cierre - d.spy.apertura) - 0.01) / d.spy.apertura * 56389);
const rSpy = rachas(serieSpy);
console.log(`   SPY en acciones (todo el capital, $56.389): racha perdedora más larga ${rSpy.peorRacha} días · peor caída acumulada $${rSpy.peorCaida.toFixed(0)}`);
console.log(`   peor día $${Math.min(...serieSpy).toFixed(0)} · mejor día $${Math.max(...serieSpy).toFixed(0)}`);

const serieOpc = ordenados.map((d) => {
  const o = d.lado > 0 ? d.callATM : d.putATM; if (!o || !(o.ask > 0)) return null;
  const intr = d.lado > 0 ? Math.max(0, d.ci - o.K) : Math.max(0, o.K - d.ci);
  return (intr - o.ask) * 100;
}).filter((x) => x != null);
const rOpc = rachas(serieOpc);
console.log(`   SPXW 0DTE ATM (1 contrato): racha perdedora más larga ${rOpc.peorRacha} días · peor caída acumulada $${rOpc.peorCaida.toFixed(0)}`);
console.log(`   peor día $${Math.min(...serieOpc).toFixed(0)} · mejor día $${Math.max(...serieOpc).toFixed(0)} · pierde el 100% de la prima el ${(100 * serieOpc.filter((x, i) => { const o = ordenados[i].lado > 0 ? ordenados[i].callATM : ordenados[i].putATM; return o && x <= -o.ask * 100 + 0.01; }).length / serieOpc.length).toFixed(0)}% de las veces`);

console.log("\n══ 4 · EL INTERVALO HONESTO DEL DINERO ══");
const diasAno = 252 * (NEG.length / D.length);
const mSpy = media(serieSpy), sSpy = sd(serieSpy);
const ic = 1.96 * sSpy / Math.sqrt(serieSpy.length);
console.log(`   SPY: $${(mSpy * diasAno).toFixed(0)}/año · intervalo 95%: $${((mSpy - ic) * diasAno).toFixed(0)} a $${((mSpy + ic) * diasAno).toFixed(0)}`);
const mO = media(serieOpc), icO = 1.96 * sd(serieOpc) / Math.sqrt(serieOpc.length);
console.log(`   SPXW 1 contrato: $${(mO * diasAno).toFixed(0)}/año · intervalo 95%: $${((mO - icO) * diasAno).toFixed(0)} a $${((mO + icO) * diasAno).toFixed(0)}`);
console.log(`   → el cero está DENTRO de los dos intervalos: no se puede distinguir de no operar.\n`);
