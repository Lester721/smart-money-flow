import fs from 'node:fs';
const R = 'scripts/cache-theta', NOCHE = `${R}/noche-2026-08-10`;
const INTRA = `${NOCHE}/theta-intra`, VENC = `${NOCHE}/theta-venc`, CAD = `${R}/cadenas`;
const csv = p => { const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/); return { h: l[0].split(',').map(s => s.replace(/^"|"$/g, '')), rows: l.slice(1).map(x => x.split(',').map(s => s.replace(/^"|"$/g, ''))) }; };

// ── A. ¿que viernes FALTAN de la rejilla +7 dias?
console.log('\n## A · huecos en la rejilla de viernes\n');
const rej = []; { const d = new Date(Date.UTC(2020, 0, 3)); while (d < new Date(Date.UTC(2026, 7, 1))) { rej.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const pares = rej.slice(0, -1);
const hay = new Set(fs.readdirSync(INTRA).filter(f => f.startsWith('QQQ_')).map(f => f.split('_')[1]));
const faltan = pares.filter(d => !hay.has(d));
console.log(`rejilla de entradas posibles: ${pares.length} · con fichero: ${hay.size} · FALTAN: ${faltan.length}`);
console.log('  ' + faltan.join(' '));
// ¿son festivos? mirar si ese dia hay cierre de QQQ
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
const dias = new Set(oc.map(x => x.d));
const festivo = faltan.filter(d => !dias.has(d)), habil = faltan.filter(d => dias.has(d));
console.log(`  de los que faltan: ${festivo.length} el mercado estaba CERRADO · ${habil.length} eran dia habil → hueco de datos`);
if (habil.length) console.log('  habiles sin dato: ' + habil.join(' '));

// ── B. theta-venc: ¿cubre los vencimientos de los 316 viernes?
console.log('\n## B · datos para RECOMPRAR al vencimiento\n');
const filas = JSON.parse(fs.readFileSync(`${R}/_inv-mezcla-filas.json`, 'utf8'));
const fvenc = new Set(fs.readdirSync(VENC).filter(f => f.startsWith('QQQ')).map(f => f.split('_')[1].replace('_P.csv', '').replace('.csv', '')));
let conVenc = 0, conStrike = 0, sinNada = [];
for (const x of filas) {
  const f = `${VENC}/QQQ_${x.exp}_P.csv`;
  if (!fs.existsSync(f)) { sinNada.push(x.exp); continue; }
  conVenc++;
  const d = csv(f);
  const iK = d.h.indexOf('strike'), iA = d.h.indexOf('ask'), iB = d.h.indexOf('bid');
  const r = d.rows.find(r => Math.abs(+r[iK] - x.strike) < 1e-6);
  if (r && +r[iA] > 0 && +r[iA] >= +r[iB]) conStrike++;
}
console.log(`de ${filas.length} operaciones: fichero del vencimiento ${conVenc} · CON el strike exacto y ask>0 ${conStrike} (${(100 * conStrike / filas.length).toFixed(1)}%)`);
if (sinNada.length) console.log(`  vencimientos sin fichero: ${sinNada.length} → ${sinNada.slice(0, 10).join(' ')}`);

// ── C. cierre del subyacente el dia del vencimiento
const cierreDia = new Map(oc.map(x => [x.d, x.c]));
const sinCierre = filas.filter(x => !cierreDia.has(x.exp));
console.log(`cierre de QQQ el dia del vencimiento: ${filas.length - sinCierre.length}/${filas.length} · faltan ${sinCierre.length} ${sinCierre.length ? '→ ' + sinCierre.map(x => x.exp).join(' ') : ''}`);
// cuantas acaban dentro del dinero
const conC = filas.filter(x => cierreDia.has(x.exp));
const itm = conC.filter(x => cierreDia.get(x.exp) < x.strike);
console.log(`  acaban DENTRO del dinero: ${itm.length}/${conC.length} (${(100 * itm.length / conC.length).toFixed(1)}%) → esas hay que recomprarlas`);

// ── D. precios-ajustados: ¿que desfase tiene?
console.log('\n## D · precios-ajustados.json — convencion de fecha\n');
const aj = JSON.parse(fs.readFileSync(`${NOCHE}/precios-ajustados.json`, 'utf8'));
const ocm = new Map(oc.map(x => [x.d, x.c]));
const ymd = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// rendimientos semanales del ajustado vs los del crudo desplazado k dias
const rAj = []; for (let i = 1; i < aj.QQQ.length; i++) rAj.push({ d: aj.QQQ[i].d, r: aj.QQQ[i].c / aj.QQQ[i - 1].c - 1 });
for (const k of [0, 1, 2, 3, 4, 5, -3]) {
  const xs = [], ys = [];
  for (let i = 1; i < aj.QQQ.length; i++) {
    const a = ocm.get(ymd(aj.QQQ[i - 1].d, k)), b = ocm.get(ymd(aj.QQQ[i].d, k));
    if (a == null || b == null) continue;
    xs.push(b / a - 1); ys.push(rAj[i - 1].r);
  }
  const m = a => a.reduce((x, y) => x + y, 0) / a.length;
  const mx = m(xs), my = m(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < xs.length; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  console.log(`  desfase +${k}d: n=${xs.length} · corr con el crudo = ${(sxy / Math.sqrt(sxx * syy)).toFixed(4)}`);
}
// dividendo implicito: retorno ajustado - retorno crudo, al desfase que gane
console.log('\n## E · el dividendo, extraido del propio fichero\n');
{
  const k = 4;
  let extra = 0, n = 0, meses = new Map();
  for (let i = 1; i < aj.QQQ.length; i++) {
    const a = ocm.get(ymd(aj.QQQ[i - 1].d, k)), b = ocm.get(ymd(aj.QQQ[i].d, k));
    if (a == null || b == null) continue;
    const d = (aj.QQQ[i].c / aj.QQQ[i - 1].c) - (b / a);
    if (d > 0.0005) { meses.set(aj.QQQ[i].d, (d * 100).toFixed(3) + '%'); }
    extra += d; n++;
  }
  console.log(`  exceso acumulado del ajustado sobre el crudo en ${n} semanas: ${(100 * extra).toFixed(2)} pts`);
  console.log(`  semanas con salto >0,05% (dividendos): ${meses.size} · ${[...meses.entries()].slice(0, 8).map(([d, v]) => d + '=' + v).join(' ')}`);
}

// ── F. cadenas/: la put semanal a 3% AL CIERRE, cobertura por año (para comparar con las 12:00)
console.log('\n## F · la misma put pero AL CIERRE, desde cadenas/ (2016-2026)\n');
const cierres = JSON.parse(fs.readFileSync(`${R}/cierres/QQQ.json`, 'utf8'));
const arch = new Set(fs.readdirSync(CAD));
const dd = (a, b) => (Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000;
const porAño = new Map();
const todos = [...arch].filter(f => f.startsWith('QQQ_d')).map(f => f.slice(5, 13)).sort();
for (const d of todos) {
  const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)));
  if (dt.getUTCDay() !== 5) continue;                       // solo viernes
  const a = d.slice(0, 4);
  const rec = porAño.get(a) ?? { v: 0, spot: 0, exp: 0, bid: 0 };
  rec.v++;
  const S = cierres[d];
  if (S == null) { porAño.set(a, rec); continue; }
  rec.spot++;
  const j = JSON.parse(fs.readFileSync(`${CAD}/QQQ_d${d}.json`, 'utf8'));
  const exps = Object.keys(j).filter(e => dd(d, e) === 7);
  if (!exps.length) { porAño.set(a, rec); continue; }
  rec.exp++;
  const obj = S * 0.97;
  let mejor = null, dif = Infinity;
  for (const key of Object.keys(j[exps[0]])) {
    const [k, r] = key.split('|'); if (r !== 'P') continue;
    const K = +k; if (K > S) continue;
    const x = Math.abs(K - obj); if (x < dif) { dif = x; mejor = [K, j[exps[0]][key]]; }
  }
  if (mejor && dif <= S * 0.01 && mejor[1][0] > 0) rec.bid++;
  porAño.set(a, rec);
}
console.log('   año  viernes  con-cierre  con-venc-7d  con-put-3%-bid>0');
for (const [a, r] of [...porAño.entries()].sort()) console.log(`   ${a}   ${String(r.v).padStart(4)}     ${String(r.spot).padStart(5)}       ${String(r.exp).padStart(5)}        ${String(r.bid).padStart(5)}`);
