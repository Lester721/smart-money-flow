// Worker de /api/ideas sobre THETADATA — alternativa a ideasWorker.ts (Massive).
//
// Diferencia clave con Massive: ThetaData Standard NO tiene firehose de mercado
// (eso es Pro). Sí permite suscribir contratos individuales, con dos límites:
//   · 15.000 contratos con stream de TRADES
//   · 10.000 contratos con stream de QUOTES   ← el que MANDA
// Sin quote no hay NBBO y sin NBBO no hay agresor (= la señal), así que el universo
// útil son los ~10.000 contratos MÁS LÍQUIDOS (por open interest), refrescados a diario.
// Consecuencia honesta: Ideas ve el dinero grande de los nombres líquidos, no todo el
// mercado. Subir a Options Pro daría el Full Trade Stream (ver pendiente-upgrades-ideas).
//
// Flujo: elegir contratos por OI → suscribir TRADE+QUOTE → guardar el último NBBO en
// memoria → por cada trade notable armar el RawTrade (agresor + griegas) → Redis.
//
// Requiere el Theta Terminal corriendo (WS en :25520) y REDIS_URL.

import { fileURLToPath } from "node:url";
import { pushNotableTrades } from "../lib/ideasStore";
import { occFor } from "../lib/thetadata";
import { sideFor } from "../lib/massiveFlow";
import { tradeGreeks } from "../lib/greeks";
import { isCanceledCondition, isMultiLegCondition } from "../lib/conditions";
import type { RawTrade } from "../lib/flow";

const HTTP = process.env.THETA_BASE || "http://127.0.0.1:25503";
const WS_URL = process.env.THETA_WS || "ws://127.0.0.1:25520/v1/events";
const MIN_PREMIUM = Number(process.env.IDEAS_MIN_PREMIUM) || 500_000;
/** Tope de contratos a suscribir. Lo limita el stream de QUOTES (10k en Standard). */
const MAX_CONTRACTS = Number(process.env.IDEAS_MAX_CONTRACTS) || 10_000;
/** Universo de subyacentes a vigilar (los más operados en opciones). Configurable. */
const UNIVERSE = (process.env.IDEAS_UNIVERSE || [
  "SPY", "QQQ", "IWM", "DIA", "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "GOOG", "META", "TSLA",
  "AMD", "NFLX", "AVGO", "INTC", "MU", "SMCI", "PLTR", "COIN", "HOOD", "SOFI", "MARA", "RIOT",
  "BAC", "JPM", "WFC", "GS", "MS", "C", "SCHW", "V", "MA", "PYPL", "SQ", "AXP",
  "XOM", "CVX", "OXY", "SLB", "COP", "XLE", "XLF", "XLK", "XLV", "XLI", "XLU", "XLP",
  "T", "VZ", "DIS", "CMCSA", "WBD", "PARA", "ROKU", "SNAP", "PINS", "UBER", "LYFT", "ABNB",
  "WMT", "TGT", "COST", "HD", "LOW", "NKE", "SBUX", "MCD", "KO", "PEP", "PG", "JNJ",
  "PFE", "MRNA", "LLY", "UNH", "CVS", "ABBV", "BMY", "GILD", "AMGN", "TMO",
  "BA", "CAT", "DE", "GE", "LMT", "RTX", "F", "GM", "RIVN", "LCID", "NIO", "CHPT",
  "CRM", "ORCL", "ADBE", "NOW", "SNOW", "DDOG", "NET", "CRWD", "PANW", "ZS", "OKTA", "MDB",
  "TQQQ", "SQQQ", "SOXL", "TLT", "GLD", "SLV", "USO", "VXX", "UVXY", "ARKK", "EEM", "FXI",
].join(",")).split(",").map((s) => s.trim()).filter(Boolean);

const log = (m: string) => console.log(`[ideas-theta] ${m}`);

if (typeof WebSocket === "undefined") { console.error("Necesita Node 22+ (WebSocket nativo)."); process.exit(1); }

// ── Helpers ──────────────────────────────────────────────────────────────────
const key = (root: string, expYmd: number, strike: number, right: string) => `${root}|${expYmd}|${strike}|${right}`;
const sentimentFor = (side: string) =>
  side === "ABOVE_ASK" || side === "AT_ASK" ? "bullish" : side === "BELOW_BID" || side === "AT_BID" ? "bearish" : "neutral";
/** 20241108 → "2024-11-08" */
const expDash = (n: number) => { const s = String(n); return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`; };

async function getCsv(path: string): Promise<{ header: string[]; rows: string[][] } | null> {
  try {
    const r = await fetch(`${HTTP}${path}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    const lines = (await r.text()).trim().split(/\r?\n/);
    if (lines.length < 2 || lines[0].includes(" ") || lines[0].includes("<")) return null;
    const unq = (s: string) => s.replace(/^"(.*)"$/, "$1");
    return { header: lines[0].split(",").map(unq), rows: lines.slice(1).map((l) => l.split(",").map(unq)) };
  } catch { return null; }
}

// ── 1. Elegir los contratos más líquidos del universo (por open interest) ────
export interface Pick { root: string; expYmd: number; strike: number; right: "C" | "P"; oi: number }

async function selectContracts(): Promise<Pick[]> {
  const bySymbol = new Map<string, Pick[]>();
  let total = 0;
  for (const root of UNIVERSE) {
    const csv = await getCsv(`/v3/option/snapshot/open_interest?symbol=${root}&expiration=*`);
    if (!csv) { log(`[${root}] sin OI — omitido`); continue; }
    const iE = csv.header.indexOf("expiration"), iK = csv.header.indexOf("strike"),
      iR = csv.header.indexOf("right"), iO = csv.header.indexOf("open_interest");
    if (iE < 0 || iK < 0 || iR < 0 || iO < 0) continue;
    const list: Pick[] = [];
    for (const r of csv.rows) {
      const oi = Number(r[iO]);
      const strike = Number(r[iK]);
      if (!(oi > 0) || !(strike > 0)) continue;
      list.push({ root, expYmd: Number(r[iE].replace(/-/g, "")), strike, right: r[iR].toUpperCase().startsWith("C") ? "C" : "P", oi });
    }
    list.sort((a, b) => b.oi - a.oi);
    bySymbol.set(root, list);
    total += list.length;
  }

  const final = pickByQuota(bySymbol, MAX_CONTRACTS);
  log(`universo: ${bySymbol.size} subyacentes · ${total} contratos con OI → suscribiendo ${final.length} (cuota por símbolo + relleno por OI)`);
  return final;
}

/**
 * Reparte los cupos disponibles entre los símbolos. PURA (testeable).
 *
 * Por qué existe la cuota: SPY/QQQ tienen un open interest gigantesco; si ordenáramos todo
 * globalmente por OI se llevarían casi los 10.000 cupos e Ideas quedaría ciega en el resto
 * del universo. Damos primero una cuota pareja a cada símbolo y luego rellenamos lo que
 * sobre con los de mayor OI global.
 *
 * `bySymbol` debe traer cada lista YA ordenada por OI descendente.
 */
export function pickByQuota(bySymbol: Map<string, Pick[]>, max: number): Pick[] {
  const symbols = [...bySymbol.keys()];
  if (!symbols.length || max <= 0) return [];
  const quota = Math.max(10, Math.floor(max / symbols.length));
  const picked: Pick[] = [];
  for (const s of symbols) picked.push(...(bySymbol.get(s) ?? []).slice(0, quota));

  if (picked.length < max) {
    const chosen = new Set(picked.map((p) => key(p.root, p.expYmd, p.strike, p.right)));
    const leftovers: Pick[] = [];
    for (const s of symbols) for (const p of (bySymbol.get(s) ?? []).slice(quota)) leftovers.push(p);
    leftovers.sort((a, b) => b.oi - a.oi);
    for (const p of leftovers) {
      if (picked.length >= max) break;
      const k = key(p.root, p.expYmd, p.strike, p.right);
      if (!chosen.has(k)) { picked.push(p); chosen.add(k); }
    }
  }
  return picked.slice(0, max);
}

// ── 2. Spot del subyacente (para las griegas). Stocks Value = 15 min de retraso ──
const SPOT_TTL = 5 * 60_000;
const spotCache = new Map<string, { px: number; at: number }>();
async function getSpot(root: string): Promise<number | null> {
  const c = spotCache.get(root);
  if (c && Date.now() - c.at < SPOT_TTL) return c.px;
  const csv = await getCsv(`/v3/stock/snapshot/ohlc?symbol=${root}&venue=utp_cta`);
  const i = csv?.header.indexOf("close") ?? -1;
  const px = csv && i >= 0 ? Number(csv.rows[0]?.[i]) : NaN;
  if (px > 0) { spotCache.set(root, { px, at: Date.now() }); return px; }
  return c?.px ?? null;
}

// ── 3. Estado en vivo: último NBBO por contrato + OI ─────────────────────────
const nbbo = new Map<string, { bid: number; ask: number }>();
const oiByKey = new Map<string, number>();

// ── 4. Búfer a Redis + métricas ─────────────────────────────────────────────
// Los efectos (timers, WS, Redis) solo arrancan si este módulo es el proceso principal;
// así los tests pueden importar las funciones puras sin levantar el worker.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

let outBuffer: RawTrade[] = [];
let seen = 0, notable = 0, pushed = 0, quotes = 0;

if (isMain) {
  setInterval(() => {
    if (!outBuffer.length) return;
    const batch = outBuffer; outBuffer = [];
    pushNotableTrades(batch).catch((e) => console.error("[redis] push falló:", e?.message ?? e));
  }, 2000);
  setInterval(() => log(`[salud] trades ${seen} · notables ${notable} · a Redis ${pushed} · quotes ${quotes} · buffer ${outBuffer.length}`), 30_000);
}

// ── 5. Armar el RawTrade de un trade notable ────────────────────────────────
const YEAR_MS = 365 * 24 * 3600 * 1000;
async function buildTrade(
  root: string, expYmd: number, strike: number, right: string,
  price: number, size: number, condition: number, tMs: number,
): Promise<RawTrade | null> {
  const k = key(root, expYmd, strike, right);
  const q = nbbo.get(k);
  const side = sideFor(price, q?.bid ?? null, q?.ask ?? null);
  const isCall = right.toUpperCase().startsWith("C");
  const exp = expDash(expYmd);
  const spot = await getSpot(root);
  const T = (Date.parse(`${exp}T20:00:00Z`) - tMs) / YEAR_MS;
  const g = spot != null && T > 0
    ? tradeGreeks(price, spot, strike, T, isCall)
    : { iv: null, delta: null, gamma: 0, theta: 0, vega: 0 };
  return {
    id: 0,
    symbol: occFor(root, exp, strike, isCall),
    price, size, side,
    bid_price: q?.bid ?? 0,
    ask_price: q?.ask ?? 0,
    premium: price * size * 100,
    delta: g.delta ?? 0, gamma: g.gamma, theta: g.theta / 365, vega: g.vega,
    implied_volatility: g.iv ?? 0,
    open_interest: oiByKey.get(k) ?? 0,
    volume: 0,
    score: 0,
    sentiment: sentimentFor(side),
    timestamp: new Date(tMs).toISOString(),
    asset_price: spot ?? undefined,
    trade_condition_id: isMultiLegCondition(condition) || isCanceledCondition(condition) ? condition : condition || undefined,
  };
}

// ── 6. WebSocket: suscribir y procesar ──────────────────────────────────────
let socket: WebSocket | null = null;
let backoff = 1000;
let picks: Pick[] = [];

function subscribeAll(): void {
  let id = 1;
  for (const p of picks) {
    const contract = { root: p.root, expiration: p.expYmd, strike: Math.round(p.strike * 1000), right: p.right };
    // Strike en 1/10 de centavo (140000 = $140.00). Un mensaje por contrato y por tipo de stream.
    socket?.send(JSON.stringify({ msg_type: "STREAM", sec_type: "OPTION", req_type: "QUOTE", add: true, id: id++, contract }));
    socket?.send(JSON.stringify({ msg_type: "STREAM", sec_type: "OPTION", req_type: "TRADE", add: true, id: id++, contract }));
    oiByKey.set(key(p.root, p.expYmd, p.strike, p.right), p.oi);
  }
  log(`suscritos ${picks.length} contratos (TRADE+QUOTE) · filtro premium ≥ $${MIN_PREMIUM.toLocaleString("en-US")}`);
}

function onMessage(raw: string): void {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  const type = msg?.header?.type;
  const c = msg?.contract;
  if (!type || !c) return;
  const strike = Number(c.strike) / 1000; // viene en 1/10 de centavo
  const k = key(c.root, Number(c.expiration), strike, String(c.right).toUpperCase().startsWith("C") ? "C" : "P");

  if (type === "QUOTE" && msg.quote) {
    const bid = Number(msg.quote.bid), ask = Number(msg.quote.ask);
    if (bid >= 0 && ask > 0) { nbbo.set(k, { bid, ask }); quotes++; }
    return;
  }
  if (type !== "TRADE" || !msg.trade) return;

  seen++;
  const t = msg.trade;
  const price = Number(t.price), size = Number(t.size);
  if (!(price > 0) || !(size > 0)) return;
  if (price * size * 100 < MIN_PREMIUM) return;
  if (isCanceledCondition(Number(t.condition))) return; // orden anulada

  notable++;
  // date=YYYYMMDD + ms_of_day (ET). Se compone en UTC como hace el resto del pipeline.
  const d = String(t.date);
  const tMs = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`) + Number(t.ms_of_day || 0);
  buildTrade(c.root, Number(c.expiration), strike, String(c.right), price, size, Number(t.condition), tMs)
    .then((row) => { if (row) { outBuffer.push(row); pushed++; } })
    .catch((e) => console.error("[build] falló:", e?.message ?? e));
}

function connect(): void {
  log(`conectando a ${WS_URL} …`);
  socket = new WebSocket(WS_URL);
  socket.addEventListener("open", () => { log("socket abierto."); backoff = 1000; subscribeAll(); });
  socket.addEventListener("message", (ev: MessageEvent) => onMessage(typeof ev.data === "string" ? ev.data : String(ev.data)));
  socket.addEventListener("error", (ev: Event) => console.error("[ws] error:", (ev as ErrorEvent).message ?? ""));
  socket.addEventListener("close", () => {
    console.warn(`[ws] cerrado. Reconectando en ${backoff / 1000}s…`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 30_000);
  });
}

// ── 7. Arranque + refresco diario del universo ──────────────────────────────
if (isMain) {
  void (async () => {
    picks = await selectContracts();
    if (!picks.length) { console.error("Sin contratos que suscribir — ¿Terminal corriendo?"); process.exit(1); }
    connect();
    // Refresco diario: el OI cambia y los líquidos de ayer no son los de hoy.
    setInterval(async () => {
      const fresh = await selectContracts();
      if (fresh.length) { picks = fresh; nbbo.clear(); try { socket?.close(); } catch {} } // close → reconecta y resuscribe
    }, 24 * 3600_000);
  })();
}
