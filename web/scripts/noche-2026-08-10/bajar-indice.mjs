// Baja SOLO lo que hace falta para el indice PUT: la cadena del dia de rolo, para la
// expiracion mensual siguiente. Puts Y calls (las calls hacen falta para sacar el tipo de
// interes por paridad, sin tener que suponerlo).
//
// ~80 peticiones por ticker en vez de bajar años enteros de cadena.
import fs from 'node:fs';
const S = process.argv[2], SYM = process.argv[3] || 'SPY';
const DIR = S + '/theta-idx'; fs.mkdirSync(DIR, { recursive: true });
const B = 'http://127.0.0.1:25503/v3';

// terceros viernes 2020-2026
const viernes = [];
for (let y = 2020; y <= 2026; y++) for (let m = 0; m < 12; m++) {
  const d = new Date(Date.UTC(y, m, 1)); let n = 0;
  while (true) { if (d.getUTCDay() === 5) { n++; if (n === 3) break; } d.setUTCDate(d.getUTCDate() + 1); }
  viernes.push(d.toISOString().slice(0, 10));
}
const pares = [];
for (let i = 0; i < viernes.length - 1; i++) pares.push({ rolo: viernes[i], exp: viernes[i + 1] });

async function pMap(items, n, fn) { let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } })); }

let ok = 0, mal = 0;
await pMap(pares, 4, async (p) => {
  for (const right of ['P', 'C']) {
    const f = `${DIR}/${SYM}_${p.rolo}_${p.exp}_${right}.csv`;
    if (fs.existsSync(f) && fs.statSync(f).size > 300) { ok++; continue; }
    const url = `${B}/option/history/eod?symbol=${SYM}&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.rolo}&right=${right}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      const t = await r.text();
      if (!r.ok || t.length < 300) { mal++; continue; }
      fs.writeFileSync(f, t); ok++;
    } catch { mal++; }
  }
});
console.log(`${SYM}: ${ok} ficheros, ${mal} sin datos`);
