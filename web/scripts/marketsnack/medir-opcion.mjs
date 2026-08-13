// PRUEBA B — ¿SE GANA DINERO COMPRANDO LA OPCIÓN QUE ELLOS SEÑALAN?
//
// Las pruebas anteriores miraban el SUBYACENTE. Esta reproduce lo que de verdad hace alguien que
// sigue sus alertas: ve "alguien compró esta call con score 85", y compra esa misma call.
//
// ╔═══ LOS CUATRO BARROTES, QUE AQUÍ MUERDEN MÁS QUE NUNCA ═══╗
//   1. Entrada al ASK real del momento (el que ellos mismos publican con la operación).
//   2. Salida al BID real de ThetaData al cierre. Se cruza la horquilla ENTERA, ida y vuelta.
//   3. Comisiones de Robinhood: $0,03 por contrato y lado.
//   4. Si el contrato ya venció, se liquida a su valor intrínseco con el cierre real del
//      subyacente. No es un estimado: es lo que vale un contrato al expirar.
//
// La horquilla es la asesina conocida: se come un porcentaje de la PRIMA, no del nocional.
//
// ╔═══ POR QUÉ CONTRATO A CONTRATO Y NO POR CADENA ═══╗
// Primer intento: una petición por raíz+vencimiento con el rango completo. En subyacentes grandes
// (SPX, QQQ, MU) son decenas de miles de filas, tardaban más de 2 minutos y volvían VACÍAS — y el
// script las cacheaba como buenas. 4 de cada 5 salieron así. Lección: un caché que guarda el
// fallo silencioso es peor que no tener caché.
// Ahora: un contrato por petición (~1,2 s), 4 en paralelo (el máximo del Terminal), y los vacíos
// NO se cachean.
//
// Uso: node scripts/marketsnack/medir-opcion.mjs [--score 70] [--solo-bajar]

import fs from "node:fs";
import path from "node:path";
import rl from "node:readline";

const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const FLUJO = "data/marketsnack/flujo-prima1000k.jsonl";
const DIRC = "data/marketsnack/contratos";
const CIERRES = "data/marketsnack/cierres";
const COMISION = 0.03;
const HOR = [0, 1, 3, 5, 21];
const CONCURRENCIA = 4;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const SCORE_MIN = Number(arg("--score", 70));

fs.mkdirSync(DIRC, { recursive: true });

// ── 1. operaciones seguibles ────────────────────────────────────────────────
console.log(`═══ PRUEBA B · COMPRAR LA OPCIÓN SEÑALADA ═══`);
console.log(`   se sigue: compra agresiva (ASKSIDE/ABOVE_ASK/AT_ASK) con score >= ${SCORE_MIN}\n`);

const ops = [];
const contratos = new Map();   // clave -> {raiz, venc, strike, right, desde}
for await (const l of rl.createInterface({ input: fs.createReadStream(FLUJO) })) {
  if (!l.trim()) continue;
  let t; try { t = JSON.parse(l); } catch { continue; }
  const m = P.exec(t.symbol ?? ""); if (!m) continue;
  if (!COMPRA.has(t.side) || (t.score ?? 0) < SCORE_MIN || !(t.ask_price > 0) || !t.timestamp) continue;
  const venc = `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`;
  const strike = +m[4] / 1000;              // OJO: la API quiere el strike en DÓLARES, no ×1000
  const right = m[3] === "C" ? "CALL" : "PUT";
  const dia = t.timestamp.slice(0, 10);
  const k = `${m[1]}|${venc}|${strike}|${right}`;
  ops.push({ k, raiz: m[1], venc, strike, right, dia, entrada: t.ask_price, score: t.score, prima: t.premium });
  const c = contratos.get(k);
  if (!c) contratos.set(k, { raiz: m[1], venc, strike, right, desde: dia, ultima: dia });
  else { if (dia < c.desde) c.desde = dia; if (dia > c.ultima) c.ultima = dia; }
}

// Dos cosas que hicieron fallar el 24% de las peticiones en el primer intento, y que se
// diagnosticaron pidiendo a mano las que faltaban:
//   · HTTP 400 "Too many days": la API sólo admite 365 días entre inicio y fin. Los contratos de
//     2027-2029 se pasaban de largo pidiendo hasta el vencimiento.
//   · HTTP 472 "No data found": las operaciones de HOY. El cierre de hoy no existe todavía.
// Arreglo: pedir sólo la ventana que hace falta (hasta +45 días naturales cubre +21 de mercado)
// y descartar el día en curso.
const HOY = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const masDiasNat = (f, n) => new Date(Date.parse(f) + n * 86400000).toISOString().slice(0, 10);
let descartadasHoy = 0;
for (const [k, c] of contratos) {
  if (c.desde >= HOY) { contratos.delete(k); descartadasHoy++; continue; }
  const tope = masDiasNat(c.ultima, 45);
  c.hasta = tope < c.venc ? tope : c.venc;
}
if (descartadasHoy) console.log(`   descartados ${descartadasHoy} contratos que sólo se operaron hoy (aún no hay cierre)`);
console.log(`   operaciones: ${ops.length.toLocaleString("es-ES")}  ·  contratos únicos: ${contratos.size.toLocaleString("es-ES")}`);
console.log(`   estimado: ~${Math.round(contratos.size * 1.2 / CONCURRENCIA / 60)} min con ${CONCURRENCIA} en paralelo\n`);

// ── 2. bajar contrato a contrato ────────────────────────────────────────────
const fichero = (k) => path.join(DIRC, k.replaceAll("|", "_").replaceAll("-", "") + ".json");

async function bajar(k, c) {
  const f = fichero(k);
  if (fs.existsSync(f)) return "cache";
  try {
    const r = await fetch(`${B}/option/history/eod?symbol=${c.raiz}&expiration=${c.venc}&strike=${c.strike}&right=${c.right[0]}&start_date=${c.desde}&end_date=${c.hasta}`,
                          { signal: AbortSignal.timeout(45000) });
    const txt = await r.text();
    if (!r.ok || !txt.includes("bid")) return "fallo";      // NO se cachea el fallo
    const lin = txt.trim().split("\n");
    const cab = lin[0].split(",");
    const iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iT = cab.indexOf("last_trade");
    const mapa = {};
    for (const l of lin.slice(1)) {
      const cc = l.split(",");
      const fecha = (cc[iT] ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      const bid = +cc[iB], ask = +cc[iA];
      if (!(bid >= 0) || !(ask > 0)) continue;
      mapa[fecha] = [bid, ask];
    }
    if (!Object.keys(mapa).length) return "vacio";          // tampoco se cachea
    fs.writeFileSync(f, JSON.stringify(mapa));
    return "ok";
  } catch { return "fallo"; }
}

const lista = [...contratos.entries()];
const cuenta = { ok: 0, cache: 0, vacio: 0, fallo: 0 };
const t0 = Date.now();
let idx = 0;

async function trabajador() {
  while (idx < lista.length) {
    const i = idx++;
    const [k, c] = lista[i];
    cuenta[await bajar(k, c)]++;
    const hechas = cuenta.ok + cuenta.cache + cuenta.vacio + cuenta.fallo;
    if (hechas % 200 === 0) {
      const min = (Date.now() - t0) / 60000;
      process.stdout.write(`\r   ${hechas}/${lista.length}  ·  ok ${cuenta.ok + cuenta.cache}  vacíos ${cuenta.vacio}  fallos ${cuenta.fallo}  ·  ${min.toFixed(1)} min  ·  faltan ~${(min / hechas * (lista.length - hechas)).toFixed(0)} min    `);
    }
  }
}
await Promise.all(Array.from({ length: CONCURRENCIA }, trabajador));
console.log(`\r   ${lista.length}/${lista.length}  ·  con datos ${cuenta.ok + cuenta.cache}  ·  vacíos ${cuenta.vacio}  ·  fallos ${cuenta.fallo}  ·  ${((Date.now() - t0) / 60000).toFixed(1)} min          \n`);

if (cuenta.vacio + cuenta.fallo > lista.length * 0.25) {
  console.log(`   ⚠ Más del 25% sin datos. NO se mide con esto: el resultado no sería fiable.`);
  process.exit(1);
}
if (process.argv.includes("--solo-bajar")) process.exit(0);

// ── 3. medir ────────────────────────────────────────────────────────────────
const cache = new Map();
const precios = (k) => {
  if (!cache.has(k)) { try { cache.set(k, JSON.parse(fs.readFileSync(fichero(k), "utf8"))); } catch { cache.set(k, null); } }
  return cache.get(k);
};
const serieSub = (r) => { try { const j = JSON.parse(fs.readFileSync(path.join(CIERRES, `${r}.json`), "utf8")); return j || null; } catch { return null; } };

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUno = (a) => media(a) / (de(a) / Math.sqrt(a.length));
const mediana = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

const res = {}; for (const h of HOR) res[h] = { r: [], venc: 0, sin: 0, fechas: [] };

for (const o of ops) {
  const p = precios(o.k); if (!p) continue;
  const s = serieSub(o.raiz);
  const i = s ? s.findIndex(([f]) => f === o.dia) : -1;
  for (const h of HOR) {
    let salida = null;
    if (i >= 0 && s[Math.min(i + h, s.length - 1)]) {
      const fSalida = s[Math.min(i + h, s.length - 1)][0];
      if (fSalida > o.venc) {
        // Venció: vale su intrínseco con el cierre del subyacente el día del vencimiento.
        const fila = s.filter(([f]) => f <= o.venc).pop();
        if (fila) { const S = fila[1];
          salida = o.right === "CALL" ? Math.max(0, S - o.strike) : Math.max(0, o.strike - S);
          res[h].venc++; }
      } else if (p[fSalida]) {
        salida = p[fSalida][0];                    // se VENDE al bid
      }
    }
    if (salida == null) { res[h].sin++; continue; }
    const neto = (salida - o.entrada) - 2 * COMISION;
    res[h].r.push((neto / o.entrada) * 100);
    res[h].fechas.push(o.dia);
  }
}

console.log(`${"─".repeat(78)}`);
console.log(`COMPRAR LA OPCIÓN · entrada al ask, salida al bid, $0,03/contrato ida y vuelta\n`);
console.log(`   horizonte      n     media%   mediana%   ganadoras        t   1ª mitad   2ª mitad`);
for (const h of HOR) {
  const a = res[h].r;
  if (a.length < 50) { console.log(`   +${String(h).padEnd(2)}      ${String(a.length).padStart(7)}   muestra insuficiente`); continue; }
  const idxs = a.map((v, i) => i).sort((x, y) => (res[h].fechas[x] < res[h].fechas[y] ? -1 : 1));
  const c = Math.floor(idxs.length / 2);
  const m1 = media(idxs.slice(0, c).map((i) => a[i])), m2 = media(idxs.slice(c).map((i) => a[i]));
  const gan = a.filter((x) => x > 0).length / a.length * 100;
  console.log(`   +${String(h).padEnd(2)}      ${String(a.length).padStart(7)}  ${(media(a) >= 0 ? "+" : "") + media(a).toFixed(2).padStart(7)}  ${(mediana(a) >= 0 ? "+" : "") + mediana(a).toFixed(2).padStart(8)}     ${gan.toFixed(1).padStart(5)}%  ${tUno(a).toFixed(2).padStart(7)}   ${(m1 >= 0 ? "+" : "") + m1.toFixed(2).padStart(7)}   ${(m2 >= 0 ? "+" : "") + m2.toFixed(2).padStart(7)}`);
}
console.log(`\n   (+0 = intradía: se compra en la alerta y se vende al cierre del MISMO día)`);
console.log(`   liquidadas a intrínseco por vencimiento: ${HOR.map((h) => `+${h}:${res[h].venc}`).join("  ")}`);
console.log(`   sin cotización de salida: ${HOR.map((h) => `+${h}:${res[h].sin}`).join("  ")}`);
console.log(`\n   El pre-registro exige |t| > 3,3, coherencia entre mitades y superar a SPY.`);
console.log(`   Una media positiva sola NO es un resultado.\n`);
