// ¿POR QUÉ EL FORWARD DICE "faltan strikes" SI EL BACKTEST OPERA ESE MISMO DÍA?
//
// El backtest coge el strike MÁS CERCANO al objetivo. El forward pide el strike EXACTO
// (redondear el spot a 5 y sumar 25). Si ese exacto no está cotizado, el forward no opera y el
// backtest sí — o sea, los dos no están midiendo lo mismo, que es justo lo que este registro
// tenía que evitar.
//
// Y hay un segundo sospechoso: foto() descarta toda opción con bid <= 0. Para la pata que se
// VENDE tiene sentido; para el ALA que se COMPRA no — un ala que nadie quiere comprar se paga
// al ask igual, y es la más barata. Ese filtro puede estar tirando justo las dos alas.

import { readFileSync } from "node:fs";
const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DIA = process.argv[2] || "2026-08-17";
const HORA = "11:00", SEP = 25, ALA = 50, PASO = 5;

async function csv(ruta) {
  const r = await fetch(B + "/" + ruta, { signal: AbortSignal.timeout(180_000) });
  const txt = await r.text();
  if (!r.ok || txt.length < 200) return null;
  const lin = txt.trim().split("\n");
  return { cab: lin[0].split(","), filas: lin.slice(1).map((l) => l.split(",")) };
}

for (const lado of ["C", "P"]) {
  const d = await csv("option/history/greeks/implied_volatility?symbol=SPXW&expiration=" +
    DIA.replace(/-/g, "") + "&start_date=" + DIA.replace(/-/g, "") + "&end_date=" + DIA.replace(/-/g, "") +
    "&right=" + lado + "&interval=5m");
  if (!d) { console.log(lado + ": sin datos"); continue; }
  const jK = d.cab.indexOf("strike"), jT = d.cab.indexOf("timestamp"), jB = d.cab.indexOf("bid"),
        jA = d.cab.indexOf("ask"), jM = d.cab.indexOf("midpoint"), jV = d.cab.indexOf("implied_vol"),
        jU = d.cab.indexOf("underlying_price");
  const todas = new Map(); let U = 0;
  for (const c of d.filas) {
    if (c[jT].slice(11, 16) !== HORA) continue;
    const u = +c[jU]; if (u > 0) U = u;
    todas.set(+c[jK], { bid: +c[jB], ask: +c[jA], mid: +c[jM], iv: +c[jV] });
  }
  const red = (x) => Math.round(x / PASO) * PASO;
  const obj = lado === "C" ? red(U) + SEP : red(U) - SEP;
  const ala = lado === "C" ? obj + ALA : obj - ALA;
  console.log("\n═══ " + (lado === "C" ? "CALLS" : "PUTS") + " · SPX " + U.toFixed(2) + " · " + todas.size + " strikes a las " + HORA + " ═══");
  console.log("   busca la corta en " + obj + " y el ala en " + ala);
  const ks = [...todas.keys()].sort((a, b) => a - b);
  console.log("   strikes existentes cerca: " + ks.filter((k) => Math.abs(k - obj) <= 60).join(", "));
  console.log("   paso entre strikes en esa zona: " + [...new Set(ks.filter((k) => Math.abs(k - U) <= 150).map((k, i, arr) => (i ? k - arr[i - 1] : null)).filter(Boolean))].join(", "));
  for (const [nom, K] of [["corta", obj], ["ala", ala]]) {
    const q = todas.get(K);
    if (!q) { console.log("   " + nom + " " + K + ": ❌ NO EXISTE ese strike exacto"); continue; }
    const pasaBid = q.bid > 0, pasaAsk = q.ask > 0, pasaIv = q.iv > 0.01 && q.iv <= 4,
          pasaHorq = q.mid > 0 && (q.ask - q.bid) / q.mid <= 0.5;
    console.log("   " + nom + " " + K + ": bid " + q.bid.toFixed(2) + " ask " + q.ask.toFixed(2) +
      " mid " + q.mid.toFixed(2) + " iv " + q.iv.toFixed(3) +
      "  ->  bid>0 " + (pasaBid ? "✅" : "❌") + " · ask>0 " + (pasaAsk ? "✅" : "❌") +
      " · iv " + (pasaIv ? "✅" : "❌") + " · horquilla<50% " + (pasaHorq ? "✅" : "❌") +
      ((pasaBid && pasaAsk && pasaIv && pasaHorq) ? "  → PASA" : "  → **DESCARTADA**"));
  }
}
