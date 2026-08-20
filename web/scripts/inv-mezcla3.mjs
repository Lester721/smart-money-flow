import fs from 'node:fs';
const R = 'scripts/cache-theta', CAD = `${R}/cadenas`, NOCHE = `${R}/noche-2026-08-10`;

// cierres crudos 2016-2026 desde barsPAR
const cierre = new Map();
for (const f of fs.readdirSync(R)) {
  if (!/^QQQ_barsPAR_y_\d+_\d+\.json$/.test(f)) continue;
  for (const x of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8'))) cierre.set(x.time.replace(/-/g, ''), x.close);
}
const cSpy = new Map();
for (const f of fs.readdirSync(R)) {
  if (!/^SPY_barsPAR_y_\d+_\d+\.json$/.test(f)) continue;
  for (const x of JSON.parse(fs.readFileSync(`${R}/${f}`, 'utf8'))) cSpy.set(x.time.replace(/-/g, ''), x.close);
}
const ks = [...cierre.keys()].sort();
console.log(`\n## cierres crudos QQQ (barsPAR): ${ks.length} dias · ${ks[0]} → ${ks[ks.length - 1]}`);
const kS = [...cSpy.keys()].sort();
console.log(`## cierres crudos SPY (barsPAR): ${kS.length} dias · ${kS[0]} → ${kS[kS.length - 1]}`);

const dd = (a, b) => (Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6)) - Date.UTC(+a.slice(0, 4), +a.slice(4, 6) - 1, +a.slice(6))) / 86400000;

console.log('\n## G · ruta EOD (cadenas/) 2016-2026 · viernes con put semanal 3% OTM y bid>0\n');
for (const T of ['QQQ', 'SPY']) {
  const px = T === 'QQQ' ? cierre : cSpy;
  const dias = fs.readdirSync(CAD).filter(f => f.startsWith(`${T}_d`)).map(f => f.slice(T.length + 2, T.length + 10)).sort();
  const porAño = new Map();
  const bids = [], horqs = [];
  for (const d of dias) {
    const dt = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6)));
    if (dt.getUTCDay() !== 5) continue;
    const a = d.slice(0, 4);
    const r = porAño.get(a) ?? { v: 0, px: 0, exp7: 0, exp5a9: 0, ok: 0 };
    r.v++;
    const S = px.get(d);
    if (S != null) r.px++;
    let j; try { j = JSON.parse(fs.readFileSync(`${CAD}/${T}_d${d}.json`, 'utf8')); } catch { porAño.set(a, r); continue; }
    const e7 = Object.keys(j).filter(e => dd(d, e) === 7);
    const e59 = Object.keys(j).filter(e => dd(d, e) >= 5 && dd(d, e) <= 9).sort();
    if (e7.length) r.exp7++;
    if (e59.length) r.exp5a9++;
    if (S == null || !e59.length) { porAño.set(a, r); continue; }
    const exp = e7.length ? e7[0] : e59[e59.length - 1];
    const obj = S * 0.97;
    let mejor = null, dif = Infinity;
    for (const key of Object.keys(j[exp])) {
      const [k, rr] = key.split('|'); if (rr !== 'P') continue;
      const K = +k; if (K > S) continue;
      const x = Math.abs(K - obj); if (x < dif) { dif = x; mejor = [K, j[exp][key]]; }
    }
    if (mejor && dif <= S * 0.01 && mejor[1][0] > 0) {
      r.ok++;
      bids.push(mejor[1][0]);
      horqs.push((mejor[1][1] - mejor[1][0]) / ((mejor[1][0] + mejor[1][1]) / 2));
    }
    porAño.set(a, r);
  }
  console.log(`### ${T}`);
  console.log('   año  viernes  con-cierre  venc-exacto-7d  venc-5a9d  put-3%-bid>0');
  for (const [a, r] of [...porAño.entries()].sort())
    console.log(`   ${a}   ${String(r.v).padStart(4)}     ${String(r.px).padStart(5)}        ${String(r.exp7).padStart(5)}         ${String(r.exp5a9).padStart(5)}       ${String(r.ok).padStart(5)}`);
  const q = (arr, p) => { const s = [...arr].sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1))]; };
  if (bids.length) console.log(`   prima al cierre: mediana $${q(bids, .5).toFixed(2)} · horquilla mediana ${(100 * q(horqs, .5)).toFixed(1)}%`);
}

// ── los 13 viernes habiles "sin dato": ¿por que?
console.log('\n## H · los 13 viernes habiles sin fichero intradia — el porque\n');
const habiles = ['2020-04-03', '2020-06-26', '2020-12-18', '2021-03-26', '2021-12-17', '2022-04-08', '2023-03-31', '2024-03-22', '2025-04-11', '2025-06-27', '2026-03-27', '2026-06-12', '2026-06-26'];
for (const f of habiles) {
  const d = f.replace(/-/g, '');
  const exp7 = new Date(f + 'T00:00:00Z'); exp7.setUTCDate(exp7.getUTCDate() + 7);
  const e7 = exp7.toISOString().slice(0, 10).replace(/-/g, '');
  const p = `${CAD}/QQQ_d${d}.json`;
  if (!fs.existsSync(p)) { console.log(`  ${f}: sin cadena EOD tampoco`); continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const e59 = Object.keys(j).filter(e => dd(d, e) >= 3 && dd(d, e) <= 9).sort();
  console.log(`  ${f}: venc +7d (${e7}) ${e7 in j ? 'SI existe' : 'NO EXISTE'} · vencimientos a 3-9 dias: ${e59.join(',') || 'ninguno'} · mercado abierto el +7: ${cierre.has(e7) ? 'si' : 'NO (festivo)'}`);
}

// ── dividendos: los saltos grandes, ¿caen en fechas ex-dividendo de QQQ?
console.log('\n## I · el "exceso" del fichero ajustado: ¿son dividendos?\n');
{
  const aj = JSON.parse(fs.readFileSync(`${NOCHE}/precios-ajustados.json`, 'utf8'));
  const oc = new Map(JSON.parse(fs.readFileSync(`${NOCHE}/qqq-oc.json`, 'utf8')).map(x => [x.d, x.c]));
  const mas4 = s => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 4); return d.toISOString().slice(0, 10); };
  const ex = [];
  for (let i = 1; i < aj.QQQ.length; i++) {
    const a = oc.get(mas4(aj.QQQ[i - 1].d)), b = oc.get(mas4(aj.QQQ[i].d));
    if (a == null || b == null) continue;
    ex.push({ d: mas4(aj.QQQ[i].d), e: (aj.QQQ[i].c / aj.QQQ[i - 1].c) - (b / a) });
  }
  ex.sort((x, y) => y.e - x.e);
  console.log('  las 12 semanas de mayor exceso (fecha del viernes de cierre):');
  console.log('   ' + ex.slice(0, 12).map(x => `${x.d}:${(100 * x.e).toFixed(2)}%`).join('  '));
  const mes = new Map();
  for (const x of ex.slice(0, 30)) { const m = x.d.slice(5, 7); mes.set(m, (mes.get(m) ?? 0) + 1); }
  console.log('  reparto por mes de las 30 mayores: ' + [...mes.entries()].sort().map(([m, n]) => `${m}:${n}`).join(' '));
  const neg = ex.filter(x => x.e < -0.0005).length;
  console.log(`  semanas con exceso NEGATIVO < -0,05%: ${neg} de ${ex.length}  (un ajuste por dividendo NUNCA es negativo)`);
}
