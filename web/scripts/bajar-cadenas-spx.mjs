// BAJAR LAS CADENAS DIARIAS DE SPX Y SPXW — el 27% ciego del flujo de MarketSnack.
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
//
// SPX (22,1%) + SPXW (5,1%) son más de la cuarta parte de todos los prints de MarketSnack, y hoy
// tienen CERO cobertura de cadena salvo el 0DTE de gex-2026 (que es sólo IV cada 5 min del
// vencimiento del propio día: ni bid, ni ask, ni vencimientos largos).
//
// Sin esto, cualquier medida "del flujo" está midiendo el mercado SIN el activo del que más habla
// el flujo — y sin el único que Lester opera de verdad con spreads (SPXW es europea y en efectivo).
//
// ═══ QUÉ BAJA ═══════════════════════════════════════════════════════════════════════════════
//
// El MISMO formato que scripts/cache-theta/cadenas/{TICKER}_d{AAAAMMDD}.json:
//     { "20260918": { "6400|C": [bid, ask], "6400|P": [bid, ask], ... }, ... }
// para que TODO el análisis existente (ventana-lib.mjs `cadena()`/`eod()`) lo lea sin tocar nada.
//
// · Raíces: SPXW y SPX (son dos raíces distintas en ThetaData; SPX es la mensual AM, SPXW la
//   diaria/semanal PM). Se bajan las dos por separado y se guardan por separado.
// · Vencimientos: hasta MAX_DTE días (por defecto 130) — cubre la esquina barata de 90 días con
//   margen y evita arrastrar LEAPS que multiplican el fichero sin usarse.
// · Además: cierres diarios del índice SPX → cache-theta/cierres/SPX.json y SPXW.json (mismo
//   valor: SPXW no tiene subyacente propio, liquida sobre SPX). Sin el cierre no hay distancia
//   al dinero y la cadena no sirve para nada.
// · Y de paso extiende las cadenas de los 27 tickers de acciones de 20260806 → 20260819, que es
//   donde termina el flujo de MS. Hoy faltan los 9 últimos días hábiles.
//
// ═══ CÓMO ══════════════════════════════════════════════════════════════════════════════════
//
// · REANUDABLE: lo que ya está en disco no se vuelve a pedir.
// · Un día VACÍO NO SE CACHEA. Guardar un {} enmascara el fallo y el siguiente arranque lo da por
//   bueno. Ese error costó 75 minutos con el OI.
// · Prioridad: primero el rango del flujo de MS (2026-04-22 → 2026-08-19). Sin él la fase de
//   seguir el print no puede medir SPX. Después hacia atrás, si da tiempo.
// · Valida ABRIENDO ficheros al final: días, vencimientos/día, strikes/vencimiento, cuántos con
//   bid>0 y el rango de fechas. EL RECUENTO MIENTE.
//
// Uso:  node scripts/with-theta.mjs node scripts/bajar-cadenas-spx.mjs
//       DESDE=20250102 HASTA=20260819 node scripts/with-theta.mjs node scripts/bajar-cadenas-spx.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";

const BASE = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "");
const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const MAX_DTE = Number(process.env.MAX_DTE || 130);
const CONC = Number(process.env.CONC || 3);
const RAICES = (process.env.RAICES || "SPXW,SPX").split(",");

if (!existsSync(CDIR)) mkdirSync(CDIR, { recursive: true });
if (!existsSync(CIERRES)) mkdirSync(CIERRES, { recursive: true });

const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);

async function pMap(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; await fn(items[k], k); }
  }));
}

// ── EL CALENDARIO ───────────────────────────────────────────────────────────────────────────
// Los días hábiles salen de las cadenas de SPY que ya están en disco (calendario real, festivos
// incluidos). Para los días POSTERIORES al último de SPY se completan los laborables y los que
// resulten ser festivos se caen solos al no devolver filas.
function calendarioBase() {
  const d = readdirSync(CDIR).filter((f) => /^SPY_d\d{8}\.json$/.test(f)).map((f) => f.slice(5, 13)).sort();
  return d;
}
function laborables(desde, hasta) {
  const out = [];
  for (let d = new Date(iso(desde) + "T12:00:00Z"); d <= new Date(iso(hasta) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}

const calSPY = calendarioBase();
const ULTIMO_SPY = calSPY[calSPY.length - 1];
const DESDE = process.env.DESDE || "20260422";
const HASTA = process.env.HASTA || "20260819";

/** Días a pedir: los del calendario real de SPY dentro del rango + los laborables posteriores. */
function diasDelRango(desde, hasta) {
  const dentro = calSPY.filter((d) => d >= desde && d <= hasta);
  const extra = hasta > ULTIMO_SPY ? laborables(ULTIMO_SPY, hasta).filter((d) => d > ULTIMO_SPY) : [];
  return [...new Set([...dentro, ...extra])].sort();
}

// ── UNA CADENA ──────────────────────────────────────────────────────────────────────────────
let httpFallos = 0, httpOk = 0, bytesTotal = 0;

async function bajarCadena(sym, dia, maxDte = MAX_DTE) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (existsSync(f) && statSync(f).size > 40) return "ya";
  const out = {};
  let filas = 0;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(
        `${BASE}/v3/option/history/eod?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`,
        { signal: AbortSignal.timeout(300_000) },
      );
      if (!r.ok) {
        // 472 / 404 = "no hay datos" (festivo, raíz inexistente ese día): no es un fallo transitorio.
        if (r.status === 404 || r.status === 472) return "vacío";
        httpFallos++;
        await new Promise((s) => setTimeout(s, 2000 * (intento + 1)));
        continue;                                         // 5xx / 429: se reintenta antes de rendirse
      }
      const txt = await r.text();
      bytesTotal += txt.length;
      const l = txt.trim().split("\n");
      if (l.length < 2) return "vacío";
      const h = l[0].split(",").map(limpia);
      const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right");
      const iB = h.indexOf("bid"), iA = h.indexOf("ask");
      // UN CAMPO QUE NO EXISTE SE LEE COMO 0. Si falta una columna se PARA, no se rellena.
      if (iE < 0 || iK < 0 || iR < 0 || iB < 0 || iA < 0)
        throw new Error(`${sym} ${dia}: faltan columnas en la respuesta (${h.join("|")})`);
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const exp = limpia(c[iE]).replace(/-/g, "");
        if (exp.length !== 8) continue;
        const dte = dias(dia, exp);
        if (dte < 0 || dte > maxDte) continue;
        const b = Number(limpia(c[iB])), a = Number(limpia(c[iA])), K = Number(limpia(c[iK]));
        const right = limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P";
        if (!(K > 0) || !(b > 0) || !(a > 0) || a < b) continue;   // sin puja no hay precio real
        (out[exp] ??= {})[`${K}|${right}`] = [b, a];
        filas++;
      }
      httpOk++;
      break;
    } catch (e) {
      if (String(e.message).includes("faltan columnas")) throw e;
      httpFallos++;
      await new Promise((s) => setTimeout(s, 2000 * (intento + 1)));
    }
  }
  if (!filas) return "vacío";                                   // NO se cachea un día vacío
  writeFileSync(f, JSON.stringify(out), "utf8");
  return filas;
}

// ── CIERRES DEL ÍNDICE ──────────────────────────────────────────────────────────────────────
async function bajarCierresIndice(sim, desdeAño = 2022) {
  const out = {};
  for (let a = desdeAño; a <= 2026; a++) {
    try {
      const r = await fetch(`${BASE}/v3/index/history/eod?symbol=${sim}&start_date=${a}0101&end_date=${a === 2026 ? "20261231" : `${a}1231`}`,
        { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) { console.log(`    ${sim} ${a}: http ${r.status}`); continue; }
      const l = (await r.text()).trim().split("\n");
      if (l.length < 2) continue;
      const h = l[0].split(",").map(limpia);
      const iC = h.indexOf("close");
      const iT = h.indexOf("last_trade") >= 0 ? h.indexOf("last_trade") : h.indexOf("created");
      if (iC < 0 || iT < 0) { console.log(`    ${sim} ${a}: faltan columnas (${h.join("|")})`); continue; }
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const d = limpia(c[iT]).slice(0, 10).replace(/-/g, ""), v = Number(limpia(c[iC]));
        if (d.length === 8 && v > 0) out[d] = v;
      }
    } catch (e) { console.log(`    ${sim} ${a}: ${e.message.slice(0, 60)}`); }
  }
  return out;
}

// ═══ MAIN ═══════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log(`CADENAS DE SPX Y SPXW — el 27% ciego del flujo`);
console.log(`${"═".repeat(96)}`);
console.log(`  raíces: ${RAICES.join(", ")} · vencimientos hasta ${MAX_DTE} días · rango ${DESDE} → ${HASTA}`);
console.log(`  calendario de SPY en disco: ${calSPY.length} días, último ${ULTIMO_SPY}\n`);

// ── 0. CIERRES DEL ÍNDICE (sin esto la cadena no sirve: no hay distancia al dinero) ─────────
console.log(`## 0. Cierres del índice SPX`);
if (!existsSync(`${CIERRES}/SPX.json`)) {
  const cl = await bajarCierresIndice("SPX");
  const ds = Object.keys(cl).sort();
  if (ds.length) {
    writeFileSync(`${CIERRES}/SPX.json`, JSON.stringify(cl), "utf8");
    writeFileSync(`${CIERRES}/SPXW.json`, JSON.stringify(cl), "utf8");   // SPXW liquida sobre SPX
    console.log(`   SPX: ${ds.length} días · ${ds[0]} → ${ds[ds.length - 1]} · último cierre ${cl[ds[ds.length - 1]]}`);
  } else {
    console.log(`   ✗ SPX: SIN DATOS — la cadena se bajará igual pero NO se podrá medir distancia al dinero.`);
  }
} else {
  const cl = JSON.parse(readFileSync(`${CIERRES}/SPX.json`, "utf8"));
  const ds = Object.keys(cl).sort();
  console.log(`   SPX: ya en caché, ${ds.length} días · ${ds[0]} → ${ds[ds.length - 1]}`);
  if (!existsSync(`${CIERRES}/SPXW.json`)) writeFileSync(`${CIERRES}/SPXW.json`, JSON.stringify(cl), "utf8");
}

// ── 1. EL RANGO DEL FLUJO, QUE ES LA PRIORIDAD ──────────────────────────────────────────────
const objetivo = diasDelRango(DESDE, HASTA);
console.log(`\n## 1. Rango del flujo de MS · ${objetivo.length} días (${objetivo[0]} → ${objetivo[objetivo.length - 1]})\n`);

for (const raiz of RAICES) {
  const faltan = objetivo.filter((d) => !(existsSync(`${CDIR}/${raiz}_d${d}.json`) && statSync(`${CDIR}/${raiz}_d${d}.json`).size > 40));
  if (!faltan.length) { console.log(`   ${raiz}: los ${objetivo.length} días ya están`); continue; }
  const t0 = Date.now();
  let ok = 0, vacios = 0, n = 0;
  await pMap(faltan, CONC, async (d) => {
    const r = await bajarCadena(raiz, d);
    if (typeof r === "number") ok++; else if (r === "vacío") vacios++; else ok++;
    if (++n % 5 === 0 || n === faltan.length) {
      const seg = (Date.now() - t0) / 1000;
      process.stdout.write(`\r   ${raiz}: ${n}/${faltan.length} · ${ok} con datos · ${vacios} vacíos · ${(seg / n).toFixed(1)}s/día · quedan ~${(((faltan.length - n) * seg) / n / 60).toFixed(0)} min      `);
    }
  });
  console.log(`\r   ${raiz}: ${ok}/${faltan.length} con datos · ${vacios} vacíos (festivo o sin cotizar) · ${((Date.now() - t0) / 60000).toFixed(1)} min          `);
}

// ── 2. LOS 9 DÍAS QUE LE FALTAN A LAS ACCIONES (20260807 → 20260819) ────────────────────────
const tickersAcc = [...new Set(readdirSync(CDIR).map((f) => /^([A-Z]+)_d\d{8}\.json$/.exec(f)?.[1]).filter(Boolean))]
  .filter((t) => !RAICES.includes(t)).sort();
const colaDias = laborables("20260807", HASTA);
console.log(`\n## 2. Cola de las acciones · ${tickersAcc.length} tickers × ${colaDias.length} días (20260807 → ${HASTA})\n`);
{
  const tareas = [];
  for (const t of tickersAcc) for (const d of colaDias)
    if (!existsSync(`${CDIR}/${t}_d${d}.json`)) tareas.push([t, d]);
  if (!tareas.length) console.log(`   ya estaban todas`);
  else {
    const t0 = Date.now();
    let ok = 0, n = 0;
    await pMap(tareas, CONC + 1, async ([t, d]) => {
      const r = await bajarCadena(t, d, 400);           // en acciones no cuesta nada guardar todo
      if (typeof r === "number") ok++;
      if (++n % 25 === 0 || n === tareas.length) {
        const seg = (Date.now() - t0) / 1000;
        process.stdout.write(`\r   ${n}/${tareas.length} · ${ok} con datos · quedan ~${(((tareas.length - n) * seg) / n / 60).toFixed(0)} min      `);
      }
    });
    console.log(`\r   ${ok}/${tareas.length} bajados · ${((Date.now() - t0) / 60000).toFixed(1)} min                    `);
  }
  // Y los cierres de esos 9 días: bajar-cierres.mjs paró en 20260806.
  console.log(`\n   Cierres de las acciones hasta ${HASTA}:`);
  let arreglados = 0;
  for (const t of tickersAcc) {
    const f = `${CIERRES}/${t}.json`;
    if (!existsSync(f)) continue;
    const cl = JSON.parse(readFileSync(f, "utf8"));
    const ult = Object.keys(cl).sort().pop();
    if (ult >= HASTA) continue;
    try {
      const r = await fetch(`${BASE}/v3/stock/history/eod?symbol=${t}&start_date=20260801&end_date=${HASTA}`, { signal: AbortSignal.timeout(60_000) });
      if (!r.ok) continue;
      const l = (await r.text()).trim().split("\n");
      if (l.length < 2) continue;
      const h = l[0].split(",").map(limpia);
      const iC = h.indexOf("close");
      const iT = h.indexOf("last_trade") >= 0 ? h.indexOf("last_trade") : h.indexOf("created");
      if (iC < 0 || iT < 0) continue;
      let add = 0;
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const d = limpia(c[iT]).slice(0, 10).replace(/-/g, ""), v = Number(limpia(c[iC]));
        if (d.length === 8 && v > 0 && !cl[d]) { cl[d] = v; add++; }
      }
      if (add) { writeFileSync(f, JSON.stringify(cl), "utf8"); arreglados++; }
    } catch { /* se ve en la validación */ }
  }
  console.log(`   ${arreglados} ficheros de cierres extendidos`);
}

// ── 3. HACIA ATRÁS, SI DA TIEMPO ────────────────────────────────────────────────────────────
if (process.env.ATRAS) {
  const [a0, a1] = process.env.ATRAS.split(",");
  const atras = diasDelRango(a0, a1);
  console.log(`\n## 3. Hacia atrás · ${atras.length} días (${a0} → ${a1})\n`);
  for (const raiz of RAICES) {
    const faltan = atras.filter((d) => !existsSync(`${CDIR}/${raiz}_d${d}.json`));
    if (!faltan.length) { console.log(`   ${raiz}: ya estaban`); continue; }
    const t0 = Date.now();
    let ok = 0, n = 0;
    await pMap(faltan, CONC, async (d) => {
      if (typeof (await bajarCadena(raiz, d)) === "number") ok++;
      if (++n % 10 === 0) process.stdout.write(`\r   ${raiz}: ${n}/${faltan.length} · ${ok} con datos · quedan ~${(((faltan.length - n) * (Date.now() - t0)) / n / 60000).toFixed(0)} min    `);
    });
    console.log(`\r   ${raiz}: ${ok}/${faltan.length} · ${((Date.now() - t0) / 60000).toFixed(1)} min                `);
  }
}

// ═══ VALIDACIÓN — ABRIENDO LOS FICHEROS, NO CONTÁNDOLOS ═════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log(`VALIDACIÓN — abriendo los ficheros`);
console.log(`${"═".repeat(96)}\n`);
console.log(`  http ok ${httpOk} · fallos/reintentos ${httpFallos} · ${(bytesTotal / 1e6).toFixed(0)} MB de respuesta\n`);

const informe = {};
for (const raiz of [...RAICES, "SPY"]) {
  const fs2 = readdirSync(CDIR).filter((f) => new RegExp(`^${raiz}_d\\d{8}\\.json$`).test(f)).sort();
  if (!fs2.length) { console.log(`  ${raiz.padEnd(5)} SIN NINGÚN FICHERO`); informe[raiz] = { dias: 0 }; continue; }
  const enRango = fs2.filter((f) => { const d = f.slice(raiz.length + 2, raiz.length + 10); return d >= DESDE && d <= HASTA; });
  // se ABREN 6 días repartidos por el rango
  const muestra = enRango.length ? [0, 0.2, 0.4, 0.6, 0.8, 0.999].map((q) => enRango[Math.min(enRango.length - 1, Math.floor(enRango.length * q))]) : [];
  const filasPorDia = [], expPorDia = [], kPorExp = [];
  let conBid = 0, total = 0;
  for (const f of [...new Set(muestra)]) {
    const c = JSON.parse(readFileSync(`${CDIR}/${f}`, "utf8"));
    const exps = Object.keys(c).sort();
    expPorDia.push(exps.length);
    let n = 0;
    for (const e of exps) { const k = Object.keys(c[e]).length; kPorExp.push(k); n += k; for (const v of Object.values(c[e])) { total++; if (v[0] > 0) conBid++; } }
    filasPorDia.push(n);
  }
  const dY = enRango.map((f) => f.slice(raiz.length + 2, raiz.length + 10)).sort();
  const med = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
  console.log(`  ${raiz.padEnd(5)} ${String(fs2.length).padStart(5)} días en total · ${String(enRango.length).padStart(4)} dentro de ${DESDE}→${HASTA}` +
              ` (${dY[0] ?? "-"} → ${dY[dY.length - 1] ?? "-"})`);
  console.log(`        abiertos ${new Set(muestra).size} ficheros: mediana ${med(expPorDia)} vencimientos/día · ${med(kPorExp)} contratos/vencimiento · ${med(filasPorDia)} contratos/día`);
  console.log(`        de ${total} cotizaciones leídas, ${conBid} con bid>0 (${total ? ((100 * conBid) / total).toFixed(1) : 0}%)  [el descargador ya filtra bid<=0, así que debe ser 100%]`);
  informe[raiz] = { dias: fs2.length, enRango: enRango.length, primero: dY[0], ultimo: dY[dY.length - 1], expDia: med(expPorDia), kExp: med(kPorExp) };
}

// Huecos dentro del rango: qué días del calendario de SPY NO tienen cadena de cada raíz.
console.log(`\n  Huecos dentro del rango (días con SPY pero sin la raíz):`);
for (const raiz of RAICES) {
  const falta = objetivo.filter((d) => !existsSync(`${CDIR}/${raiz}_d${d}.json`));
  console.log(`   ${raiz.padEnd(5)} ${falta.length} de ${objetivo.length}${falta.length ? " → " + falta.slice(0, 12).join(" ") + (falta.length > 12 ? " …" : "") : "  ✅"}`);
}

writeFileSync("scripts/bajar-cadenas-spx.json", JSON.stringify(informe, null, 1));
console.log(`\n  → scripts/bajar-cadenas-spx.json\n`);
