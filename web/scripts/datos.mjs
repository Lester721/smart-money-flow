// EL GUARDIÁN DE LOS DATOS — ningún script vuelve a medir sobre un fichero cuya procedencia
// no esté escrita y verificada.
//
// ═══ POR QUÉ EXISTE ════════════════════════════════════════════════════════════════════════
//
// El 2026-08-25 se perdieron dos días de trabajo midiendo sobre `cache-theta/TICKER_y_*.json`.
// Ese fichero parecía dato en bruto. No lo era: el descargador pedía el volumen de TODO EL AÑO,
// ordenaba por volumen × **precio final** y se quedaba con los 60 mejores contratos. O sea que
// eligió los contratos sabiendo cómo acabaron. Medir "¿cuántos doblaron?" ahí daba 88% por
// construcción.
//
// Y no fue la primera vez. La misma clase de fallo, con otros ficheros:
//   · una tabla de splits construida con toda la historia y aplicada hacia atrás
//   · un fichero de OI recortado a ±25%: 570 de 573 valores eran cero exacto
//   · tres hallazgos retirados en un solo día por no leer el filtro del descargador
//
// ═══ POR QUÉ LAS AUDITORÍAS NO LO CAZAN ════════════════════════════════════════════════════
//
// Se comprobó todo esto sobre el dato contaminado y TODO pasó:
//   · cero cotizaciones cruzadas (bid > ask) en 11.107 observaciones
//   · el 94,9% de las subidas de la opción cuadraban con el movimiento real de la acción
//   · el seguimiento llegaba a vencimiento y algunas acababan en $0,01
//   · el resultado aguantaba año a año
//
// Todas esas comprobaciones miran las filas que ESTÁN. La contaminación está en las que FALTAN.
// **Una selección sesgada no se puede detectar mirando lo seleccionado.** Sólo leyendo el script
// que seleccionó. Por eso esto no es una auditoría más: es la única que ataca esa clase de fallo.
//
// ═══ CÓMO SE USA ═══════════════════════════════════════════════════════════════════════════
//
//   import { abrir } from "./datos.mjs";
//   const cad = abrir("cadenas");          // lanza si no hay manifiesto o si mira al futuro
//   const c = cad.leer("SPY", "20260415"); // { "20260619": { "680|C": [bid, ask] } }
//
// `abrir` imprime en una línea de dónde viene el dato, así que la salida de CUALQUIER medición
// empieza declarando su procedencia. Eso es lo que la hace auditable por Lester.
//
// Para añadir una carpeta nueva: escribe su `_MANIFIESTO.json` (ver escribir-manifiestos.mjs)
// DESPUÉS de leer el script que la generó. No al revés, y no de memoria.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const MANIFIESTO = "_MANIFIESTO.json";
const yaDicho = new Set();

/** Lee y valida el manifiesto de una carpeta de datos. Lanza si falta o si está mal. */
export function manifiesto(carpeta) {
  const dir = join(CACHE, carpeta);
  if (!existsSync(dir)) throw new Error(`No existe la carpeta de datos: ${dir}`);
  const f = join(dir, MANIFIESTO);
  if (!existsSync(f)) {
    throw new Error(
      `\n\n  ⛔ ${carpeta}/ NO TIENE MANIFIESTO.\n` +
      `     No se mide sobre datos cuya procedencia no está escrita.\n` +
      `     Lee el script que generó esta carpeta, comprueba si algún filtro usa\n` +
      `     información posterior a la fecha de cada fila, y escribe ${carpeta}/${MANIFIESTO}.\n`,
    );
  }
  let m;
  try { m = JSON.parse(readFileSync(f, "utf8")); }
  catch (e) { throw new Error(`${carpeta}/${MANIFIESTO} ilegible: ${e.message}`); }

  for (const campo of ["que_es", "script", "filtros", "mira_al_futuro", "verificado"]) {
    if (!(campo in m)) throw new Error(`${carpeta}/${MANIFIESTO} sin el campo obligatorio "${campo}"`);
  }
  if (m.mira_al_futuro === true) {
    throw new Error(
      `\n\n  ⛔ ${carpeta}/ MIRA AL FUTURO — NO SE PUEDE MEDIR CON ESTO.\n` +
      `     ${m.por_que ?? ""}\n` +
      `     Script: ${m.script}\n` +
      `     Si crees que para tu pregunta da igual, cámbialo en el manifiesto y firma por qué.\n`,
    );
  }
  if (m.mira_al_futuro !== false) {
    throw new Error(
      `\n\n  ⛔ ${carpeta}/ tiene "mira_al_futuro": ${JSON.stringify(m.mira_al_futuro)}.\n` +
      `     Mientras no sea false verificado, no se mide. Lee ${m.script} y decídelo.\n`,
    );
  }
  return m;
}

/**
 * Abre una carpeta de datos por ticker y día: TICKER_dAAAAMMDD.json.
 * Devuelve { dir, manifiesto, dias(ticker), leer(ticker, dia) } con caché acotada.
 */
export function abrir(carpeta, { cache = 700, callado = false } = {}) {
  const m = manifiesto(carpeta);
  const dir = join(CACHE, carpeta);
  if (!callado && !yaDicho.has(carpeta)) {
    yaDicho.add(carpeta);
    console.log(`  [datos] ${carpeta}: ${m.que_es} · filtros: ${m.filtros.join("; ")} · verificado ${m.verificado}`);
  }

  let _dias = null;
  const indice = () => {
    if (_dias) return _dias;
    _dias = new Map();
    for (const f of readdirSync(dir)) {
      const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
      if (!g) continue;
      if (!_dias.has(g[1])) _dias.set(g[1], []);
      _dias.get(g[1]).push(g[2]);
    }
    for (const v of _dias.values()) v.sort();
    return _dias;
  };

  const _c = new Map();
  const leer = (ticker, dia) => {
    const k = `${ticker}|${dia}`;
    if (_c.has(k)) return _c.get(k);
    const f = join(dir, `${ticker}_d${dia}.json`);
    const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
    _c.set(k, v);
    if (_c.size > cache) _c.delete(_c.keys().next().value);
    return v;
  };

  return {
    dir, manifiesto: m, leer,
    tickers: () => [...indice().keys()].sort(),
    dias: (t) => indice().get(t) ?? [],
  };
}

/** La tabla de todo lo que hay, para mirarla de un vistazo. */
export function inventario() {
  const filas = [];
  for (const c of readdirSync(CACHE, { withFileTypes: true })) {
    if (!c.isDirectory()) continue;
    const f = join(CACHE, c.name, MANIFIESTO);
    if (!existsSync(f)) { filas.push({ carpeta: c.name, estado: "SIN MANIFIESTO", futuro: "?", que_es: "" }); continue; }
    try {
      const m = JSON.parse(readFileSync(f, "utf8"));
      filas.push({
        carpeta: c.name,
        estado: m.mira_al_futuro === false ? "usable" : "BLOQUEADA",
        futuro: m.mira_al_futuro === false ? "no" : String(m.mira_al_futuro),
        que_es: m.que_es,
      });
    } catch { filas.push({ carpeta: c.name, estado: "MANIFIESTO ROTO", futuro: "?", que_es: "" }); }
  }
  return filas;
}
