import fs from 'node:fs';
const R = 'scripts/cache-theta', CAD = `${R}/cadenas`, NOCHE = `${R}/noche-2026-08-10`, INTRA = `${NOCHE}/theta-intra`;
const csv = p => { const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/); return { h: l[0].split(',').map(s => s.replace(/^"|"$/g, '')), rows: l.slice(1).map(x => x.split(',').map(s => s.replace(/^"|"$/g, ''))) }; };
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874;

// ── N. signo de la diferencia EOD vs 16:00
console.log('\n## N · EOD de cadenas/ menos la foto de las 16:00 — ¿hacia donde?\n');
{
  const fich = fs.readdirSync(INTRA).filter(f => /^QQQ_\d{4}-/.test(f)).sort();
  const dB = [], dA = [], rel = [];
  for (const f of fich.filter((_, i) => i % 5 === 0)) {
    const [, fecha, exp] = f.replace('.csv', '').split('_');
    const p = `${CAD}/QQQ_d${fecha.replace(/-/g, '')}.json`;
    if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'))[exp.replace(/-/g, '')];
    if (!j) continue;
    const d = csv(`${INTRA}/${f}`);
    const iT = d.h.indexOf('timestamp'), iK = d.h.indexOf('strike'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
    for (const r of d.rows) {
      if (r[iT].slice(11, 16) !== '16:00') continue;
      const K = +r[iK], b = +r[iB], a = +r[iA]; if (!(b > 0)) continue;
      const e = j[`${K}|P`]; if (!e) continue;
      dB.push(e[0] - b); dA.push(e[1] - a); rel.push((e[0] - b) / b);
    }
  }
  const m = a => a.reduce((x, y) => x + y, 0) / a.length;
  console.log(`  n=${dB.length} · bid EOD − bid 16:00: media $${m(dB).toFixed(3)} · mediana $${q(dB, .5).toFixed(3)} · p10 $${q(dB, .1).toFixed(3)} · p90 $${q(dB, .9).toFixed(3)}`);
  console.log(`             ask EOD − ask 16:00: media $${m(dA).toFixed(3)} · mediana $${q(dA, .5).toFixed(3)}`);
  console.log(`  → las dos rutas NO son el mismo instante; no se pueden mezclar sin decirlo.`);
}

// ── O. el tamaño: colateral de UNA put de QQQ contra la cuenta
console.log('\n## O · el tamaño real: una put de QQQ contra $56.389 / $7.977 en efectivo\n');
{
  const filas = JSON.parse(fs.readFileSync(`${R}/_inv-mezcla-filas.json`, 'utf8')).filter(x => x.ok);
  const col = filas.map(x => x.strike * 100);
  console.log(`  colateral (strike×100) de 1 contrato: primero $${col[0].toLocaleString('es')} (${filas[0].fecha}) · ultimo $${col[col.length - 1].toLocaleString('es')} (${filas[filas.length - 1].fecha})`);
  console.log(`     mediana $${q(col, .5).toLocaleString('es')} · maximo $${Math.max(...col).toLocaleString('es')}`);
  const sobrePoder = col.filter(c => c > PODER).length;
  console.log(`  semanas en que 1 contrato ya no cabe en el PODER DE COMPRA ($${PODER.toLocaleString('es')}): ${sobrePoder} de ${col.length}`);
  console.log(`  semanas en que 1 contrato no cabe en EFECTIVO ($${EFECTIVO.toLocaleString('es')}): ${col.filter(c => c > EFECTIVO).length} de ${col.length}  → cash-secured es IMPOSIBLE en todas`);
  // la prima de 1 contrato en $/año
  const prim = filas.map(x => x.bid * 100);
  console.log(`  prima bruta de 1 contrato: mediana $${q(prim, .5).toFixed(0)} · ~48 semanas/año → $${(q(prim, .5) * 48).toFixed(0)}/año brutos = ${(100 * q(prim, .5) * 48 / CUENTA).toFixed(1)}% de la cuenta`);
  console.log(`  "mitad del capital" = $${(CUENTA / 2).toLocaleString('es')} → a QQQ de hoy (~$${(filas[filas.length - 1].spot).toFixed(0)}) son ${(CUENTA / 2 / filas[filas.length - 1].spot).toFixed(0)} acciones`);
  console.log(`  la otra mitad NO alcanza para el colateral de 1 put: $${(CUENTA / 2).toLocaleString('es')} contra $${col[col.length - 1].toLocaleString('es')}`);
}

// ── P. ¿esta viva la Terminal de ThetaData? (para saber si se puede bajar lo que falta)
console.log('\n## P · ¿se puede bajar lo que falta ahora mismo?\n');
{
  const B = process.env.THETA_BASE || 'http://127.0.0.1:25503';
  try {
    const r = await fetch(`${B}/v3/stock/history/eod?symbol=QQQ&start_date=2026-08-05&end_date=2026-08-06`, { signal: AbortSignal.timeout(8000) });
    const t = await r.text();
    console.log(`  Terminal ThetaData en ${B}: HTTP ${r.status} · ${t.slice(0, 120).replace(/\n/g, ' | ')}`);
  } catch (e) { console.log(`  Terminal ThetaData en ${B}: NO RESPONDE (${e.name}) → hoy no se puede bajar nada nuevo`); }
}
