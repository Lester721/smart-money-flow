import fs from 'node:fs';
const R = 'scripts/cache-theta', CAD = `${R}/cadenas`, NOCHE = `${R}/noche-2026-08-10`;
const INTRA = `${NOCHE}/theta-intra`;
const csv = p => { const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/); return { h: l[0].split(',').map(s => s.replace(/^"|"$/g, '')), rows: l.slice(1).map(x => x.split(',').map(s => s.replace(/^"|"$/g, ''))) }; };
const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };

// ── J. ¿la marca de tiempo es una FOTO o un agregado de 30 min?
console.log('\n## J · la marca de tiempo del intradia: foto o agregado\n');
{
  const fich = fs.readdirSync(INTRA).filter(f => /^QQQ_\d{4}-/.test(f)).sort();
  const porHora = new Map();
  for (const f of fich.filter((_, i) => i % 8 === 0)) {          // 1 de cada 8 para ir rapido
    const d = csv(`${INTRA}/${f}`);
    const iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
    for (const r of d.rows) {
      const hh = r[iT].slice(11, 16);
      const rec = porHora.get(hh) ?? { n: 0, cero: 0 };
      rec.n++; if (!(+r[iB] > 0)) rec.cero++;
      porHora.set(hh, rec);
    }
  }
  console.log('  % de cotizaciones con bid=0 por hora (una foto a las 09:30:00 pilla el mercado sin abrir):');
  console.log('  ' + [...porHora.entries()].sort().map(([h, r]) => `${h}:${(100 * r.cero / r.n).toFixed(0)}%`).join('  '));
}

// ── K. cruzar el 16:00 del intradia contra el EOD de cadenas/ (mismo dia, mismo strike)
console.log('\n## K · el 16:00 del intradia contra el EOD de cadenas/\n');
{
  const fich = fs.readdirSync(INTRA).filter(f => /^QQQ_\d{4}-/.test(f)).sort();
  let comp = 0, iguales = 0; const difs = [];
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
      const K = +r[iK], b = +r[iB], a = +r[iA];
      if (!(b > 0)) continue;
      const e = j[`${K}|P`]; if (!e) continue;
      comp++;
      if (Math.abs(e[0] - b) < 0.005 && Math.abs(e[1] - a) < 0.005) iguales++;
      else difs.push(Math.abs(e[0] - b));
    }
  }
  console.log(`  contratos comparados: ${comp} · bid/ask IDENTICOS: ${iguales} (${(100 * iguales / comp).toFixed(1)}%)`);
  if (difs.length) console.log(`  de los que difieren: dif mediana del bid $${q(difs, .5).toFixed(3)} · p90 $${q(difs, .9).toFixed(3)}`);
}

// ── L. precios-ajustados: el cociente ajustado/crudo, ¿es monotono como un ajuste por dividendo?
console.log('\n## L · precios-ajustados.json: cociente ajustado/crudo en el tiempo\n');
{
  const aj = JSON.parse(fs.readFileSync(`${NOCHE}/precios-ajustados.json`, 'utf8'));
  const oc = new Map(JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8')).map(x => [x.d, x.c]));
  const spy = new Map();
  for (const f of fs.readdirSync(R)) { if (!/^SPY_barsPAR_y_/.test(f)) continue; for (const x of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8'))) spy.set(x.time, x.close); }
  const mas4 = s => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 4); return d.toISOString().slice(0, 10); };
  for (const [T, px] of [['QQQ', oc], ['SPY', spy]]) {
    const rat = [];
    for (const x of aj[T]) { const c = px.get(mas4(x.d)); if (c != null) rat.push({ d: mas4(x.d), r: x.c / c }); }
    let baja = 0;
    for (let i = 1; i < rat.length; i++) if (rat[i].r < rat[i - 1].r - 1e-6) baja++;
    console.log(`  ${T}: n=${rat.length} · cociente ${rat[0].r.toFixed(4)} → ${rat[rat.length - 1].r.toFixed(4)} · pasos que BAJAN: ${baja} (${(100 * baja / (rat.length - 1)).toFixed(0)}%)`);
    console.log(`     muestra: ${rat.filter((_, i) => i % 40 === 0).map(x => x.d.slice(0, 7) + '=' + x.r.toFixed(4)).join(' ')}`);
    const anual = (rat[rat.length - 1].r / rat[0].r) ** (365 / ((Date.parse(rat[rat.length - 1].d) - Date.parse(rat[0].d)) / 86400000)) - 1;
    console.log(`     dividendo implicito: ${(100 * anual).toFixed(2)}%/año`);
  }
}

// ── M. horas disponibles: ¿la meseta 11:00-15:00 esta cubierta en TODOS los viernes?
console.log('\n## M · cobertura por hora en los 316 viernes\n');
{
  const fich = fs.readdirSync(INTRA).filter(f => /^QQQ_\d{4}-/.test(f)).sort();
  const cnt = new Map();
  for (const f of fich) {
    const d = csv(`${INTRA}/${f}`);
    const iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid');
    const hs = new Set();
    for (const r of d.rows) if (+r[iB] > 0) hs.add(r[iT].slice(11, 16));
    for (const h of hs) cnt.set(h, (cnt.get(h) ?? 0) + 1);
  }
  console.log('  viernes con AL MENOS una cotizacion viva a esa hora (de 316):');
  console.log('  ' + [...cnt.entries()].sort().map(([h, n]) => `${h}:${n}`).join('  '));
}
