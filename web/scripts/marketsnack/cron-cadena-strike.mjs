// GUARDAR LA ESCALERA DE STRIKES DE MARKETSNACK — todos los días, antes de que desaparezca.
//
// ═══ POR QUÉ EXISTE ESTE FICHERO ════════════════════════════════════════════════════════════
//
// `option_chain_extended` es la ÚNICA ruta de MarketSnack con dato que no tenemos por otra vía:
// por CADA STRIKE da `premium_breakdown{bid,mid,ask}` (cuánta prima se compró al ask y cuánta se
// vendió al bid) y `legs_premium{single,multi,other}` (qué parte es una apuesta de verdad y qué
// parte son patas de un spread, que no expresan dirección).
//
// Y es la única que puede responder la pregunta bien planteada. Las 11 métricas que murieron
// promediaban por (ticker, día) — y el **99% de la variación vive DENTRO del ticker, entre
// strikes**. Al promediar se tiraba el 99% de la información. Esta ruta es la que no lo tira.
//
// ⚠️ EL PROBLEMA QUE HACE ESTO URGENTE: **la ruta ignora el parámetro `date`.** Sólo devuelve la
// foto de AHORA. No hay histórico y no se puede pedir hacia atrás — ni pagando. La foto que no se
// guarde hoy NO EXISTIRÁ NUNCA. A 2026-08-20 sólo había 2 días en disco.
//
// Hacen falta ~307 días de bolsa para poder juzgar la señal. Cada día que este cron no corra es
// un día que se resta del final, no del principio.
//
// ═══ QUÉ SE GUARDA ══════════════════════════════════════════════════════════════════════════
//
// Un fichero por (día, ticker) en scripts/cache-theta/ms-cadena/AAAA-MM-DD/TICKER.json.gz, con
// la escalera entera de los vencimientos del rango que interesa. Comprimido: la escalera cruda
// pesa unas 8-10x más.
//
// Uso:  node --env-file=.env.local scripts/marketsnack/cron-cadena-strike.mjs
//       node --env-file=.env.local scripts/marketsnack/cron-cadena-strike.mjs --tickers SPY,QQQ

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";

const BASE = "https://app.marketsnack.com";
const COOKIE = process.env.MARKETSNACK_COOKIE;
const DIR = "scripts/cache-theta/ms-cadena";

// LA ESQUINA BARATA manda sobre qué vencimientos se guardan: 5% fuera del dinero y ~90 días es
// donde el peaje baja del 26,9% al 5,2%. Se guarda de 30 a 150 días para tener margen alrededor.
const DTE_MIN = 30, DTE_MAX = 150;

// Los tickers con más flujo Y con cadena nuestra para poder medir después. SPX y SPXW van dentro
// aunque hoy no tengamos su cadena larga: son el 27% del flujo y el vehículo que Lester opera.
const TICKERS = (process.argv.includes("--tickers")
  ? process.argv[process.argv.indexOf("--tickers") + 1]
  : "SPY,QQQ,SPX,SPXW,NVDA,TSLA,AAPL,MSFT,AMZN,META,AMD,GOOGL,HOOD,PLTR,MU,COIN,IWM,MSTR"
).split(",").map((x) => x.trim()).filter(Boolean);

if (!COOKIE) { console.error("Falta MARKETSNACK_COOKIE en web/.env.local"); process.exit(1); }

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const DIA = hoyET();

async function api(ruta) {
  try {
    const r = await fetch(`${BASE}/api${ruta}`, {
      headers: { Cookie: COOKIE, Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) return { error: `http ${r.status}` };
    const t = await r.text();
    // TRAMPA CONOCIDA DE ESTA API: 200 con cuerpo vacío se lee como éxito. Se valida el contenido.
    if (t.length < 20) return { error: "cuerpo vacío" };
    try { return { datos: JSON.parse(t) }; } catch { return { error: "no es JSON" }; }
  } catch (e) { return { error: e.message.slice(0, 50) }; }
}

const dias = (venc) => Math.round((Date.parse(venc + "T00:00:00Z") - Date.parse(DIA + "T00:00:00Z")) / 86_400_000);

const destino = `${DIR}/${DIA}`;
if (!existsSync(destino)) mkdirSync(destino, { recursive: true });

console.log(`\n## ESCALERA DE STRIKES · ${DIA} · ${TICKERS.length} tickers\n`);

let guardados = 0, saltados = 0;
const fallos = [];

for (const tk of TICKERS) {
  const fichero = `${destino}/${tk}.json.gz`;
  if (existsSync(fichero)) { saltados++; console.log(`  ${tk.padEnd(6)} ya estaba`); continue; }

  // 1 · qué vencimientos hay
  const exp = await api(`/assets/${tk}/expirations`);
  let vencimientos = [];
  if (exp.datos) {
    const lista = Array.isArray(exp.datos) ? exp.datos : (exp.datos.expirations ?? exp.datos.data ?? []);
    vencimientos = lista.map((x) => (typeof x === "string" ? x : x?.expiration_date ?? x?.date))
      .filter(Boolean).filter((v) => { const d = dias(v); return d >= DTE_MIN && d <= DTE_MAX; });
  }
  // Si la ruta de vencimientos no existe o no responde, se prueba sin ella: hay APIs que devuelven
  // la cadena entera sin pedir vencimiento. Se DICE lo que pasó, no se finge.
  if (!vencimientos.length) {
    const sinExp = await api(`/assets/${tk}/option_chain_extended`);
    if (sinExp.datos) {
      writeFileSync(fichero, gzipSync(JSON.stringify({ ticker: tk, dia: DIA, modo: "sin_vencimiento", capturado: new Date().toISOString(), datos: sinExp.datos })));
      guardados++;
      console.log(`  ${tk.padEnd(6)} ✓ (sin filtro de vencimiento)`);
    } else {
      fallos.push(`${tk}: expirations=${exp.error ?? "sin lista útil"} · chain=${sinExp.error}`);
      console.log(`  ${tk.padEnd(6)} ✗ ${exp.error ?? "sin vencimientos en rango"}`);
    }
    continue;
  }

  // 2 · la escalera de cada vencimiento del rango
  const escaleras = [];
  for (const v of vencimientos) {
    const c = await api(`/assets/${tk}/option_chain_extended?expiration_date=${v}`);
    if (c.datos) escaleras.push({ vencimiento: v, dte: dias(v), datos: c.datos });
  }
  if (!escaleras.length) { fallos.push(`${tk}: ningún vencimiento devolvió escalera`); console.log(`  ${tk.padEnd(6)} ✗ sin escaleras`); continue; }

  writeFileSync(fichero, gzipSync(JSON.stringify({ ticker: tk, dia: DIA, capturado: new Date().toISOString(), escaleras })));
  guardados++;
  console.log(`  ${tk.padEnd(6)} ✓ ${escaleras.length} vencimientos (${escaleras.map((e) => e.dte).join(", ")} días)`);
}

// ── VALIDACIÓN · abriendo el fichero, no contándolo ─────────────────────────
console.log(`\n### Resultado · guardados ${guardados} · ya estaban ${saltados} · fallos ${fallos.length}\n`);
if (fallos.length) for (const f of fallos) console.log(`  ✗ ${f}`);

const ficheros = readdirSync(destino).filter((f) => f.endsWith(".json.gz"));
if (ficheros.length) {
  const m = JSON.parse(gunzipSync(readFileSync(`${destino}/${ficheros[0]}`)).toString("utf8"));
  const primera = m.escaleras?.[0]?.datos ?? m.datos;
  const filas = Array.isArray(primera) ? primera : (primera?.data ?? primera?.strikes ?? []);
  console.log(`\n  muestra (${m.ticker}): ${Array.isArray(filas) ? filas.length + " strikes" : "estructura " + Object.keys(primera ?? {}).slice(0, 8).join(", ")}`);
  if (Array.isArray(filas) && filas.length) {
    const campos = Object.keys(filas[0]);
    console.log(`  campos por strike: ${campos.join(", ").slice(0, 220)}`);
    // LO QUE HACE ÚNICO A ESTE DATO: si estos dos no vienen, el fichero no sirve para nada.
    for (const clave of ["premium_breakdown", "legs_premium"]) {
      const con = filas.filter((f) => f[clave] != null).length;
      console.log(`  ${clave.padEnd(20)} presente en ${con} de ${filas.length} strikes ${con ? "✅" : "❌ SIN ESTO EL FICHERO NO VALE"}`);
    }
  }
}

// El historial acumulado, que es lo único que importa a largo plazo.
const historial = existsSync(DIR) ? readdirSync(DIR).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort() : [];
console.log(`\n  HISTORIAL ACUMULADO: ${historial.length} día(s)` + (historial.length ? ` · ${historial[0]} → ${historial[historial.length - 1]}` : ""));
console.log(`  Hacen falta ~307 días de bolsa para juzgar la señal. Faltan ~${Math.max(0, 307 - historial.length)}.`);
