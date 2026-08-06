// Búfer de flujo notable de TODO el mercado, en Redis.
//
// El worker (web/worker/ideasWorker.ts) consume el firehose de Massive, arma los
// RawTrade notables y los EMPUJA aquí. La ruta /api/ideas los LEE. Así el escaneo
// "de todo el mercado" no depende de MarketSnack ni de bajar GB: es un búfer rodante
// en Redis con solo lo notable (institucional), con TTL de un día de mercado.
//
// Requiere REDIS_URL en el entorno (lo pone Railway al añadir el plugin de Redis;
// en local se apunta al mismo Redis remoto).

import Redis from "ioredis";
import type { RawTrade } from "./flow";

const KEY = "ideas:notable";
const CAP = 5000; // máximo de trades notables retenidos (rodante)
const TTL_SEC = 24 * 60 * 60; // se limpia solo tras un día sin actualizaciones

export class IdeasStoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeasStoreError";
  }
}

let client: Redis | null = null;

function redis(): Redis {
  if (client) return client;
  const url = process.env.REDIS_URL;
  if (!url || !url.trim()) {
    throw new IdeasStoreError(
      "Falta REDIS_URL en el entorno. En Railway lo pone el plugin de Redis; en local, apúntalo al Redis remoto.",
    );
  }
  client = new Redis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
  return client;
}

/**
 * Cierra la conexión. IMPRESCINDIBLE en scripts de un solo uso (los cron): mientras el socket
 * siga abierto, Node NO termina y el contenedor queda "Running" para siempre aunque el trabajo
 * ya esté hecho. El worker (proceso permanente) no necesita llamarla.
 */
export async function closeIdeasStore(): Promise<void> {
  if (!client) return;
  try { await client.quit(); } catch { /* ya estaba cerrada */ }
  client = null;
}

/** El worker empuja los trades notables recién armados (más nuevos primero). */
export async function pushNotableTrades(trades: RawTrade[]): Promise<void> {
  if (trades.length === 0) return;
  const pipe = redis().pipeline();
  for (const t of trades) pipe.lpush(KEY, JSON.stringify(t));
  pipe.ltrim(KEY, 0, CAP - 1); // recorta al tope → búfer rodante
  pipe.expire(KEY, TTL_SEC);
  await pipe.exec();
}

export interface MarketFlowResult {
  trades: RawTrade[];
  pages: number;
  truncated: boolean;
}

/**
 * Lee el búfer completo como RawTrade[] — drop-in de `fetchMarketFlow` de MarketSnack.
 * Reasigna ids secuenciales (el pipeline aguas abajo los espera únicos).
 */
export async function loadMarketFlow(): Promise<MarketFlowResult> {
  const raw = await redis().lrange(KEY, 0, CAP - 1);
  const trades: RawTrade[] = [];
  for (const s of raw) {
    try {
      trades.push(JSON.parse(s) as RawTrade);
    } catch {
      // entrada corrupta: se ignora
    }
  }
  trades.forEach((t, i) => {
    t.id = i;
  });
  return { trades, pages: 1, truncated: trades.length >= CAP };
}
