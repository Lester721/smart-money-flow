// LA FORMA EXACTA DE EDUARDO, SIN FILTRO NINGUNO — ¿gana dinero la forma por sí sola?
//
// ═══ QUÉ PASÓ ═══════════════════════════════════════════════════════════════════════════════
//
// Un compañero de curso de Lester enseñó cuatro calls ganadoras de SPXW 0DTE del viernes
// 21 de agosto de 2026 y dijo que las eligió por el GEX. Cruzando su ganancia y su porcentaje
// con la cinta real de ese día, la FORMA de sus operaciones fue siempre la misma:
//
//     compra una call con el strike entre 10 y 27 puntos POR ENCIMA del precio de ese momento,
//     entra a media mañana (09:55–10:05) y sale antes de la tarde (hacia las 12:20).
//
// ═══ QUÉ MIDE ESTE FICHERO ══════════════════════════════════════════════════════════════════
//
// La pregunta más directa que se puede hacer, y la que hay que contestar ANTES de mirar ningún
// GEX: ¿esa forma gana dinero ELLA SOLA, todos los días, sin saber nada del mercado?
//
// Se prueba la rejilla entera:
//     D = cuántos puntos por encima del precio está el strike   {0,5,10,15,20,25,30}
//     E = a qué hora se entra    {09:35 09:45 09:55 10:05 10:15 10:30 11:00}
//     S = a qué hora se sale     {10:30 11:00 11:30 12:00 12:30 13:00 14:00 15:00 15:55}
//
// Y la MISMA rejilla comprando PUTS D puntos por debajo. Ése es el control de simetría: si las
// dos direcciones "funcionan", lo que se ha encontrado es volatilidad, no dirección.
//
// ═══ LOS CONTROLES ══════════════════════════════════════════════════════════════════════════
//
//  · Esta familia YA ES el control tonto: no lleva filtro, opera los 1.123 días. Así que el
//    listón contra el que se compara la mejor celda es la media de TODAS las celdas — o sea,
//    lo que da una forma cualquiera elegida sin mirar.
//  · El "barajado": elegir el strike con el precio del SPX del DÍA ANTERIOR a esa misma hora,
//    en vez del de hoy. Si eso va igual de bien, elegir el strike respecto al precio de hoy
//    no aporta nada.
//  · Mitades y tercios por tiempo, para las dos direcciones.
//
// Reglas de la casa que se cumplen aquí: se compra al ASK y se vende al BID (lo hace operar()),
// sólo se mira el pasado (la hora de entrada decide con el spot de ESA barra), un hueco no es
// un cero (se cuentan aparte), y ningún precio sale de un modelo.
//
//   node --import tsx scripts/e1-forma-de-eduardo.mjs

import { diasDisponibles, cargarDia, operar, idxHora, rejilla, resumen } from "./lib0dte.mjs";

const DS = [0, 5, 10, 15, 20, 25, 30];
const ES = ["09:35", "09:45", "09:55", "10:05", "10:15", "10:30", "11:00"];
const SS = ["10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "14:00", "15:00", "15:55"];
const LADOS = ["C", "P"];

// La celda de Eduardo: strike ~15 puntos por encima, entra 10:05, sale 12:20 (no hay barra
// 12:20 en la rejilla de salidas, la más cercana por debajo es 12:00 — se mide también 12:30).
const EDU = { D: 15, E: "10:05", S: "12:00" };

const clave = (lado, D, E, S) => `${lado}|${D}|${E}|${S}`;

/** Acumulador de una celda de la rejilla. */
function nuevaCelda() {
  return { rets: [], dols: [], dias: [], costes: [], huecos: 0, sinBarra: 0 };
}

const celdas = new Map();
const celdasBarajado = new Map();   // mismo strike pero elegido con el spot de AYER
for (const lado of LADOS)
  for (const D of DS)
    for (const E of ES)
      for (const S of SS) {
        if (S <= E) continue;
        celdas.set(clave(lado, D, E, S), nuevaCelda());
        celdasBarajado.set(clave(lado, D, E, S), nuevaCelda());
      }

const dias = diasDisponibles();
console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);

let diasCargados = 0, diasNulos = 0;
let spotAyer = null;                 // { "09:35": 7674.18, ... } del día anterior cargado
const t0 = Date.now();

for (let i = 0; i < dias.length; i++) {
  const d = cargarDia(dias[i]);
  if (!d) { diasNulos++; continue; }
  diasCargados++;

  // índices y spot de cada hora de la rejilla, UNA vez por día
  const iE = {}, spotE = {};
  for (const E of ES) {
    const k = idxHora(d, E);
    iE[E] = k;
    spotE[E] = k >= 0 ? d.barras[k].spot : null;
  }
  const iS = {};
  for (const S of SS) iS[S] = idxHora(d, S);

  for (const lado of LADOS) {
    const signo = lado === "C" ? +1 : -1;
    for (const D of DS) {
      for (const E of ES) {
        if (iE[E] < 0 || spotE[E] == null) continue;
        const K = rejilla(spotE[E]) + signo * D;
        const Kayer = spotAyer && spotAyer[E] != null ? rejilla(spotAyer[E]) + signo * D : null;
        for (const S of SS) {
          if (S <= E) continue;
          const c = celdas.get(clave(lado, D, E, S));
          if (iS[S] < 0) { c.sinBarra++; }
          else {
            const r = operar(d, iE[E], iS[S], K, lado);
            if (!r) c.huecos++;
            else { c.rets.push(r.ret); c.dols.push(r.dolares); c.dias.push(i); c.costes.push(r.coste); }
          }
          if (Kayer != null && iS[S] >= 0) {
            const b = celdasBarajado.get(clave(lado, D, E, S));
            const r2 = operar(d, iE[E], iS[S], Kayer, lado);
            if (!r2) b.huecos++;
            else { b.rets.push(r2.ret); b.dols.push(r2.dolares); b.dias.push(i); b.costes.push(r2.coste); }
          }
        }
      }
    }
  }

  spotAyer = spotE;
  if (diasCargados % 200 === 0) console.log(`  … ${diasCargados} días (${((Date.now() - t0) / 1000) | 0}s)`);
}

console.log(`\ndías cargados: ${diasCargados}   días incompletos descartados: ${diasNulos}`);

// ─── años reales de muestra, para pasar todo a dólares al año ────────────────────────────────
const ms = new Date(dias[dias.length - 1]) - new Date(dias[0]);
const anos = ms / (365.25 * 24 * 3600 * 1000);
console.log(`años de muestra: ${anos.toFixed(2)}`);

// ─── ficha de una celda ──────────────────────────────────────────────────────────────────────
function ficha(c) {
  if (c.rets.length < 30) return null;
  const r = resumen(c.rets);
  const dolTot = c.dols.reduce((a, b) => a + b, 0);
  const corte1 = c.dias[Math.floor(c.dias.length / 2)];
  const m1 = [], m2 = [];
  for (let j = 0; j < c.rets.length; j++) (c.dias[j] < corte1 ? m1 : m2).push(c.rets[j]);
  const t3 = [[], [], []];
  for (let j = 0; j < c.rets.length; j++) t3[Math.min(2, Math.floor((j * 3) / c.rets.length))].push(c.rets[j]);
  const cost = c.costes.slice().sort((a, b) => a - b);
  return {
    n: r.n, media: r.media, t: r.t, aciertos: r.aciertos,
    dolMedio: dolTot / c.dols.length,
    dolAno: dolTot / anos,
    m1: resumen(m1).media, m2: resumen(m2).media,
    t1: resumen(t3[0]).media, t2: resumen(t3[1]).media, t3: resumen(t3[2]).media,
    huecos: c.huecos, sinBarra: c.sinBarra,
    costeMin: cost[0], costeMed: cost[Math.floor(cost.length / 2)], costeMax: cost[cost.length - 1],
  };
}

const fichas = new Map();
for (const [k, c] of celdas) { const f = ficha(c); if (f) fichas.set(k, f); }

// ─── VALIDACIÓN antes de creerse nada ────────────────────────────────────────────────────────
console.log("\n═══ VALIDACIÓN ══════════════════════════════════════════════════════");
console.log(`celdas de la rejilla con n≥30: ${fichas.size} de ${celdas.size}`);
{
  const ns = [...fichas.values()].map((f) => f.n);
  console.log(`operaciones por celda: mín ${Math.min(...ns)}  máx ${Math.max(...ns)}`);
  const hu = [...celdas.values()].reduce((a, c) => a + c.huecos, 0);
  const sb = [...celdas.values()].reduce((a, c) => a + c.sinBarra, 0);
  const ok = [...celdas.values()].reduce((a, c) => a + c.rets.length, 0);
  console.log(`operaciones válidas ${ok} · huecos (faltaba un precio) ${hu} · barra inexistente ${sb}`);
  const cm = [...fichas.values()].map((f) => f.costeMed);
  console.log(`coste de entrada mediano por celda: de $${Math.min(...cm).toFixed(2)} a $${Math.max(...cm).toFixed(2)}`);
  const eduF = fichas.get(clave("C", EDU.D, EDU.E, EDU.S));
  console.log(`celda de Eduardo — coste de entrada: mín $${eduF.costeMin.toFixed(2)} · mediana $${eduF.costeMed.toFixed(2)} · máx $${eduF.costeMax.toFixed(2)}`);
}

// ─── recuento de celdas positivas / negativas ────────────────────────────────────────────────
console.log("\n═══ ¿CUÁNTAS CELDAS GANAN? ══════════════════════════════════════════");
for (const lado of LADOS) {
  const fs = [...fichas.entries()].filter(([k]) => k.startsWith(lado + "|"));
  const pos = fs.filter(([, f]) => f.media > 0).length;
  const media = fs.reduce((a, [, f]) => a + f.media, 0) / fs.length;
  const dolAno = fs.reduce((a, [, f]) => a + f.dolAno, 0) / fs.length;
  console.log(
    `${lado === "C" ? "CALLS" : "PUTS "}: ${pos} positivas / ${fs.length - pos} negativas de ${fs.length} celdas` +
    `   media de todas: ${(media * 100).toFixed(2)}%  ($${dolAno.toFixed(0)}/año)`
  );
}

// ─── la rejilla resumida ─────────────────────────────────────────────────────────────────────
for (const lado of LADOS) {
  console.log(`\n═══ REJILLA ${lado === "C" ? "CALLS (strike D por ENCIMA)" : "PUTS (strike D por DEBAJO)"} — retorno medio %, con horquilla real ═══`);
  console.log("           " + SS.map((s) => s.padStart(8)).join(""));
  for (const D of DS) {
    for (const E of ES) {
      let fila = `D=${String(D).padStart(2)} E=${E} `;
      let hay = false;
      for (const S of SS) {
        const f = fichas.get(clave(lado, D, E, S));
        if (!f) { fila += "       ·"; continue; }
        hay = true;
        fila += (f.media * 100).toFixed(1).padStart(8);
      }
      if (hay) console.log(fila);
    }
  }
}

// ─── medias marginales, para ver si hay estructura o es ruido ─────────────────────────────────
console.log("\n═══ MEDIAS MARGINALES (calls) ═══════════════════════════════════════");
for (const eje of ["D", "E", "S"]) {
  const vals = eje === "D" ? DS : eje === "E" ? ES : SS;
  const linea = vals.map((v) => {
    const fs = [...fichas.entries()].filter(([k]) => {
      const [l, d, e, s] = k.split("|");
      return l === "C" && (eje === "D" ? +d === v : eje === "E" ? e === v : s === v);
    });
    const m = fs.reduce((a, [, f]) => a + f.media, 0) / fs.length;
    return `${v}:${(m * 100).toFixed(1)}%`;
  });
  console.log(`  por ${eje}: ${linea.join("  ")}`);
}

// ─── la mejor celda de cada lado ─────────────────────────────────────────────────────────────
function mejor(lado) {
  let best = null;
  for (const [k, f] of fichas) {
    if (!k.startsWith(lado + "|")) continue;
    if (!best || f.media > best.f.media) best = { k, f };
  }
  return best;
}

function pinta(titulo, k, f) {
  const [lado, D, E, S] = k.split("|");
  console.log(`\n${titulo}`);
  console.log(`  ${lado === "C" ? "CALL" : "PUT"} strike ${D} puntos ${lado === "C" ? "arriba" : "abajo"} · entra ${E} · sale ${S}`);
  console.log(`  n=${f.n}  media ${(f.media * 100).toFixed(2)}%  t=${f.t.toFixed(2)}  aciertos ${(f.aciertos * 100).toFixed(1)}%`);
  console.log(`  $${f.dolMedio.toFixed(2)} por operación  ->  $${f.dolAno.toFixed(0)}/año con UN contrato`);
  console.log(`  mitades: ${(f.m1 * 100).toFixed(2)}% / ${(f.m2 * 100).toFixed(2)}%   tercios: ${(f.t1 * 100).toFixed(1)} / ${(f.t2 * 100).toFixed(1)} / ${(f.t3 * 100).toFixed(1)}`);
  console.log(`  coste de entrada: mediana $${f.costeMed.toFixed(2)} (de $${f.costeMin.toFixed(2)} a $${f.costeMax.toFixed(2)})  huecos ${f.huecos}`);
  const b = ficha(celdasBarajado.get(k));
  if (b) console.log(`  BARAJADO (strike elegido con el precio de AYER): ${(b.media * 100).toFixed(2)}%  n=${b.n}  t=${b.t.toFixed(2)}`);
}

const mejorC = mejor("C"), mejorP = mejor("P");
console.log("\n═══ LAS MEJORES CELDAS ══════════════════════════════════════════════");
pinta("MEJOR CALL:", mejorC.k, mejorC.f);
pinta("MEJOR PUT (control de simetría):", mejorP.k, mejorP.f);

// top 10 calls, para ver si la mejor destaca o hay un empate de ruido
console.log("\n  top 10 celdas de calls:");
[...fichas.entries()].filter(([k]) => k.startsWith("C|")).sort((a, b) => b[1].media - a[1].media).slice(0, 10)
  .forEach(([k, f]) => {
    const [, D, E, S] = k.split("|");
    console.log(`   D=${String(D).padStart(2)} ${E}->${S}  ${(f.media * 100).toFixed(2)}%  t=${f.t.toFixed(2)}  n=${f.n}  $${f.dolAno.toFixed(0)}/año`);
  });

// ─── LA CELDA DE EDUARDO ─────────────────────────────────────────────────────────────────────
console.log("\n═══ LA CELDA DE EDUARDO (D=15, entra 10:05) ═════════════════════════");
for (const S of ["11:30", "12:00", "12:30", "13:00"]) {
  const k = clave("C", EDU.D, EDU.E, S);
  const f = fichas.get(k);
  if (!f) continue;
  const b = ficha(celdasBarajado.get(k));
  console.log(
    `  sale ${S}: n=${f.n}  ${(f.media * 100).toFixed(2)}%  t=${f.t.toFixed(2)}  aciertos ${(f.aciertos * 100).toFixed(1)}%  ` +
    `$${f.dolMedio.toFixed(2)}/op  $${f.dolAno.toFixed(0)}/año  mitades ${(f.m1 * 100).toFixed(1)}/${(f.m2 * 100).toFixed(1)}` +
    `  tercios ${(f.t1 * 100).toFixed(1)}/${(f.t2 * 100).toFixed(1)}/${(f.t3 * 100).toFixed(1)}` +
    `  huecos ${f.huecos}` + (b ? `  barajado ${(b.media * 100).toFixed(2)}%` : "")
  );
}
// y su put espejo
{
  const k = clave("P", EDU.D, EDU.E, EDU.S);
  const f = fichas.get(k);
  if (f) console.log(`  espejo en PUTS (D=15 abajo, 10:05->12:00): n=${f.n}  ${(f.media * 100).toFixed(2)}%  t=${f.t.toFixed(2)}  $${f.dolAno.toFixed(0)}/año`);
}

// ─── OJO: el % por operación y el dinero NO dicen lo mismo ───────────────────────────────────
// Una call muy fuera del dinero gana el 300% sobre $1 y pierde el 100% sobre $8. El % medio
// sale positivo y la cuenta baja. Por eso se ordena TAMBIÉN por dólares, que es lo que se cobra.
console.log("\n═══ ORDENADO POR DINERO (lo que de verdad se cobra) ══════════════════");
for (const lado of LADOS) {
  console.log(`\n  top 10 de ${lado === "C" ? "CALLS" : "PUTS"} por $/año:`);
  [...fichas.entries()].filter(([k]) => k.startsWith(lado + "|")).sort((a, b) => b[1].dolAno - a[1].dolAno).slice(0, 10)
    .forEach(([k, f]) => {
      const [, D, E, S] = k.split("|");
      console.log(`   D=${String(D).padStart(2)} ${E}->${S}  $${f.dolAno.toFixed(0)}/año  ($${f.dolMedio.toFixed(2)}/op)  ${(f.media * 100).toFixed(2)}%  t=${f.t.toFixed(2)}  n=${f.n}`);
    });
  const fs = [...fichas.entries()].filter(([k]) => k.startsWith(lado + "|"));
  const pos = fs.filter(([, f]) => f.dolAno > 0).length;
  console.log(`  celdas que ganan DINERO: ${pos} / ${fs.length}`);
}
{
  // la mejor por dinero, con todos sus controles
  let best = null;
  for (const [k, f] of fichas) { if (k.startsWith("C|") && (!best || f.dolAno > best.f.dolAno)) best = { k, f }; }
  pinta("MEJOR CALL POR DINERO:", best.k, best.f);
  const dols = celdas.get(best.k).dols;
  const dias_ = celdas.get(best.k).dias;
  const corte = dias_[Math.floor(dias_.length / 2)];
  let d1 = 0, d2 = 0, n1 = 0, n2 = 0;
  for (let j = 0; j < dols.length; j++) (dias_[j] < corte ? (d1 += dols[j], n1++) : (d2 += dols[j], n2++));
  console.log(`  mitades EN DINERO: $${(d1 / n1).toFixed(2)}/op (n=${n1})  vs  $${(d2 / n2).toFixed(2)}/op (n=${n2})`);
  const ord = dols.slice().sort((a, b) => a - b);
  console.log(`  mediana del P&L: $${ord[Math.floor(ord.length / 2)].toFixed(2)}  ·  peor $${ord[0].toFixed(2)}  ·  mejor $${ord[ord.length - 1].toFixed(2)}`);
  const top5 = ord.slice(-5).reduce((a, b) => a + b, 0);
  const tot = dols.reduce((a, b) => a + b, 0);
  console.log(`  las 5 mejores operaciones aportan $${top5.toFixed(0)} de $${tot.toFixed(0)} totales (${((top5 / tot) * 100).toFixed(0)}%)`);
}

// ─── el listón: la celda MEDIA de la rejilla ─────────────────────────────────────────────────
{
  const fs = [...fichas.entries()].filter(([k]) => k.startsWith("C|"));
  const media = fs.reduce((a, [, f]) => a + f.media, 0) / fs.length;
  console.log(`\nLISTÓN — la celda media de calls (una forma cualquiera, sin elegir): ${(media * 100).toFixed(2)}%`);
  const fp = [...fichas.entries()].filter(([k]) => k.startsWith("P|"));
  const mediaP = fp.reduce((a, [, f]) => a + f.media, 0) / fp.length;
  console.log(`LISTÓN — la celda media de puts: ${(mediaP * 100).toFixed(2)}%`);
}

console.log(`\nhecho en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
