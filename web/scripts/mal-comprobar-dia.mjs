// COMPROBACIÓN A MANO de dos días de 2022, leyendo el CSV crudo línea a línea.
// Todo el veredicto depende de que 2022 sea mercado de verdad; esto lo mira con los ojos.
import { readFileSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026";
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"));
for (const F of ["2022-01-05", "2022-06-28", "2023-12-20"]) {
  const d = dias.find((x) => x.fecha === F);
  console.log(`\n═══ ${F} ═══`);
  console.log(`  guardado: spot 11:00 ${d.sp11} · cierre ${d.cierre} · strikes ${d.kpL}/${d.kpC} — ${d.kcC}/${d.kcL}`);
  console.log(`  patas: vendo call ${d.kcC} a bid ${d.bidC} · vendo put ${d.kpC} a bid ${d.bidP} · compro call ${d.kcL} a ask ${d.askCL} · compro put ${d.kpL} a ask ${d.askPL}`);
  console.log(`  crédito ${d.credito} · P&L ${d.pl.toFixed(2)}`);
  for (const [right, ks] of [["C", [d.kcC, d.kcL]], ["P", [d.kpC, d.kpL]]]) {
    const lin = readFileSync(`${DIR}/iv_${F}_${right}.csv`, "utf8").split("\n");
    const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
    const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
    for (const k of ks) {
      const f = lin.find((l) => { const c = l.split(","); return +c[iK] === k && String(c[iT]).slice(11, 16) === "11:00"; });
      const c = f ? f.split(",") : null;
      console.log(`    CSV crudo ${right} ${k} @11:00 → bid ${c ? c[iB] : "NO ESTÁ"} · ask ${c ? c[iA] : "—"} · spot ${c ? c[iU] : "—"}`);
    }
    // último precio del subyacente del día
    let ult = null;
    for (let j = lin.length - 1; j > 0 && !ult; j--) { const c = lin[j].split(","); if (+c[iU] > 0) ult = { h: String(c[iT]).slice(11, 16), s: +c[iU] }; }
    console.log(`    último subyacente en el fichero ${right}: ${ult.h} = ${ult.s}`);
  }
  // reconstrucción a mano
  const pC = Math.min(Math.max(d.cierre - d.kcC, 0), d.kcL - d.kcC);
  const pP = Math.min(Math.max(d.kpC - d.cierre, 0), d.kpC - d.kpL);
  const pl = (d.credito / 100 - pC - pP) * 100 - 8 * 0.03;
  console.log(`  a mano: penetración call ${pC.toFixed(2)} · put ${pP.toFixed(2)} → P&L ${pl.toFixed(2)}  ${Math.abs(pl - d.pl) < 0.01 ? "CUADRA" : "*** NO CUADRA ***"}`);
}
