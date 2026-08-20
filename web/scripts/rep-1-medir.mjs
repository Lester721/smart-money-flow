// LA REPETICION · 1 — ¿APORTA REPETIR, POR ENCIMA DEL TAMAÑO?
//
// LA REGLA QUE SE JUZGA, dicha como se ejecuta:
//   Cuando en MarketSnack veas N o más prints DEL MISMO CONTRATO, del MISMO lado (al ask),
//   el MISMO día, que entre todos suman >= $X de prima — al cierre de ESE día compra la opción
//   de la esquina barata (~5% fuera del dinero, ~90 días) en la dirección del racimo
//   (calls -> call, puts -> put) y véndela a los K días.
//
// Y LOS DOS CONTROLES QUE MANDA EL ENCARGO:
//   (a) EL PRINT UNICO de la misma prima total — si el racimo no bate al print suelto del mismo
//       tamaño, la repetición no aporta nada y lo único que hay es TAMAÑO.
//   (b) EL AZAR — misma fecha, misma dirección, ACTIVO sorteado entre los que cotizaban.
//
// PRECIOS REALES SIEMPRE: se compra al ASK de la cadena de cierre y se vende al BID. Nunca medio,
// nunca Black-Scholes. Nada posterior al instante de decidir entra en la decisión.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-1-medir.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25;
const SALIDAS = [3, 5, 10];
const NN = [2, 3, 5];
const XX = [1e6, 2.5e6, 5e6, 10e6];
// Rejilla declarada ANTES de mirar: 3 N x 4 primas x 3 salidas = 36, más ~20 controles.
// Se usa el listón de la FAMILIA (120 pruebas ya gastadas sobre estos mismos 86 días en la
// serie print-0..9), no el de este script suelto: los datos son los mismos.
const PRUEBAS = 120;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const MULTI = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);
const BASURA = new Set([201, 202, 203, 204, 205, 206, 207, 208, 248]);
const ACCOPC = new Set([237, 240, 241, 242, 243, 244, 245]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "GLD"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const setCad = new Set(conCad);
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();

const tPorDia = (f, c) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
};
const tercios = (f, c) => {
  const o = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const k = Math.floor(o.length / 3);
  if (k < 3) return null;
  return [0, 1, 2].map((i) => media((i < 2 ? o.slice(i * k, (i + 1) * k) : o.slice(2 * k)).map((x) => x[c])));
};
const mismoSigno = (t) => t && Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]);

console.log(`\n${"#".repeat(104)}`);
console.log(`LA REPETICION · 1 — el racimo contra el print único y contra el azar`);
console.log(`${"#".repeat(104)}`);
console.log(`  ${conCad.length} activos con cadena Y cierres · cadenas hasta ${ULTIMO}`);
console.log(`  listón |t| >= ${LISTON} (Bonferroni, ${PRUEBAS} pruebas de la familia sobre estos mismos 86 días)\n`);

// ── 1. RACIMOS ──────────────────────────────────────────────────────────────────────────────
const racimos = [];
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map(), gMulti = new Map();
  for (const o of crudos) {
    const cid = o.trade_condition_id;
    if (BASURA.has(cid) || ACCOPC.has(cid)) continue;
    const esMulti = MULTI.has(cid);
    const q = parseOCC(o.symbol);
    if (!q) continue;
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60 + Number(o.timestamp.slice(17, 19)) / 3600;
    // Sólo lo que se ve ANTES de las 15:00 ET: la compra es al cierre de ese mismo día.
    if (!(et >= 9.5 && et < 15)) continue;
    const dest = esMulti ? gMulti : g;
    const k = `${o.symbol}|${lado}`;
    let r = dest.get(k);
    if (!r) r = { dY, tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike, lado, multi: esMulti, n: 0, prem: 0, t0: 99, t1: -99, mayor: 0, dte: dias(dY, q.exp) };
    r.n++; r.prem += o.premium;
    if (o.premium > r.mayor) r.mayor = o.premium;
    if (et < r.t0) r.t0 = et;
    if (et > r.t1) r.t1 = et;
    dest.set(k, r);
  }
  for (const r of g.values()) racimos.push(r);
  for (const r of gMulti.values()) racimos.push(r);
}
console.log(`  racimos (día, contrato, lado) sobre activos con cadena y antes de las 15:00 ET: ${fmt(racimos.length)}`);

// ── 2. REJILLA DE LA ESQUINA BARATA ─────────────────────────────────────────────────────────
const rejilla = new Map();     // "tk|dY" -> {salida K: {...}}
for (const tk of conCad) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  for (const dY of md) {
    if (dY > ULTIMO) continue;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const o = {};
    for (const K of SALIDAS) {
      const sal = md.find((d) => d > dY && dias(dY, d) >= K);
      if (!sal || sal > c.exp) continue;
      const cs = cadena(tk, sal);
      if (!cs) continue;
      const qC = cs[c.exp]?.[`${c.K}|C`], qP = cs[p.exp]?.[`${p.K}|P`];
      const rC = (qC ? qC[0] : 0) / c.ask - 1, rP = (qP ? qP[0] : 0) / p.ask - 1;
      o[K] = {
        g: (rC - rP) / 2, m: (rC + rP) / 2, C: rC, P: rP,
        askC: c.ask * 100, askP: p.ask * 100,
        peaje: ((c.ask - c.bid) / c.ask + (p.ask - p.bid) / p.ask) / 2,
        diasPos: dias(dY, sal),
      };
    }
    if (Object.keys(o).length) rejilla.set(`${tk}|${dY}`, o);
  }
}
const porDia = new Map();      // salida -> dY -> [{tk, ...}]
const gDia = new Map();        // salida -> dY -> deriva media del día
for (const K of SALIDAS) {
  const pd = new Map();
  for (const [k, o] of rejilla) {
    if (!o[K]) continue;
    const [tk, dY] = k.split("|");
    if (!pd.has(dY)) pd.set(dY, []);
    pd.get(dY).push({ tk, ...o[K] });
  }
  porDia.set(K, pd);
  gDia.set(K, new Map([...pd.entries()].map(([d, v]) => [d, media(v.map((x) => x.g))])));
}
{
  const pool = [...porDia.get(5).values()].flat();
  console.log(`  rejilla de la esquina 5%/90d con salida a 5d: ${fmt(pool.length)} (activo, día)`);
  console.log(`  deriva del período g = ${(100 * media(pool.map((x) => x.g))).toFixed(2)}% · coste del vehículo sin señal ${(100 * media(pool.map((x) => x.m))).toFixed(2)}% · peaje ${(100 * media(pool.map((x) => x.peaje))).toFixed(1)}%\n`);
}

/**
 * Entradas de una regla. Un evento por (activo, día): si hay varios racimos que califican
 * el mismo día en el mismo activo, se coge el de MAYOR prima — que es lo que se ve en pantalla.
 */
function construir({ nMin = 1, nMax = Infinity, xMin = 0, xMax = Infinity, lado = 1, multi = false, salida = 5, desplazar = 0, ventanaMin = Infinity, filtro = null } = {}) {
  const mejor = new Map();
  for (const r of racimos) {
    if (!!r.multi !== multi) continue;
    if (r.lado !== lado) continue;
    if (r.n < nMin || r.n > nMax) continue;
    if (r.prem < xMin || r.prem >= xMax) continue;
    if ((r.t1 - r.t0) * 60 > ventanaMin) continue;
    if (filtro && !filtro(r)) continue;
    const k = `${r.tk}|${r.dY}`;
    const a = mejor.get(k);
    if (!a || r.prem > a.prem) mejor.set(k, r);
  }
  const gd = gDia.get(salida);
  const out = [];
  for (const r of mejor.values()) {
    let dEnt = r.dY;
    if (desplazar) {
      const md = diasPorTk.get(r.tk), i = md.indexOf(r.dY);
      if (i < 0 || i + desplazar < 0 || i + desplazar >= md.length) continue;
      dEnt = md[i + desplazar];
    }
    const o = rejilla.get(`${r.tk}|${dEnt}`)?.[salida];
    if (!o || gd.get(dEnt) == null) continue;
    const dir = r.tipo === "C" ? 1 : -1;
    out.push({
      ticker: r.tk, fechaY: dEnt, fecha: `${dEnt.slice(0, 4)}-${dEnt.slice(4, 6)}-${dEnt.slice(6, 8)}`,
      dir, tipo: r.tipo, n: r.n, prem: r.prem, mayor: r.mayor, dteRacimo: r.dte,
      minutos: r.n > 1 ? (r.t1 - r.t0) * 60 : 0, hora: r.t0,
      // SEGUIR el racimo: la esquina barata en su dirección, neutralizada por la deriva del día
      seguir: dir * (o.g - gd.get(dEnt)),
      retBruto: dir === 1 ? o.C : o.P,
      prima: dir === 1 ? o.askC : o.askP,
      peaje: o.peaje, diasPos: o.diasPos,
    });
  }
  return out;
}

// ── 3. RADIOGRAFIA ──────────────────────────────────────────────────────────────────────────
const base = construir({ nMin: 3, xMin: 2.5e6, salida: 5 });
radiografia(base, ["seguir", "retBruto", "prima", "prem", "n", "minutos"], "racimos N>=3 · >=$2,5M · salida 5d",
  { cerosLegitimos: ["seguir", "retBruto"] });

const linea = (nombre, f, campo = "seguir") => {
  if (f.length < 40) { console.log(`  ${nombre.padEnd(46)} n=${String(f.length).padStart(5)}  — muestra corta`); return null; }
  const td = tPorDia(f, campo), te = tercios(f, campo);
  const ne = nEfectiva(f, f[0].diasPos ? Math.round(media(f.map((x) => x.diasPos))) : 5);
  const m = media(f.map((x) => x[campo]));
  console.log(`  ${nombre.padEnd(46)} n=${String(f.length).padStart(5)} ${String(td.nDias).padStart(3)}d nef=${String(ne.porTicker).padStart(4)} ${(100 * m).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " <<" : "   "} tercios ${te ? te.map((x) => (100 * x).toFixed(1)).join("/") : "-"}${mismoSigno(te) ? " ok" : " x"}`);
  return { nombre, n: f.length, nDias: td.nDias, nEfectiva: ne.porTicker, ventanas: ne.ventanas, media: m, t: td.t, tercios: te, mismoSigno: mismoSigno(te), cruza: Math.abs(td.t) >= LISTON };
};

// ── 4. LA REJILLA COMPLETA ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`1. LA REJILLA DECLARADA — seguir el racimo (comprar al ask, vender al bid)`);
console.log(`${"=".repeat(104)}\n`);
const rej = [];
for (const K of SALIDAS) {
  console.log(`  --- salida a ${K} días ---`);
  for (const N of NN) for (const X of XX) {
    const r = linea(`N>=${N} · >=$${(X / 1e6).toFixed(1)}M`, construir({ nMin: N, xMin: X, salida: K }));
    if (r) rej.push({ ...r, N, X, salida: K });
  }
  console.log("");
}

// ── 5. EL CONTROL QUE PIDE EL ENCARGO: ¿aporta repetir sobre el TAMAÑO? ──────────────────────
console.log(`${"=".repeat(104)}`);
console.log(`2. RACIMO contra PRINT UNICO — a IGUAL prima total, ¿aporta algo repetir?`);
console.log(`${"=".repeat(104)}\n`);
const cubos = [[1e6, 2.5e6, "$1-2,5M"], [2.5e6, 5e6, "$2,5-5M"], [5e6, 1e12, ">=$5M"]];
const emparejado = [];
for (const K of [5]) {
  console.log(`  salida ${K}d · mismo cubo de PRIMA TOTAL, sólo cambia si vino de UNO o de VARIOS prints\n`);
  console.log(`  ${"cubo de prima".padEnd(12)} ${"UNICO (n=1)".padStart(22)} ${"RACIMO (n>=3)".padStart(22)}  ${"diferencia".padStart(11)} ${"t Welch".padStart(8)}`);
  for (const [a, b, et] of cubos) {
    const u = construir({ nMin: 1, nMax: 1, xMin: a, xMax: b, salida: K });
    const r = construir({ nMin: 3, xMin: a, xMax: b, salida: K });
    if (u.length < 40 || r.length < 40) { console.log(`  ${et.padEnd(12)} muestra corta (${u.length} / ${r.length})`); continue; }
    const mu = media(u.map((x) => x.seguir)), mr = media(r.map((x) => x.seguir));
    const su = sd(u.map((x) => x.seguir)), sr = sd(r.map((x) => x.seguir));
    const tw = (mr - mu) / Math.sqrt(su * su / u.length + sr * sr / r.length);
    console.log(`  ${et.padEnd(12)} ${(`${(100 * mu).toFixed(2)}%  n=${u.length}`).padStart(22)} ${(`${(100 * mr).toFixed(2)}%  n=${r.length}`).padStart(22)}  ${((100 * (mr - mu)).toFixed(2) + "%").padStart(11)} ${tw.toFixed(2).padStart(8)}`);
    emparejado.push({ cubo: et, salida: K, unico: { n: u.length, media: mu }, racimo: { n: r.length, media: mr }, dif: mr - mu, tWelch: tw });
  }
  console.log("");
}

// escalera por N dentro del mismo cubo de prima (>= $2,5M)
console.log(`  ESCALERA POR N, con la prima total sujeta en >=$2,5M (si repetir aporta, tiene que ser monótona):\n`);
const escalera = [];
for (const [lo, hi, et] of [[1, 1, "1 print"], [2, 2, "2 prints"], [3, 4, "3-4 prints"], [5, 9, "5-9 prints"], [10, Infinity, "10+ prints"]]) {
  const f = construir({ nMin: lo, nMax: hi, xMin: 2.5e6, salida: 5 });
  const r = linea(`  ${et}`, f);
  if (r) escalera.push({ ...r, lo, hi });
}

// ── 6. CONTROLES ────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`3. LOS CONTROLES — cada uno es un intento de tumbar el racimo N>=3 · >=$2,5M · 5d`);
console.log(`${"=".repeat(104)}\n`);
const C = {};
C.base = linea("BASE: N>=3 · >=$2,5M · AL ASK", base);
C.bid = linea("PLACEBO: el mismo racimo pero AL BID", construir({ nMin: 3, xMin: 2.5e6, lado: -1, salida: 5 }));
C.multi = linea("PLACEBO: racimos de PATAS DE SPREAD", construir({ nMin: 3, xMin: 2.5e6, multi: true, salida: 5 }));
C.antes = linea("CAUSALIDAD: comprar el día ANTES", construir({ nMin: 3, xMin: 2.5e6, salida: 5, desplazar: -1 }));
C.tarde1 = linea("comprar 1 día TARDE", construir({ nMin: 3, xMin: 2.5e6, salida: 5, desplazar: 1 }));
C.tarde2 = linea("comprar 2 días tarde", construir({ nMin: 3, xMin: 2.5e6, salida: 5, desplazar: 2 }));
C.rapido = linea("racimo APRETADO (todo en <=30 min)", construir({ nMin: 3, xMin: 2.5e6, salida: 5, ventanaMin: 30 }));
C.lento = linea("racimo LENTO (mas de 60 min)", base.filter((f) => f.minutos > 60));
C.acciones = linea("sólo ACCIONES (fuera índices y ETF)", base.filter((f) => !INDICES.has(f.ticker)));
C.indices = linea("sólo INDICES y ETF", base.filter((f) => INDICES.has(f.ticker)));
C.calls = linea("sólo racimos de CALL", base.filter((f) => f.tipo === "C"));
C.puts = linea("sólo racimos de PUT", base.filter((f) => f.tipo === "P"));
C.repartido = linea("racimo REPARTIDO (el mayor <25% del total)", base.filter((f) => f.mayor / f.prem < 0.25));
C.dominado = linea("racimo DOMINADO (el mayor >50% del total)", base.filter((f) => f.mayor / f.prem > 0.5));
C.corto = linea("racimo en contrato CORTO (<45d)", base.filter((f) => f.dteRacimo < 45));
C.largo = linea("racimo en contrato LARGO (>=45d)", base.filter((f) => f.dteRacimo >= 45));
C.manana = linea("racimo de la MAÑANA (antes de las 12 ET)", base.filter((f) => f.hora < 12));
C.tarde = linea("racimo de la TARDE (12:00-15:00 ET)", base.filter((f) => f.hora >= 12));

// ── 7. DEJAR FUERA UN ACTIVO CADA VEZ ───────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`4. DEJANDO FUERA UN ACTIVO CADA VEZ — ¿vive el efecto en uno solo?`);
console.log(`${"=".repeat(104)}\n`);
const fuera = [];
{
  const c = new Map();
  for (const f of base) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const ts = [...c.entries()].filter(([, n]) => n >= 15).sort((a, b) => b[1] - a[1]);
  for (const [t] of ts) {
    const f = base.filter((x) => x.ticker !== t);
    fuera.push({ t, n: f.length, tt: tPorDia(f, "seguir").t, m: media(f.map((x) => x.seguir)) });
  }
  fuera.sort((a, b) => Math.abs(a.tt) - Math.abs(b.tt));
  console.log(`   ${ts.length} activos con >=15 entradas. Los ${Math.min(5, fuera.length)} que más lo debilitan y los 2 que más lo refuerzan:`);
  for (const o of fuera.slice(0, 5)) console.log(`     sin ${o.t.padEnd(6)} n=${String(o.n).padStart(4)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}   ${Math.abs(o.tt) >= LISTON ? "sigue cruzando" : "<< deja de cruzar"}`);
  console.log(`     ...`);
  for (const o of fuera.slice(-2)) console.log(`     sin ${o.t.padEnd(6)} n=${String(o.n).padStart(4)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}`);
  console.log(`\n   Cruza el listón en ${fuera.filter((o) => Math.abs(o.tt) >= LISTON).length} de ${fuera.length} versiones.`);
}

// ── 8. EL AZAR ──────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`5. CONTRA EL AZAR — ${SORTEOS} sorteos: misma fecha, misma dirección, ACTIVO sorteado`);
console.log(`${"=".repeat(104)}\n`);
const azarOut = {};
for (const [nombre, filas] of [["N>=3 · >=$2,5M", base], ["print UNICO >=$2,5M", construir({ nMin: 1, nMax: 1, xMin: 2.5e6, salida: 5 })]]) {
  if (filas.length < 40) continue;
  const az = rng(20260820);
  const pd = porDia.get(5), gd = gDia.get(5);
  const porFecha = new Map();
  for (const f of filas) { if (!porFecha.has(f.fechaY)) porFecha.set(f.fechaY, []); porFecha.get(f.fechaY).push(f.dir); }
  const nulos = [];
  for (let it = 0; it < SORTEOS; it++) {
    const md = [];
    for (const [dY, dirs] of porFecha) {
      const cand = pd.get(dY);
      if (!cand?.length) continue;
      const g = gd.get(dY);
      let s = 0;
      for (const d of dirs) { const x = cand[Math.floor(az() * cand.length)]; s += d * (x.g - g); }
      md.push(s / dirs.length);
    }
    nulos.push(media(md));
  }
  const obs = tPorDia(filas, "seguir").m, mN = media(nulos), sN = sd(nulos);
  const z = (obs - mN) / sN;
  const cola = nulos.filter((x) => (obs < mN ? x <= obs : x >= obs)).length / SORTEOS;
  console.log(`  ${nombre.padEnd(24)} observado ${(100 * obs).toFixed(2).padStart(6)}%  ·  azar ${(100 * mN).toFixed(2).padStart(6)}% ±${(100 * sN).toFixed(2)}  ·  z=${z.toFixed(2).padStart(6)}  ·  p=${cola.toFixed(3)}`);
  azarOut[nombre] = { obs, azar: mN, sd: sN, z, p: cola };
}

// ── 9. DINERO ───────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`6. EN DOLARES AL AÑO sobre $${fmt(CUENTA)} — con el signo que salga`);
console.log(`${"=".repeat(104)}\n`);
const dinero = [];
for (const [nombre, filas] of [["racimo N>=3 >=$2,5M", base], ["print único >=$2,5M", construir({ nMin: 1, nMax: 1, xMin: 2.5e6, salida: 5 })]]) {
  if (filas.length < 40) continue;
  const prima = media(filas.map((f) => f.prima));
  const diasPos = media(filas.map((f) => f.diasPos));
  const mBruto = media(filas.map((f) => f.retBruto));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const opsAno = (filas.length / 86) * 252;
  const comprometido = nCtr * prima;
  const anual = comprometido * mBruto * (365 / diasPos);
  console.log(`  ${nombre}`);
  console.log(`     ${filas.length} eventos en 86 días = ${opsAno.toFixed(0)} al año · prima media $${fmt(prima)} · ${nCtr} contrato(s) con el 10% de la cuenta ($${fmt(comprometido)} comprometidos)`);
  console.log(`     retorno BRUTO por operación (ask->bid, sin neutralizar) ${(100 * mBruto).toFixed(2)}%  ->  ${("$" + fmt(anual)).padStart(9)}/año por ciclo de ${diasPos.toFixed(0)}d`);
  console.log(`     acierto (sale con valor > lo pagado): ${((100 * filas.filter((f) => f.retBruto > 0).length) / filas.length).toFixed(1)}%\n`);
  dinero.push({ nombre, n: filas.length, prima, nCtr, comprometido, mBruto, anual, opsAno, aciertoPct: (100 * filas.filter((f) => f.retBruto > 0).length) / filas.length, diasPos });
}
console.log(`  Referencia: SPY sobre el mismo capital comprometido, 14%/año.\n`);

writeFileSync("scripts/rep-1-medir.json", JSON.stringify({ LISTON, rej, emparejado, escalera, C, fuera: fuera.slice(0, 6), azar: azarOut, dinero }, null, 1));
console.log(`  -> scripts/rep-1-medir.json\n`);
