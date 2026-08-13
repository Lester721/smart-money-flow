// Baja la cadena de PUTS de HOOD, EOD con bid/ask reales, 2021-08 -> 2026-08.
// Un fichero por mes. 4 peticiones en paralelo (el maximo del plan Standard).
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.argv[2] + '/theta-hood';
const SYM = process.argv[3] || 'HOOD';
const DESDE = process.argv[4] || '2021-08';
fs.mkdirSync(DIR, { recursive: true });
const B = 'http://127.0.0.1:25503/v3';

const meses = [];
for (let y = 2021; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
  const k = `${y}-${String(m).padStart(2, '0')}`;
  if (k < DESDE || k > '2026-08') continue;
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  meses.push({ k, ini: `${k}-01`, fin });
}

async function pMap(items, n, fn) {
  const res = []; let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) { const k = i++; res[k] = await fn(items[k], k); }
  }));
  return res;
}

let ok = 0, vacios = 0;
await pMap(meses, 4, async (m) => {
  const f = path.join(DIR, `${SYM}_${m.k}.csv`);
  if (fs.existsSync(f) && fs.statSync(f).size > 200) { ok++; return; }
  const url = `${B}/option/history/eod?symbol=${SYM}&expiration=*&start_date=${m.ini}&end_date=${m.fin}&right=P`;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(600_000) });
      const t = await r.text();
      if (!r.ok || t.length < 200) { if (intento === 2) { vacios++; console.log('vacio', m.k, t.slice(0, 80)); } continue; }
      fs.writeFileSync(f, t); ok++;
      console.log(`  ${m.k}  ${(t.length / 1e6).toFixed(1)} MB  ${t.split('\n').length} filas`);
      return;
    } catch (e) { if (intento === 2) { vacios++; console.log('fallo', m.k, String(e).slice(0, 80)); } }
  }
});
console.log(`\nlisto: ${ok} meses, ${vacios} fallos`);
