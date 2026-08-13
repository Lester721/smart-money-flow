// Cadenas semanales al dinero: cada viernes, la expiracion del viernes siguiente.
// Puts y calls (las calls para sacar el tipo por paridad).
import fs from 'node:fs';
const S = process.argv[2], SYM = process.argv[3] || 'QQQ';
const DIR = S + '/theta-sem'; fs.mkdirSync(DIR, { recursive: true });
const B = 'http://127.0.0.1:25503/v3';

const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const pares = viernes.slice(0, -1).map((r, i) => ({ rolo: r, exp: viernes[i + 1] }));

async function pMap(items, n, fn) { let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]); })); }

let ok = 0, mal = 0;
await pMap(pares, 4, async (p) => {
  for (const right of ['P', 'C']) {
    const f = `${DIR}/${SYM}_${p.rolo}_${p.exp}_${right}.csv`;
    if (fs.existsSync(f) && fs.statSync(f).size > 300) { ok++; continue; }
    try {
      const r = await fetch(`${B}/option/history/eod?symbol=${SYM}&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.rolo}&right=${right}`,
        { signal: AbortSignal.timeout(120_000) });
      const t = await r.text();
      if (!r.ok || t.length < 300) { mal++; continue; }
      fs.writeFileSync(f, t); ok++;
    } catch { mal++; }
  }
});
console.log(`${SYM} semanal: ${ok} ficheros, ${mal} sin datos (festivos y semanas sin expiracion el viernes)`);
