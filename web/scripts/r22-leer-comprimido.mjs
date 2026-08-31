// LECTOR DE LOS DATOS COMPRIMIDOS + su verificación.
//
// r21-comprimir.mjs juntó cada ticker-año en un solo fichero gzip:
//    cadenas/SPY_d20260415.json  × 250 al año   →   cadenas-z/SPY_2026.json.gz
//    2.458 MB → 698 MB (72% menos) · 1.381 MB → 294 MB (79% menos)
//    de 150.000 ficheros a 626
//
// Este módulo los lee con la MISMA interfaz que `datos.mjs`, para que nada más tenga que cambiar:
//    const cad = abrirZ("cadenas");   cad.leer("SPY","20260415")   cad.dias("SPY")
//
// La caché es POR AÑO: se descomprime un año entero la primera vez y se queda en memoria. Por eso
// es más rápido que el original — se abre un fichero en vez de 250.
//
// ⚠ NO se borra nada del original hasta que la verificación de abajo pase.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const CARPETAS = { cadenas: "cadenas-z", "oi-ancho": "oi-z" };

export function abrirZ(nombre, { maxAnos = 24 } = {}) {
  const dir = join(CACHE, CARPETAS[nombre] ?? nombre);
  if (!existsSync(dir)) throw new Error(`No existe ${dir}. Corre r21-comprimir.mjs primero.`);

  // índice: qué ticker-años hay
  const anos = new Map();                       // ticker -> [años]
  for (const f of readdirSync(dir)) {
    const g = /^([A-Z]+)_(\d{4})\.json\.gz$/.exec(f);
    if (!g) continue;
    if (!anos.has(g[1])) anos.set(g[1], []);
    anos.get(g[1]).push(g[2]);
  }
  for (const v of anos.values()) v.sort();

  const cache = new Map();                      // "TK_AAAA" -> { dia: contenido }
  function ano(tk, a) {
    const k = `${tk}_${a}`;
    if (cache.has(k)) return cache.get(k);
    const f = join(dir, `${k}.json.gz`);
    const v = existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) : null;
    cache.set(k, v);
    if (cache.size > maxAnos) cache.delete(cache.keys().next().value);
    return v;
  }

  let _dias = null;
  const indice = () => {
    if (_dias) return _dias;
    _dias = new Map();
    for (const [tk, aa] of anos) {
      const lista = [];
      for (const a of aa) { const p = ano(tk, a); if (p) lista.push(...Object.keys(p)); }
      lista.sort();
      _dias.set(tk, lista);
    }
    return _dias;
  };

  return {
    dir,
    leer: (tk, dia) => ano(tk, dia.slice(0, 4))?.[dia] ?? null,
    tickers: () => [...anos.keys()].sort(),
    dias: (tk) => indice().get(tk) ?? [],
  };
}

// ── si se ejecuta directamente: VERIFICAR contra los originales ──
if (process.argv[1]?.endsWith("r22-leer-comprimido.mjs")) {
  console.log(`\n═══ VERIFICACIÓN: ¿el comprimido dice EXACTAMENTE lo mismo? ═══\n`);
  let totalOk = 0, totalMal = 0;
  for (const [nombre, carpetaOrig] of [["cadenas", "cadenas"], ["oi-ancho", "oi-ancho"]]) {
    const z = abrirZ(nombre);
    const orig = join(CACHE, carpetaOrig);
    const ficheros = readdirSync(orig).filter((f) => /^[A-Z]+_d\d{8}\.json$/.test(f));
    // muestra repartida por todo el archivo: uno de cada 137 (número primo, para no caer siempre igual)
    const muestra = ficheros.filter((_, i) => i % 137 === 0);
    let ok = 0, mal = 0, faltan = 0;
    const fallos = [];
    for (const f of muestra) {
      const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
      const a = readFileSync(join(orig, f), "utf8");
      const b = z.leer(g[1], g[2]);
      if (b === null) { faltan++; fallos.push(`${f} NO ESTÁ en el comprimido`); continue; }
      if (JSON.stringify(JSON.parse(a)) === JSON.stringify(b)) ok++;
      else { mal++; if (fallos.length < 5) fallos.push(`${f} DIFIERE`); }
    }
    totalOk += ok; totalMal += mal + faltan;
    console.log(`  ${nombre.padEnd(10)} muestra de ${muestra.length} ficheros · idénticos ${ok} · distintos ${mal} · ausentes ${faltan}`);
    for (const x of fallos.slice(0, 5)) console.log(`     ⚠ ${x}`);
    // y el recuento total de días
    const tks = z.tickers();
    const diasZ = tks.reduce((s, t) => s + z.dias(t).length, 0);
    console.log(`  ${"".padEnd(10)} días en el comprimido: ${diasZ.toLocaleString("en-US")} · en el original: ${ficheros.length.toLocaleString("en-US")} · ${diasZ === ficheros.length ? "✓ coinciden" : "⚠ NO coinciden"}`);
  }
  console.log(`\n  ${totalMal === 0 ? "✓ VERIFICADO — el comprimido es idéntico al original" : `✗ HAY ${totalMal} DIFERENCIAS — no borrar nada`}`);

  // velocidad
  console.log(`\n═══ ¿ES MÁS RÁPIDO? ═══\n`);
  const { abrir } = await import("./datos.mjs");
  const cadO = abrir("cadenas", { callado: true });
  const cadZ = abrirZ("cadenas");
  const dias = cadO.dias("SPY").filter((d) => d.startsWith("2026")).slice(0, 120);
  let t = Date.now(); let n1 = 0;
  for (const d of dias) { const c = cadO.leer("SPY", d); if (c) n1 += Object.keys(c).length; }
  const tO = Date.now() - t;
  t = Date.now(); let n2 = 0;
  for (const d of dias) { const c = cadZ.leer("SPY", d); if (c) n2 += Object.keys(c).length; }
  const tZ = Date.now() - t;
  console.log(`  leer ${dias.length} días de SPY:  original ${tO} ms  ·  comprimido ${tZ} ms  ·  ${tZ < tO ? `${(tO / tZ).toFixed(1)}× más rápido` : `${(tZ / tO).toFixed(1)}× más lento`}`);
  console.log(`  (vencimientos leídos: ${n1} contra ${n2} — ${n1 === n2 ? "✓ mismo contenido" : "⚠ DISTINTO"})\n`);
}
