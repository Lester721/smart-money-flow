// LA SALIDA: DEJAR CORRER AL GANADOR, CORTAR AL PERDEDOR
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// La esquina barata (5% fuera del dinero, ~90 días de plazo) vende HOY a los 23 días de bolsa,
// pase lo que pase: tanto la que va al +300% como la que va al −60%. El listón medido sobre
// 6.924 operaciones y diez años dice que el ganador medio deja $1.237 y el perdedor se lleva
// $602, y que el cono (call+put) da un RATIO de 1,03 dólares ganados por dólar perdido.
//
// Esta es la palanca que ataca ese ratio SIN tocar el acierto: si con la misma entrada y el
// mismo número de aciertos consigues que el ganador medio valga más o que el perdedor medio
// valga menos, el ratio sube sin haber acertado una sola vez más.
//
// Se prueban salidas que NO son de reloj, comprobadas CADA DÍA DE BOLSA con el BID de ese día
// (que es al bid como se sale de verdad), y se sale el primer día que se cumple la condición:
//   · objetivo de beneficio: +50%, +100%, +200%, +300%, +500%
//   · stop de pérdida: −30%, −50%, −70%
//   · las 24 combinaciones de objetivo Y stop
//   · trailing: salir cuando el bid caiga un X% desde el MÁXIMO ALCANZADO HASTA ESE DÍA
//   · y el control: no hacer nada y aguantar hasta el vencimiento
// Todo eso por partida doble: con el tope de reloj a los 23 días (si no salta la regla, se
// vende igual) y sin tope (si no salta la regla, se aguanta a vencimiento).
//
// ═══ LA TRAMPA QUE HAY QUE ESQUIVAR ═════════════════════════════════════════════════════════
//
// Mirar el máximo del PERIODO ENTERO para decidir cuándo salir es mirar al futuro y fabrica un
// resultado precioso que no existe. Aquí el trailing usa el máximo HASTA ESE DÍA: el día 7 sólo
// sabe lo que pasó del 1 al 7. La regla se evalúa con el cierre de ese día y se ejecuta con el
// BID de ese mismo cierre — nunca con el precio del día siguiente ni con el máximo del mes.
//
// Y la ejecución es conservadora a propósito: si el bid pasa de largo el objetivo o se hunde por
// debajo del stop, se sale AL BID REAL DE ESE DÍA, no al precio bonito de la regla. Un stop
// al −50% que se encuentra el bid en −80% cobra −80%.
//
// ═══ EL PREJUICIO QUE NO SE APLICA ══════════════════════════════════════════════════════════
//
// La memoria del proyecto dice que los stops perdieron 19 de 20 veces. Pero eso se midió sobre
// VENTA de prima, donde el stop corta justo antes de que la cosa revierta. En una compra
// convexa el stop hace otra cosa distinta: recorta la cola izquierda, que aquí es el 100% de la
// prima. Se mide sin prejuicio y se dice lo que salga.
//
// Reglas de la casa: se compra al ASK y se vende al BID, jamás punto medio, jamás un modelo de
// precios. Un hueco (no hay cadena ese día) NO es un cero: el día no se puede evaluar, y si
// falta el precio terminal la operación se descarta y se cuenta aparte. Un contrato que
// desaparece de la cadena SÍ es un cero real: el descargador filtra bid<=0, o sea que "no está"
// significa "no hay comprador".
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/z2-la-salida-inteligente.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const OTM = 5;                 // % fuera del dinero      ─┐
const DTE_OBJ = 90;            // plazo objetivo           ├─ la esquina del listón, sin tocar
const DTE_TOL = 25;            // margen del plazo         │
const ASK_MIN = 0.10;          //                         ─┘
const RELOJ = 23;              // el tope de reloj de hoy (días de bolsa)
const APUESTA = 1000;          // mismo riesgo en cada intento

const SOLO = process.env.SOLO ? process.env.SOLO.split(",") : null;

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (100 * x).toFixed(1) + "%";
const fmt = (n) => Math.round(n).toLocaleString("es-ES");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (SOLO && !SOLO.includes(m[1])) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
const NDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${NDIAS.toLocaleString("es-ES")} días de cadena\n`);

/** El spot por PARIDAD PUT-CALL: el strike donde la call y la put valen casi lo mismo.
 *  Es una identidad de no-arbitraje leída de la propia cadena, no un modelo. */
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

// ── FASE 1+2: un solo recorrido por ticker ──────────────────────────────────
// Se abre una operación el primer día de cada mes (call y put) y se le construye la SERIE DIARIA
// de bids hasta el vencimiento. Cada fichero de cadena se lee UNA vez.

const ops = [];
let huecoTerminal = 0, sinContrato = 0, sinCadenaTramo = 0, diasSerie = 0;
let ceroYResucita = 0, grupoAusente = 0, contratoAusente = 0;
const t0 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const ultimo = dias[dias.length - 1];
  const abiertas = [];               // operaciones vivas de este ticker
  const vistos = new Set();

  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const esPrimeroDeMes = !vistos.has(d.slice(0, 6));
    const necesitaCadena = esPrimeroDeMes || abiertas.length > 0;
    if (!necesitaCadena) continue;

    const p = `${CDIR}/${sym}_d${d}.json`;
    let c = null;
    if (existsSync(p)) { try { c = JSON.parse(readFileSync(p, "utf8")); } catch { c = null; } }

    // (a) actualizar las vivas con el bid de HOY
    for (let a = abiertas.length - 1; a >= 0; a--) {
      const o = abiertas[a];
      let v;
      if (!c) { v = null; sinCadenaTramo++; }            // HUECO: hoy no se puede evaluar
      else {
        const g = c[o.exp];
        if (!g) { v = 0; grupoAusente++; }               // la expiración no está: sin puja
        else if (!g[o.clave]) { v = 0; contratoAusente++; }
        else v = g[o.clave][0];                          // el BID, que es como se sale
      }
      o.serie.push(v);
      diasSerie++;
      if (i >= o.iFin) { abiertas.splice(a, 1); ops.push(o); }
    }

    // (b) abrir las nuevas — con lo que se sabía ESE día
    if (esPrimeroDeMes) {
      vistos.add(d.slice(0, 6));
      if (c) {
        const sp = spotDe(c);
        if (sp) for (const tipo of ["C", "P"]) {
          const objetivo = tipo === "C" ? sp * (1 + OTM / 100) : sp * (1 - OTM / 100);
          let mejor = null, mejorD = Infinity;
          for (const [exp, g] of Object.entries(c)) {
            const dte = Math.round((ms(exp) - ms(d)) / 86_400_000);
            if (Math.abs(dte - DTE_OBJ) > DTE_TOL) continue;
            for (const [clave, ba] of Object.entries(g)) {
              if (clave.slice(-1) !== tipo) continue;
              const K = Number(clave.slice(0, -2));
              const [bid, ask] = ba;
              if (!(ask >= ASK_MIN)) continue;
              const dd = Math.abs(K - objetivo) / sp + Math.abs(dte - DTE_OBJ) / 1000;
              if (dd < mejorD) { mejorD = dd; mejor = { exp, clave, K, bid, ask, dte }; }
            }
          }
          if (!mejor) continue;
          // los dos finales tienen que existir en los datos: el de reloj y el de vencimiento
          const iReloj = i + RELOJ;
          if (iReloj >= dias.length) continue;
          if (ultimo < mejor.exp) continue;              // los datos no llegan al vencimiento
          let iExp = -1;
          for (let j = i + 1; j < dias.length; j++) { if (dias[j] > mejor.exp) break; iExp = j; }
          if (iExp <= i) continue;
          abiertas.push({
            sym, dia: d, ano: d.slice(0, 4), tipo, spot: sp,
            exp: mejor.exp, clave: mejor.clave, K: mejor.K, ask: mejor.ask, bidEntrada: mejor.bid,
            dte: mejor.dte, iReloj: iReloj - i - 1, iExp: iExp - i - 1, iFin: Math.max(iReloj, iExp),
            serie: [],
          });
        }
      }
    }
  }
  // las que se quedaron abiertas al acabar los días del ticker no se cierran: no deberían existir
  for (const o of abiertas) ops.push(o);
  process.stdout.write(`\r   ${sym} · ${ops.length} operaciones · ${((Date.now() - t0) / 1000).toFixed(0)}s   `);
}
console.log("");

// ── criba: los dos precios terminales tienen que ser datos reales ───────────
const limpias = [];
for (const o of ops) {
  const vReloj = o.serie[o.iReloj];
  const vExp = o.serie[o.iExp];
  if (vReloj == null || vExp == null || o.serie.length <= Math.max(o.iReloj, o.iExp)) { huecoTerminal++; continue; }
  // ¿un cero que luego resucita? sería un cero FALSO y hay que saberlo
  let visto0 = false, resucita = false;
  for (const v of o.serie) { if (v === 0) visto0 = true; else if (v > 0 && visto0) resucita = true; }
  if (resucita) ceroYResucita++;
  limpias.push(o);
}

console.log(`\n${"═".repeat(100)}`);
console.log(`  SANIDAD — antes de creerse ningún número`);
console.log(`${"═".repeat(100)}`);
console.log(`  operaciones construidas ............ ${fmt(ops.length)}`);
console.log(`  descartadas por HUECO terminal ..... ${fmt(huecoTerminal)}  (falta el precio de salida: no se rellena)`);
console.log(`  operaciones medidas ................ ${fmt(limpias.length)}`);
console.log(`  días de serie leídos ............... ${fmt(diasSerie)}  (${(diasSerie / Math.max(1, ops.length)).toFixed(1)} por operación)`);
console.log(`    · de ellos, sin cadena (hueco) ... ${fmt(sinCadenaTramo)} (${pct(sinCadenaTramo / Math.max(1, diasSerie))})`);
console.log(`    · expiración ausente del fichero . ${fmt(grupoAusente)} (${pct(grupoAusente / Math.max(1, diasSerie))})`);
console.log(`    · contrato ausente = bid 0 real .. ${fmt(contratoAusente)} (${pct(contratoAusente / Math.max(1, diasSerie))})`);
console.log(`  series con un 0 que luego resucita . ${fmt(ceroYResucita)} (${pct(ceroYResucita / Math.max(1, limpias.length))}) ← si esto fuera alto, los ceros serían falsos`);
const costePct = limpias.map((o) => o.ask / o.spot);
console.log(`  coste medio de entrada ............. ${pct(media(costePct))} del subyacente (mediana ${pct([...costePct].sort((a, b) => a - b)[Math.floor(costePct.length / 2)])})`);
console.log(`     (una opción 5% fuera a 90 días cuesta típicamente entre el 1% y el 6%: si no, hay un fallo)`);
console.log(`  plazo real medio ................... ${media(limpias.map((o) => o.dte)).toFixed(1)} días · distancia real media ${pct(media(limpias.map((o) => Math.abs(o.K / o.spot - 1))))}`);
console.log(`  horquilla de entrada ............... ${pct(media(limpias.map((o) => (o.ask - o.bidEntrada) / o.ask)))} de la prima`);
console.log(`  vence sin valor (aguantando) ....... ${pct(limpias.filter((o) => o.serie[o.iExp] === 0).length / limpias.length)}`);
console.log(`  a los 23 días vale 0 ............... ${pct(limpias.filter((o) => o.serie[o.iReloj] === 0).length / limpias.length)}`);
console.log(`  primera entrada ${limpias[0]?.dia} · última ${limpias[limpias.length - 1]?.dia}`);
// LA TRAMPA DEL VENCIMIENTO: si una opción MUY dentro del dinero dejara de cotizar el último día,
// se leería como 0 y fabricaría una pérdida enorme que no existió. Se comprueba mirando el día
// ANTERIOR: si el día antes valía $1 y el día del vencimiento vale 0, hay que sospechar.
const alVenc0 = limpias.filter((o) => o.serie[o.iExp] === 0);
const saltoRaro = alVenc0.filter((o) => (o.serie[o.iExp - 1] ?? 0) >= 0.5);
console.log(`  de las ${fmt(alVenc0.length)} que acaban en 0 al vencimiento, ${fmt(saltoRaro.length)} (${pct(saltoRaro.length / Math.max(1, alVenc0.length))}) valían ≥$0,50 el día anterior`);
console.log(`     (si esto fuera alto, serían opciones DENTRO del dinero leídas como cero: el resultado no valdría nada)`);
console.log(`     bid medio el día antes de acabar en 0: $${(media(alVenc0.map((o) => o.serie[o.iExp - 1] ?? 0))).toFixed(3)}`);

if (limpias.length < 200) { console.error("\nMuestra insuficiente."); process.exit(1); }

// ── EL MOTOR DE SALIDA ──────────────────────────────────────────────────────
// Devuelve {ret, diasDentro, motivo}. Se recorre día a día, en orden, y se sale el PRIMER día
// que se cumple la condición, AL BID DE ESE DÍA. Los huecos no se pueden evaluar: se saltan.
// UN BID DE 0 NO ES UN PRECIO DE VENTA: significa que ese día NO HAY COMPRADOR, y lo que no
// tiene comprador no se puede vender. Por eso una regla sólo puede ejecutarse un día con bid > 0.
// El día terminal es distinto: ahí se cobra lo que haya, y si no hay puja se pierde el 100% —
// eso es un dato real, no un hueco. (`crudo` = versión ingenua que sí vende a 0: sólo para
// enseñar cuánto cambia el resultado según cómo se modele la ejecución.)
function salir(o, { horizonte, obj, stop, trail }, crudo = false) {
  const fin = horizonte === "reloj" ? o.iReloj : o.iExp;
  let maxBid = 0;
  for (let j = 0; j <= fin; j++) {
    const v = o.serie[j];
    if (v == null) continue;                       // HUECO: ese día no se sabe nada
    if (v > maxBid) maxBid = v;                    // máximo HASTA ESE DÍA, jamás del periodo
    if (j === fin) break;                          // el último día se vende igual: no hay mañana
    if (!(v > 0) && !crudo) continue;              // sin comprador no hay venta posible
    if (obj != null && v >= o.ask * (1 + obj)) return { ret: (v - o.ask) / o.ask, j, motivo: "obj" };
    if (stop != null && v <= o.ask * (1 - stop)) return { ret: (v - o.ask) / o.ask, j, motivo: "stop" };
    if (trail != null && maxBid > 0 && v <= maxBid * (1 - trail)) return { ret: (v - o.ask) / o.ask, j, motivo: "trail" };
  }
  const v = o.serie[fin];
  return { ret: (v - o.ask) / o.ask, j: fin, motivo: horizonte === "reloj" ? "reloj" : "vencimiento" };
}

// ── LA VARA DE LESTER ───────────────────────────────────────────────────────
// RATIO = dólares ganados ÷ dólares perdidos, arriesgando lo mismo en cada intento.
function vara(rets) {
  if (!rets.length) return null;
  const d = rets.map((r) => APUESTA * r);
  const gan = d.filter((x) => x > 0), per = d.filter((x) => x <= 0);
  const G = gan.reduce((a, b) => a + b, 0), P = Math.abs(per.reduce((a, b) => a + b, 0));
  return {
    n: d.length, acierto: gan.length / d.length, G, P,
    ratio: P > 0 ? G / P : Infinity, neto: G - P,
    ganMedio: gan.length ? G / gan.length : 0, perMedio: per.length ? P / per.length : 0,
    mayor: d.length ? Math.max(...d) : 0,
  };
}

// ── LA REJILLA ──────────────────────────────────────────────────────────────
const OBJS = [null, 0.5, 1.0, 2.0, 3.0, 5.0];
const STOPS = [null, 0.2, 0.3, 0.5, 0.7];
const TRAILS = [0.3, 0.4, 0.5, 0.6];
const HORIZ = ["reloj", "vencimiento"];

const celdas = [];
for (const horizonte of HORIZ) {
  for (const obj of OBJS) for (const stop of STOPS) celdas.push({ horizonte, obj, stop, trail: null });
  for (const trail of TRAILS) celdas.push({ horizonte, obj: null, stop: null, trail });
  for (const trail of [0.3, 0.5]) for (const obj of [1.0, 3.0]) celdas.push({ horizonte, obj, stop: null, trail });
}
const nombre = (c) =>
  `${c.horizonte === "reloj" ? "23d" : "venc"} ` +
  `obj ${c.obj == null ? " — " : ("+" + Math.round(100 * c.obj) + "%").padStart(5)} · ` +
  `stop ${c.stop == null ? " — " : ("−" + Math.round(100 * c.stop) + "%").padStart(5)} · ` +
  `trail ${c.trail == null ? " — " : ("−" + Math.round(100 * c.trail) + "%").padStart(5)}`;

console.log(`\n\n${"═".repeat(100)}`);
console.log(`  LA REJILLA — ${celdas.length} celdas medidas sobre las MISMAS ${fmt(limpias.length)} entradas`);
console.log(`  (misma esquina 5% / 90 días, misma fecha de compra: lo ÚNICO que cambia es cuándo se vende)`);
console.log(`${"═".repeat(100)}\n`);
console.log("| salida | n | acierto | ganador medio | perdedor medio | días dentro | RATIO cono | calls | puts | $ neto/op |");
console.log("|---|---|---|---|---|---|---|---|---|---|");

const res = [];
for (const c of celdas) {
  const salidas = limpias.map((o) => ({ o, s: salir(o, c) }));
  const todo = vara(salidas.map((x) => x.s.ret));
  const calls = vara(salidas.filter((x) => x.o.tipo === "C").map((x) => x.s.ret));
  const puts = vara(salidas.filter((x) => x.o.tipo === "P").map((x) => x.s.ret));
  const diasDentro = media(salidas.map((x) => x.s.j + 1));
  const r = { c, todo, calls, puts, diasDentro, salidas };
  res.push(r);
  console.log(`| ${nombre(c)} | ${todo.n} | ${pct(todo.acierto)} | $${fmt(todo.ganMedio)} | $${fmt(todo.perMedio)} | ${diasDentro.toFixed(1)} | **${todo.ratio.toFixed(2)}** | ${calls.ratio.toFixed(2)} | ${puts.ratio.toFixed(2)} | $${fmt(todo.neto / todo.n)} |`);
}

// ── el control: la regla de HOY ─────────────────────────────────────────────
const base = res.find((r) => r.c.horizonte === "reloj" && r.c.obj == null && r.c.stop == null && r.c.trail == null);
console.log(`\n  CONTROL (la regla de hoy, vender a los 23 días pase lo que pase): RATIO ${base.todo.ratio.toFixed(2)} · ` +
  `acierta ${pct(base.todo.acierto)} · ganador medio $${fmt(base.todo.ganMedio)} · perdedor medio $${fmt(base.todo.perMedio)}`);
console.log(`  (el listón publicado sobre 6.924 operaciones daba 1,03 / 33,3% / $1.237 / $602 — aquí hay ${fmt(limpias.length)} porque se exige`);
console.log(`   que los datos lleguen TAMBIÉN al vencimiento, para que todas las celdas midan sobre las mismas entradas)`);

// ── ordenar por la vara ─────────────────────────────────────────────────────
const orden = [...res].sort((a, b) => b.todo.ratio - a.todo.ratio);
console.log(`\n${"═".repeat(100)}`);
console.log(`  LAS 10 MEJORES POR RATIO DEL CONO`);
console.log(`${"═".repeat(100)}`);
for (const r of orden.slice(0, 10)) {
  console.log(`  ${nombre(r.c)}  →  RATIO ${r.todo.ratio.toFixed(2)} · acierta ${pct(r.todo.acierto)} · ` +
    `gana $${fmt(r.todo.G)} · pierde $${fmt(r.todo.P)} · neto $${fmt(r.todo.neto)}`);
}
console.log(`\n  LAS 5 PEORES:`);
for (const r of orden.slice(-5)) console.log(`  ${nombre(r.c)}  →  RATIO ${r.todo.ratio.toFixed(2)}`);

// ── la mejor, a fondo ───────────────────────────────────────────────────────
const mejor = orden[0];
const ANOS = [...new Set(limpias.map((o) => o.ano))].sort();

function porAno(r) {
  return ANOS.map((a) => {
    const v = vara(r.salidas.filter((x) => x.o.ano === a).map((x) => x.s.ret));
    return { a, ratio: v ? v.ratio : NaN, n: v ? v.n : 0 };
  });
}
function porTicker(r) {
  const m = new Map();
  for (const x of r.salidas) {
    if (!m.has(x.o.sym)) m.set(x.o.sym, []);
    m.get(x.o.sym).push(x.s.ret);
  }
  const t = [...m.entries()].map(([sym, rets]) => ({ sym, ...vara(rets) })).sort((a, b) => b.G - a.G);
  const totalG = t.reduce((a, x) => a + x.G, 0);
  let acum = 0, mitad = 0;
  for (const x of t) { acum += x.G; mitad++; if (acum >= totalG / 2) break; }
  return { t, mitad, positivos: t.filter((x) => x.ratio > 1).length };
}
function sinElMejor(r) {
  const d = r.salidas.map((x) => APUESTA * x.s.ret).sort((a, b) => b - a);
  const resto = d.slice(1);
  const G = resto.filter((x) => x > 0).reduce((a, b) => a + b, 0);
  const P = Math.abs(resto.filter((x) => x <= 0).reduce((a, b) => a + b, 0));
  return P > 0 ? G / P : Infinity;
}

function aFondo(r, titulo) {
  console.log(`\n${"═".repeat(100)}`);
  console.log(`  ${titulo}: ${nombre(r.c)}`);
  console.log(`${"═".repeat(100)}`);
  console.log(`  cono  n=${r.todo.n} · acierta ${pct(r.todo.acierto)} · gana $${fmt(r.todo.G)} · pierde $${fmt(r.todo.P)} · RATIO ${r.todo.ratio.toFixed(2)} · neto $${fmt(r.todo.neto)}`);
  console.log(`  calls n=${r.calls.n} · acierta ${pct(r.calls.acierto)} · RATIO ${r.calls.ratio.toFixed(2)}    puts n=${r.puts.n} · acierta ${pct(r.puts.acierto)} · RATIO ${r.puts.ratio.toFixed(2)}`);
  console.log(`  ganador medio $${fmt(r.todo.ganMedio)} · perdedor medio $${fmt(r.todo.perMedio)} · el mayor billete pagó $${fmt(r.todo.mayor)}`);
  console.log(`  sin ese mayor billete el RATIO queda en ${sinElMejor(r).toFixed(2)}`);
  const mot = new Map();
  for (const x of r.salidas) mot.set(x.s.motivo, (mot.get(x.s.motivo) || 0) + 1);
  console.log(`  por qué se salió: ${[...mot.entries()].map(([k, v]) => `${k} ${pct(v / r.salidas.length)}`).join(" · ")} · días dentro ${r.diasDentro.toFixed(1)}`);
  console.log(`  neto por operación: $${fmt(r.todo.neto / r.todo.n)} (arriesgando $${APUESTA} cada vez)`);
  console.log(`  operaciones que acaban valiendo CERO (se pierde el 100%): ${pct(r.salidas.filter((x) => x.s.ret <= -0.999).length / r.salidas.length)}`);
  const crudo = vara(limpias.map((o) => salir(o, r.c, true).ret));
  console.log(`  si se permitiera vender a bid CERO (que no se puede, no hay comprador): RATIO ${crudo.ratio.toFixed(2)} — la diferencia mide cuánto depende del modelo de ejecución`);
  console.log(`\n  AÑO A AÑO (el cono):`);
  console.log(`  | año | n | RATIO |`);
  for (const { a, ratio, n } of porAno(r)) console.log(`  | ${a} | ${String(n).padStart(4)} | ${ratio.toFixed(2).padStart(5)} |`);
  const pt = porTicker(r);
  console.log(`\n  POR TICKER: ${pt.positivos} de ${pt.t.length} tickers con ratio > 1 · ${pt.mitad} tickers aportan la MITAD de todo lo ganado`);
  console.log(`  mejores: ${pt.t.slice(0, 5).map((x) => `${x.sym} ${x.ratio.toFixed(2)}`).join(" · ")}`);
  console.log(`  peores:  ${pt.t.slice(-5).map((x) => `${x.sym} ${x.ratio.toFixed(2)}`).join(" · ")}`);
  const crisis = { "2018": null, "2020": null, "2022": null, "2025": null };
  for (const k of Object.keys(crisis)) {
    const v = vara(r.salidas.filter((x) => x.o.ano === k).map((x) => x.s.ret));
    crisis[k] = v ? `${v.ratio.toFixed(2)} (n=${v.n})` : "sin datos";
  }
  console.log(`  CRISIS: 2018 ${crisis["2018"]} · 2020 ${crisis["2020"]} · 2022 ${crisis["2022"]} · 2025 ${crisis["2025"]}`);
}

aFondo(base, "EL CONTROL — lo que se hace hoy");
aFondo(mejor, "LA MEJOR CELDA");

// ── la vecindad: ¿meseta o diente solitario? ────────────────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log(`  LA VECINDAD DE LA MEJOR — una casilla buena rodeada de casillas malas es ruido`);
console.log(`${"═".repeat(100)}`);
const vecinas = res.filter((r) => {
  const a = r.c, b = mejor.c;
  if (a === b) return false;
  const iO = (x) => OBJS.indexOf(x), iS = (x) => STOPS.indexOf(x);
  const mismoTrail = (a.trail ?? -1) === (b.trail ?? -1);
  const dO = Math.abs(iO(a.obj) - iO(b.obj)), dS = Math.abs(iS(a.stop) - iS(b.stop));
  return a.horizonte === b.horizonte && mismoTrail && dO <= 1 && dS <= 1 && dO + dS >= 1;
});
for (const r of vecinas) console.log(`  ${nombre(r.c)}  →  RATIO ${r.todo.ratio.toFixed(2)}`);
const mismaFamilia = res.filter((r) => r.c.horizonte === mejor.c.horizonte && (r.c.trail ?? -1) === (mejor.c.trail ?? -1));
console.log(`  · el mismo horizonte y familia: ${mismaFamilia.filter((r) => r.todo.ratio > base.todo.ratio).length} de ${mismaFamilia.length} celdas por encima del control`);
console.log(`  · en TODA la rejilla: ${res.filter((r) => r.todo.ratio > base.todo.ratio).length} de ${res.length} celdas por encima del control (${base.todo.ratio.toFixed(2)})`);
console.log(`  · por encima del listón 1,03: ${res.filter((r) => r.todo.ratio > 1.03).length} de ${res.length}`);
console.log(`  · por encima de 1,30: ${res.filter((r) => r.todo.ratio > 1.30).length} de ${res.length}`);

// ── el mapa completo objetivo × stop, por horizonte ─────────────────────────
for (const h of HORIZ) {
  console.log(`\n  MAPA objetivo × stop — horizonte ${h === "reloj" ? "tope de 23 días" : "aguantar a vencimiento"} (RATIO del cono)`);
  console.log(`  | obj \\ stop | ${STOPS.map((s) => (s == null ? "sin stop" : "−" + Math.round(100 * s) + "%").padStart(8)).join(" | ")} |`);
  for (const o of OBJS) {
    const fila = STOPS.map((s) => {
      const r = res.find((x) => x.c.horizonte === h && x.c.obj === o && x.c.stop === s && x.c.trail == null);
      return (r ? r.todo.ratio.toFixed(2) : "—").padStart(8);
    });
    console.log(`  | ${(o == null ? "sin obj" : "+" + Math.round(100 * o) + "%").padStart(10)} | ${fila.join(" | ")} |`);
  }
}

// ── el ratio no es lo único: ¿cuánto DINERO deja cada celda? ────────────────
const porNeto = [...res].sort((a, b) => b.todo.neto - a.todo.neto);
console.log(`\n${"═".repeat(100)}`);
console.log(`  LAS 8 QUE MÁS DINERO DEJAN (neto por operación, arriesgando $${APUESTA} cada vez)`);
console.log(`  — porque un stop muy corto puede subir el ratio y dejar de ganar dinero`);
console.log(`${"═".repeat(100)}`);
for (const r of porNeto.slice(0, 8)) {
  console.log(`  ${nombre(r.c)}  →  neto/op $${fmt(r.todo.neto / r.todo.n)} · RATIO ${r.todo.ratio.toFixed(2)} · acierta ${pct(r.todo.acierto)}`);
}

// ── año a año, control contra las candidatas ───────────────────────────────
const candidatas = [base, ...orden.slice(0, 3), porNeto[0]].filter((v, i, a) => a.indexOf(v) === i);
console.log(`\n${"═".repeat(100)}`);
console.log(`  AÑO A AÑO — el control contra las candidatas (RATIO del cono). Lo que hay que exigir es`);
console.log(`  que aguante TODOS los años, no que gane de media.`);
console.log(`${"═".repeat(100)}`);
console.log(`  | año | ${candidatas.map((r) => nombre(r.c).padEnd(44)).join(" | ")} |`);
for (const a of ANOS) {
  const fila = candidatas.map((r) => {
    const v = vara(r.salidas.filter((x) => x.o.ano === a).map((x) => x.s.ret));
    return (v ? `${v.ratio.toFixed(2)} (n=${v.n})` : "—").padEnd(44);
  });
  console.log(`  | ${a} | ${fila.join(" | ")} |`);
}
const gana = candidatas.map((r) => ANOS.filter((a) => {
  const v = vara(r.salidas.filter((x) => x.o.ano === a).map((x) => x.s.ret));
  const b = vara(base.salidas.filter((x) => x.o.ano === a).map((x) => x.s.ret));
  return v && b && v.ratio > b.ratio;
}).length);
console.log(`  años en que cada candidata bate al control: ${candidatas.map((r, i) => `${nombre(r.c)} → ${gana[i]}/${ANOS.length}`).join("  ·  ")}`);

// ── lo estructural: ¿qué palanca mueve algo y cuál no? ─────────────────────
console.log(`\n${"═".repeat(100)}`);
console.log(`  LAS DOS PALANCAS POR SEPARADO — promediando cada fila y cada columna de los dos mapas`);
console.log(`  (así se ve si la palanca hace algo DE VERDAD o si la mejor casilla es una casualidad)`);
console.log(`${"═".repeat(100)}`);
const soloOS = res.filter((r) => r.c.trail == null);
for (const o of OBJS) {
  const v = soloOS.filter((r) => r.c.obj === o).map((r) => r.todo.ratio);
  console.log(`  objetivo ${(o == null ? "ninguno" : "+" + Math.round(100 * o) + "%").padStart(8)} → ratio medio ${media(v).toFixed(3)} (${v.length} celdas, de ${Math.min(...v).toFixed(2)} a ${Math.max(...v).toFixed(2)})`);
}
for (const s of STOPS) {
  const v = soloOS.filter((r) => r.c.stop === s).map((r) => r.todo.ratio);
  console.log(`  stop     ${(s == null ? "ninguno" : "−" + Math.round(100 * s) + "%").padStart(8)} → ratio medio ${media(v).toFixed(3)} (${v.length} celdas, de ${Math.min(...v).toFixed(2)} a ${Math.max(...v).toFixed(2)})`);
}
for (const h of HORIZ) {
  const v = res.filter((r) => r.c.horizonte === h);
  console.log(`  horizonte ${(h === "reloj" ? "23 días" : "vencimiento").padStart(11)} → ratio medio ${media(v.map((r) => r.todo.ratio)).toFixed(3)} · neto/op medio $${fmt(media(v.map((r) => r.todo.neto / r.todo.n)))} · días dentro ${media(v.map((r) => r.diasDentro)).toFixed(1)}`);
}
const todos = res.map((r) => r.todo.ratio);
console.log(`\n  TODA la rejilla vive entre ${Math.min(...todos).toFixed(2)} y ${Math.max(...todos).toFixed(2)}. El control está en ${base.todo.ratio.toFixed(2)}.`);

console.log(`\n${"═".repeat(100)}`);
console.log(`  ${res.length} celdas sobre los mismos diez años y las mismas ${fmt(limpias.length)} entradas.`);
console.log(`  Con tantas puertas, la mejor casilla puede ser suerte: por eso arriba están el año a año,`);
console.log(`  el reparto por ticker y la vecindad. Una casilla alta con vecinas bajas NO es un hallazgo.`);
console.log(`${"═".repeat(100)}\n`);
