// Mirar los campos que se van a usar ANTES de construir la metrica: valores de `side`,
// reparto horario del flujo, y como se distribuye size/OI.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const leer = (d) => {
  const t = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  return t ? t.split("\n").map((l) => JSON.parse(l)) : [];
};

const sides = new Map(), sents = new Map(), horas = new Map(), horaPrima = new Map();
const combos = new Map();
let n = 0, deltaNull = 0;
const muestra = dias.filter((_, i) => i % 4 === 0);
for (const d of muestra) {
  for (const f of leer(d)) {
    n++;
    sides.set(f.side, (sides.get(f.side) ?? 0) + 1);
    sents.set(f.sentiment, (sents.get(f.sentiment) ?? 0) + 1);
    const h = f.timestamp.slice(11, 13);
    horas.set(h, (horas.get(h) ?? 0) + 1);
    horaPrima.set(h, (horaPrima.get(h) ?? 0) + (f.premium ?? 0));
    if (f.delta == null) deltaNull++;
    const cp = /(\d{6})([CP])\d{8}$/.exec(f.symbol)?.[2] ?? "?";
    const k = cp + "|" + f.side + "|" + f.sentiment;
    combos.set(k, (combos.get(k) ?? 0) + 1);
  }
}
console.log("muestra de " + muestra.length + " dias, " + n.toLocaleString("es-ES") + " ops\n");
console.log("side:      " + [...sides.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + ((v / n) * 100).toFixed(1) + "%").join("  "));
console.log("sentiment: " + [...sents.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => k + " " + ((v / n) * 100).toFixed(1) + "%").join("  "));
console.log("delta nulo: " + ((deltaNull / n) * 100).toFixed(2) + "%\n");
console.log("reparto horario (UTC; mercado 13:30-20:00Z en horario de verano):");
for (const h of [...horas.keys()].sort()) {
  console.log("  " + h + ":00Z  " + String(horas.get(h)).padStart(8) + " ops  " +
    ((horas.get(h) / n) * 100).toFixed(2).padStart(6) + "%  prima $" + (horaPrima.get(h) / 1e9).toFixed(2) + "B");
}
console.log("\ncombinaciones tipo|side|sentiment mas frecuentes:");
for (const [k, v] of [...combos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14))
  console.log("  " + k.padEnd(30) + ((v / n) * 100).toFixed(2) + "%");
