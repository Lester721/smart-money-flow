// LA COTIZACIÓN REZAGADA, MEDIDA · el pendiente que estaba en la memoria sin número.
//
// El hallazgo entra con el bid/ask de las 11:00:00 exactas. En la vida real la orden se manda
// mirando una pantalla que ya tiene unos segundos, y se rellena después. La pregunta con dinero
// dentro es: si el relleno cae 5 minutos más tarde (o el precio que miré era de 5 minutos antes),
// ¿cuánto crédito cambia — SOBRE LOS MISMOS CUATRO STRIKES?
//
// No es una simulación: son las mismas cuatro patas cotizadas a 10:55, 11:00 y 11:05.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refut-dinero-retraso.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORAS = ["10:55", "11:00", "11:05"];
const ALA = 50, SEP = 25;
const CAMPOS = ["strike", "timestamp", "bid", "ask", "underlying_price"];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = CAMPOS.map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const [iK, iT, iB, iA, iU] = idx;
  const porHora = new Map(HORAS.map((h) => [h, new Map()]));
  const spot = new Map();
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j];
    if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16);
    const m = porHora.get(h);
    if (!m) continue;
    const sp = +c[iU];
    if (sp > 0 && !spot.has(h)) spot.set(h, sp);
    const K = +c[iK], bid = +c[iB], ask = +c[iA];
    if (K > 0 && bid >= 0 && ask > 0) m.set(K, { bid, ask });
  }
  return { porHora, spot };
}

const cercaK = (m, o) => { let mej = null, d = Infinity; for (const k of m.keys()) { const x = Math.abs(k - o); if (x < d) { d = x; mej = k; } } return mej; };

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const out = [];
let hecho = 0, sinDato = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const sp11 = C.spot.get("11:00") ?? P.spot.get("11:00");
  if (!(sp11 > 0)) continue;
  const c11 = C.porHora.get("11:00"), p11 = P.porHora.get("11:00");
  if (!c11.size || !p11.size) continue;
  // LOS STRIKES SE ELIGEN A LAS 11:00 Y NO SE MUEVEN. Sólo cambia la hora de la cotización.
  const kCC = cercaK(c11, sp11 + SEP), kPC = cercaK(p11, sp11 - SEP);
  const kCL = cercaK(c11, kCC + ALA), kPL = cercaK(p11, kPC - ALA);
  if (!(kCL > kCC && kPL < kPC)) continue;

  const cr = {};
  let falta = false;
  for (const h of HORAS) {
    const mc = C.porHora.get(h), mp = P.porHora.get(h);
    const a = mc.get(kCC), b = mp.get(kPC), c = mc.get(kCL), d = mp.get(kPL);
    if (!a || !b || !c || !d) { falta = true; break; }
    cr[h] = (a.bid + b.bid - c.ask - d.ask) * 100;
  }
  if (falta) { sinDato++; continue; }
  out.push({ fecha, sp11, spot1055: C.spot.get("10:55") ?? null, spot1105: C.spot.get("11:05") ?? null,
             c1055: cr["10:55"], c1100: cr["11:00"], c1105: cr["11:05"] });
  if (++hecho % 200 === 0) console.log(`  ${hecho} · ${fecha}`);
}
console.log(`\n${out.length} días con las mismas 4 patas cotizadas a 10:55, 11:00 y 11:05 · ${sinDato} descartados por faltar alguna pata en alguna de las tres horas`);
writeFileSync("scripts/refut-dinero-retraso.json", JSON.stringify(out));
console.log("escrito scripts/refut-dinero-retraso.json");
