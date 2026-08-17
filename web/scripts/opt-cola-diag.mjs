// Diagnóstico: ¿por qué el crédito del 2024-04-04 sale $100? Mirar el fichero crudo.
import { readFileSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026";
const F = process.argv[2] || "2024-04-04";
const HORA = process.argv[3] || "11:00";

for (const right of ["C", "P"]) {
  const lin = readFileSync(`${DIR}/iv_${F}_${right}.csv`, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const i = (n) => cab.indexOf(n);
  const filas = [];
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[i("timestamp")]).slice(11, 16) !== HORA) continue;
    filas.push({ K: +c[i("strike")], bid: +c[i("bid")], ask: +c[i("ask")], iv: +c[i("implied_vol")], spot: +c[i("underlying_price")] });
  }
  filas.sort((a, b) => a.K - b.K);
  const spot = filas[0]?.spot;
  console.log(`\n=== ${right} · ${F} ${HORA} · spot ${spot} · ${filas.length} strikes · rango ${filas[0]?.K}–${filas[filas.length - 1]?.K}`);
  const paso = filas.length > 1 ? filas.slice(1).map((x, k) => x.K - filas[k].K) : [];
  console.log(`    paso entre strikes: ${[...new Set(paso)].sort((a,b)=>a-b).slice(0,6).join(", ")}`);
  const cerca = filas.filter((x) => Math.abs(x.K - spot) <= 90);
  for (const x of cerca) console.log(`    K=${x.K}  d=${(x.K - spot).toFixed(1).padStart(7)}  bid=${String(x.bid).padStart(8)}  ask=${String(x.ask).padStart(8)}  iv=${x.iv}`);
}
