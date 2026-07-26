// Worker de MEDICIÓN (Fase 1) — NO guarda nada, solo cuenta.
//
// Objetivo: medir el volumen REAL del firehose de trades de opciones de Massive
// (`T.*`, todo el mercado) para dimensionar el host del worker de producción y
// elegir el umbral de premium. Se conecta, suscribe, cuenta y reporta. Cero disco.
//
// Requisitos: Node 22+ (usa WebSocket nativo y --env-file). Cero dependencias.
//
// Uso (desde la raíz del repo, en horario de mercado 9:30–16:00 ET):
//   node --env-file=web/.env.local worker/measure.mjs           (corre hasta Ctrl+C)
//   node --env-file=web/.env.local worker/measure.mjs 120        (corre 120 s y sale)
//
// Trae de vuelta el "RESUMEN FINAL" que imprime al terminar.

const WS_URL = "wss://socket.massive.com/options";
const KEY = process.env.MASSIVE_API_KEY;

// Umbrales de premium (USD) para el histograma. Cada nivel te dice cuántos
// trades "notables" pasarían el filtro por minuto → cuántas quotes REST/min
// tendría que pedir el worker de producción a ese umbral.
const THRESHOLDS = [1e3, 5e3, 1e4, 2.5e4, 5e4, 1e5, 2.5e5, 1e6];

const DURATION_S = Number(process.argv[2]) || 0; // 0 = hasta Ctrl+C

if (typeof WebSocket === "undefined") {
  console.error("Este script necesita Node 22+ (WebSocket nativo). Tu versión no lo trae.");
  process.exit(1);
}
if (!KEY) {
  console.error("Falta MASSIVE_API_KEY. Corre con: node --env-file=web/.env.local worker/measure.mjs");
  process.exit(1);
}

// ---- Estado de medición -----------------------------------------------------
let started = 0;            // epoch ms cuando arranca el conteo (tras suscribir)
let trades = 0;            // total de trades vistos
let withPremium = 0;       // trades con premium > 0
let bytes = 0;             // bytes de texto recibidos (para estimar ancho de banda)
let frames = 0;            // mensajes (frames) recibidos
let peakPerSec = 0;        // pico de trades en un segundo de reloj
let curSec = 0;            // segundo actual (epoch s)
let curSecCount = 0;       // trades en el segundo actual
let topPremium = 0;        // el premium más grande visto
let topInfo = "";          // detalle del trade más grande
const hist = new Array(THRESHOLDS.length).fill(0); // conteo por umbral

const fmtUSD = (n) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}k` : `$${n.toFixed(0)}`;
const fmtNum = (n) => n.toLocaleString("en-US");

function recordTrade(p, s, sym) {
  trades++;
  const premium = (p || 0) * (s || 0) * 100;
  if (premium > 0) withPremium++;
  for (let i = 0; i < THRESHOLDS.length; i++) if (premium >= THRESHOLDS[i]) hist[i]++;
  if (premium > topPremium) {
    topPremium = premium;
    topInfo = `${sym}  ${s} @ $${p}  = ${fmtUSD(premium)}`;
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec !== curSec) {
    if (curSecCount > peakPerSec) peakPerSec = curSecCount;
    curSec = nowSec;
    curSecCount = 0;
  }
  curSecCount++;
}

// ---- Conexión ---------------------------------------------------------------
console.log(`Conectando a ${WS_URL} …`);
const ws = new WebSocket(WS_URL);

ws.addEventListener("open", () => console.log("Socket abierto. Esperando 'connected' → auth…"));

ws.addEventListener("message", (ev) => {
  const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
  bytes += raw.length;
  frames++;

  let events;
  try {
    events = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(events)) events = [events];

  for (const e of events) {
    if (e.ev === "status") {
      const st = e.status;
      console.log(`[status] ${st}: ${e.message ?? ""}`);
      if (st === "connected") {
        ws.send(JSON.stringify({ action: "auth", params: KEY }));
      } else if (st === "auth_success") {
        ws.send(JSON.stringify({ action: "subscribe", params: "T.*" }));
        started = Date.now();
        curSec = Math.floor(started / 1000);
        console.log("Suscrito a T.* — MIDIENDO. (Ctrl+C para el resumen final)\n");
      } else if (st === "auth_failed" || st === "error") {
        console.error("Autenticación/stream falló. Revisa la key o el plan.");
        process.exit(1);
      }
    } else if (e.ev === "T") {
      // Trade de opción: p=precio, s=tamaño, sym=ticker OCC ("O:AAPL...").
      recordTrade(e.p, e.s, e.sym);
    }
  }
});

ws.addEventListener("close", () => {
  console.log("\nSocket cerrado.");
  if (started) summary();
  process.exit(0);
});
ws.addEventListener("error", (e) => console.error("Error de socket:", e.message ?? e));

// ---- Reporte periódico cada 10 s -------------------------------------------
let lastTrades = 0;
const ticker = setInterval(() => {
  if (!started) return;
  const elapsed = (Date.now() - started) / 1000;
  const last10 = trades - lastTrades;
  lastTrades = trades;
  console.log(
    `[${elapsed.toFixed(0).padStart(4)}s] total ${fmtNum(trades).padStart(9)} trades · ` +
    `últimos 10s: ${fmtNum(last10).padStart(7)} (${(last10 / 10).toFixed(0)}/s) · ` +
    `pico ${peakPerSec}/s · ${(bytes / 1e6).toFixed(1)} MB`,
  );
  if (elapsed > 12 && trades < 50) {
    console.log("  ⚠ Muy pocos trades — ¿mercado cerrado? Corre esto en horario 9:30–16:00 ET.");
  }
}, 10000);

// ---- Resumen final ----------------------------------------------------------
function summary() {
  clearInterval(ticker);
  if (curSecCount > peakPerSec) peakPerSec = curSecCount;
  const elapsed = Math.max((Date.now() - started) / 1000, 1);
  const mins = elapsed / 60;

  console.log("\n========== RESUMEN FINAL ==========");
  console.log(`Duración medida:     ${elapsed.toFixed(0)} s (${mins.toFixed(1)} min)`);
  console.log(`Trades totales:      ${fmtNum(trades)}`);
  console.log(`Promedio:            ${(trades / elapsed).toFixed(0)} trades/s`);
  console.log(`Pico:                ${peakPerSec} trades/s`);
  console.log(`Con premium > 0:     ${fmtNum(withPremium)} (${((withPremium / Math.max(trades,1)) * 100).toFixed(0)}%)`);
  console.log(`Ancho de banda:      ${(bytes / 1e6 / mins).toFixed(1)} MB/min  (total ${(bytes / 1e6).toFixed(1)} MB, ${fmtNum(frames)} frames)`);
  console.log(`Trade más grande:    ${topInfo || "—"}`);
  console.log("\n-- Notables por umbral de premium (esto = quotes REST/min del worker real) --");
  for (let i = 0; i < THRESHOLDS.length; i++) {
    const perMin = hist[i] / mins;
    console.log(
      `  ≥ ${fmtUSD(THRESHOLDS[i]).padEnd(6)}: ${fmtNum(hist[i]).padStart(8)} total · ${perMin.toFixed(1).padStart(8)} /min`,
    );
  }
  console.log("===================================\n");
}

// Ctrl+C → resumen y salida limpia.
process.on("SIGINT", () => {
  console.log("\n(SIGINT) cerrando…");
  if (started) summary();
  try { ws.close(); } catch {}
  process.exit(0);
});

// Duración fija opcional.
if (DURATION_S > 0) {
  setTimeout(() => {
    console.log(`\n(${DURATION_S}s cumplidos)`);
    if (started) summary();
    try { ws.close(); } catch {}
    process.exit(0);
  }, DURATION_S * 1000 + 3000); // +3s de margen para el handshake
}
