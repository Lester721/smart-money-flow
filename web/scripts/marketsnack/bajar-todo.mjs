// BAJAR TODO LO QUE MARKETSNACK PERMITA, ANTES DE QUE CADUQUE.
//
// ═══ POR QUÉ EXISTE ═══════════════════════════════════════════════════════════════════════
//
// La ventana del `flow_feed` RUEDA. Medido hoy (2026-08-19):
//   · el 2026-08-12 el paginador llegaba hasta 2026-04-15
//   · hoy el día más antiguo que devuelve la API es 2026-04-22  (2026-04-20 y -21 dan CERO filas,
//     y no son fin de semana: son días de mercado que YA SE PERDIERON)
// Siete días de historia borrados en siete días de calendario. Todo lo que no esté en disco
// cuando caduque la suscripción NO se podrá volver a medir nunca.
//
// El caché viejo (data/marketsnack/flujo-prima1000k.jsonl, 178.445 ops) sólo tiene piso $1M y
// se paró el 2026-08-12. A piso $100k hay 34.891 operaciones por día — DOCE VECES más — y ésas
// nunca se han guardado.
//
// ═══ EDUCACIÓN CON EL SERVIDOR ════════════════════════════════════════════════════════════
// MarketSnack es de Victor. Hay pausa entre peticiones, reintento con espera creciente, y ante
// un 429 se para en seco: no se martillea a un servidor que pide bajar el ritmo.
//
// ═══ CÓMO ES REANUDABLE ═══════════════════════════════════════════════════════════════════
// Cada día se escribe primero en `.parcial` (JSONL plano) guardando el `next_page_token` en el
// índice. Si se corta, al relanzar continúa desde ese token y sigue añadiendo al mismo parcial.
// Sólo cuando el día termina se deduplica por `id`, se comprime a `.jsonl.gz` y se borra el
// parcial. Un `.jsonl.gz` que existe = día CERRADO y completo; nunca se vuelve a pedir.
//
// ═══ USO ══════════════════════════════════════════════════════════════════════════════════
//   node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/bajar-todo.mjs --piso 1000000
//   node --env-file=.env.local ... scripts/marketsnack/bajar-todo.mjs --piso 100000
//   node --env-file=.env.local ... scripts/marketsnack/bajar-todo.mjs --fases aux
//
//   --piso N        piso de prima en $ (por defecto 100000). Un piso más bajo INCLUYE al alto.
//   --desde / --hasta   YYYY-MM-DD. Por defecto: suelo detectado en vivo → hoy.
//   --fases         aux,flujo  (por defecto las dos; aux = precio, GEX y cadenas)
//   --orden         viejo|nuevo  (por defecto viejo: lo que muere primero se salva primero)
//   --maxpag N      tope de páginas por día (por defecto 1500)
//   --pausa ms      entre peticiones (por defecto 80)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

// ── parámetros ───────────────────────────────────────────────────────────────────────────
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const PISO = Number(arg("--piso", 100000));
const MAXPAG = Number(arg("--maxpag", 1500));
const PAUSA = Number(arg("--pausa", 80));
const ORDEN = arg("--orden", "viejo");
const FASES = String(arg("--fases", "aux,flujo")).split(",").map((s) => s.trim());
const HOY = new Date().toISOString().slice(0, 10);

const BASE = "https://app.marketsnack.com/api";
const C = process.env.MARKETSNACK_COOKIE;
if (!C) { console.log("✗ falta MARKETSNACK_COOKIE en .env.local"); process.exit(1); }

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const ETIQUETA = PISO >= 1000 ? `${Math.round(PISO / 1000)}k` : String(PISO);
const DIR_FLUJO = path.join(RAIZ, `flujo-${ETIQUETA}`);
const DIR_AUX = path.join(RAIZ, "aux");
const INDICE = path.join(RAIZ, "indice.json");
for (const d of [RAIZ, DIR_FLUJO, DIR_AUX]) fs.mkdirSync(d, { recursive: true });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const finde = (s) => { const g = new Date(s + "T12:00:00Z").getUTCDay(); return g === 0 || g === 6; };

// ── índice: la memoria del descargador entre lanzamientos ────────────────────────────────
function leerIndice() {
  if (!fs.existsSync(INDICE)) return { creado: new Date().toISOString(), flujo: {}, aux: {}, fallos: [] };
  try { return JSON.parse(fs.readFileSync(INDICE, "utf8")); }
  catch { return { creado: new Date().toISOString(), flujo: {}, aux: {}, fallos: [] }; }
}
let IDX = leerIndice();
IDX.flujo ??= {}; IDX.aux ??= {}; IDX.fallos ??= [];
const guardarIndice = () => {
  IDX.actualizado = new Date().toISOString();
  fs.writeFileSync(INDICE, JSON.stringify(IDX, null, 1));
};

// ── petición con reintento educado ───────────────────────────────────────────────────────
let PARAR = false;   // lo pone un 429 o una sesión caducada: se termina ordenadamente

async function get(ruta, intentos = 4) {
  for (let k = 1; k <= intentos; k++) {
    try {
      const r = await fetch(BASE + ruta, {
        headers: { Accept: "application/json", Cookie: C },
        redirect: "manual",
        signal: AbortSignal.timeout(90000),
      });
      if (r.status === 429) {
        console.log(`   ⚠ 429 — el servidor pide bajar el ritmo. PARO (lo hecho queda guardado).`);
        PARAR = true;
        return { http: 429, j: null, bytes: 0 };
      }
      if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) {
        console.log(`   ✗ ${r.status} — la cookie caducó. PARO. Hay que recopiar MARKETSNACK_COOKIE.`);
        PARAR = true;
        return { http: r.status, j: null, bytes: 0 };
      }
      const txt = await r.text().catch(() => "");
      if (r.status !== 200) {
        if (k === intentos) return { http: r.status, j: null, bytes: txt.length, err: `HTTP ${r.status}` };
        await dormir(1500 * k);
        continue;
      }
      let j = null;
      try { j = JSON.parse(txt); } catch {
        if (k === intentos) return { http: 200, j: null, bytes: txt.length, err: "cuerpo no-JSON" };
        await dormir(1500 * k); continue;
      }
      return { http: 200, j, bytes: txt.length };
    } catch (e) {
      // fallo de red: reintento con espera creciente, no se abandona el día
      if (k === intentos) return { http: null, j: null, bytes: 0, err: String(e.message).slice(0, 80) };
      await dormir(2000 * k);
    }
  }
  return { http: null, j: null, bytes: 0, err: "sin intentos" };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FASE 0 · dónde está el suelo del archivo HOY (rueda, hay que medirlo cada vez)
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function detectarSuelo() {
  console.log(`═══ SUELO DEL ARCHIVO (ventanas de 7 días, se comprueba con filas) ═══`);
  let atras = 90;
  let ultimoConDatos = null;
  // se avanza hacia atrás en saltos de 7 días hasta encontrar la primera ventana vacía
  for (let paso = 0; paso < 40; paso++) {
    const fin = iso(Date.now() - atras * 86400000);
    const ini = iso(Date.now() - (atras + 6) * 86400000);
    const r = await get(`/flow_feed?filter[scope]=all&filter[date][gte]=${ini}&filter[date][lte]=${fin}&filter[premium][gte]=1000000&limit=10`);
    if (PARAR) return null;
    const n = (r.j?.list ?? []).length;
    console.log(`   ${ini} → ${fin}  ${n ? `${n} filas ✓` : "vacío"}`);
    if (n) { ultimoConDatos = ini; atras += 7; }
    else break;
    await dormir(150);
  }
  if (!ultimoConDatos) { console.log(`   ⚠ no se encontró ventana con datos a 90 días; uso 2026-04-22`); return "2026-04-22"; }
  // afinado día a día dentro de la última ventana con datos
  const base = Date.parse(ultimoConDatos + "T12:00:00Z");
  let suelo = ultimoConDatos;
  for (let k = -7; k <= 7; k++) {
    const d = iso(base + k * 86400000);
    if (finde(d)) continue;
    const r = await get(`/flow_feed?filter[scope]=all&filter[date][gte]=${d}&filter[date][lte]=${d}&filter[premium][gte]=1000000&limit=10`);
    if (PARAR) return suelo;
    if ((r.j?.list ?? []).length) { suelo = d; break; }
    await dormir(130);
  }
  console.log(`   ── SUELO = ${suelo}  ·  profundidad ${((Date.now() - Date.parse(suelo)) / 86400000).toFixed(0)} días\n`);
  return suelo;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FASE FLUJO · un fichero por día, reanudable página a página
// ═══════════════════════════════════════════════════════════════════════════════════════════
async function bajarDia(dia) {
  const gz = path.join(DIR_FLUJO, `${dia}.jsonl.gz`);
  const parcial = path.join(DIR_FLUJO, `${dia}.parcial`);
  const clave = `${ETIQUETA}|${dia}`;

  if (fs.existsSync(gz)) return { estado: "ya", n: IDX.flujo[clave]?.n ?? null };

  const previo = IDX.flujo[clave];
  let token = previo?.token ?? null;
  let pag = previo?.pag ?? 0;
  let bytes = previo?.bytes ?? 0;
  const reanuda = Boolean(token);
  if (!reanuda && fs.existsSync(parcial)) fs.unlinkSync(parcial);   // parcial huérfano sin token: se rehace

  const f = fs.createWriteStream(parcial, { flags: reanuda ? "a" : "w" });
  const t0 = Date.now();
  let nuevas = 0, cortado = false, error = null;

  while (pag < MAXPAG) {
    pag++;
    const qs = `filter[scope]=all&filter[date][gte]=${dia}&filter[date][lte]=${dia}` +
      `&filter[premium][gte]=${PISO}&limit=100` +
      (token ? `&next_page_token=${encodeURIComponent(token)}` : "");
    const r = await get(`/flow_feed?${qs}`);
    if (PARAR) { cortado = true; break; }
    if (r.http !== 200 || !r.j) {
      error = r.err ?? `HTTP ${r.http}`;
      cortado = true;
      break;
    }
    const l = r.j.list ?? [];
    for (const t of l) f.write(JSON.stringify(t) + "\n");
    nuevas += l.length; bytes += r.bytes;
    token = r.j.meta?.next_page_token ?? null;

    if (pag % 40 === 0) {
      IDX.flujo[clave] = { ...(IDX.flujo[clave] ?? {}), estado: "parcial", token, pag, bytes, parciales: (previo?.n ?? 0) + nuevas };
      guardarIndice();
      process.stdout.write(`\r   ${dia}  pág ${String(pag).padStart(4)} · ${String((previo?.n ?? 0) + nuevas).padStart(6)} ops · ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
    }
    if (!l.length || !token) break;
    await dormir(PAUSA);
  }
  if (pag >= MAXPAG && token) { cortado = true; error ??= `tope de ${MAXPAG} páginas`; }

  await new Promise((res) => f.end(res));

  if (cortado) {
    IDX.flujo[clave] = { estado: "parcial", token, pag, bytes, parciales: (previo?.n ?? 0) + nuevas, error };
    IDX.fallos.push({ cuando: new Date().toISOString(), dia, piso: ETIQUETA, error });
    guardarIndice();
    return { estado: "cortado", n: (previo?.n ?? 0) + nuevas, error };
  }

  // ── día terminado: deduplicar por id, comprimir, borrar parcial ──
  const lineas = fs.readFileSync(parcial, "utf8").split("\n").filter(Boolean);
  const vistos = new Set();
  const salida = [];
  let fueraDeDia = 0, sinId = 0;
  let tmin = null, tmax = null;
  for (const ln of lineas) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    if (o.id == null) sinId++;
    const k = o.id ?? ln;
    if (vistos.has(k)) continue;
    vistos.add(k);
    const ts = o.timestamp ?? null;
    if (ts && ts.slice(0, 10) !== dia) fueraDeDia++;
    if (ts) { if (!tmin || ts < tmin) tmin = ts; if (!tmax || ts > tmax) tmax = ts; }
    salida.push(ln);
  }
  fs.writeFileSync(gz, zlib.gzipSync(Buffer.from(salida.join("\n") + (salida.length ? "\n" : ""), "utf8"), { level: 9 }));
  fs.unlinkSync(parcial);

  IDX.flujo[clave] = {
    estado: "completo", n: salida.length, brutas: lineas.length, duplicadas: lineas.length - salida.length,
    fueraDeDia, sinId, pag, bytesApi: bytes, bytesDisco: fs.statSync(gz).size,
    tmin, tmax, seg: Math.round((Date.now() - t0) / 1000), cuando: new Date().toISOString(),
  };
  guardarIndice();
  return { estado: "ok", n: salida.length, dup: lineas.length - salida.length, pag, seg: (Date.now() - t0) / 1000 };
}

async function faseFlujo(desde, hasta) {
  const dias = [];
  for (let t = Date.parse(desde + "T12:00:00Z"); t <= Date.parse(hasta + "T12:00:00Z"); t += 86400000) {
    const d = iso(t);
    if (!finde(d)) dias.push(d);       // los fines de semana no tienen sesión; se saltan y se anota
  }
  if (ORDEN === "nuevo") dias.reverse();

  console.log(`═══ FLUJO · piso $${PISO.toLocaleString("es-ES")} · ${dias.length} días de mercado · orden ${ORDEN} ═══`);
  console.log(`   destino: ${DIR_FLUJO}\n`);

  let hechos = 0, saltados = 0, cortados = 0, ops = 0;
  const t0 = Date.now();
  for (const [i, dia] of dias.entries()) {
    if (PARAR) { console.log(`\n   ── PARADA ORDENADA: lo bajado hasta aquí queda cerrado en disco.`); break; }
    const r = await bajarDia(dia);
    if (r.estado === "ya") { saltados++; continue; }
    if (r.estado === "cortado") {
      cortados++;
      console.log(`\r   ${dia}  ⚠ CORTADO (${r.n} ops guardadas) — ${r.error}. Sigo con el día siguiente.        `);
      continue;
    }
    hechos++; ops += r.n;
    const min = (Date.now() - t0) / 60000;
    const restan = hechos ? (min / hechos) * (dias.length - i - 1) : 0;
    console.log(`\r   ${dia}  ${String(r.n).padStart(6)} ops · ${String(r.pag).padStart(4)} pág · ${r.seg.toFixed(0)}s` +
      `${r.dup ? ` · ${r.dup} dup` : ""}  │ ${i + 1}/${dias.length} · faltan ~${restan.toFixed(0)} min      `);
  }
  console.log(`\n   ── flujo: ${hechos} días nuevos (${ops.toLocaleString("es-ES")} ops) · ${saltados} ya estaban · ${cortados} cortados · ${((Date.now() - t0) / 60000).toFixed(1)} min\n`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// FASE AUX · lo que NO es flujo y también se pierde
//   · chart?period=all  → 252 barras diarias, 366 días. Es la ÚNICA serie larga de toda la API,
//     y sin ella no hay retorno futuro contra el que medir ninguna señal.
//   · gex_stats_chart   → net_gex, muros, gamma_flip, max_pain. Sólo 27 días de retención: si no
//     se fotografía a diario, no habrá NUNCA una serie de GEX larga.
//   · option_chain_extended → premium_breakdown{bid,mid,ask} y legs_premium{single,multi,other}
//     POR STRIKE. Es SNAPSHOT puro: no acepta fecha. Sólo existe si se guarda hoy.
// ═══════════════════════════════════════════════════════════════════════════════════════════
const NUCLEO = ["SPX", "SPY", "QQQ", "IWM", "NVDA", "TSLA", "AAPL", "MSFT", "AMZN", "META",
  "GOOGL", "AMD", "AVGO", "NFLX", "HOOD", "PLTR", "COIN", "MSTR", "SMCI", "MU",
  "INTC", "BAC", "XLF", "XLE", "GLD", "TLT", "VIX", "UVXY", "SOXL", "TQQQ"];

async function tickersDelFlujo() {
  // los que de verdad mueven prima hoy, sacados del propio flujo (no adivinados)
  const cuenta = new Map();
  let token = null;
  for (let p = 0; p < 25; p++) {
    const r = await get(`/flow_feed?filter[scope]=all&period=1d&filter[premium][gte]=250000&limit=100` +
      (token ? `&next_page_token=${encodeURIComponent(token)}` : ""));
    if (PARAR || r.http !== 200 || !r.j) break;
    const l = r.j.list ?? [];
    for (const t of l) {
      const raiz = /^([A-Z]+)\d{6}[CP]\d{8}$/.exec(t.symbol)?.[1] ?? t.symbol;
      cuenta.set(raiz, (cuenta.get(raiz) ?? 0) + 1);
    }
    token = r.j.meta?.next_page_token ?? null;
    if (!l.length || !token) break;
    await dormir(PAUSA);
  }
  const orden = [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return [...new Set([...NUCLEO, ...orden])].slice(0, 90);
}

async function guardar(rel, obj) {
  const p = path.join(DIR_AUX, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, zlib.gzipSync(Buffer.from(JSON.stringify(obj), "utf8"), { level: 9 }));
  return fs.statSync(p).size;
}

async function faseAux() {
  console.log(`═══ AUX · precio largo, GEX y cadenas ═══\n`);
  const tk = await tickersDelFlujo();
  if (PARAR) return;
  console.log(`   ${tk.length} tickers (núcleo + los que mueven prima hoy)\n`);
  IDX.aux.tickers = tk;

  // 1 · serie de precio larga — sin esto no hay retorno futuro que medir
  let okChart = 0, ptos = 0;
  for (const T of tk) {
    if (PARAR) break;
    const dest = path.join(DIR_AUX, "chart-all", `${T}.json.gz`);
    if (fs.existsSync(dest)) { okChart++; continue; }
    const r = await get(`/assets/${T}/chart?period=all`);
    const d = r.j?.data ?? [];
    if (r.http === 200 && d.length) { await guardar(path.join("chart-all", `${T}.json.gz`), r.j); okChart++; ptos += d.length; }
    else IDX.fallos.push({ cuando: new Date().toISOString(), ruta: `chart-all/${T}`, error: r.err ?? `HTTP ${r.http} · ${d.length} puntos` });
    await dormir(PAUSA);
  }
  console.log(`   chart?period=all       ${okChart}/${tk.length} tickers · ${ptos.toLocaleString("es-ES")} barras diarias nuevas`);
  IDX.aux.chartAll = { ok: okChart, de: tk.length, cuando: new Date().toISOString() };
  guardarIndice();

  // 2 · GEX — la foto de hoy; su retención es de 27 días, no vuelve
  let okGex = 0;
  for (const T of tk.slice(0, 40)) {
    if (PARAR) break;
    const rel = path.join("gex", HOY, `${T}.json.gz`);
    if (fs.existsSync(path.join(DIR_AUX, rel))) { okGex++; continue; }
    const paq = {};
    for (const p of ["1m", "1w", "1d"]) {
      const r = await get(`/assets/${T}/gex_stats_chart?period=${p}`);
      if (r.http === 200 && (r.j?.data ?? []).length) paq[p] = r.j;
      await dormir(PAUSA);
    }
    if (Object.keys(paq).length) { await guardar(rel, paq); okGex++; }
    else IDX.fallos.push({ cuando: new Date().toISOString(), ruta: `gex/${T}`, error: "sin datos" });
  }
  console.log(`   gex_stats_chart        ${okGex}/40 tickers (foto de ${HOY})`);
  IDX.aux.gex ??= {}; IDX.aux.gex[HOY] = { ok: okGex, de: 40 };
  guardarIndice();

  // 3 · cadena extendida — snapshot puro, la única vista con premium_breakdown y legs_premium
  let okCad = 0, contratos = 0;
  for (const T of tk.slice(0, 25)) {
    if (PARAR) break;
    const ex = await get(`/assets/${T}/expirations`);
    const lista = (Array.isArray(ex.j) ? ex.j : (ex.j?.data ?? [])).map((e) => e.date).filter(Boolean);
    await dormir(PAUSA);
    for (const v of lista.slice(0, 6)) {          // los 6 vencimientos más cercanos
      if (PARAR) break;
      const rel = path.join("cadenas", HOY, `${T}-${v}.json.gz`);
      if (fs.existsSync(path.join(DIR_AUX, rel))) { okCad++; continue; }
      const r = await get(`/assets/${T}/option_chain_extended?expiration_date=${v}`);
      const arr = Array.isArray(r.j) ? r.j : (r.j?.data ?? []);
      if (r.http === 200 && arr.length) { await guardar(rel, r.j); okCad++; contratos += arr.length; }
      else IDX.fallos.push({ cuando: new Date().toISOString(), ruta: `cadenas/${T}-${v}`, error: r.err ?? `HTTP ${r.http}` });
      await dormir(PAUSA);
    }
  }
  console.log(`   option_chain_extended  ${okCad} cadenas · ${contratos.toLocaleString("es-ES")} contratos (foto de ${HOY})\n`);
  IDX.aux.cadenas ??= {}; IDX.aux.cadenas[HOY] = { ok: okCad, contratos };
  guardarIndice();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n╔═══ BAJAR TODO DE MARKETSNACK ═══╗`);
console.log(`   hoy ${HOY} · piso $${PISO.toLocaleString("es-ES")} · fases ${FASES.join(",")}`);
console.log(`   raíz ${RAIZ}\n`);

if (FASES.includes("aux")) await faseAux();

if (FASES.includes("flujo") && !PARAR) {
  const desde = arg("--desde") ?? (await detectarSuelo());
  const hasta = arg("--hasta") ?? HOY;
  if (desde) {
    IDX.suelo ??= {};
    IDX.suelo[HOY] = desde;   // se anota cada día: así queda medida la VELOCIDAD a la que rueda
    guardarIndice();
    await faseFlujo(desde, hasta);
  }
}

guardarIndice();
const completos = Object.values(IDX.flujo).filter((x) => x.estado === "completo");
const totalOps = completos.reduce((a, x) => a + (x.n ?? 0), 0);
console.log(`╚═══ FIN ═══╝`);
console.log(`   días de flujo cerrados : ${completos.length}`);
console.log(`   operaciones en disco   : ${totalOps.toLocaleString("es-ES")}`);
console.log(`   fallos anotados        : ${IDX.fallos.length}`);
console.log(`   índice                 : ${INDICE}\n`);
