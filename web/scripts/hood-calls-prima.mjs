// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  ¿CUÁNDO PAGAN MÁS LAS CALLS DE HOOD? — a distancia fija y plazo fijo                     ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// Lester, 2026-09-01: «no entiendo algo... ¿tú quieres que venda calls cuando HOOD está
// bajando? Así casi no consigo prima... la prima es más jugosa cuando está cerca del strike y
// eso pasa cuando sube.»
//
// TENÍA RAZÓN, y mi primer análisis estaba mal. Comparé la prima media de sus ventas tras una
// caída ($236) contra la de los días planos ($86) sin mirar el PLAZO: las de la caída eran
// opciones a 83 días y las planas a 14. Seis veces más largas, claro que costaban más.
// Normalizado por semana el orden se invierte: tras subida 0,90%, plana 0,42%, tras caída 0,31%.
//
// Aquello eran 55 ventas suyas con plazos y distancias distintas — no se puede comparar. Esto
// mide la MISMA opción en todos los casos: misma distancia al dinero y mismo plazo, cambiando
// sólo cómo venía la acción. Es la única forma de contestar su pregunta sin trampa.
//
// Se apunta el BID, que es lo que de verdad cobraría al vender, no el punto medio.
import { writeFileSync } from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const SYM = "HOOD";
const DIST = [0.05, 0.10, 0.15, 0.20];      // distancias al dinero que se miden
const PLAZO = [7, 14, 30];                   // días naturales al vencimiento
const TOL_DIST = 0.025, TOL_PLAZO = 0.35;    // tolerancias para encontrar el contrato más parecido

const iso = (d) => d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8);
const ms = (d) => Date.parse(iso(d) + "T00:00:00Z");
const dias = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);

async function csv(ruta, intentos = 3) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(B + "/" + ruta, { signal: AbortSignal.timeout(120000) });
      const t = await r.text();
      // ⚠️ El HTTP 200 vacío: se comprueba el CONTENIDO, no el código.
      if (r.ok && t.split("\n").length > 1 && t.includes(",")) return t;
      if (/Invalid session/i.test(t)) throw new Error("SESIÓN INVÁLIDA: hay otro Terminal corriendo");
    } catch (e) {
      if (/SESIÓN/.test(e.message)) throw e;
      if (i === intentos - 1) return null;
    }
    await new Promise((s) => setTimeout(s, 1200));
  }
  return null;
}

// cierres diarios del subyacente.
// ⚠️ ThetaData rechaza rangos de más de 365 días: "Too many days between start and end date".
// Con HTTP 400, así que el fallo llegaba como "sin cierres" sin decir por qué. Se trocea en años.
async function cierres(desde, hasta) {
  const trozos = [];
  let a = desde;
  while (a <= hasta) {
    const b = new Date(ms(a) + 360 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
    trozos.push([a, b < hasta ? b : hasta]);
    if (b >= hasta) break;
    a = new Date(ms(b) + 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  }
  const todo = [];
  for (const [x, y] of trozos) {
    const parte = await unTrozo(x, y);
    if (parte) todo.push(...parte);
    else console.log("    ⚠️ sin datos de " + iso(x) + " a " + iso(y));
  }
  if (!todo.length) return null;
  const vistos = new Set();
  return todo.filter((r) => !vistos.has(r[0]) && vistos.add(r[0])).sort((p, q) => p[0].localeCompare(q[0]));
}
async function unTrozo(desde, hasta) {
  const t = await csv(`stock/history/eod?symbol=${SYM}&start_date=${desde}&end_date=${hasta}`);
  if (!t) return null;
  const L = t.trim().split("\n"), c = L[0].split(",");
  const iC = c.indexOf("close"), iD = c.findIndex((x) => x === "date" || x === "created" || x === "quote_date");
  if (iC < 0 || iD < 0) return null;
  const out = [];
  for (let i = 1; i < L.length; i++) {
    const f = L[i].split(",");
    const d = String(f[iD] ?? "").replace(/[-"]/g, "").slice(0, 8), p = Number(f[iC]);
    if (/^\d{8}$/.test(d) && p > 0) out.push([d, p]);
  }
  out.sort((a, b) => a[0].localeCompare(b[0]));
  return out.length ? out : null;
}

// calls de un día, con su bid
async function calls(dia) {
  const t = await csv(`option/history/eod?symbol=${SYM}&expiration=*&start_date=${dia}&end_date=${dia}`);
  if (!t) return null;
  const L = t.trim().split("\n"), c = L[0].split(",");
  const iE = c.indexOf("expiration"), iK = c.indexOf("strike"), iR = c.indexOf("right"),
        iB = c.indexOf("bid"), iA = c.indexOf("ask");
  if ([iE, iK, iR, iB, iA].some((x) => x < 0)) return null;
  const out = [];
  for (let i = 1; i < L.length; i++) {
    const f = L[i].split(","); if (f.length < c.length) continue;
    const q = (s) => String(s ?? "").replace(/^"|"$/g, "");
    if (!q(f[iR]).toUpperCase().startsWith("C")) continue;
    const exp = q(f[iE]).replace(/-/g, ""), K = Number(f[iK]), bid = Number(f[iB]), ask = Number(f[iA]);
    if (!/^\d{8}$/.test(exp) || !(K > 0) || !(bid > 0) || !(ask > 0)) continue;
    out.push({ exp, K, bid, ask });
  }
  return out.length ? out : null;
}

// ══ EL RECORRIDO ═════════════════════════════════════════════════════════════════════════
const DESDE = process.env.DESDE || "20240101";
const HASTA = process.env.HASTA || "20260831";
const PASO = Number(process.env.PASO || 5);         // 1 de cada N sesiones, para no tardar horas

console.log("\n  ╔═══ ¿CUÁNDO PAGAN MÁS LAS CALLS DE HOOD? ═══╗\n");
const S = await cierres(DESDE, HASTA);
if (!S) { console.log("  ⛔ sin cierres de HOOD"); process.exit(1); }
console.log("  " + S.length + " sesiones de " + iso(S[0][0]) + " a " + iso(S[S.length - 1][0]));

const P = Object.fromEntries(S);
const D = S.map((x) => x[0]);
const muestras = [];
let n = 0;

for (let i = 5; i < D.length; i += PASO) {
  const dia = D[i], spot = P[dia];
  const mov5 = spot / P[D[i - 5]] - 1;
  const cad = await calls(dia);
  n++;
  if (!cad) { if (n % 10 === 0) console.log("    " + iso(dia) + " sin cadena"); continue; }
  for (const dist of DIST) {
    for (const plazo of PLAZO) {
      const objK = spot * (1 + dist);
      let mejor = null, dm = Infinity;
      for (const o of cad) {
        const dte = dias(dia, o.exp);
        if (dte < plazo * (1 - TOL_PLAZO) || dte > plazo * (1 + TOL_PLAZO)) continue;
        const d = Math.abs(o.K / spot - 1 - dist);
        if (d > TOL_DIST) continue;
        const pen = d / TOL_DIST + Math.abs(dte - plazo) / plazo;
        if (pen < dm) { dm = pen; mejor = { ...o, dte }; }
      }
      if (mejor) muestras.push({ dia, spot, mov5, dist, plazo,
        K: mejor.K, dte: mejor.dte, bid: mejor.bid, ask: mejor.ask,
        primaPct: mejor.bid / spot, porSemana: (mejor.bid / spot) / (mejor.dte / 7) });
    }
  }
  if (n % 20 === 0) console.log("    " + iso(dia) + "  ·  " + muestras.length + " muestras");
}

writeFileSync("hood-primas.json", JSON.stringify(muestras));
console.log("\n  " + muestras.length + " muestras guardadas en hood-primas.json\n");

// ── el resultado ─────────────────────────────────────────────────────────────────────────
const pct = (x) => (100 * x).toFixed(2) + "%";
const cubos = [["venía CAYENDO >5%", (m) => m.mov5 < -0.05],
               ["plana (±5%)", (m) => m.mov5 >= -0.05 && m.mov5 <= 0.05],
               ["venía SUBIENDO >5%", (m) => m.mov5 > 0.05]];
for (const plazo of PLAZO) {
  console.log("  ══ PLAZO " + plazo + " DÍAS · prima POR SEMANA como % del precio de la acción ══");
  console.log("  situación              " + DIST.map((d) => (100 * d + "% fuera").padStart(12)).join(""));
  for (const [nom, q] of cubos) {
    const fila = DIST.map((dist) => {
      const G = muestras.filter((m) => m.plazo === plazo && m.dist === dist && q(m));
      return G.length ? (pct(G.reduce((s, m) => s + m.porSemana, 0) / G.length) + " (" + G.length + ")").padStart(12) : "—".padStart(12);
    });
    console.log("  " + nom.padEnd(23) + fila.join(""));
  }
  console.log("");
}
