// INVENTARIO para la mezcla "mitad QQQ comprado + mitad vendiendo put semanal 3% OTM a media
// sesion". No mide la estrategia: solo dice QUE DATO EXISTE, abriendo los ficheros.
import fs from 'node:fs';
import path from 'node:path';

const R = 'scripts/cache-theta';
const CAD = `${R}/cadenas`;
const NOCHE = `${R}/noche-2026-08-10`;
const INTRA = `${NOCHE}/theta-intra`;
const GRIEG = `${NOCHE}/theta-griegas`;

const pad = (s, n) => String(s).padEnd(n);
const num = (x, d = 1) => (x == null ? 'n/d' : Number(x).toFixed(d));

// ─────────────────────────────────────────────────────────────────────────────
// 1. cadenas/ : dias por año y estructura de vencimientos, ABRIENDO ficheros
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## 1 · cadenas/ (EOD, un dato por dia)\n');
const arch = fs.readdirSync(CAD);
for (const T of ['QQQ', 'SPY']) {
  const dias = arch.filter(f => f.startsWith(`${T}_d`) && f.endsWith('.json'))
    .map(f => f.slice(T.length + 2, T.length + 10)).sort();
  const porAño = new Map();
  for (const d of dias) porAño.set(d.slice(0, 4), (porAño.get(d.slice(0, 4)) ?? 0) + 1);
  console.log(`${T}: ${dias.length} dias · ${dias[0]} → ${dias[dias.length - 1]}`);
  console.log('   ' + [...porAño.entries()].sort().map(([a, n]) => `${a}:${n}`).join(' '));
  // abrir una muestra de dias repartida y mirar vencimientos + strikes reales
  const muestra = [0, 0.2, 0.4, 0.6, 0.8, 0.99].map(f => dias[Math.floor(f * (dias.length - 1))]);
  let vacios = 0;
  for (const d of muestra) {
    const j = JSON.parse(fs.readFileSync(`${CAD}/${T}_d${d}.json`, 'utf8'));
    const exps = Object.keys(j).sort();
    const nC = exps.reduce((a, k) => a + Object.keys(j[k]).length, 0);
    // ¿hay vencimiento a 5-9 dias (el semanal siguiente)?
    const dd = (a, b) => (Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) -
      Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000;
    const sem = exps.filter(e => dd(d, e) >= 5 && dd(d, e) <= 9);
    if (!nC) vacios++;
    console.log(`   ${d}: ${exps.length} vencimientos, ${nC} contratos | venc a 5-9d: ${sem.join(',') || 'NINGUNO'}`);
  }
  if (vacios) console.log(`   !! ${vacios} de la muestra estaban VACIOS`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. ¿EOD o intradia? theta-intra
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## 2 · theta-intra/ (cotizacion cada 30 min)\n');
const fIntra = fs.existsSync(INTRA) ? fs.readdirSync(INTRA).filter(f => /^QQQ_\d{4}-\d\d-\d\d_\d{4}-\d\d-\d\d\.csv$/.test(f)).sort() : [];
console.log(`QQQ: ${fIntra.length} ficheros · ${fIntra[0]} → ${fIntra[fIntra.length - 1]}`);
const fSpy = fs.existsSync(INTRA) ? fs.readdirSync(INTRA).filter(f => f.startsWith('SPY')) : [];
console.log(`SPY intradia de opciones: ${fSpy.length} ficheros ${fSpy.length ? '' : '→ NO HAY'}`);

const csv = p => {
  const l = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const h = l[0].split(',').map(s => s.replace(/^"|"$/g, ''));
  return { h, rows: l.slice(1).map(x => x.split(',').map(s => s.replace(/^"|"$/g, ''))) };
};

// spot a las 12:00
const spot12 = new Map();       // fechaYmd -> precio
const horasSpot = new Map();
for (const f of (fs.existsSync(GRIEG) ? fs.readdirSync(GRIEG) : [])) {
  const { h, rows } = csv(`${GRIEG}/${f}`);
  const iT = h.indexOf('timestamp'), iC = h.indexOf('close');
  for (const r of rows) {
    const hh = r[iT].slice(11, 16);
    horasSpot.set(hh, (horasSpot.get(hh) ?? 0) + 1);
    if (hh === '12:00') spot12.set(r[iT].slice(0, 10), +r[iC]);
  }
}
console.log(`\nspot 30m (theta-griegas, underlying_price): ${fs.readdirSync(GRIEG).length} viernes · con dato a 12:00: ${spot12.size}`);
console.log('   horas presentes: ' + [...horasSpot.keys()].sort().join(' '));

// ─────────────────────────────────────────────────────────────────────────────
// 3. ¿hay put ~3% OTM con bid>0 a las 12:00? Semana a semana.
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## 3 · la put del 3% a las 12:00, viernes a viernes\n');
const OTM = 0.03, HORA = '12:00';
const filas = [];
const fallos = { sinCsv: 0, sinHora: 0, sinSpot: 0, rejilla: 0, sinBid: 0 };
for (const f of fIntra) {
  const [, fecha, exp] = f.replace('.csv', '').split('_');
  let d;
  try { d = csv(`${INTRA}/${f}`); } catch { fallos.sinCsv++; continue; }
  const iK = d.h.indexOf('strike'), iT = d.h.indexOf('timestamp'), iB = d.h.indexOf('bid'), iA = d.h.indexOf('ask');
  if (iK < 0 || iT < 0 || iB < 0 || iA < 0) { fallos.sinCsv++; continue; }
  const cad = [];
  let hayHora = false;
  for (const r of d.rows) {
    if (r[iT]?.slice(11, 16) !== HORA) continue;
    hayHora = true;
    const b = +r[iB], a = +r[iA], k = +r[iK];
    cad.push({ k, b, a });
  }
  if (!hayHora) { fallos.sinHora++; continue; }
  const S = spot12.get(fecha);
  if (!(S > 0)) { fallos.sinSpot++; continue; }
  const obj = S * (1 - OTM);
  let mejor = null, dif = Infinity;
  for (const c of cad) { if (c.k > S) continue; const x = Math.abs(c.k - obj); if (x < dif) { dif = x; mejor = c; } }
  if (!mejor || dif > S * 0.01) { fallos.rejilla++; continue; }
  const conBid = mejor.b > 0 && mejor.a > 0 && mejor.a >= mejor.b;
  if (!conBid) fallos.sinBid++;
  filas.push({
    fecha, exp, spot: S, strike: mejor.k, bid: mejor.b, ask: mejor.a,
    otmReal: (S - mejor.k) / S, ok: conBid,
    horq: conBid ? (mejor.a - mejor.b) / ((mejor.a + mejor.b) / 2) : null,
    // strike "raro" (adjusted): decimales que no son .0 ni .5
    raro: Math.abs(mejor.k - Math.round(mejor.k * 2) / 2) > 1e-6,
  });
}
const usables = filas.filter(x => x.ok);
console.log(`viernes con fichero: ${fIntra.length}`);
console.log(`  descartados → sin csv/columnas ${fallos.sinCsv} · sin la hora 12:00 ${fallos.sinHora} · sin spot ${fallos.sinSpot} · rejilla de strikes lejos ${fallos.rejilla}`);
console.log(`  con strike colocado: ${filas.length} · de esos, con bid>0 y ask>=bid: ${usables.length} (${(100 * usables.length / fIntra.length).toFixed(1)}% de los viernes)`);
const raros = usables.filter(x => x.raro);
console.log(`  strikes NO estandar (decimal raro, contrato ajustado): ${raros.length}`);
if (raros.length) console.log('    ' + raros.slice(0, 8).map(x => `${x.fecha}:${x.strike}`).join(' '));

const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(p * (a.length - 1))]; };
const prim = usables.map(x => x.bid);
const horqs = usables.map(x => x.horq);
console.log(`  prima (bid) $: min ${num(Math.min(...prim), 2)} · p25 ${num(q(prim, .25), 2)} · mediana ${num(q(prim, .5), 2)} · p75 ${num(q(prim, .75), 2)} · max ${num(Math.max(...prim), 2)}`);
console.log(`  horquilla rel: mediana ${(100 * q(horqs, .5)).toFixed(1)}% · p90 ${(100 * q(horqs, .9)).toFixed(1)}%`);
console.log(`  OTM real: mediana ${(100 * q(usables.map(x => x.otmReal), .5)).toFixed(2)}%`);

console.log('\n  por año:');
const años = [...new Set(fIntra.map(f => f.split('_')[1].slice(0, 4)))].sort();
for (const a of años) {
  const tot = fIntra.filter(f => f.split('_')[1].startsWith(a)).length;
  const u = usables.filter(x => x.fecha.startsWith(a));
  const p = u.map(x => x.bid);
  console.log(`   ${a}: ${pad(tot, 3)} viernes en disco · ${pad(u.length, 3)} usables (${pad((100 * u.length / tot).toFixed(0) + '%', 5)}) · prima mediana $${p.length ? num(q(p, .5), 2) : 'n/d'} · horq mediana ${p.length ? (100 * q(u.map(x => x.horq), .5)).toFixed(1) + '%' : 'n/d'}`);
}

// ¿existe la cotizacion del VENCIMIENTO para recomprar? theta-venc
console.log('\n## 4 · cierre del vencimiento (para recomprar)\n');
const VENC = `${NOCHE}/theta-venc`;
const fv = fs.existsSync(VENC) ? fs.readdirSync(VENC).filter(f => f.startsWith('QQQ')) : [];
console.log(`theta-venc: ${fv.length} ficheros (QQQ, puts, EOD del dia de vencimiento)`);
{
  const ej = fv[Math.floor(fv.length / 2)];
  const d = csv(`${VENC}/${ej}`);
  console.log(`   ejemplo ${ej}: ${d.rows.length} filas · columnas: ${d.h.join(',')}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. la pata comprada: cierres y dividendos
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## 5 · la pata comprada de QQQ\n');
const cierres = JSON.parse(fs.readFileSync(`${R}/cierres/QQQ.json`, 'utf8'));
const ck = Object.keys(cierres).sort();
console.log(`cierres/QQQ.json: ${ck.length} dias · ${ck[0]} → ${ck[ck.length - 1]}  (CRUDOS, sin dividendos)`);
const oc = JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8'));
console.log(`qqq-oc.json: ${oc.length} dias · ${oc[0].d} → ${oc[oc.length - 1].d}  (open+close CRUDOS)`);
const aj = JSON.parse(fs.readFileSync(`${NOCHE}/precios-ajustados.json`, 'utf8'));
for (const t of ['QQQ', 'SPY']) console.log(`precios-ajustados.json ${t}: ${aj[t].length} puntos SEMANALES · ${aj[t][0].d} → ${aj[t][aj[t].length - 1].d}`);
// ¿el ajustado esta desplazado? comparar contra el cierre crudo del mismo dia y del viernes+4
{
  const inv = new Map();
  for (const [d, c] of Object.entries(cierres)) inv.set(c.toFixed(2), `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`);
  let igualMismoDia = 0, igualMas4 = 0, n = 0;
  for (const x of aj.QQQ.slice(-40)) {
    const c = cierres[x.d.replace(/-/g, '')];
    n++;
    if (c != null && Math.abs(c - x.c) < 0.005) igualMismoDia++;
    const hit = inv.get(x.c.toFixed(2));
    if (hit) { const dd = (Date.parse(hit) - Date.parse(x.d)) / 86400000; if (dd === 4) igualMas4++; }
  }
  console.log(`   de los ultimos ${n}: coinciden con el cierre crudo del MISMO dia ${igualMismoDia} · con el del dia +4 ${igualMas4}`);
}
// dividendos declarados en algun sitio?
const posibles = ['dividendos', 'dividend', 'div'];
const enc = [];
const walk = (dir, prof = 0) => {
  if (prof > 2) return;
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const x of e) {
    if (x.isDirectory()) walk(path.join(dir, x.name), prof + 1);
    else if (posibles.some(p => x.name.toLowerCase().includes(p))) enc.push(path.join(dir, x.name));
  }
};
walk(R);
console.log(`   ficheros de dividendos en cache-theta: ${enc.length ? enc.join(', ') : 'NINGUNO'}`);

// ─────────────────────────────────────────────────────────────────────────────
// 6. mitades
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n## 6 · partir la muestra\n');
const fs_ = usables.map(x => x.fecha).sort();
const mitad = fs_[Math.floor(fs_.length / 2)];
console.log(`viernes usables: ${fs_.length} · ${fs_[0]} → ${fs_[fs_.length - 1]}`);
console.log(`   1a mitad: ${fs_[0]} → ${mitad} (${fs_.filter(d => d <= mitad).length})`);
console.log(`   2a mitad: ${mitad} → ${fs_[fs_.length - 1]} (${fs_.filter(d => d > mitad).length})`);
const añosC = {};
for (const d of fs_) añosC[d.slice(0, 4)] = (añosC[d.slice(0, 4)] ?? 0) + 1;
console.log('   por año: ' + Object.entries(añosC).map(([a, n]) => `${a}:${n}`).join(' '));

fs.writeFileSync('scripts/cache-theta/_inv-mezcla-filas.json', JSON.stringify(filas));
console.log('\nfilas guardadas en scripts/cache-theta/_inv-mezcla-filas.json');
