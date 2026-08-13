// FORWARD-TEST (papel) de la put semanal de QQQ al 3%.
//
// NO ejecuta órdenes. Registra jugadas de PAPEL con cotizaciones REALES y las liquida contra
// el cierre real del vencimiento, para ver hacia adelante si el 15,1%/año del backtest
// (309 viernes, 2020-2026, COVID incluido) aparece también en vivo.
//
// Cada corrida hace tres cosas:
//   1) ABRE   — si hoy es viernes y aún no hay operación de hoy: busca el strike listado más
//               cercano al 3% por debajo del spot DE LAS 10:00, con el bid/ask de esa hora.
//   2) CIERRA — toda posición cuyo vencimiento ya pasó: si acabó dentro del dinero se RECOMPRA
//               al ask real de ese viernes; si no, vence sola. Nunca se acepta la asignación.
//   3) REPORTA — estado del ledger y comparación contra comprar QQQ el mismo periodo.
//
// Uso:  node --env-file=.env.local --import tsx scripts/forward-put-semanal.ts
//       node --env-file=.env.local --import tsx scripts/forward-put-semanal.ts --fecha 2026-08-07
//
// Necesita el Theta Terminal arriba (ver §0 de CLAUDE.md) o THETA_BASE apuntando a uno.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import Redis from "ioredis";
import {
  candidataDelViernes, recompraAlVencimiento, cierreSubyacente, cerrar,
  esViernes, OTM, HORA_ENTRADA, COMISION,
} from "../lib/putSemanal";

const SYMBOL = process.env.PS_SYMBOL || "QQQ";
const FICHERO = process.env.PS_FILE || "data/forward/put-semanal.json";
const STORE = (process.env.PS_STORE || (process.env.REDIS_URL ? "redis" : "file")).toLowerCase();
const REDIS_KEY = process.env.PS_REDIS_KEY || "putsemanal:ledger";

const argFecha = (() => {
  const i = process.argv.indexOf("--fecha");
  return i > 0 ? process.argv[i + 1] : null;
})();
const HOY = argFecha || new Date().toISOString().slice(0, 10);

export interface Op {
  id: string;
  symbol: string;
  entrada: string;          // viernes de venta
  hora: string;
  exp: string;              // viernes de vencimiento
  spot: number;
  strike: number;
  bid: number; ask: number;
  credito: number;          // punto medio cobrado
  colateral: number;
  otmReal: number;
  horquillaRel: number;
  estado: "abierta" | "cerrada";
  // al cerrar
  cierreExp?: number;
  recompra?: number | null;
  pnl?: number;
  retorno?: number;
  asignadaEvitada?: boolean;
}

// ── almacenamiento ────────────────────────────────────────────────────────────
let redis: Redis | null = null;
const getRedis = () => {
  if (!redis) {
    if (!process.env.REDIS_URL) throw new Error("PS_STORE=redis pero falta REDIS_URL");
    redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  }
  return redis;
};

async function leer(): Promise<Op[]> {
  if (STORE === "redis") {
    try {
      const raw = await getRedis().get(REDIS_KEY);
      if (raw) return JSON.parse(raw) as Op[];
    } catch (e) { console.log(`  aviso: Redis no responde (${String(e).slice(0, 60)}), leo del fichero`); }
  }
  try { return JSON.parse(readFileSync(FICHERO, "utf8")) as Op[]; } catch { return []; }
}

async function guardar(ledger: Op[], reporte: string) {
  // Siempre al fichero: es lo que se versiona y lo que sirve la web si Redis no está.
  if (!existsSync(dirname(FICHERO))) mkdirSync(dirname(FICHERO), { recursive: true });
  writeFileSync(FICHERO, JSON.stringify(ledger, null, 1), "utf8");
  if (STORE === "redis") {
    try {
      const r = getRedis();
      await r.set(REDIS_KEY, JSON.stringify(ledger));
      await r.set(`${REDIS_KEY}:report`, reporte);
    } catch (e) { console.log(`  aviso: no se pudo escribir en Redis (${String(e).slice(0, 60)})`); }
  }
}

// ── 1. abrir ──────────────────────────────────────────────────────────────────
async function abrir(ledger: Op[]): Promise<string[]> {
  const log: string[] = [];
  if (!esViernes(HOY)) { log.push(`  hoy (${HOY}) no es viernes — no se abre nada`); return log; }
  const id = `${SYMBOL}|${HOY}`;
  if (ledger.some((o) => o.id === id)) { log.push(`  ya había operación de ${HOY} — no se duplica`); return log; }

  const c = await candidataDelViernes(SYMBOL, HOY, HORA_ENTRADA, OTM);
  if (!c) {
    log.push(`  ✗ sin cotización utilizable a las ${HORA_ENTRADA} del ${HOY} (¿Terminal caído? ¿festivo?)`);
    return log;
  }
  ledger.push({
    id, symbol: SYMBOL, entrada: c.fecha, hora: c.hora, exp: c.exp, spot: c.spot,
    strike: c.strike, bid: c.bid, ask: c.ask, credito: c.credito, colateral: c.colateral,
    otmReal: c.otmReal, horquillaRel: c.horquillaRel, estado: "abierta",
  });
  log.push(
    `  ✓ ABIERTA  ${SYMBOL} ${c.spot.toFixed(2)} → vender put ${c.strike} (${(c.otmReal * 100).toFixed(2)}% fuera) ` +
    `venc ${c.exp} · cobro $${(c.credito * 100).toFixed(0)} · horquilla ${(c.horquillaRel * 100).toFixed(1)}% · ` +
    `colateral $${c.colateral.toFixed(0)}`,
  );
  return log;
}

// ── 2. cerrar ─────────────────────────────────────────────────────────────────
async function cerrarVencidas(ledger: Op[]): Promise<string[]> {
  const log: string[] = [];
  for (const o of ledger) {
    if (o.estado !== "abierta" || o.exp > HOY) continue;
    const cierreExp = await cierreSubyacente(o.symbol, o.exp);
    if (cierreExp == null) { log.push(`  … ${o.exp}: aún sin cierre del subyacente, se reintenta`); continue; }
    const dentro = cierreExp < o.strike;
    const rec = dentro ? await recompraAlVencimiento(o.symbol, o.exp, o.strike) : null;
    if (dentro && !rec) { log.push(`  … ${o.exp}: dentro del dinero pero sin cotización de recompra, se reintenta`); continue; }

    const r = cerrar(o.credito, o.strike, cierreExp, rec?.ask ?? null);
    o.estado = "cerrada"; o.cierreExp = cierreExp; o.recompra = r.recompra;
    o.pnl = r.pnl; o.retorno = r.retorno; o.asignadaEvitada = r.asignadaEvitada;
    log.push(
      `  ✓ CERRADA  ${o.entrada}→${o.exp}  K=${o.strike}  ${o.symbol} cerró ${cierreExp.toFixed(2)}  ` +
      (r.asignadaEvitada ? `RECOMPRADA a $${(r.recompra! * 100).toFixed(0)}  ` : `venció sola  `) +
      `P&L $${r.pnl.toFixed(0)}  (${(r.retorno * 100).toFixed(2)}%)`,
    );
  }
  return log;
}

// ── 3. reportar ───────────────────────────────────────────────────────────────
function reportar(ledger: Op[]): string {
  const cer = ledger.filter((o) => o.estado === "cerrada" && o.retorno != null);
  const abi = ledger.filter((o) => o.estado === "abierta");
  const L: string[] = [];
  L.push(`# Forward-test — put semanal ${SYMBOL} al ${(OTM * 100).toFixed(0)}%`);
  L.push(``);
  L.push(`Actualizado: ${HOY}. **100% papel — no se ejecuta ninguna orden.**`);
  L.push(``);
  L.push(`- operaciones cerradas: **${cer.length}**`);
  L.push(`- abiertas ahora: ${abi.length}`);
  if (!cer.length) {
    L.push(``);
    L.push(`Todavía sin cierres. El backtest (309 viernes, 2020-2026) dio 15,1%/año con 7% de caída.`);
    return L.join("\n");
  }
  const rets = cer.map((o) => o.retorno!);
  const eq = rets.reduce((a, r) => a * (1 + r), 1);
  const ganan = rets.filter((r) => r > 0).length;
  const dias = (new Date(cer[cer.length - 1].exp).getTime() - new Date(cer[0].entrada).getTime()) / 864e5;
  const anual = dias > 30 ? (eq ** (365 / dias) - 1) * 100 : null;
  const asignadas = cer.filter((o) => o.asignadaEvitada).length;

  L.push(`- aciertos: **${ganan}/${cer.length}** (${Math.round((ganan / cer.length) * 100)}%)`);
  L.push(`- acumulado sobre el colateral: **${((eq - 1) * 100).toFixed(2)}%** en ${Math.round(dias)} días`);
  if (anual != null) L.push(`- ritmo anualizado: **${anual.toFixed(1)}%** _(con ${cer.length} cierres esto todavía se mueve mucho)_`);
  L.push(`- acabaron dentro del dinero y hubo que recomprar: ${asignadas}`);
  const primas = cer.map((o) => o.credito * 100).sort((a, b) => a - b);
  L.push(`- prima mediana cobrada: $${(primas[Math.floor(primas.length / 2)] ?? 0).toFixed(0)}`);
  L.push(``);
  L.push(`Referencia del backtest (corregida): 13,5%/año, 90% de aciertos, caída máxima 7%.`);
  return L.join("\n");
}

// ── main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n=== forward-test put semanal ${SYMBOL} · ${HOY} · almacén: ${STORE} ===\n`);
  const ledger = await leer();
  console.log(`ledger cargado: ${ledger.length} operaciones`);

  console.log(`\n[1/3] cerrar vencidas`);
  for (const l of await cerrarVencidas(ledger)) console.log(l);

  console.log(`\n[2/3] abrir la del viernes`);
  for (const l of await abrir(ledger)) console.log(l);

  console.log(`\n[3/3] reporte`);
  const rep = reportar(ledger);
  console.log(rep.split("\n").map((l) => `  ${l}`).join("\n"));

  await guardar(ledger, rep);
  console.log(`\nguardado en ${FICHERO}${STORE === "redis" ? ` y en Redis (${REDIS_KEY})` : ""}`);
  await (redis as Redis | null)?.quit();
})();
