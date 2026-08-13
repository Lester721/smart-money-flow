// RECOLECTOR DE FLUJO FIRMADO — SPXW 0DTE, en vivo.
//
// Qué hace: se suscribe a las operaciones Y a las cotizaciones de una banda de strikes alrededor
// del dinero, guarda en memoria la ÚLTIMA cotización de cada contrato, y cuando entra una
// operación la empareja con esa cotización para deducir quién tomó la iniciativa.
//
// ╔═══ LO QUE ESTO ES Y LO QUE NO ES ═══╗
// Esto SOLO RECOGE. No calcula ninguna señal, no decide nada y no opera. La pregunta que va a
// contestar —¿el desequilibrio compra/venta predice el movimiento del SPX?— se responde DESPUÉS,
// con los datos ya en disco. Si mezclara aquí la medición con la recogida, cualquier resultado
// estaría contaminado por las decisiones que tomé al recoger.
//
// ╔═══ LA CLASIFICACIÓN, Y POR QUÉ SE GUARDA TODO EN CRUDO ═══╗
//   precio >= ask  -> COMPRA  (levantó la oferta: el comprador tenía prisa)
//   precio <= bid  -> VENTA   (pegó contra la demanda: el vendedor tenía prisa)
//   entre medias   -> DENTRO  (no se sabe — y NO se fuerza a un lado)
//
// Se guardan bid, ask y tamaños tal cual venían, así que la regla se puede cambiar después sin
// volver a recoger. La regla de arriba es una convención, no una verdad; si mañana queremos
// probar la regla del punto medio, los datos ya están.
//
// ╔═══ EL DESFASE DE LA COTIZACIÓN — el campo que más importa ═══╗
// ThetaData confirmó que la cotización pegada a una operación es "the LAST NBBO quote at the time
// of the trade", o sea que puede venir rezagada. Aquí lo emparejamos nosotros, así que sabemos
// EXACTAMENTE cuánto: `desfase_ms`. Sin ese campo, toda la clasificación es un acto de fe —
// si la cotización es de hace 2 segundos, decir que "levantó la oferta" no significa nada.
// Al analizar hay que partir la muestra por ese campo (fresca <50 ms contra vieja >500 ms) y ver
// si el resultado aguanta en las dos mitades. Si solo aguanta en una, ya sabemos qué era.
//
// Uso:
//   node scripts/gex-2026/recolector-flujo-firmado.mjs                 (hasta el cierre)
//   node scripts/gex-2026/recolector-flujo-firmado.mjs --minutos 30
//   node scripts/gex-2026/recolector-flujo-firmado.mjs --centro 7730 --banda 100

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const WS = process.env.THETA_WS || "ws://127.0.0.1:25520/v1/events";
const B = process.env.THETA_BASE || "http://127.0.0.1:25503/v3";
const SYM = "SPXW";
const PASO = 5;

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const BANDA = Number(arg("--banda", 75));
const MINUTOS = arg("--minutos") ? Number(arg("--minutos")) : null;

const hoyET = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
const horaET = () => new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false });
const msDelDia = () => { const [h, m, s] = horaET().split(":").map(Number); return ((h * 60 + m) * 60 + s) * 1000; };
const MS_CIERRE = 16 * 3600 * 1000;

const DIA = hoyET();
const SALIDA = path.join("data", "flujo", `${DIA}.jsonl`);

// ── el centro de la banda ────────────────────────────────────────────────────
// Se pide el cierre anterior del índice, que es un dato real y disponible antes de la apertura.
// NO se estima nada: si no hay dato, el script para en vez de inventarse un centro.
async function centro() {
  const forzado = arg("--centro");
  if (forzado) return Math.round(Number(forzado) / PASO) * PASO;
  const ayer = new Date(Date.now() - 5 * 86400000).toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  // Se reintenta: la petición falla de vez en cuando (la conexión del Terminal con su servidor
  // es intermitente — ya nos pasó con la autenticación). Un fallo suelto no es "no hay dato".
  let txt = "";
  for (let intento = 1; intento <= 4; intento++) {
    try {
      const r = await fetch(`${B}/index/history/eod?symbol=SPX&start_date=${ayer}&end_date=${DIA}`, { signal: AbortSignal.timeout(30000) });
      txt = await r.text();
      if (r.ok && txt.includes("close")) break;
    } catch { /* se reintenta */ }
    if (intento < 4) { console.log(`   (intento ${intento} de obtener el cierre falló, reintentando)`); await new Promise((r) => setTimeout(r, 3000)); }
  }
  const lin = txt.trim().split("\n");
  if (lin.length < 2 || txt.includes("subscription")) return null;
  // De atrás hacia delante hasta encontrar un cierre válido: la fila de HOY viene con close=0
  // porque el día no ha terminado, y ese cero no es un precio.
  const cab = lin[0].split(","), iC = cab.indexOf("close");
  for (let i = lin.length - 1; i >= 1; i--) {
    const cierre = Number(lin[i].split(",")[iC]);
    if (cierre > 0) return Math.round(cierre / PASO) * PASO;
  }
  return null;
}

const C = await centro();
if (C == null) {
  console.log("✗ No se pudo obtener el cierre del índice y no hay --centro.");
  console.log("  NO invento un centro. Pasa uno a mano:  --centro 7730");
  process.exit(1);
}

const STRIKES = [];
for (let K = C - BANDA; K <= C + BANDA; K += PASO) STRIKES.push(K);
const CONTRATOS = STRIKES.flatMap((K) => ["C", "P"].map((R) => ({ K, R })));
const clave = (K, R) => `${K}${R}`;

console.log(`═══ RECOLECTOR DE FLUJO FIRMADO · ${DIA} ═══`);
console.log(`   centro ${C} · banda ±${BANDA} · ${CONTRATOS.length} contratos (${STRIKES.length} strikes × 2)`);
console.log(`   guardando en ${SALIDA}`);
console.log(`   ${MINUTOS ? `${MINUTOS} minutos` : "hasta el cierre (16:00 ET)"}\n`);

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
const fichero = fs.createWriteStream(SALIDA, { flags: "a" });

// ── estado ───────────────────────────────────────────────────────────────────
const ultimaCot = new Map();   // clave -> {ms, bid, ask, bidSize, askSize}
const cuenta = { operaciones: 0, compra: 0, venta: 0, dentro: 0, sinCotizacion: 0, cotizaciones: 0 };
const primaNeta = { compra: 0, venta: 0 };
const desfases = [];
let desconexiones = 0;

const ws = new WebSocket(WS);

ws.onopen = () => {
  let id = 1;
  for (const { K, R } of CONTRATOS)
    for (const tipo of ["QUOTE", "TRADE"])
      ws.send(JSON.stringify({ msg_type: "STREAM", sec_type: "OPTION", req_type: tipo, add: true, id: id++,
                               contract: { root: SYM, expiration: DIA.replaceAll("-", ""), strike: K * 1000, right: R } }));
  console.log(`✓ conectado · ${id - 1} suscripciones enviadas\n`);
};

ws.onmessage = (e) => {
  let m; try { m = JSON.parse(String(e.data)); } catch { return; }
  const tipo = m?.header?.type;

  if (tipo === "STATUS") {
    if (m.header.status === "DISCONNECTED") { desconexiones++; console.log(`  ⚠ ${horaET()} FPSS desconectado`); }
    return;
  }
  if (!m.contract) return;
  const k = clave(m.contract.strike / 1000, m.contract.right);

  if (tipo === "QUOTE") {
    const q = m.quote;
    if (!(q?.bid > 0) || !(q?.ask > 0) || q.ask < q.bid) return;   // cotización rota: se descarta
    ultimaCot.set(k, { ms: q.ms_of_day, bid: q.bid, ask: q.ask, bidSize: q.bid_size, askSize: q.ask_size });
    cuenta.cotizaciones++;
    return;
  }

  if (tipo !== "TRADE") return;
  const t = m.trade;
  if (!(t?.price > 0) || !(t?.size > 0)) return;
  cuenta.operaciones++;

  const q = ultimaCot.get(k);
  if (!q) { cuenta.sinCotizacion++; return; }   // aún no hemos visto cotización de ese contrato

  // El lado. Sin redondeos ni tolerancias: si cae entre bid y ask, es DENTRO y se dice.
  const lado = t.price >= q.ask ? "compra" : t.price <= q.bid ? "venta" : "dentro";
  const prima = t.price * t.size * 100;
  const desfase = t.ms_of_day - q.ms;
  desfases.push(desfase);
  cuenta[lado]++;
  if (lado !== "dentro") primaNeta[lado] += prima;

  fichero.write(JSON.stringify({
    dia: DIA, strike: m.contract.strike / 1000, right: m.contract.right,
    ms: t.ms_of_day, precio: t.price, tamano: t.size, prima: Math.round(prima),
    mercado: t.exchange, condicion: t.condition, secuencia: t.sequence,
    bid: q.bid, ask: q.ask, bidSize: q.bidSize, askSize: q.askSize,
    cotMs: q.ms, desfase_ms: desfase, lado,
  }) + "\n");
};

ws.onerror = (e) => console.log(`  ✗ ${String(e?.message ?? e).slice(0, 140)}`);

// ── resumen periódico ────────────────────────────────────────────────────────
const mediana = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

function resumen(final = false) {
  const c = cuenta;
  const clasificadas = c.compra + c.venta;
  const neto = primaNeta.compra - primaNeta.venta;
  const dolar = (x) => `${x >= 0 ? "+" : "−"}$${Math.abs(Math.round(x)).toLocaleString("es-ES")}`;
  console.log(`${final ? "\n═══ FINAL ═══\n " : " "}${horaET()}  ops ${c.operaciones}  ·  compra ${c.compra} · venta ${c.venta} · dentro ${c.dentro}` +
    `${c.sinCotizacion ? ` · sin cotización ${c.sinCotizacion}` : ""}  ·  prima neta ${dolar(neto)}` +
    `  ·  desfase mediano ${mediana(desfases) ?? "—"} ms`);
  if (final) {
    console.log(`\n   cotizaciones procesadas: ${cuenta.cotizaciones.toLocaleString("es-ES")}`);
    console.log(`   desconexiones de FPSS: ${desconexiones}`);
    if (clasificadas) {
      const frescas = desfases.filter((d) => d < 50).length;
      console.log(`   clasificadas: ${clasificadas} de ${c.operaciones} (${Math.round(clasificadas / c.operaciones * 100)}%)`);
      console.log(`   con cotización fresca (<50 ms): ${frescas} (${Math.round(frescas / desfases.length * 100)}%)`);
      console.log(`\n   ⚠ Esto es SOLO la recogida. No mide nada todavía. Para saber si el`);
      console.log(`     desequilibrio predice algo hay que cruzarlo contra el movimiento del SPX,`);
      console.log(`     y partir la muestra por desfase_ms antes de creerse cualquier resultado.`);
    }
    console.log(`\n   guardado en ${SALIDA}\n`);
  }
}

const reloj = setInterval(() => resumen(), 60000);

const parar = () => {
  clearInterval(reloj);
  resumen(true);
  try { ws.close(); } catch { /* ya cerrado */ }
  // Al cerrar se comprime y se copia a la nube. El flujo en vivo no se puede volver a bajar,
  // así que la copia se hace el mismo día y no "cuando me acuerde".
  fichero.end(() => {
    const hijo = spawn(process.execPath, ["scripts/gex-2026/archivar-flujo.mjs", "--dia", DIA],
                       { stdio: "inherit" });
    hijo.on("close", () => process.exit(0));
    hijo.on("error", (e) => { console.log(`  ⚠ no se pudo archivar: ${e.message}`); process.exit(0); });
  });
};

const finMs = MINUTOS ? Date.now() + MINUTOS * 60000 : null;
setInterval(() => {
  if (finMs && Date.now() >= finMs) parar();
  if (!finMs && msDelDia() >= MS_CIERRE) parar();
}, 5000);

process.on("SIGINT", parar);
