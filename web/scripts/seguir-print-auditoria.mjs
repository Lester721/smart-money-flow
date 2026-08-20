// AUDITORIA — 8 filas al azar comprobadas A MANO contra el fichero de cadena crudo y contra el
// .jsonl.gz del flujo. Si una sola no cuadra, no se reporta nada.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-auditoria.mjs

import { readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { rng, dias, fmt } from "./print-lib.mjs";

const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const A = todo.filter((f) => f.lado === 1 && f.prima >= 1e6 && Number.isFinite(f.r5));
const r = rng(20260820);
let fallos = 0, comprobadas = 0;
const occ = (f) => `${f.ticker}${f.exp.slice(2)}${f.tipo}${String(Math.round(f.K * 1000)).padStart(8, "0")}`;

console.log("\n" + "=".repeat(104));
console.log("AUDITORIA A MANO — 8 filas contra los ficheros crudos");
console.log("=".repeat(104));

for (let i = 0; i < 8; i++) {
  const f = A[Math.floor(r() * A.length)];
  comprobadas++;
  console.log(`\n[${i + 1}] ${f.ticker} ${f.exp} ${f.tipo} ${f.K} · print del ${f.fecha} a las ${f.horaN.toFixed(2)}h ET · prima $${fmt(f.prima)}`);

  // (a) el print existe de verdad en el flujo, al ask, de una pata, antes de las 15:00
  const p = `scripts/cache-theta/marketsnack/flujo-100k/${f.fecha}.jsonl.gz`;
  const sym = occ(f);
  let hallado = 0, maxP = 0, condiciones = new Set(), lados = new Set();
  if (existsSync(p)) {
    for (const l of gunzipSync(readFileSync(p)).toString("utf8").trim().split("\n")) {
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.symbol !== sym) continue;
      if (o.premium < 250e3) continue;
      if (![209, 210, 219, 227, 228, 229, 230, 231].includes(o.trade_condition_id)) continue;
      if (!["ASKSIDE", "ABOVE_ASK", "AT_ASK"].includes(o.side)) continue;
      if (Number(o.timestamp.slice(11, 13)) >= 19) continue;
      hallado++; maxP = Math.max(maxP, o.premium);
      condiciones.add(o.trade_condition_id); lados.add(o.side);
    }
  }
  const okFlujo = hallado === f.nPrints && Math.abs(maxP - f.prima) < 1;
  console.log(`    flujo   : ${hallado} print(s) al ask/una pata/<15:00, prima max $${fmt(maxP)}` +
    `  · fila dice ${f.nPrints} y $${fmt(f.prima)}  ${okFlujo ? "OK" : "*** NO CUADRA ***"}`);
  console.log(`              codigos ${[...condiciones].join(",")} · lados ${[...lados].join(",")}`);
  if (!okFlujo) fallos++;

  // (b) el ask de entrada sale del fichero de cadena del MISMO dia
  const cE = JSON.parse(readFileSync(`scripts/cache-theta/cadenas/${f.ticker}_d${f.fechaY}.json`, "utf8"));
  const qE = cE[f.exp][`${f.K}|${f.tipo}`];
  const okE = Math.abs(qE[1] - f.ask) < 1e-9 && qE[1] > qE[0] * 0.99999 - 1e9;
  console.log(`    entrada : cadena ${f.ticker}_d${f.fechaY}.json -> bid ${qE[0]} ask ${qE[1]} · fila compra al ask ${f.ask}  ${okE ? "OK" : "*** NO CUADRA ***"}`);
  if (!okE) fallos++;

  // (c) la salida sale de la cadena del dia de salida, y ese dia es POSTERIOR
  const dS = f.sal5;
  const cS = JSON.parse(readFileSync(`scripts/cache-theta/cadenas/${f.ticker}_d${dS}.json`, "utf8"));
  const qS = cS[f.exp] ? cS[f.exp][`${f.K}|${f.tipo}`] : null;
  const bidS = qS ? qS[0] : 0;
  const rEsp = (bidS - f.ask) / f.ask;
  const d = dias(f.fechaY, dS);
  const okS = Math.abs(rEsp - f.r5) < 1e-9 && d >= 5 && d <= 9 && dS > f.fechaY && f.exp > dS;
  console.log(`    salida  : ${dS} (+${d} dias, vence ${f.exp}) -> bid ${bidS} · ret (bid-ask)/ask = ${(rEsp * 100).toFixed(2)}%`
    + ` · fila dice ${(f.r5 * 100).toFixed(2)}%  ${okS ? "OK" : "*** NO CUADRA ***"}`);
  if (!okS) fallos++;

  // (d) el control de horquilla se elige SOLO con datos del dia de entrada
  console.log(`    control : horq propia ${(f.horq * 100).toFixed(2)}% = (${qE[1]}-${qE[0]})/${qE[1]}` +
    ` ${Math.abs((qE[1] - qE[0]) / qE[1] - f.horq) < 1e-9 ? "OK" : "*** NO CUADRA ***"}`);
  if (Math.abs((qE[1] - qE[0]) / qE[1] - f.horq) >= 1e-9) fallos++;
}

console.log(`\n${"=".repeat(104)}`);
console.log(`   ${comprobadas} filas · ${fallos} comprobaciones falladas`);
console.log(fallos === 0 ? "   AUDITORIA LIMPIA" : "   *** HAY FALLOS: NO SE REPORTA ***");
console.log("=".repeat(104) + "\n");
