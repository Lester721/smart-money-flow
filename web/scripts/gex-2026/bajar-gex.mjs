// FASE 1 del GEX intradía: lo que NO necesita ninguna suposición sobre los dealers.
//
// Por día de 2026 con vencimiento 0DTE de SPXW:
//   · precios + IV cada 5 min, todos los strikes, puts Y calls  (~7,6 MB/día)
//   · open interest del día anterior y del día              (~92 KB/día)
//
// Con esto se puede medir la pregunta que no exige saber de qué lado están los dealers:
// ¿el precio se comporta distinto cerca de los strikes con mucha gamma?
//
// El flujo firmado (8,4 MB por strike y día — no se puede agregar en el servidor) es la FASE 2,
// y solo se baja si la fase 1 enseña algo.
import fs from 'node:fs';
const DIR = process.argv[2]; fs.mkdirSync(DIR, { recursive: true });
const B = 'http://127.0.0.1:25503/v3';

// vencimientos diarios reales de SPXW en 2026 (los pide al Terminal, no se inventan)
const txt = await (await fetch(`${B}/option/list/expirations?symbol=SPXW`)).text();
const exps = [...new Set(txt.split('\n').slice(1).map(l => l.split(',')[1]?.replace(/"/g, '')).filter(Boolean))]
  .filter(e => e >= '2026-01-01' && e <= '2026-08-10').sort();
console.log(`${exps.length} vencimientos 0DTE de SPXW en 2026`);

const anterior = (d) => { const x = new Date(d + 'T00:00:00Z'); do { x.setUTCDate(x.getUTCDate() - 1); } while ([0, 6].includes(x.getUTCDay())); return x.toISOString().slice(0, 10); };

let ok = 0, mal = 0, i = 0, bytes = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
  while (i < exps.length) {
    const e = exps[i++];
    for (const [nombre, url] of [
      [`iv_${e}_P`, `option/history/greeks/implied_volatility?symbol=SPXW&expiration=${e}&start_date=${e}&end_date=${e}&right=P&interval=5m`],
      [`iv_${e}_C`, `option/history/greeks/implied_volatility?symbol=SPXW&expiration=${e}&start_date=${e}&end_date=${e}&right=C&interval=5m`],
      [`oi_${e}`,   `option/history/open_interest?symbol=SPXW&expiration=${e}&start_date=${anterior(e)}&end_date=${e}`],
    ]) {
      const f = `${DIR}/${nombre}.csv`;
      if (fs.existsSync(f) && fs.statSync(f).size > 2000) { ok++; bytes += fs.statSync(f).size; continue; }
      try {
        const r = await fetch(`${B}/${url}`, { signal: AbortSignal.timeout(300_000) });
        const t = await r.text();
        if (!r.ok || t.length < 2000) { mal++; continue; }
        fs.writeFileSync(f, t); ok++; bytes += t.length;
      } catch { mal++; }
    }
    if (ok % 60 === 0) console.log(`  ... ${ok} ficheros, ${(bytes / 1e9).toFixed(2)} GB`);
  }
}));
console.log(`\nlisto: ${ok} ficheros (${(bytes / 1e9).toFixed(2)} GB), ${mal} sin datos`);
