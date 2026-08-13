// UNA ENTRADA POR DÍA. Arregla el fallo de la primera pasada: allí se entraba a las 10:00,
// 10:30, 11:00... del mismo día y todas se liquidaban contra el MISMO cierre. No eran
// independientes, así que el n de 1.409 era mentira: el n real son los días.
import { obs, deltaCall, med, mean, COMM } from './gex-lib.mjs';

function operar(o) {
  let corta = null, mejorD = 9;
  for (const [K, q] of o.calls) {
    if (K <= o.U) continue;
    const dl = deltaCall(o.U, K, o.T, q.iv);
    if (!(dl > 0.04 && dl < 0.12)) continue;
    if (Math.abs(dl - 0.08) < mejorD) { mejorD = Math.abs(dl - 0.08); corta = { K, q, dl }; }
  }
  if (!corta) return null;
  const larga = o.calls.get(corta.K + 25); if (!larga) return null;
  const credito = corta.q.mid - larga.mid, ancho = 25;
  if (!(credito > 0.05) || credito > ancho * 0.5) return null;
  const perdida = Math.min(Math.max(o.cierre - corta.K, 0), ancho);
  const pl = (credito - perdida) * 100 - 4 * COMM;
  return { d: o.d, h: o.h, net: o.net1, mom: o.mom, credito, delta: corta.dl, corta: corta.K, pl, ret: pl / (ancho * 100) };
}

// UNA foto por día: la primera hora fija en la que haya operación válida
for (const HORA of ['11:00', '12:00', '13:00']) {
  const porDia = new Map();
  for (const o of obs) { if (o.h !== HORA) continue; const t = operar(o); if (t) porDia.set(o.d, t); }
  const ops = [...porDia.values()].sort((a, b) => a.d < b.d ? -1 : 1);
  if (ops.length < 40) { console.log(`${HORA}: solo ${ops.length} días`); continue; }

  const grupo = (sel) => ops.filter(sel);
  const resumen = (nom, g) => {
    if (g.length < 15) { console.log(`   ${nom.padEnd(30)} (solo ${g.length} días)`); return null; }
    const r = g.map(x => x.ret), m = mean(r);
    // error estándar: ahora sí vale, porque cada día es independiente
    const sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1));
    const t = m / (sd / Math.sqrt(r.length));
    console.log(`   ${nom.padEnd(30)} n=${String(g.length).padStart(3)} días  acierto ${(g.filter(x => x.ret > 0).length / g.length * 100).toFixed(0)}%  media ${(m * 100).toFixed(2)}%  mediana ${(med(r) * 100).toFixed(2)}%  t=${t.toFixed(2)}${Math.abs(t) > 2 ? '  <<<' : ''}`);
    return { m, t, n: g.length, g };
  };

  console.log(`\n═══ ENTRADA ÚNICA A LAS ${HORA} — ${ops.length} días ═══`);
  resumen('sin filtro', ops);
  const pos = resumen('GEX POSITIVO', grupo(x => x.net > 0));
  const neg = resumen('GEX negativo', grupo(x => x.net < 0));
  resumen('GEX negativo + precio baja', grupo(x => x.net < 0 && x.mom < 0));
  resumen('GEX positivo + precio baja', grupo(x => x.net > 0 && x.mom < 0));

  // partida de la muestra
  if (pos) {
    const a = pos.g.filter(x => x.d < '2026-05-01'), b = pos.g.filter(x => x.d >= '2026-05-01');
    console.log(`   partida GEX+:  ene-abr ${(mean(a.map(x => x.ret)) * 100).toFixed(2)}% (n=${a.length})   may-ago ${(mean(b.map(x => x.ret)) * 100).toFixed(2)}% (n=${b.length})`);
  }
  if (neg) {
    const a = neg.g.filter(x => x.d < '2026-05-01'), b = neg.g.filter(x => x.d >= '2026-05-01');
    console.log(`   partida GEX−:  ene-abr ${(mean(a.map(x => x.ret)) * 100).toFixed(2)}% (n=${a.length})   may-ago ${(mean(b.map(x => x.ret)) * 100).toFixed(2)}% (n=${b.length})`);
  }
}
