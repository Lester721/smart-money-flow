// ═══════════════════════════════════════════════════════════════════════════════════════════
// TARJETA (1) — EXTRAER LAS COTIZACIONES REALES de las CUATRO patas, hora a hora
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tarjeta-1-salidas.mjs
//
// POR QUÉ LAS CUATRO: la tarjeta tiene que decir DÓNDE SALE (hace falta el bid/ask real de las
// patas a media sesión, no un modelo) y tiene que pasar EL CONTROL (la misma vertical con el
// lado al azar, que exige tener también la vertical del lado CONTRARIO con sus precios reales).
//
// Se saca de cada día: callATM, call05, putATM y put05 — bid y ask a 13 horas del día.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORAS = ["09:35", "10:00", "10:30", "11:00", "11:30", "12:00", "13:00", "14:00", "15:00", "15:30", "15:45", "15:55", "16:00"];
function exigir(c, m) { if (!c) throw new Error(`FALLO CERRADO: ${m}`); }

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
exigir(J.hora === "09:35", `la hora de decisión cambió: ${J.hora}`);

// ── las columnas se leen por NOMBRE, no por posición ──
function columnas(cab) {
  const c = cab.split(",").map((s) => s.trim());
  const idx = {};
  for (const n of ["strike", "right", "timestamp", "bid", "ask", "underlying_price"]) {
    const i = c.indexOf(n);
    if (i < 0) throw new Error(`FALLO CERRADO: falta la columna ${n} en ${cab.slice(0, 120)}`);
    idx[n] = i;
  }
  return idx;
}

// Lee un fichero de cadena y devuelve {K: {hora: [bid, ask]}} sólo para los strikes pedidos.
function leerCadena(ruta, strikes) {
  const txt = readFileSync(ruta, "utf8");
  const nl = txt.indexOf("\n");
  const idx = columnas(txt.slice(0, nl));
  const quiere = new Set(HORAS);
  const want = new Set(strikes);
  const cot = {};
  for (const k of strikes) cot[k] = {};
  let pos = nl + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos);
    if (fin < 0) fin = txt.length;
    const linea = txt.slice(pos, fin);
    pos = fin + 1;
    if (linea.length < 20) continue;
    const p = linea.split(",");
    const k = +p[idx.strike];
    if (!want.has(k)) continue;
    const h = p[idx.timestamp].slice(11, 16);
    if (!quiere.has(h)) continue;
    cot[k][h] = [+p[idx.bid], +p[idx.ask]];
  }
  return cot;
}

const out = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
let hecho = 0;
const t0 = Date.now();

for (const f of J.filas) {
  const net = f.niveles?.gam?.netPunto;
  const K = f.niveles?.gamD?.imanNeto;
  if (!Number.isFinite(net)) { cae("sin gamma neta"); continue; }
  if (!(K > 0) || !(f.apertura > 0) || !(f.cierre > 0)) { cae("sin imán, apertura o cierre"); continue; }
  const lado = Math.sign(K - f.apertura);
  if (lado === 0) { cae("imán justo en la apertura"); continue; }
  const cA = f.peaje?.callATM, c5 = f.peaje?.call05, pA = f.peaje?.putATM, p5 = f.peaje?.put05;
  if (!cA || !c5 || !pA || !p5) { cae("falta alguna de las cuatro patas"); continue; }
  const rC = `${DIR}/iv_${f.fecha}_C.csv`, rP = `${DIR}/iv_${f.fecha}_P.csv`;
  if (!existsSync(rC) || !existsSync(rP)) { cae("fichero de cadena ausente"); continue; }

  const cotC = leerCadena(rC, [cA.K, c5.K]);
  const cotP = leerCadena(rP, [pA.K, p5.K]);

  // FALLO CERRADO: la cadena tiene que cuadrar con lo ya guardado a las 09:35
  const chk = [[cotC[cA.K], cA], [cotC[c5.K], c5], [cotP[pA.K], pA], [cotP[p5.K], p5]];
  let ok = true;
  for (const [c, ref] of chk) {
    const q = c && c["09:35"];
    if (!q || Math.abs(q[0] - ref.bid) > 0.011 || Math.abs(q[1] - ref.ask) > 0.011) { ok = false; break; }
  }
  if (!ok) { cae("la cadena no cuadra con gex-niveles a las 09:35"); continue; }

  out.push({
    fecha: f.fecha, ap: f.apertura, ci: f.cierre, net, iman: K, lado,
    call: { KL: cA.K, KC: c5.K, ancho: c5.K - cA.K, larga: cotC[cA.K], corta: cotC[c5.K] },
    put: { KL: pA.K, KC: p5.K, ancho: pA.K - p5.K, larga: cotP[pA.K], corta: cotP[p5.K] },
  });
  if (++hecho % 200 === 0) console.log(`   ${hecho} días · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log("\nDESCARTES:");
for (const [k, v] of Object.entries(fuera)) console.log(`   ${k}: ${v}`);
console.log(`\ndías extraídos: ${out.length}`);
for (const h of HORAS) {
  let vivos = 0;
  for (const d of out) {
    const q = [d.call.larga[h], d.call.corta[h], d.put.larga[h], d.put.corta[h]];
    if (q.every((x) => x && Number.isFinite(x[0]) && Number.isFinite(x[1]))) vivos++;
  }
  console.log(`   ${h}  las cuatro patas vivas en ${String(vivos).padStart(4)}/${out.length}`);
}
writeFileSync("scripts/tarjeta-salidas.json", JSON.stringify({ generado: new Date().toISOString(), horas: HORAS, n: out.length, descartes: fuera, dias: out }));
console.log("\n   → scripts/tarjeta-salidas.json\n");
