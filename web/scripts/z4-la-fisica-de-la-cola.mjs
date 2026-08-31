// LA FÍSICA DE LA COLA — quién paga, cuánto, cada cuánto, y cuánto hay que aguantar.
//
// ═══ QUÉ MIDE ESTO Y POR QUÉ ════════════════════════════════════════════════════════════════
//
// Esto NO busca una regla. Describe el terreno de la esquina barata (comprar una opción suelta,
// fuera del dinero, y venderla unas semanas después). Sin este mapa, cualquier otra familia
// mide a ciegas: no sabe si un ratio de 1,2 sale de mil operaciones parecidas o de tres billetes
// gordos de marzo de 2020.
//
// Se contesta a seis preguntas, en dinero y con TAMAÑO IGUAL en cada intento ($1.000 arriesgados
// siempre, que es como se opera de verdad: el que compra elige cuánto pone):
//
//   1. ¿Qué fracción vence sin valor (se pierde el 100%) y qué fracción pierde sólo un trozo?
//   2. De los que ganan, ¿cuántos pagan 2, 5, 10 o 20 veces lo apostado?
//   3. ¿Cuántos ganadores hacen falta para pagar TODAS las pérdidas, y cada cuánto aparecen?
//   4. ¿Cuál es la racha más larga de pérdidas seguidas? Esto importa MUCHO: es lo que hay que
//      aguantar sin abandonar. Una estrategia que exige tragar 40 seguidas no es operable
//      aunque el ratio sea bueno.
//   5. ¿Los billetes grandes se agrupan en las crisis o están repartidos? Si se agrupan, esto
//      es un SEGURO, y hay que llamarlo por su nombre.
//   6. El dinero en el tiempo: la caja acumulada mes a mes. ¿Cuál es el bajón más profundo y,
//      sobre todo, el más LARGO antes de recuperarse? Ese número es el que decide si se puede
//      operar de verdad: no es cuánto gana, es cuánto tiempo hay que perder antes de ganar.
//
// ═══ SOBRE QUÉ ESQUINAS ═════════════════════════════════════════════════════════════════════
//
// Sobre la del listón (5% fuera · ~90 días · salir a los 23 días de bolsa) y sobre las mejores
// de una rejilla propia de 52 casillas (4 distancias × 4 plazos × varias salidas). La rejilla
// está aquí sólo para elegir a quién radiografiar; el número de casillas se declara, porque con
// tantas puertas la mejor casilla puede ser ruido.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · Se COMPRA AL ASK y se VENDE AL BID. Nunca punto medio.
//   · Ningún modelo de precios. Si el precio no está en la cadena, la operación no existe.
//   · Un hueco NO es un cero: vencer sin puja (bid 0) es un dato real (se pierde el 100%);
//     no tener cadena ese día es un hueco, se descarta y se cuenta aparte.
//   · Nunca se sale DESPUÉS del vencimiento (ahí un contrato dentro del dinero liquida por
//     intrínseco y la cadena ya no lo lista: leerlo como 0 fabricaría pérdidas falsas).
//   · Sólo el pasado: se entra con la cadena de cierre de ese día y se sale con la de ese otro.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z4-la-fisica-de-la-cola.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE = "scripts/cache-theta/z4-ops.json";   // las operaciones ya medidas, para no releer 2,5 GB
const ASK_MIN = 0.10;
const APUESTA = 1000;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (100 * x).toFixed(1) + "%";
const $ = (x) => "$" + Math.round(x).toLocaleString("es-ES");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const mesDe = (d) => d.slice(0, 6);

// ── la rejilla: distancias × plazos × salidas ───────────────────────────────
const DISTS = [3, 5, 8, 12];            // % fuera del dinero
const DTES = [30, 60, 90, 180];         // días de plazo objetivo
const HOLDS = [5, 10, 23, 45];          // días de BOLSA hasta la salida
const tolDte = (dte) => Math.round(0.28 * dte);   // el listón usaba 90±25; se mantiene relativo

// Una casilla sólo vale si la salida cae claramente ANTES del vencimiento más corto aceptado.
// (hold en días de bolsa ≈ hold×1,4 días de calendario)
const CELDAS = [];
for (const dist of DISTS) for (const dte of DTES) for (const hold of HOLDS) {
  const dteMin = dte - tolDte(dte);
  if (hold * 1.45 >= dteMin - 2) continue;
  CELDAS.push({ id: CELDAS.length, dist, dte, hold, nombre: `${dist}% · ${dte}d · salir ${hold}` });
}
const HOLDS_USADOS = [...new Set(CELDAS.map((c) => c.hold))].sort((a, b) => a - b);

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
const NDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${NDIAS.toLocaleString("es-ES")} días de cadena · ${CELDAS.length} casillas de rejilla\n`);

const leer = (sym, dia) => { try { return JSON.parse(readFileSync(`${CDIR}/${sym}_d${dia}.json`, "utf8")); } catch { return null; } };

/** El spot por paridad put-call: el strike donde call y put valen casi lo mismo. */
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}

// ── el motor ────────────────────────────────────────────────────────────────
// Por ticker: se leen SÓLO los días que hacen falta (una entrada al mes + sus días de salida),
// cada fichero una sola vez, en orden. Las cadenas pesan; no se guarda ninguna.
let ops = [];                 // {celda, sym, ent, sal, tipo, prima, ret, spot, distReal}
let huecos = 0, sinCadenaSalida = 0, expAusente = 0, sinContrato = 0;

const guardado = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : null;
if (guardado && guardado.celdas === CELDAS.length) {
  ({ huecos, sinCadenaSalida, expAusente, sinContrato } = guardado);
  ops = guardado.ops.map((a) => ({ celda: a[0], sym: a[1], ent: a[2], sal: a[3], tipo: a[4], prima: a[5], salida: a[6], ret: a[7], spot: a[8], distReal: a[9], horq: a[10] }));
  console.log(`   (reusando ${ops.length.toLocaleString("es-ES")} operaciones ya medidas de ${CACHE})\n`);
}

for (const sym of ops.length ? [] : TICKERS) {
  const dias = diasPorSim.get(sym);
  const entradas = [];
  const vistos = new Set();
  for (let i = 0; i < dias.length; i++) {
    const m = mesDe(dias[i]);
    if (vistos.has(m)) continue;
    vistos.add(m); entradas.push(i);
  }
  const pendientes = new Map();          // idx de salida -> [posiciones]
  const necesarios = new Set(entradas);
  for (const i of entradas) for (const h of HOLDS_USADOS) if (i + h < dias.length) necesarios.add(i + h);
  const orden = [...necesarios].sort((a, b) => a - b);
  const esEntrada = new Set(entradas);

  for (const idx of orden) {
    const dia = dias[idx];
    const c = leer(sym, dia);

    // salidas primero no hace falta: idx de salida siempre > idx de entrada
    if (esEntrada.has(idx)) {
      if (!c) { huecos++; }
      else {
        const sp = spotDe(c);
        if (sp) {
          // expiraciones disponibles con su plazo
          const exps = Object.keys(c).map((e) => ({ e, dte: Math.round((ms(e) - ms(dia)) / 86400000) })).filter((x) => x.dte >= 1);
          for (const dte of DTES) {
            const tol = tolDte(dte);
            for (const tipo of ["C", "P"]) {
              for (const dist of DISTS) {
                const objetivo = tipo === "C" ? sp * (1 + dist / 100) : sp * (1 - dist / 100);
                let mejor = null, mejorD = Infinity;
                for (const { e, dte: d } of exps) {
                  if (Math.abs(d - dte) > tol) continue;
                  const g = c[e];
                  for (const clave in g) {
                    if (clave.charCodeAt(clave.length - 1) !== (tipo === "C" ? 67 : 80)) continue;
                    const K = Number(clave.slice(0, -2));
                    const ba = g[clave];
                    if (!(ba[1] >= ASK_MIN)) continue;
                    const s = Math.abs(K - objetivo) / sp + Math.abs(d - dte) / 1000;
                    if (s < mejorD) { mejorD = s; mejor = { exp: e, clave, K, ask: ba[1], bid: ba[0], dte: d }; }
                  }
                }
                if (!mejor) { sinContrato++; continue; }
                for (const cel of CELDAS) {
                  if (cel.dist !== dist || cel.dte !== dte) continue;
                  const iSal = idx + cel.hold;
                  if (iSal >= dias.length) continue;
                  const diaSal = dias[iSal];
                  if (ms(diaSal) > ms(mejor.exp)) continue;     // nunca salir después del vencimiento
                  if (!pendientes.has(iSal)) pendientes.set(iSal, []);
                  pendientes.get(iSal).push({
                    celda: cel.id, sym, ent: dia, sal: diaSal, tipo,
                    exp: mejor.exp, clave: mejor.clave, prima: mejor.ask, bidEnt: mejor.bid,
                    spot: sp, distReal: Math.abs(mejor.K - sp) / sp,
                  });
                }
              }
            }
          }
        }
      }
    }

    const ps = pendientes.get(idx);
    if (ps) {
      pendientes.delete(idx);
      for (const p of ps) {
        if (!c) { sinCadenaSalida++; continue; }                // hueco de verdad: no se mide
        const g = c[p.exp];
        if (!g) expAusente++;                                    // regla de la casa: sin grupo = sin puja = 0
        const bid = g ? (g[p.clave] ? g[p.clave][0] : 0) : 0;
        ops.push({
          celda: p.celda, sym, ent: p.ent, sal: p.sal, tipo: p.tipo,
          prima: p.prima, salida: bid, ret: (bid - p.prima) / p.prima,
          spot: p.spot, distReal: p.distReal, horq: (p.prima - p.bidEnt) / p.prima,
        });
      }
    }
  }
  process.stdout.write(`\r   ${sym} · ${ops.length.toLocaleString("es-ES")} operaciones        `);
}
console.log(`\n`);
if (!guardado || guardado.celdas !== CELDAS.length) {
  writeFileSync(CACHE, JSON.stringify({
    celdas: CELDAS.length, huecos, sinCadenaSalida, expAusente, sinContrato,
    ops: ops.map((o) => [o.celda, o.sym, o.ent, o.sal, o.tipo, o.prima, o.salida, o.ret, o.spot, o.distReal, o.horq]),
  }));
}

// ═══ SANIDAD ════════════════════════════════════════════════════════════════
const conoListon = ops.filter((o) => { const c = CELDAS[o.celda]; return c.dist === 5 && c.dte === 90 && c.hold === 23; });
console.log(`${"═".repeat(96)}`);
console.log(`  SANIDAD`);
console.log(`${"═".repeat(96)}`);
console.log(`  operaciones totales (todas las casillas) : ${ops.length.toLocaleString("es-ES")}`);
console.log(`  huecos: cadena de entrada ausente ${huecos} · cadena de SALIDA ausente ${sinCadenaSalida} · sin contrato que encaje ${sinContrato.toLocaleString("es-ES")}`);
console.log(`  salidas con la expiración ausente en la cadena (se leen como sin puja) : ${expAusente.toLocaleString("es-ES")} (${pct(expAusente / Math.max(1, ops.length))})`);
console.log(`  coste medio de entrada, todas las casillas : ${pct(media(ops.map((o) => o.prima / o.spot)))} del subyacente`);
console.log(`  horquilla media pagada                    : ${pct(media(ops.map((o) => o.horq)))} de la prima`);
console.log(`  distancia real media al dinero            : ${pct(media(ops.map((o) => o.distReal)))}`);
console.log(`  vencen sin valor (bid 0 al salir)         : ${pct(ops.filter((o) => o.salida === 0).length / ops.length)}`);
console.log(`\n  → LA CASILLA DEL LISTÓN (5% · 90d · salir 23): n=${conoListon.length.toLocaleString("es-ES")} ` +
  `· coste medio ${pct(media(conoListon.map((o) => o.prima / o.spot)))} del subyacente · sin valor ${pct(conoListon.filter((o) => o.salida === 0).length / conoListon.length)}`);
console.log(`     (el listón publicado: 6.924 operaciones. Si esto no cuadra, hay un fallo.)`);

// ═══ LA REJILLA — sólo para elegir a quién radiografiar ═════════════════════
function ratioDe(lista) {
  let g = 0, p = 0, ng = 0;
  for (const o of lista) { const d = APUESTA * o.ret; if (d > 0) { g += d; ng++; } else p -= d; }
  return { ratio: p > 0 ? g / p : Infinity, gana: g, pierde: p, acierto: ng / Math.max(1, lista.length), n: lista.length };
}
const porCelda = new Map();
for (const o of ops) { if (!porCelda.has(o.celda)) porCelda.set(o.celda, []); porCelda.get(o.celda).push(o); }

const tabla = [];
for (const cel of CELDAS) {
  const l = porCelda.get(cel.id) || [];
  if (l.length < 400) continue;
  const cono = ratioDe(l);
  const anos = [...new Set(l.map((o) => o.ent.slice(0, 4)))].sort();
  const rAnos = anos.map((a) => ratioDe(l.filter((o) => o.ent.slice(0, 4) === a)).ratio);
  tabla.push({ cel, cono, anosBuenos: rAnos.filter((r) => r >= 1).length, anos: anos.length, rAnos });
}
tabla.sort((a, b) => b.cono.ratio - a.cono.ratio);
console.log(`\n${"═".repeat(96)}`);
console.log(`  LA REJILLA (${CELDAS.length} casillas declaradas · ${tabla.length} con muestra suficiente) — ordenada por RATIO del cono`);
console.log(`${"═".repeat(96)}`);
console.log(`  ${"casilla".padEnd(24)} ${"n".padStart(6)} ${"acierto".padStart(8)} ${"RATIO".padStart(6)} ${"años≥1".padStart(7)}`);
for (const t of tabla) {
  console.log(`  ${t.cel.nombre.padEnd(24)} ${String(t.cono.n).padStart(6)} ${pct(t.cono.acierto).padStart(8)} ${t.cono.ratio.toFixed(2).padStart(6)} ${(t.anosBuenos + "/" + t.anos).padStart(7)}`);
}
const porEncima = tabla.filter((t) => t.cono.ratio > 1.03).length;
console.log(`\n  casillas por encima del listón (1,03): ${porEncima} de ${tabla.length}`);

// ═══ LA RADIOGRAFÍA ═════════════════════════════════════════════════════════
const CRISIS = [["2018-10..2018-12", (m) => m >= "201810" && m <= "201812"],
                ["2020-02..2020-04", (m) => m >= "202002" && m <= "202004"],
                ["2022 entero", (m) => m.slice(0, 4) === "2022"],
                ["2025-03..2025-05", (m) => m >= "202503" && m <= "202505"]];

function radiografia(titulo, lista) {
  console.log(`\n\n${"█".repeat(96)}`);
  console.log(`  ${titulo}`);
  console.log(`${"█".repeat(96)}`);
  if (lista.length < 100) { console.log("  muestra insuficiente"); return null; }

  const con = ratioDe(lista);
  const calls = ratioDe(lista.filter((o) => o.tipo === "C"));
  const puts = ratioDe(lista.filter((o) => o.tipo === "P"));
  console.log(`\n  el cono  n=${con.n.toLocaleString("es-ES")} · acierta ${pct(con.acierto)} · gana ${$(con.gana)} · pierde ${$(con.pierde)} · RATIO ${con.ratio.toFixed(2)} · neto ${$(con.gana - con.pierde)}`);
  console.log(`  calls    n=${calls.n.toLocaleString("es-ES")} · acierta ${pct(calls.acierto)} · RATIO ${calls.ratio.toFixed(2)}`);
  console.log(`  puts     n=${puts.n.toLocaleString("es-ES")} · acierta ${pct(puts.acierto)} · RATIO ${puts.ratio.toFixed(2)}`);

  // 1. cómo se pierde
  const sinValor = lista.filter((o) => o.salida === 0);
  const parcial = lista.filter((o) => o.salida > 0 && o.ret <= 0);
  const gana = lista.filter((o) => o.ret > 0);
  console.log(`\n  ── CÓMO SE PIERDE ──`);
  console.log(`     vence SIN VALOR (se pierde el 100%) : ${sinValor.length.toLocaleString("es-ES")} (${pct(sinValor.length / lista.length)}) · aportan ${$(APUESTA * sinValor.length)} de pérdida`);
  console.log(`     pierde sólo un trozo                : ${parcial.length.toLocaleString("es-ES")} (${pct(parcial.length / lista.length)}) · pierde de media ${pct(-media(parcial.map((o) => o.ret)))} de lo puesto`);
  console.log(`     gana                                : ${gana.length.toLocaleString("es-ES")} (${pct(gana.length / lista.length)})`);
  console.log(`     de cada $100 perdidos, ${(100 * APUESTA * sinValor.length / con.pierde).toFixed(0)} salen de los que vencen sin valor`);
  console.log(`     (OJO: se VENDE antes del vencimiento, así que perder el 100% es raro; lo normal es`);
  console.log(`      recuperar un trozo. Así se reparten las pérdidas:)`);
  const tramos = [[0.9, 1.0001, "pierde 90-100%"], [0.75, 0.9, "pierde 75-90%"], [0.5, 0.75, "pierde 50-75%"], [0.25, 0.5, "pierde 25-50%"], [0, 0.25, "pierde 0-25%"]];
  for (const [a, b, nom] of tramos) {
    const g = lista.filter((o) => o.ret <= 0 && -o.ret >= a && -o.ret < b);
    console.log(`       ${nom.padEnd(16)} ${String(g.length).padStart(5)} (${pct(g.length / lista.length).padStart(6)}) · ${$(APUESTA * g.reduce((s, o) => s - o.ret, 0)).padStart(12)}`);
  }

  // 2. el reparto de los ganadores
  console.log(`\n  ── QUIÉN PAGA (multiplicador sobre lo apostado; 2x = se ganan $2.000 sobre $1.000) ──`);
  const cortes = [0.5, 1, 2, 5, 10, 20, 50];
  for (const c of cortes) {
    const g = lista.filter((o) => o.ret >= c);
    if (!g.length) { console.log(`     ≥ ${String(c).padStart(4)}x : ninguno`); continue; }
    const suma = g.reduce((a, o) => a + APUESTA * o.ret, 0);
    console.log(`     ≥ ${String(c).padStart(4)}x : ${String(g.length).padStart(5)} operaciones (${pct(g.length / lista.length).padStart(6)}) · ${$(suma).padStart(12)} = ${pct(suma / con.gana).padStart(6)} de todo lo ganado`);
  }

  // 3. cuántos ganadores pagan todas las pérdidas
  const d = lista.map((o) => ({ ...o, d: APUESTA * o.ret })).sort((a, b) => b.d - a.d);
  let acum = 0, k = 0;
  for (const x of d) { if (x.d <= 0) break; acum += x.d; k++; if (acum >= con.pierde) break; }
  const anosSpan = (Math.max(...lista.map((o) => ms(o.ent))) - Math.min(...lista.map((o) => ms(o.ent)))) / 31557600000;
  console.log(`\n  ── CUÁNTOS PAGAN LA FIESTA ──`);
  if (acum >= con.pierde) {
    console.log(`     hacen falta ${k} ganadores (los ${pct(k / lista.length)} mejores) para pagar TODAS las pérdidas`);
    console.log(`     aparecen 1 de cada ${Math.round(lista.length / k)} operaciones · ${(k / anosSpan).toFixed(1)} al año sobre ${anosSpan.toFixed(1)} años`);
    console.log(`     los 5 mayores: ${d.slice(0, 5).map((x) => `${x.sym} ${x.ent.slice(0, 6)} ${x.tipo} ${$(x.d)}`).join(" · ")}`);
  } else {
    console.log(`     NINGÚN conjunto de ganadores paga las pérdidas: todos juntos suman ${$(acum)} contra ${$(con.pierde)}`);
  }
  const sinElMejor = ratioDe(lista.filter((o) => o !== d[0]));
  console.log(`     mayor billete ${$(d[0].d)} (${d[0].sym} ${d[0].ent} ${d[0].tipo}) · quitándolo el RATIO pasa de ${con.ratio.toFixed(3)} a ${sinElMejor.ratio.toFixed(3)}`);
  // un "evento" de verdad no es UNA operación: es un MES. Quitar el mejor mes es la prueba dura.
  const gMes = new Map();
  for (const o of lista) { const m = mesDe(o.ent); gMes.set(m, (gMes.get(m) || 0) + APUESTA * o.ret); }
  const mejorMes = [...gMes.entries()].sort((a, b) => b[1] - a[1])[0];
  const sinMes = ratioDe(lista.filter((o) => mesDe(o.ent) !== mejorMes[0]));
  const sin2020 = ratioDe(lista.filter((o) => !(mesDe(o.ent) >= "202002" && mesDe(o.ent) <= "202005")));
  console.log(`     mejor MES de entrada: ${mejorMes[0]} (${$(mejorMes[1])} netos) · quitándolo el RATIO pasa a ${sinMes.ratio.toFixed(3)}`);
  console.log(`     quitando febrero-mayo de 2020 entero: RATIO ${sin2020.ratio.toFixed(3)} (n=${sin2020.n.toLocaleString("es-ES")})`);
  // ¿de cuántos tickers depende?
  const gTk = new Map();
  for (const o of gana) gTk.set(o.sym, (gTk.get(o.sym) || 0) + APUESTA * o.ret);
  const tkOrd = [...gTk.entries()].sort((a, b) => b[1] - a[1]);
  let ac = 0, nt = 0;
  for (const [, v] of tkOrd) { ac += v; nt++; if (ac >= con.gana / 2) break; }
  console.log(`     ${nt} tickers (de ${TICKERS.length}) aportan la MITAD de lo ganado · los 5 primeros: ${tkOrd.slice(0, 5).map((x) => `${x[0]} ${$(x[1])}`).join(" · ")}`);
  // ratio por ticker: ¿cuántos tickers dan ratio ≥ 1?
  const rTk = [...new Set(lista.map((o) => o.sym))].map((s) => [s, ratioDe(lista.filter((o) => o.sym === s))]).filter((x) => x[1].n >= 50);
  console.log(`     tickers con RATIO ≥ 1 : ${rTk.filter((x) => x[1].ratio >= 1).length} de ${rTk.length} medidos`);

  // 4. la racha
  console.log(`\n  ── LO QUE HAY QUE AGUANTAR ──`);
  // (a) racha DENTRO DE UN TICKER: es la que sufre quien opera un nombre cada vez.
  //     Contar la racha de toda la cartera junta no dice nada: 40 tickers cierran el mismo día
  //     y el orden entre ellos es inventado.
  const rachasTk = [];
  for (const s of new Set(lista.map((o) => o.sym))) {
    const v = lista.filter((o) => o.sym === s && o.tipo === "C").sort((a, b) => (a.sal < b.sal ? -1 : 1));
    let r = 0, mx = 0, ini = null, iniMx = null, finMx = null;
    for (const o of v) { if (o.ret <= 0) { if (!r) ini = o.ent; r++; if (r > mx) { mx = r; iniMx = ini; finMx = o.ent; } } else r = 0; }
    if (v.length >= 40) rachasTk.push({ s, mx, iniMx, finMx, n: v.length });
  }
  rachasTk.sort((a, b) => b.mx - a.mx);
  const medRacha = media(rachasTk.map((x) => x.mx));
  console.log(`     operando UN ticker (una compra al mes, sólo calls): racha típica de meses perdedores seguidos ${medRacha.toFixed(1)}`);
  console.log(`       la peor de todas: ${rachasTk[0].mx} seguidas en ${rachasTk[0].s} (${rachasTk[0].iniMx} → ${rachasTk[0].finMx})`);
  console.log(`       las 5 peores: ${rachasTk.slice(0, 5).map((x) => `${x.s} ${x.mx}`).join(" · ")}`);
  // (b) el CONO como una sola apuesta: call+put del mismo día, $500 a cada lado
  const pares = new Map();
  for (const o of lista) { const k = `${o.sym}|${o.ent}`; if (!pares.has(k)) pares.set(k, []); pares.get(k).push(o); }
  const parList = [...pares.entries()].filter(([, v]) => v.length === 2)
    .map(([k, v]) => ({ sym: k.split("|")[0], ent: k.split("|")[1], sal: v[0].sal, d: (APUESTA / 2) * (v[0].ret + v[1].ret) }))
    .sort((a, b) => (a.sal < b.sal ? -1 : 1));
  console.log(`     el CONO como UNA apuesta ($500 a cada lado): ${parList.length.toLocaleString("es-ES")} conos · ganan ${pct(parList.filter((x) => x.d > 0).length / parList.length)}`);
  const rachasCono = [];
  for (const s of new Set(parList.map((x) => x.sym))) {
    const v = parList.filter((x) => x.sym === s);
    let r = 0, mx = 0; for (const x of v) { if (x.d <= 0) { r++; if (r > mx) mx = r; } else r = 0; }
    if (v.length >= 40) rachasCono.push({ s, mx });
  }
  rachasCono.sort((a, b) => b.mx - a.mx);
  console.log(`       racha de conos perdedores seguidos en un mismo ticker: típica ${media(rachasCono.map((x) => x.mx)).toFixed(1)} · peor ${rachasCono[0].mx} (${rachasCono[0].s})`);
  // rachas en meses (lo que de verdad se siente): meses de calendario con la caja en rojo
  const porMes = new Map();
  for (const o of lista) { const m = mesDe(o.sal); porMes.set(m, (porMes.get(m) || 0) + APUESTA * o.ret); }
  const meses = [...porMes.keys()].sort();
  let rm = 0, peorM = 0, finM = null, iniM = null, iniMPeor = null;
  for (const m of meses) {
    if (porMes.get(m) <= 0) { if (rm === 0) iniM = m; rm++; if (rm > peorM) { peorM = rm; iniMPeor = iniM; finM = m; } }
    else rm = 0;
  }
  console.log(`     meses perdedores seguidos (la caja del mes en rojo): ${peorM} (${iniMPeor} → ${finM}) de ${meses.length} meses`);
  console.log(`     meses en verde: ${meses.filter((m) => porMes.get(m) > 0).length} de ${meses.length} (${pct(meses.filter((m) => porMes.get(m) > 0).length / meses.length)})`);

  // 5. dónde aparecen los billetes
  console.log(`\n  ── DÓNDE APARECEN LOS BILLETES GRANDES (los ${k} que pagan la fiesta) ──`);
  const top = d.slice(0, k);
  const porAnoTop = new Map();
  for (const x of top) { const a = x.ent.slice(0, 4); porAnoTop.set(a, (porAnoTop.get(a) || 0) + 1); }
  console.log(`     por año: ${[...porAnoTop.entries()].sort().map(([a, n]) => `${a}:${n}`).join(" · ")}`);
  const porMesTop = new Map();
  for (const x of top) { const m = x.ent.slice(4, 6); porMesTop.set(m, (porMesTop.get(m) || 0) + 1); }
  console.log(`     por mes del año: ${[...porMesTop.entries()].sort().map(([m, n]) => `${m}:${n}`).join(" · ")}`);
  console.log(`     concentración: el año que más aporta pone ${pct(Math.max(...porAnoTop.values()) / k)} de esos billetes`);
  for (const [nom, f] of CRISIS) {
    const en = lista.filter((o) => f(mesDe(o.ent)));
    if (!en.length) continue;
    const r = ratioDe(en);
    const cuota = r.gana / con.gana;
    console.log(`     ${nom.padEnd(18)} n=${String(r.n).padStart(5)} (${pct(r.n / lista.length).padStart(6)} del total) · RATIO ${r.ratio.toFixed(2).padStart(5)} · aporta ${pct(cuota).padStart(6)} de todo lo ganado`);
  }

  // 6. el dinero en el tiempo
  console.log(`\n  ── LA CAJA, MES A MES (arriesgando ${$(APUESTA)} por intento) ──`);
  let caja = 0, pico = 0, picoMes = meses[0], bajonMax = 0, bajonMesIni = null, bajonMesFin = null;
  let bajoAgua = 0, bajoAguaMax = 0, bajoAguaIni = null, bajoAguaFin = null, aguaIni = null;
  const curva = [];
  for (const m of meses) {
    caja += porMes.get(m);
    curva.push([m, caja]);
    if (caja >= pico) {
      if (bajoAgua > bajoAguaMax) { bajoAguaMax = bajoAgua; bajoAguaIni = aguaIni; bajoAguaFin = m; }
      pico = caja; picoMes = m; bajoAgua = 0; aguaIni = null;
    } else {
      if (bajoAgua === 0) aguaIni = m;
      bajoAgua++;
      if (pico - caja > bajonMax) { bajonMax = pico - caja; bajonMesIni = picoMes; bajonMesFin = m; }
    }
  }
  if (bajoAgua > bajoAguaMax) { bajoAguaMax = bajoAgua; bajoAguaIni = aguaIni; bajoAguaFin = "aún"; }
  const opsMes = lista.length / meses.length;
  console.log(`     caja final ${$(caja)} en ${meses.length} meses · ${opsMes.toFixed(1)} operaciones al mes de media (${$(opsMes * APUESTA)} arriesgados al mes)`);
  console.log(`     BAJÓN MÁS PROFUNDO : ${$(bajonMax)} (de ${bajonMesIni} a ${bajonMesFin})`);
  console.log(`     BAJÓN MÁS LARGO    : ${bajoAguaMax} meses bajo el agua (${bajoAguaIni} → ${bajoAguaFin}) — esto es lo que hay que aguantar sin abandonar`);
  const paso = Math.max(1, Math.round(meses.length / 24));
  console.log(`     curva (cada ${paso} meses): ${curva.filter((_, i) => i % paso === 0).map(([m, v]) => `${m.slice(2)}:${Math.round(v / 1000)}k`).join(" ")}`);
  console.log(`     el bajón más profundo son ${(bajonMax / (opsMes * APUESTA)).toFixed(1)} meses de todo lo que se arriesga`);
  const netoAno = new Map();
  for (const o of lista) { const a = o.sal.slice(0, 4); netoAno.set(a, (netoAno.get(a) || 0) + APUESTA * o.ret); }
  console.log(`     caja NETA por año: ${[...netoAno.entries()].sort().map(([a, v]) => `${a} ${v >= 0 ? "+" : ""}${Math.round(v / 1000)}k`).join(" · ")}`);

  // año a año
  console.log(`\n  ── AÑO A AÑO (RATIO del cono) ──`);
  const anos = [...new Set(lista.map((o) => o.ent.slice(0, 4)))].sort();
  console.log(`     ${anos.map((a) => { const r = ratioDe(lista.filter((o) => o.ent.slice(0, 4) === a)); return `${a} ${r.ratio.toFixed(2)}`; }).join(" · ")}`);

  return {
    ratio: con.ratio, calls: calls.ratio, puts: puts.ratio, n: con.n, acierto: con.acierto,
    sinValor: sinValor.length / lista.length, k, peor: rachasTk[0].mx, peorTk: rachasTk[0].s,
    rachaTipica: medRacha, rachaCono: rachasCono[0].mx, peorM, bajoAguaMax, bajonMax,
    sinMes: sinMes.ratio, sin2020: sin2020.ratio, mejorMes: mejorMes[0],
    mayor: d[0].d, sinElMejor: sinElMejor.ratio, nTk: nt,
    ganMedio: con.gana / gana.length, perMedio: con.pierde / (lista.length - gana.length),
    porAno: anos.map((a) => `${a} ${ratioDe(lista.filter((o) => o.ent.slice(0, 4) === a)).ratio.toFixed(2)}`).join(" · "),
    tkOk: rTk.filter((x) => x[1].ratio >= 1).length, tkTot: rTk.length,
  };
}

const res = {};
res.liston = radiografia("LA ESQUINA DEL LISTÓN — 5% fuera · 90 días · salir a los 23", conoListon);
const yaVisto = new Set([conoListon[0] ? conoListon[0].celda : -1]);
let puestos = 0;
for (const t of tabla) {
  if (yaVisto.has(t.cel.id)) continue;
  if (puestos >= 3) break;
  puestos++;
  res[`alt${puestos}`] = radiografia(`REJILLA nº${puestos} POR RATIO — ${t.cel.nombre}`, porCelda.get(t.cel.id));
}

console.log(`\n\n${"═".repeat(96)}`);
console.log(`  RECORDATORIO DE PUERTAS: se han medido ${CELDAS.length} casillas sobre los MISMOS diez años.`);
console.log(`  Con tantas puertas, la mejor casilla puede ser ruido. Por eso arriba va el año a año`);
console.log(`  y el reparto por ticker: eso es lo que separa una meseta de un diente suelto.`);
console.log(`${"═".repeat(96)}\n`);
