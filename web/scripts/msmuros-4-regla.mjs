// ═══════════════════════════════════════════════════════════════════════════════════════════
// MUROS-MS · PASO 4 — LA REGLA, MEDIDA CON 1.122 DÍAS Y PRECIOS REALES
//
// LA REGLA (con las palabras del encargo): "comprar cuando el precio toque el muro de puts con
// objetivo el imán; vender en el muro de calls".
//
// LO QUE SE SABE AL LLEGAR AQUÍ (pasos 1-3):
//   · el max_pain de MS es EXACTAMENTE el nuestro (12/12) → mismo OI, mismo vencimiento: 0DTE
//   · su magnet se reproduce con nuestra gamma 0DTE al cierre (7/12 exacto, 3,8 pts de error)
//   · sus MUROS, en la serie diaria, están a 3,1 y 5,8 puntos del precio → son el strike de al
//     lado. No son niveles: son el dinero. Y además su foto es del CIERRE (error 0,72 pts contra
//     nuestro cierre, 43,77 contra nuestro 09:35), o sea que no se puede operar ese mismo día.
// Por eso la regla se mide con NUESTROS niveles de las 09:35, que sí están disponibles a tiempo
// y sí se pueden calcular en 1.122 días.
//
// EL VEHÍCULO — el único honesto aquí: SPXW 0DTE en VERTICAL de débito (Lester no opera desnudo
// el 0DTE). Se compra la call ATM AL ASK y se vende la de 25 puntos más arriba AL BID; al salir,
// al revés. Todas las cotizaciones son las del fichero, barra de 5 minutos. Nunca punto medio,
// nunca Black-Scholes.
//
// SOLAPAMIENTO: CERO. Cada operación nace y muere el mismo día → n efectiva = n operaciones.
//
// CONTROLES (obligatorios):
//   A. AZAR-NIVEL — el mismo día, el mismo vehículo, pero el "muro" es un nivel SORTEADO de la
//      bolsa de distancias observadas. Contesta: ¿el muro elige mejor que una raya cualquiera?
//   B. AZAR-HORA  — entrar en una barra sorteada del día con el mismo objetivo. Contesta: ¿el
//      TOQUE aporta algo, o es que comprar verticales esos días paga?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/msmuros-4-regla.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIV = "scripts/gex-niveles.json";
const SALIDA = "scripts/msmuros-4-salida.json";
const CACHE = "scripts/msmuros-4-camino.json";

const CUENTA = 56389;
const ANCHO = 25;              // ancho de la vertical, en puntos de SPX
const HORA0 = "09:40";         // primera barra en la que se puede actuar (los niveles son de 09:35)
const HORAF = "15:55";         // última barra operable
const SORTEOS = 300;

function columnas(cab, pedidas, f) {
  const c = cab.split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = {}; const faltan = [];
  for (const p of pedidas) { const i = c.indexOf(p); if (i < 0) faltan.push(p); idx[p] = i; }
  if (faltan.length) throw new Error(f + ": faltan columnas [" + faltan.join(",") + "]");
  return idx;
}

// ═══ LECTURA DE UN DÍA: camino de 5 min + cotizaciones reales de las CALLS ═════════════════
// Se guarda sólo lo necesario: por hora → precio del subyacente; por strike|hora → [bid, ask].
function leerDia(fecha) {
  const f = DIR + "/iv_" + fecha + "_C.csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask", "underlying_price"], f);
  const camino = new Map();      // "HH:MM" → S
  const q = new Map();           // "K|HH:MM" → [bid, ask]
  for (let j = 1; j < lin.length; j++) {
    const l = lin[j]; if (l.length < 20) continue;
    const c = l.split(",");
    const ts = c[I.timestamp]; if (ts.length < 16) continue;
    const h = ts.slice(11, 16);
    const sp = +c[I.underlying_price];
    if (sp > 0 && !camino.has(h)) camino.set(h, sp);
    const b = +c[I.bid], a = +c[I.ask];
    if (a > 0 && a >= b) q.set(+c[I.strike] + "|" + h, [b, a]);
  }
  return { camino, q };
}

// ═══ LA OPERACIÓN: vertical de débito con cotizaciones reales ══════════════════════════════
// dir=+1 → alcista (compra call K, vende call K+ANCHO). dir=−1 → bajista (vende call K,
// compra call K+ANCHO: es un crédito, o sea la vertical bajista con las mismas dos patas).
function abrir(dia, h, S, dir) {
  const K1 = Math.round(S / 5) * 5;
  const K2 = K1 + ANCHO;
  const a = dia.q.get(K1 + "|" + h), b = dia.q.get(K2 + "|" + h);
  if (!a || !b) return null;
  if (dir > 0) {
    const coste = a[1] - b[0];                 // compro K1 al ASK, vendo K2 al BID
    if (!(coste > 0) || coste >= ANCHO) return null;
    return { K1, K2, dir, coste };
  }
  const credito = a[0] - b[1];                 // vendo K1 al BID, compro K2 al ASK
  if (!(credito > 0) || credito >= ANCHO) return null;
  return { K1, K2, dir, coste: ANCHO - credito }; // riesgo = ancho − crédito
}
function cerrar(dia, h, op) {
  const a = dia.q.get(op.K1 + "|" + h), b = dia.q.get(op.K2 + "|" + h);
  if (!a || !b) return null;
  if (op.dir > 0) {
    const valor = a[0] - b[1];                 // vendo K1 al BID, recompro K2 al ASK
    return (valor - op.coste) * 100;
  }
  const recompra = a[1] - b[0];                // recompro K1 al ASK, vendo K2 al BID
  const credito = ANCHO - op.coste;
  return (credito - recompra) * 100;
}

// ═══ CARGA ═════════════════════════════════════════════════════════════════════════════════
const N = JSON.parse(readFileSync(NIV, "utf8"));
const horas = [];
for (let m = 9 * 60 + 40; m <= 15 * 60 + 55; m += 5) horas.push(String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"));

const LENTES = ["gam", "gamD", "oi"];
const THETAS = [0.05, 0.10, 0.25];       // tolerancia del toque, en % del precio
const LADOS = [["put", +1], ["call", -1]];
const PRUEBAS = LENTES.length * THETAS.length * LADOS.length;

// listón de Bonferroni (misma fórmula que lib/barreraHallazgos.ts)
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS);
console.log("pruebas declaradas: " + PRUEBAS + "   liston de |t|: " + LISTON);

// ═══ RECORRIDO ═════════════════════════════════════════════════════════════════════════════
const ops = {};   // clave lente|lado|theta → filas
for (const L of LENTES) for (const [ln] of LADOS) for (const th of THETAS) ops[L + "|" + ln + "|" + th] = [];
const ctrlNivel = {}, ctrlHora = {};
for (const k of Object.keys(ops)) { ctrlNivel[k] = []; ctrlHora[k] = []; }

let leidos = 0, sinCadena = 0, sinCotiza = 0;
const t0 = Date.now();
// semilla fija para que el sorteo sea reproducible
let seed = 20260820;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

for (const fila of N.filas) {
  const dia = leerDia(fila.fecha);
  if (!dia) { sinCadena++; continue; }
  leidos++;
  if (leidos % 200 === 0) console.log("  ... " + leidos + " dias  (" + ((Date.now() - t0) / 1000).toFixed(0) + "s)");

  const camino = horas.map((h) => [h, dia.camino.get(h)]).filter(([, s]) => s > 0);
  if (camino.length < 40) continue;
  const S0 = fila.apertura;

  for (const L of LENTES) {
    const niv = fila.niveles[L];
    if (!niv) continue;
    const iman = niv.imanBruto;
    for (const [ln, dir] of LADOS) {
      const muro = ln === "put" ? niv.muroPut : niv.muroCall;
      if (muro == null || iman == null) continue;
      // condiciones de partida: el muro tiene que estar del lado correcto y el imán al otro
      if (ln === "put" && !(S0 > muro && iman > muro)) continue;
      if (ln === "call" && !(S0 < muro && iman < muro)) continue;

      for (const th of THETAS) {
        const tol = (S0 * th) / 100;
        // ── la operación REAL ────────────────────────────────────────────────────────────
        let iEnt = -1;
        for (let i = 0; i < camino.length; i++) {
          const s = camino[i][1];
          if (ln === "put" ? s <= muro + tol : s >= muro - tol) { iEnt = i; break; }
        }
        const clave = L + "|" + ln + "|" + th;
        if (iEnt >= 0 && iEnt < camino.length - 1) {
          const r = operar(dia, camino, iEnt, dir, iman);
          if (r) ops[clave].push({ fecha: fila.fecha, ...r, muro, iman, S0 });
          else sinCotiza++;
        }
        // ── CONTROL A · AZAR-NIVEL: la misma distancia relativa, pero sorteada ───────────
        // se sortea el desplazamiento del muro dentro de ±1,5% del precio de apertura
        {
          const off = (rnd() * 3 - 1.5) / 100;
          const muroF = S0 * (1 + (ln === "put" ? -Math.abs(off) : Math.abs(off)));
          let i2 = -1;
          for (let i = 0; i < camino.length; i++) {
            const s = camino[i][1];
            if (ln === "put" ? s <= muroF + tol : s >= muroF - tol) { i2 = i; break; }
          }
          if (i2 >= 0 && i2 < camino.length - 1) {
            const r = operar(dia, camino, i2, dir, iman);
            if (r) ctrlNivel[clave].push({ fecha: fila.fecha, ...r });
          }
        }
        // ── CONTROL B · AZAR-HORA: entrar en una barra sorteada, mismo objetivo ──────────
        {
          const i3 = Math.floor(rnd() * (camino.length - 2));
          const r = operar(dia, camino, i3, dir, iman);
          if (r) ctrlHora[clave].push({ fecha: fila.fecha, ...r });
        }
      }
    }
  }
}

function operar(dia, camino, iEnt, dir, iman) {
  const [hEnt, sEnt] = camino[iEnt];
  const op = abrir(dia, hEnt, sEnt, dir);
  if (!op) return null;
  let iSal = camino.length - 1, motivo = "cierre";
  for (let i = iEnt + 1; i < camino.length; i++) {
    const s = camino[i][1];
    if (dir > 0 ? s >= iman : s <= iman) { iSal = i; motivo = "iman"; break; }
  }
  const pnl = cerrar(dia, camino[iSal][0], op);
  if (pnl == null) return null;
  return { pnl, coste: op.coste * 100, hEnt, hSal: camino[iSal][0], motivo, K1: op.K1, sEnt, sSal: camino[iSal][1] };
}

console.log("\ndias leidos: " + leidos + "   sin cadena en disco: " + sinCadena + "   operaciones descartadas por falta de cotizacion: " + sinCotiza);

// ═══ RESULTADOS ════════════════════════════════════════════════════════════════════════════
const media = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(v.length - 1, 1)); };
const tDe = (v) => (v.length > 2 && sd(v) > 0 ? media(v) / (sd(v) / Math.sqrt(v.length)) : 0);

const diasAno = 252 * (leidos / N.filas.length);
const resumen = {};
console.log("\n" + "═".repeat(118));
console.log("LA REGLA, OPERACIÓN A OPERACIÓN  (vertical SPXW 0DTE de " + ANCHO + " pts, comprada al ask y vendida al bid)");
console.log("═".repeat(118));
console.log("lente|lado|θ%".padEnd(18) + "n=nEfec".padStart(9) + "$/op".padStart(9) + "t".padStart(7) + "acierto%".padStart(10) + "coste$".padStart(9) + "%coste".padStart(8) + "$/año".padStart(10) + "  azarNivel$  azarHora$   ops/año");
for (const clave of Object.keys(ops)) {
  const f = ops[clave];
  if (f.length < 20) { console.log(clave.padEnd(18) + String(f.length).padStart(9) + "   (menos de 20 operaciones — no se mide)"); continue; }
  const p = f.map((x) => x.pnl);
  const cn = ctrlNivel[clave].map((x) => x.pnl);
  const ch = ctrlHora[clave].map((x) => x.pnl);
  const opsAno = (f.length / leidos) * diasAno;
  const r = {
    n: f.length, nEfectiva: f.length,
    porOp: +media(p).toFixed(2), t: +tDe(p).toFixed(2),
    acierto: +((p.filter((x) => x > 0).length / p.length) * 100).toFixed(1),
    costeMedio: +media(f.map((x) => x.coste)).toFixed(0),
    pctSobreCoste: +((media(p) / media(f.map((x) => x.coste))) * 100).toFixed(2),
    opsAno: +opsAno.toFixed(0),
    alAno: +(media(p) * opsAno).toFixed(0),
    azarNivel: cn.length > 20 ? +media(cn).toFixed(2) : null,
    azarNivelT: cn.length > 20 ? +tDe(cn).toFixed(2) : null,
    azarHora: ch.length > 20 ? +media(ch).toFixed(2) : null,
    azarHoraT: ch.length > 20 ? +tDe(ch).toFixed(2) : null,
    pctIman: +((f.filter((x) => x.motivo === "iman").length / f.length) * 100).toFixed(1),
  };
  // tercios de tiempo
  const ord = [...f].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const k = Math.floor(ord.length / 3);
  r.tercios = [0, 1, 2].map((i) => {
    const g = i < 2 ? ord.slice(i * k, (i + 1) * k) : ord.slice(2 * k);
    return { desde: g[0].fecha, hasta: g[g.length - 1].fecha, n: g.length, porOp: +media(g.map((x) => x.pnl)).toFixed(0) };
  });
  r.mismoSigno = r.tercios.every((x) => Math.sign(x.porOp) === Math.sign(r.tercios[0].porOp));
  resumen[clave] = r;
  console.log(
    clave.padEnd(18) + String(r.n).padStart(9) + r.porOp.toFixed(1).padStart(9) + r.t.toFixed(2).padStart(7) +
      r.acierto.toFixed(1).padStart(10) + String(r.costeMedio).padStart(9) + r.pctSobreCoste.toFixed(1).padStart(8) +
      String(r.alAno).padStart(10) + String(r.azarNivel).padStart(12) + String(r.azarHora).padStart(11) + String(r.opsAno).padStart(10),
  );
}

console.log("\nlistón de |t| para " + PRUEBAS + " pruebas: " + LISTON);
const gana = Object.entries(resumen).filter(([, r]) => Math.abs(r.t) >= LISTON && r.porOp > 0 && r.azarNivel != null && r.porOp > r.azarNivel && r.porOp > r.azarHora && r.mismoSigno);
console.log("casillas que pasan el listón Y ganan a los dos azares Y mismo signo en los tres tercios: " + gana.length);
for (const [k2, r] of gana) console.log("  " + k2 + "  $" + r.porOp + "/op  t=" + r.t + "  $" + r.alAno + "/año");

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), ancho: ANCHO, cuenta: CUENTA, pruebas: PRUEBAS, liston: LISTON,
  diasLeidos: leidos, diasAno: +diasAno.toFixed(1), sinCadena, sinCotiza, resumen,
  ganadoras: gana.map(([k2]) => k2),
}, null, 1));
console.log("\nescrito " + SALIDA);
