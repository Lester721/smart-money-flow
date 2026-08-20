// CIERRE — (1) verificar el P&L contra el CSV crudo pata a pata, (2) el estrés de HOOD hacia
// ADELANTE desde el nivel de HOY, que es la única versión que le sirve a Lester para decidir.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/nulo-cierre.mjs

import { readFileSync } from "node:fs";
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;

// ── 1 · RELEER DEL CRUDO tres días clave y rehacer las cuatro patas a mano ──────────────────
console.log("═".repeat(112));
console.log("### 1 · VERIFICACIÓN — P&L rehecho desde el CSV crudo, pata a pata");
console.log("═".repeat(112) + "\n");
function crudo(fecha, right) {
  const lin = readFileSync(`scripts/cache-theta/gex-2026/iv_${fecha}_${right}.csv`, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  const en11 = []; let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","); const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h === "11:00" && Number(c[iK]) > 0 && Number(c[iB]) >= 0 && Number(c[iA]) > 0)
      en11.push({ K: Number(c[iK]), bid: Number(c[iB]), ask: Number(c[iA]), spot: sp });
  }
  return { en11, cierre, hFin };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
console.log("| fecha | spot 11:00 | cierre (última marca) | vender call/put | comprar call/put | crédito | cierre índice | P&L a mano | P&L en caché | ¿cuadra? |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const f of ["2023-12-20", "2024-04-30", "2024-04-04", "2022-06-13"]) {
  const C = crudo(f, "C"), P = crudo(f, "P");
  const sp = C.en11[0].spot, S = C.cierre;
  const cC = cerca(C.en11, sp + 25), pC = cerca(P.en11, sp - 25);
  const cL = cerca(C.en11, cC.K + 50), pL = cerca(P.en11, pC.K - 50);
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K) - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * 0.03;
  const cache = D.find((d) => d.fecha === f);
  console.log(`| ${f} | ${sp.toFixed(2)} | ${S.toFixed(2)} @${C.hFin} | ${cC.K}/${pC.K} | ${cL.K}/${pL.K} | ${eur(cred * 100)} | ${S.toFixed(2)} | ${eur(pl)} | ${cache ? eur(cache.A.pl) : "—"} | ${cache && Math.abs(pl - cache.A.pl) < 0.01 ? "SÍ" : "**NO**"} |`);
}

// ── 2 · ESTRÉS DE HOOD HACIA ADELANTE, desde el nivel de HOY ────────────────────────────────
console.log("\n\n" + "═".repeat(112));
console.log("### 2 · HACIA ADELANTE — HOOD hoy vale $48.135. ¿Cuánta caída de HOOD aguanta cada tamaño?");
console.log("═".repeat(112) + "\n");
const bars = JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json", "utf8"));
let pk = -Infinity, ddH = 0;
for (const b of bars) { if (b.close > pk) pk = b.close; if ((pk - b.close) / pk > ddH) ddH = (pk - b.close) / pk; }
console.log(`Caída máxima REAL de HOOD en el fichero (${bars[0].time} → ${bars[bars.length - 1].time}, n=${bars.length}): **${pct(-ddH)}**`);
console.log(`El informe sólo estresó −30% y −50%. La historia de HOOD ya ha hecho ${pct(-ddH)}.\n`);
const suelos = { "cóndor HOY ±25/50": [-766, -9512], "filtro ±30/50": [-1154, -10330], "straddle 2,3×/30": [-3095, -14586] };
console.log("| caída de HOOD | valor de HOOD | línea de llamada | ¿llamada con 1 contrato? | ¿llamada con 2 contratos? |");
console.log("|---|---|---|---|---|");
for (const c of [0, 0.20, 0.30, 0.40, 0.50, ddH, 0.60, 0.70]) {
  const H = 48135 * (1 - c), L = -0.70 * H;
  const f = (i) => Object.entries(suelos).filter(([, v]) => v[i] < L).map(([k]) => k);
  const a = f(0), b = f(1);
  console.log(`| ${pct(-c)}${Math.abs(c - ddH) < 1e-9 ? " ← la real" : ""} | ${eur(H)} | ${eur(L)} | ${a.length ? "**" + a.join(", ") + "**" : "ninguna"} | ${b.length ? "**" + b.join(", ") + "**" : "ninguna"} |`);
}
console.log("\n(los suelos de caja son los del propio informe, con HOOD fijo; sólo se mueve la línea)");
console.log("\nY el dato que el supuesto constante borra: en los 20 peores días del cóndor HOOD hizo −3,1% de media");
console.log("contra +0,3% el resto. La correlación de todos los días es ρ=0,06, pero EN LA COLA caen juntos.");
