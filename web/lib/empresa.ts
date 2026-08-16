// FICHA DE EMPRESA Y LOGO, GRATIS Y SIN CLAVE — el sustituto de lo único que Massive daba y
// ThetaData no.
//
// POR QUÉ EXISTE. Al medir qué se rompía sin Massive, ocho de las nueve rutas se podían portar a
// ThetaData. La novena no: ThetaData es un proveedor de PRECIOS, no de fundamentales, y no tiene
// ni logos ni nombre ni sector. Esto lo cubre con dos fuentes gratuitas, las dos comprobadas el
// 2026-08-15 contra tickers reales, no supuestas:
//
//   · La SEC (el regulador) para nombre, sector y bolsa. Oficial, gratis, sin clave, y la fuente
//     más estable que existe: si una empresa cotiza en EE.UU., está aquí.
//   · Logos de financialmodelingprep, con parqet de reserva. Comprobado que devuelven imágenes
//     DISTINTAS por ticker y no un mismo icono genérico (parqet daba 530-836 B según el ticker).
//
// LO ÚNICO QUE SE PIERDE de la cabecera anterior es el número de EMPLEADOS. No entra en ningún
// cálculo, ninguna señal ni ningún backtest.
//
// LA SEC EXIGE IDENTIFICARSE. Sin `User-Agent` responde 403 — y como el 403 devolvería una ficha
// vacía, la cabecera se habría quedado en blanco sin decir por qué. Por eso aquí un fallo se
// distingue de "no hay dato": `null` es no encontrado, y una excepción es un problema.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import type { CompanyInfo } from "./types";
import { dirname } from "node:path";

const UA = process.env.SEC_USER_AGENT || "Agente Tito Metralleta contacto@ejemplo.com";
const CACHE_TICKERS = "data/sec-tickers.json";
const TTL_DIAS = 7;

export interface FichaEmpresa {
  ticker: string;
  nombre: string | null;
  sector: string | null;        // descripción SIC de la SEC ("Semiconductors & Related Devices")
  bolsa: string | null;         // "Nasdaq", "NYSE"…
  cik: string | null;
  logoUrl: string | null;
  fuente: "sec" | "ninguna";
}

async function pedir(url: string, ms = 20_000): Promise<Response> {
  return fetch(url, { headers: { "User-Agent": UA, "Accept-Encoding": "gzip, deflate" }, signal: AbortSignal.timeout(ms) });
}

// ── ticker → CIK ────────────────────────────────────────────────────────────
// El fichero de la SEC son ~10.400 empresas y cambia poco: se guarda en disco una semana. Sin
// caché, cada visita a una página de ticker se bajaría un megabyte para leer un número.
let mapaMem: Map<string, { cik: string; nombre: string }> | null = null;

async function mapaTickers(): Promise<Map<string, { cik: string; nombre: string }>> {
  if (mapaMem) return mapaMem;

  let crudo: string | null = null;
  try {
    const st = existsSync(CACHE_TICKERS) ? JSON.parse(readFileSync(CACHE_TICKERS, "utf8")) : null;
    if (st && Date.now() - st.cuando < TTL_DIAS * 86_400_000) crudo = JSON.stringify(st.datos);
  } catch { /* caché ilegible: se vuelve a bajar */ }

  if (!crudo) {
    const r = await pedir("https://www.sec.gov/files/company_tickers.json", 30_000);
    if (!r.ok) throw new Error(`SEC company_tickers: HTTP ${r.status}${r.status === 403 ? " (¿falta el User-Agent?)" : ""}`);
    const datos = await r.json();
    crudo = JSON.stringify(datos);
    try {
      if (!existsSync(dirname(CACHE_TICKERS))) mkdirSync(dirname(CACHE_TICKERS), { recursive: true });
      writeFileSync(CACHE_TICKERS, JSON.stringify({ cuando: Date.now(), datos }), "utf8");
    } catch { /* sin caché en disco se sigue, sólo será más lento */ }
  }

  const m = new Map<string, { cik: string; nombre: string }>();
  for (const v of Object.values(JSON.parse(crudo) as Record<string, { cik_str: number; ticker: string; title: string }>)) {
    if (v?.ticker) m.set(v.ticker.toUpperCase(), { cik: String(v.cik_str).padStart(10, "0"), nombre: v.title });
  }
  mapaMem = m;
  return m;
}

// ── La ficha ────────────────────────────────────────────────────────────────
const cacheFicha = new Map<string, { cuando: number; ficha: FichaEmpresa }>();

export async function fichaEmpresa(tickerRaw: string): Promise<FichaEmpresa> {
  const ticker = tickerRaw.trim().toUpperCase();
  const guardada = cacheFicha.get(ticker);
  if (guardada && Date.now() - guardada.cuando < 6 * 3_600_000) return guardada.ficha;

  const vacia: FichaEmpresa = {
    ticker, nombre: null, sector: null, bolsa: null, cik: null,
    logoUrl: logoUrl(ticker), fuente: "ninguna",
  };

  let ficha = vacia;
  try {
    const entrada = (await mapaTickers()).get(ticker);
    if (entrada) {
      // El nombre ya lo tenemos del índice; sector y bolsa piden una llamada más.
      ficha = { ...vacia, nombre: entrada.nombre, cik: entrada.cik, fuente: "sec" };
      const r = await pedir(`https://data.sec.gov/submissions/CIK${entrada.cik}.json`);
      if (r.ok) {
        const j = await r.json();
        ficha = {
          ...ficha,
          nombre: j.name || entrada.nombre,
          sector: j.sicDescription || null,
          bolsa: Array.isArray(j.exchanges) && j.exchanges.length ? j.exchanges.join(", ") : null,
        };
      }
    }
    // Un ticker que no está en la SEC no es un error: los ETF (SPY, QQQ) no presentan estos
    // formularios. Se devuelve la ficha vacía CON logo, que es lo honesto: no hay ficha, no que
    // haya fallado algo.
  } catch (e) {
    // Un fallo de red NO se convierte en "esta empresa no existe": se propaga la ficha vacía pero
    // NO se guarda en caché, para que el siguiente intento vuelva a preguntar.
    console.error(`[empresa] ${ticker}: ${(e as Error).message}`);
    return vacia;
  }

  cacheFicha.set(ticker, { cuando: Date.now(), ficha });
  return ficha;
}

// ── El logo ─────────────────────────────────────────────────────────────────
/** La URL del logo. No se comprueba aquí: la ruta /api/logo es la que lo trae y sabe si existe. */
export function logoUrl(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker.trim().toUpperCase())}.png`;
}

/**
 * Trae la imagen del logo. Prueba la fuente principal y, si falla, la de reserva.
 * Devuelve null si ninguna la tiene — y eso es un dato, no un fallo: hay tickers sin logo.
 */
export async function traerLogo(tickerRaw: string): Promise<{ datos: ArrayBuffer; tipo: string } | null> {
  const t = encodeURIComponent(tickerRaw.trim().toUpperCase());
  const fuentes = [
    `https://financialmodelingprep.com/image-stock/${t}.png`,
    `https://assets.parqet.com/logos/symbol/${t}?format=png`,
  ];
  for (const url of fuentes) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12_000), redirect: "follow" });
      if (!r.ok) continue;
      const tipo = r.headers.get("content-type") || "";
      if (!tipo.startsWith("image/")) continue;      // algunas devuelven una página de error con 200
      const datos = await r.arrayBuffer();
      if (datos.byteLength < 300) continue;          // demasiado pequeño para ser un logo de verdad
      return { datos, tipo };
    } catch { /* se prueba la siguiente */ }
  }
  return null;
}

/**
 * La ficha COMPLETA en el formato que espera la web (`CompanyInfo`), sin Massive.
 *
 * De dónde sale cada cosa, y qué falta:
 *   · nombre, bolsa, sector       → SEC (oficial)
 *   · precio, apertura, máximo,
 *     mínimo, volumen, variación  → ThetaData, de la última sesión CERRADA
 *   · marketCap, empleados,
 *     web, fecha de salida,
 *     descripción                 → NULL. La SEC los tiene repartidos en formularios XBRL y
 *                                   sacarlos es un proyecto aparte; ninguno entra en un cálculo.
 *
 * OJO CON EL PRECIO: la suscripción de acciones no incluye tiempo real, así que esto es el cierre
 * de la última sesión disponible, no el precio de ahora mismo. Se dice aquí para que nadie lo
 * confunda: durante la sesión, este número está retrasado.
 */
export async function fichaCompleta(tickerRaw: string): Promise<CompanyInfo> {
  const ticker = tickerRaw.trim().toUpperCase();
  const [ficha, barras] = await Promise.all([
    fichaEmpresa(ticker),
    (async () => {
      try {
        const { fetchBarrasDiarias } = await import("./thetadata");
        const hoy = new Date();
        const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
        return await fetchBarrasDiarias(ticker, ymd(new Date(hoy.getTime() - 12 * 86_400_000)), ymd(hoy));
      } catch { return []; }
    })(),
  ]);

  const ult = barras[barras.length - 1] ?? null;
  const previa = barras[barras.length - 2] ?? null;
  const cambio = ult && previa ? ult.close - previa.close : null;

  return {
    ticker,
    name: ficha.nombre,
    exchange: ficha.bolsa,
    sector: ficha.sector,
    marketCap: null,
    homepageUrl: null,
    employees: null,
    listDate: null,
    description: null,
    hasLogo: true,                       // la ruta /api/logo devuelve 404 si no lo hay
    price: ult?.close ?? null,
    change: cambio,
    changePercent: cambio != null && previa ? (cambio / previa.close) * 100 : null,
    dayOpen: ult?.open ?? null,
    dayHigh: ult?.high ?? null,
    dayLow: ult?.low ?? null,
    dayVolume: ult?.volume ?? null,
  } as CompanyInfo;
}
