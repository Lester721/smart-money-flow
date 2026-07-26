// Worker de PRODUCCIÓN para /api/ideas — firehose de Massive → Redis.
//
// Se conecta al WebSocket de opciones de Massive, suscribe TODOS los trades del
// mercado (`T.*`), se queda solo con los NOTABLES (premium ≥ IDEAS_MIN_PREMIUM),
// y para cada uno arma el RawTrade EXACTO reusando la misma lógica del análisis
// por-ticker (BBO as-of → agresor, griegas, condiciones OPRA). Los empuja a Redis
// (lib/ideasStore), de donde /api/ideas los lee.
//
// Diseño clave: NO streameamos quotes de todo el mercado (Massive las limita a
// 1.000 contratos). Streameamos solo trades y pedimos el BBO as-of por REST SOLO
// para los notables → agresor exacto sin caja negra, sin bajar GB.
//
// Corre siempre (Railway). Reconecta solo. Requiere MASSIVE_API_KEY y REDIS_URL.

import { fetchAsOfQuote, fetchBars, fetchContractStats } from "../lib/massive";
import {
  massiveTradesToRawTrades,
  occFromMassive,
  primaryConditionId,
  type MassiveTrade,
  type MassiveQuote,
  type MassiveContractContext,
} from "../lib/massiveFlow";
import { isCanceledCondition } from "../lib/conditions";
import { parseOcc } from "../lib/occ";
import { pushNotableTrades } from "../lib/ideasStore";
import type { RawTrade } from "../lib/flow";

const WS_URL = "wss://socket.massive.com/options";
const API_KEY = process.env.MASSIVE_API_KEY;
const MIN_PREMIUM = Number(process.env.IDEAS_MIN_PREMIUM) || 500_000; // piso institucional
const MAX_INFLIGHT = Number(process.env.IDEAS_CONCURRENCY) || 8; // llamadas REST en paralelo

if (typeof WebSocket === "undefined") {
  console.error("Necesita Node 22+ (WebSocket nativo).");
  process.exit(1);
}
if (!API_KEY) {
  console.error("Falta MASSIVE_API_KEY en el entorno.");
  process.exit(1);
}

// --- Normalización de timestamp a NANOsegundos -------------------------------
// El tape de opciones puede reportar el tiempo en s/ms/µs/ns según el canal.
// Normalizamos por magnitud → el BBO as-of empareja el instante correcto (agresor exacto).
function toNs(t: number): number {
  if (!(t > 0)) return 0;
  if (t > 1e18) return t; // ya en ns
  if (t > 1e15) return t * 1e3; // µs → ns
  if (t > 1e12) return t * 1e6; // ms → ns
  return t * 1e9; // s → ns
}

// --- Limitador de concurrencia (respeta el rate limit de Massive) ------------
class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
const limiter = new Limiter(MAX_INFLIGHT);

// --- Cachés por-subyacente (amortizan las llamadas entre trades del mismo activo) ---
const BARS_TTL = 5 * 60_000; // barras de minuto del subyacente
const STATS_TTL = 10 * 60_000; // OI + volumen del contrato
const barsCache = new Map<string, { bars: [number, number][]; at: number }>();
const statsCache = new Map<string, { oi: number; vol: number; at: number }>();

async function getBars(ticker: string): Promise<[number, number][]> {
  const c = barsCache.get(ticker);
  if (c && Date.now() - c.at < BARS_TTL) return c.bars;
  const bars = await fetchBars(ticker, 1, "minute", 1).catch(() => []);
  const arr = bars.map((b) => [b.time * 1000, b.close] as [number, number]);
  barsCache.set(ticker, { bars: arr, at: Date.now() });
  return arr;
}

async function getStats(ticker: string, optionSym: string): Promise<{ oi: number; vol: number }> {
  const c = statsCache.get(optionSym);
  if (c && Date.now() - c.at < STATS_TTL) return { oi: c.oi, vol: c.vol };
  const s = await fetchContractStats(ticker, optionSym).catch(() => ({ openInterest: 0, volume: 0 }));
  statsCache.set(optionSym, { oi: s.openInterest, vol: s.volume, at: Date.now() });
  return { oi: s.openInterest, vol: s.volume };
}

// --- Enriquecimiento de un trade notable → RawTrade exacto -------------------
async function enrich(
  sym: string,
  price: number,
  size: number,
  conditions: number[] | undefined,
  tNs: number,
): Promise<RawTrade | null> {
  const info = parseOcc(occFromMassive(sym));
  if (!info) return null;
  const ticker = info.underlying;

  const [bars, stats, quote] = await Promise.all([
    getBars(ticker),
    getStats(ticker, sym),
    fetchAsOfQuote(sym, tNs).catch(() => null),
  ]);

  const mt: MassiveTrade = { price, size, conditions, sip_timestamp: tNs };
  const ctx: MassiveContractContext = {
    massiveSymbol: sym,
    strike: info.strike,
    expiration: info.expiration,
    isCall: info.type === "call",
    openInterest: stats.oi,
    volume: stats.vol,
    underlyingBars: bars,
  };
  const rows = massiveTradesToRawTrades([mt], quote ? [quote as MassiveQuote] : [], ctx);
  return rows[0] ?? null;
}

// --- Búfer de salida: se vacía a Redis cada 2 s -----------------------------
let outBuffer: RawTrade[] = [];
setInterval(() => {
  if (outBuffer.length === 0) return;
  const batch = outBuffer;
  outBuffer = [];
  pushNotableTrades(batch).catch((e) => console.error("[redis] push falló:", e?.message ?? e));
}, 2000);

// --- Métricas (log de salud cada 30 s) --------------------------------------
let seen = 0;
let notable = 0;
let pushed = 0;
setInterval(() => {
  console.log(`[salud] trades vistos ${seen} · notables ${notable} · a Redis ${pushed} · buffer ${outBuffer.length}`);
}, 30_000);

// --- Manejo de un mensaje del WebSocket -------------------------------------
function onMessage(raw: string): void {
  let events: unknown;
  try {
    events = JSON.parse(raw);
  } catch {
    return;
  }
  const list = Array.isArray(events) ? events : [events];
  for (const e of list as Array<Record<string, unknown>>) {
    if (e.ev === "status") {
      const st = e.status as string;
      console.log(`[status] ${st}: ${e.message ?? ""}`);
      if (st === "connected") {
        socket?.send(JSON.stringify({ action: "auth", params: API_KEY }));
      } else if (st === "auth_success") {
        socket?.send(JSON.stringify({ action: "subscribe", params: "T.*" }));
        console.log(`Suscrito a T.* — filtrando premium ≥ $${MIN_PREMIUM.toLocaleString("en-US")}`);
      } else if (st === "auth_failed" || st === "error") {
        console.error("Auth/stream falló:", e.message);
      }
      continue;
    }
    if (e.ev !== "T") continue;

    seen++;
    const sym = e.sym as string;
    const price = Number(e.p);
    const size = Number(e.s);
    if (!(price > 0) || !(size > 0)) continue;
    if (price * size * 100 < MIN_PREMIUM) continue; // filtro por premium (del propio trade)

    const conditions = Array.isArray(e.c) ? (e.c as number[]) : undefined;
    // Canceladas: la orden se anuló → no gastamos una llamada REST enriqueciéndola.
    if (isCanceledCondition(primaryConditionId(conditions))) continue;

    notable++;
    const tNs = toNs(Number(e.t));
    limiter
      .run(() => enrich(sym, price, size, conditions, tNs))
      .then((row) => {
        if (row) {
          outBuffer.push(row);
          pushed++;
        }
      })
      .catch((err) => console.error("[enrich] falló:", err?.message ?? err));
  }
}

// --- Conexión con reconexión automática (backoff) ---------------------------
let socket: WebSocket | null = null;
let backoff = 1000;
const MAX_BACKOFF = 30_000;

function connect(): void {
  console.log(`Conectando a ${WS_URL} …`);
  socket = new WebSocket(WS_URL);
  socket.addEventListener("open", () => {
    console.log("Socket abierto.");
    backoff = 1000; // reset tras conexión sana
  });
  socket.addEventListener("message", (ev: MessageEvent) => {
    onMessage(typeof ev.data === "string" ? ev.data : String(ev.data));
  });
  socket.addEventListener("error", (ev: Event) => {
    console.error("[ws] error:", (ev as ErrorEvent).message ?? "");
  });
  socket.addEventListener("close", () => {
    console.warn(`[ws] cerrado. Reconectando en ${backoff / 1000}s…`);
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
  });
}

connect();
