// CIERRES DIARIOS REALES de los 28 símbolos — para medir movimientos de UN día.
//
// Uso: node scripts/bajar-cierres.mjs
// Salida: scripts/cache-theta/cierres/{TICKER}.json  →  {"20160104": 26.31, ...}
//
// POR QUÉ NO VALE LA PARIDAD PUT/CALL. Hasta ahora el precio del subyacente se sacaba de las
// propias cadenas, buscando el strike donde call y put valen casi lo mismo. Para elegir strikes
// sirve, pero la auditoría lo midió contra el cierre real: error mediana 0,05% y **máximo 6,5%**.
// Un 0,05% da igual cuando decides si un strike está un 60% fuera; un 6,5% es catastrófico cuando
// lo que mides ES el movimiento de un día, que ronda el 1%. Habría fabricado lunes explosivos que
// no existieron.
//
// Se piden CIERRES, no barras ajustadas: el movimiento del lunes hay que medirlo como se negoció.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const CDIR = "scripts/cache-theta/cadenas";
const DIR = "scripts/cache-theta/cierres";
const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();

/** El símbolo cambia con la fecha: META era FB antes del 2022-06-09. */
const simboloEnFecha = (sym, dia) => (sym === "META" && dia < "20220609" ? "FB" : sym);

const tickers = [...new Set(readdirSync(CDIR).map((f) => f.match(/^([A-Z]+)_d\d{8}\.json$/)?.[1]).filter(Boolean))].sort();
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

console.log(`\n## Cierres diarios · ${tickers.length} símbolos · 2016-2026\n`);

for (const t of tickers) {
  const f = `${DIR}/${t}.json`;
  if (existsSync(f)) {
    const n = Object.keys(JSON.parse(readFileSync(f, "utf8"))).length;
    console.log(`  ${t.padEnd(5)} ${n} días, ya en caché`);
    continue;
  }
  const out = {};
  // Por AÑOS: el endpoint corta los rangos largos, y así un fallo cuesta un año, no diez.
  for (let a = 2016; a <= 2026; a++) {
    const desde = `${a}0101`, hasta = a === 2026 ? "20260806" : `${a}1231`;
    const sym = simboloEnFecha(t, `${a}0601`);
    try {
      const r = await fetch(`${BASE}/v3/stock/history/eod?symbol=${sym}&start_date=${desde}&end_date=${hasta}`,
        { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) continue;
      const l = (await r.text()).trim().split("\n");
      if (l.length < 2) continue;
      const h = l[0].split(",").map(limpia);
      const iC = h.indexOf("close");
      const iT = h.indexOf("last_trade") >= 0 ? h.indexOf("last_trade") : h.indexOf("created");
      if (iC < 0 || iT < 0) continue;
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const dia = limpia(c[iT]).slice(0, 10).replace(/-/g, "");
        const px = Number(limpia(c[iC]));
        if (dia.length === 8 && px > 0) out[dia] = px;
      }
    } catch { /* el año que falle se queda sin datos y se ve en el recuento */ }
  }
  if (!Object.keys(out).length) { console.log(`  ${t.padEnd(5)} SIN DATOS`); continue; }
  writeFileSync(f, JSON.stringify(out), "utf8");
  const dias = Object.keys(out).sort();
  console.log(`  ${t.padEnd(5)} ${dias.length} días · ${dias[0]} → ${dias[dias.length - 1]}`);
}

// VALIDACIÓN: no basta con contar ficheros. Se contrasta contra el spot por paridad de las cadenas.
console.log(`\n### Validación — cierre real contra el spot por paridad (deberían parecerse)\n`);
const spotDe = (c) => {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
};
for (const t of tickers.slice(0, 6)) {
  const f = `${DIR}/${t}.json`;
  if (!existsSync(f)) continue;
  const cierres = JSON.parse(readFileSync(f, "utf8"));
  const errores = [];
  for (const dia of Object.keys(cierres).filter((_, i) => i % 250 === 0)) {
    const cf = `${CDIR}/${t}_d${dia}.json`;
    if (!existsSync(cf)) continue;
    const sp = spotDe(JSON.parse(readFileSync(cf, "utf8")));
    if (sp) errores.push(Math.abs(sp - cierres[dia]) / cierres[dia] * 100);
  }
  errores.sort((a, b) => a - b);
  console.log(`  ${t.padEnd(5)} ${errores.length} muestras · error mediana ${(errores[errores.length >> 1] ?? NaN).toFixed(2)}% · máx ${(errores[errores.length - 1] ?? NaN).toFixed(2)}%`);
}
