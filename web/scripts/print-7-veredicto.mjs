// SEGUIR EL PRINT · 7 — EL VEREDICTO. Un solo script que produce todos los números del informe.
//
// Se corre entero y de una vez para que ningún número venga de una foto distinta del disco: entre
// pase y pase estuvieron entrando cadenas nuevas y la t se movió de −3,75 a −2,58 sólo por eso.
// Aquí se mide UNA vez, con el universo que haya, y se dice cuál es.
//
// LA REGLA QUE SE JUZGA, dicha como se ejecuta:
//
//   Cuando veas en MarketSnack UN print de ≥$2,5M que entra AL ASK, antes de las 15:00 ET, en un
//   activo con cadena — al cierre de ESE día compra la opción de la ESQUINA BARATA (≈5% fuera del
//   dinero, ≈90 días de plazo) en la dirección CONTRARIA a la del print (si compraron calls,
//   compra la put; si compraron puts, compra la call). Véndela 5 días después.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/print-7-veredicto.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, elegirEsquina, bidSalida, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, comprobarDescarte, potencia } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const DIST = 0.05, DTE_OBJ = 90, TOL_DTE = 25, K_SAL = 5, MIN_PREM = 2.5e6;
const PERM = 5000;
const PRUEBAS = 120;                     // la rejilla declarada en el pase 3. NO se rebaja después.
const LISTON = listonT(PRUEBAS);
const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);
const INDICES = new Set(["SPX", "SPXW", "NDX", "RUT", "QQQ", "SPY", "IWM", "SMH", "SOXL", "GLD"]);

const conCad = tickersConCadena().filter((t) => cierres(t));
const diasPorTk = new Map(conCad.map((t) => [t, diasDe(t).filter((d) => d >= "20260422")]));
const setDias = new Map(conCad.map((t) => [t, new Set(diasPorTk.get(t))]));
const ULTIMO = [...diasPorTk.values()].flat().sort().pop();
const setCad = new Set(conCad);
const tPorDia = (f, c) => { const m = new Map(); for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(x[c]); } const d = [...m.values()].map(media); return { t: tUna(d), n: d.length, m: media(d) }; };

console.log(`\n${"█".repeat(104)}`);
console.log(`SEGUIR EL PRINT · 7 — VEREDICTO`);
console.log(`${"█".repeat(104)}`);
console.log(`  ${conCad.length} tickers con cadena Y cierres · cadenas hasta ${ULTIMO}`);
console.log(`  listón |t| ≥ ${LISTON} (Bonferroni sobre las ${PRUEBAS} pruebas declaradas en el pase 3)\n`);

// ── 0. COBERTURA DEL FLUJO ──────────────────────────────────────────────────────────────────
console.log(`${"═".repeat(104)}`);
console.log(`0. QUÉ FRACCIÓN DEL FLUJO DE MARKETSNACK ES MEDIBLE AHORA`);
console.log(`${"═".repeat(104)}\n`);
const eventos = [];
let nPrints = 0, primaTotal = 0, nCubiertos = 0, primaCubierta = 0;
const porTicker = new Map();
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const inst = new Map(), filas = [];
  for (const o of crudos) {
    const q = parseOCC(o.symbol);
    if (!q) continue;
    nPrints++; primaTotal += o.premium;
    porTicker.set(q.raiz, (porTicker.get(q.raiz) ?? 0) + 1);
    if (setCad.has(q.raiz)) { nCubiertos++; primaCubierta += o.premium; }
    const k = `${q.raiz}|${o.timestamp}`;
    if (!inst.has(k)) inst.set(k, new Set());
    inst.get(k).add(`${q.exp}|${q.tipo}|${q.K}`);
    filas.push([o, q, k]);
  }
  const dY = dia.replace(/-/g, "");
  for (const [o, q, k] of filas) {
    if (!setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60;
    if (!(et >= 9.5 && et < 15)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    eventos.push({ dia, dY, tk: q.raiz, tipo: q.tipo, K: q.strike, exp: q.exp, prem: o.premium, lado, patas: inst.get(k).size, dir: q.tipo === "C" ? 1 : -1, et, dte: dias(dY, q.exp) });
  }
}
console.log(`   prints totales del flujo         : ${fmt(nPrints)}   ($${fmt(primaTotal / 1e9)} mil millones de prima)`);
console.log(`   con cadena del activo en disco   : ${fmt(nCubiertos)}  = ${((100 * nCubiertos) / nPrints).toFixed(1)}% de los prints · ${((100 * primaCubierta) / primaTotal).toFixed(1)}% de la prima`);
console.log(`   (antes de bajar SPX/SPXW y el top del flujo era el 26,8% de los prints)\n`);
{
  const sinCad = [...porTicker.entries()].filter(([t]) => !setCad.has(t)).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`   los que más pesan y AÚN no tienen cadena: ${sinCad.map(([t, n]) => `${t} ${((100 * n) / nPrints).toFixed(2)}%`).join(" · ")}`);
}

// ── 1. REJILLA ──────────────────────────────────────────────────────────────────────────────
const rejilla = new Map();
for (const tk of conCad) {
  limpiarCache();
  const misDias = diasPorTk.get(tk), cl = cierres(tk);
  for (let i = 0; i < misDias.length; i++) {
    const dY = misDias[i];
    if (dY > ULTIMO) continue;
    const S = cl[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const c = elegirEsquina(cad, S, DTE_OBJ, DIST, "C", dY, TOL_DTE);
    const p = elegirEsquina(cad, S, DTE_OBJ, DIST, "P", dY, TOL_DTE);
    if (!c || !p || c.exp !== p.exp) continue;
    const salida = misDias.find((d) => d > dY && dias(dY, d) >= K_SAL);
    if (!salida || salida > c.exp) continue;
    const cs = cadena(tk, salida);
    if (!cs) continue;
    const qC = cs[c.exp]?.[`${c.K}|C`], qP = cs[p.exp]?.[`${p.K}|P`];
    const rC = (qC ? qC[0] : 0) / c.ask - 1, rP = (qP ? qP[0] : 0) / p.ask - 1;
    const mC0 = (c.ask + c.bid) / 2, mP0 = (p.ask + p.bid) / 2;
    const dC = (qC ? (qC[0] + qC[1]) / 2 : 0) / mC0 - 1, dP = (qP ? (qP[0] + qP[1]) / 2 : 0) / mP0 - 1;
    rejilla.set(`${tk}|${dY}`, {
      g: (rC - rP) / 2, gMid: (dC - dP) / 2, m: (rC + rP) / 2, C: rC, P: rP,
      askC: c.ask * 100, askP: p.ask * 100, peaje: ((c.ask - c.bid) / c.ask + (p.ask - p.bid) / p.ask) / 2,
      diasPos: dias(dY, salida),
    });
  }
}
const porDia = new Map();
for (const [k, r] of rejilla) { const [tk, dY] = k.split("|"); if (!porDia.has(dY)) porDia.set(dY, []); porDia.get(dY).push({ tk, ...r }); }
const gDia = new Map([...porDia.entries()].map(([d, v]) => [d, media(v.map((x) => x.g))]));
const gDiaMid = new Map([...porDia.entries()].map(([d, v]) => [d, media(v.map((x) => x.gMid))]));
const todosPool = [...porDia.values()].flat();
console.log(`\n   rejilla de la esquina: ${fmt(rejilla.size)} (ticker, día) con las dos patas y salida real a ${K_SAL}d`);
console.log(`   deriva del período ĝ = ${(100 * media(todosPool.map((x) => x.g))).toFixed(2)}%  ·  coste del vehículo sin señal ${(100 * media(todosPool.map((x) => x.m))).toFixed(2)}%  ·  peaje ${(100 * media([...rejilla.values()].map((r) => r.peaje))).toFixed(1)}%`);

/** Construye las entradas de una regla. `desplazar` mueve la COMPRA respecto al día del print. */
function construir({ lado = 1, minPrem = MIN_PREM, filtro = () => true, desplazar = 0 } = {}) {
  const mejor = new Map();
  for (const e of eventos) {
    if (e.lado !== lado || e.prem < minPrem || !filtro(e)) continue;
    const k = `${e.tk}|${e.dY}`;
    const a = mejor.get(k);
    if (!a || e.prem > a.prem) mejor.set(k, e);
  }
  const out = [];
  for (const e of mejor.values()) {
    let dEnt = e.dY;
    if (desplazar) {
      const md = diasPorTk.get(e.tk), i = md.indexOf(e.dY);
      if (i < 0 || i + desplazar < 0 || i + desplazar >= md.length) continue;
      dEnt = md[i + desplazar];
    }
    const r = rejilla.get(`${e.tk}|${dEnt}`);
    if (!r || gDia.get(dEnt) == null) continue;
    out.push({
      ticker: e.tk, fechaY: dEnt, fecha: `${dEnt.slice(0, 4)}-${dEnt.slice(4, 6)}-${dEnt.slice(6, 8)}`,
      dir: e.dir, tipo: e.tipo, prem: e.prem, patas: e.patas, et: e.et,
      seguir: e.dir * (r.g - gDia.get(dEnt)),
      seguirMid: e.dir * (r.gMid - gDiaMid.get(dEnt)),
      retDesv: e.dir === 1 ? r.P : r.C,
      retSeguir: e.dir === 1 ? r.C : r.P,
      primaDesv: e.dir === 1 ? r.askP : r.askC,
      diasPos: r.diasPos,
    });
  }
  return out;
}

const base = construir();
radiografia(base, ["seguir", "seguirMid", "retDesv", "primaDesv", "prem", "et"], "entradas de la regla", { cerosLegitimos: ["seguir", "seguirMid", "retDesv"] });

// ── 2. LAS CUATRO CRIBAS ────────────────────────────────────────────────────────────────────
function cribas(filas, campo, nombre) {
  const motivos = [], ok = [];
  if (filas.length < 200) motivos.push(`muestra de ${filas.length}, hacen falta 200`);
  else ok.push(`muestra ${filas.length} ≥ 200`);
  const c = new Map();
  for (const f of filas) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const may = [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  if (may[1] / filas.length > 0.2) motivos.push(`${may[0]} es el ${((100 * may[1]) / filas.length).toFixed(1)}% de la muestra (máximo 20%)`);
  else ok.push(`ningún activo pasa del 20% (mayor: ${may[0]} ${((100 * may[1]) / filas.length).toFixed(1)}%)`);
  const ord = [...filas].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x[campo])));
  if (Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2]))
    ok.push(`mismo signo en los tres tercios (${ter.map((x) => (100 * x).toFixed(2) + "%").join(" · ")})`);
  else motivos.push(`el signo NO se repite en los tres tercios (${ter.map((x) => (100 * x).toFixed(2) + "%").join(" · ")})`);
  const td = tPorDia(filas, campo);
  if (Math.abs(td.t) < LISTON) motivos.push(`t por día = ${td.t.toFixed(2)}, por debajo del listón de ${LISTON}`);
  else ok.push(`t por día = ${td.t.toFixed(2)} ≥ ${LISTON}`);
  console.log(`\n${motivos.length ? "⛔" : "✅"} ${nombre} — ${motivos.length ? "NO SE PUEDE REPORTAR COMO HALLAZGO" : "PASA LAS CUATRO CRIBAS"}\n`);
  for (const m of motivos) console.log(`  ✗ ${m}`);
  for (const a of ok) console.log(`  ✓ ${a}`);
  console.log(`\n  n=${filas.length} en ${td.n} días · media ${(100 * media(filas.map((f) => f[campo]))).toFixed(2)}% · t por día ${td.t.toFixed(2)} (listón ${LISTON})`);
  return { pasa: motivos.length === 0, t: td.t, nDias: td.n, media: media(filas.map((f) => f[campo])), tercios: ter, motivos, n: filas.length, mayor: { t: may[0], pct: may[1] / filas.length } };
}
console.log(`\n${"═".repeat(104)}`);
console.log(`1. LA REGLA CONTRA LAS CUATRO CRIBAS`);
console.log(`${"═".repeat(104)}`);
const V = cribas(base, "seguir", `ASK · ≥$${(MIN_PREM / 1e6).toFixed(1)}M · esquina 5%/90d · salida ${K_SAL}d`);

// ── 3. TODOS LOS CONTROLES ──────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`2. LOS CONTROLES — cada uno es un intento de tumbarla`);
console.log(`${"═".repeat(104)}\n`);
const fila = (n, f, campo = "seguir") => {
  if (f.length < 50) { console.log(`  ${n.padEnd(42)} n=${String(f.length).padStart(4)}  — muestra corta`); return null; }
  const td = tPorDia(f, campo);
  const ord = [...f].sort((a, b) => a.fechaY.localeCompare(b.fechaY));
  const kk = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * kk, (i + 1) * kk) : ord.slice(2 * kk)).map((x) => x[campo])));
  const mismo = Math.sign(ter[0]) === Math.sign(ter[1]) && Math.sign(ter[1]) === Math.sign(ter[2]);
  console.log(`  ${n.padEnd(42)} n=${String(f.length).padStart(4)} ${String(td.n).padStart(3)}d  ${(100 * media(f.map((x) => x[campo]))).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " ◄" : "  "} tercios ${ter.map((x) => (100 * x).toFixed(1)).join("/")}${mismo ? " ✓" : " ✗"}`);
  return { n: f.length, media: media(f.map((x) => x[campo])), t: td.t, mismoSigno: mismo };
};
const C = {};
C.base = fila("BASE", base);
C.mid = fila("DIAGNÓSTICO medio-a-medio (no es dinero)", base, "seguirMid");
C.tarde1 = fila("comprar 1 día TARDE", construir({ desplazar: 1 }));
C.tarde2 = fila("comprar 2 días tarde", construir({ desplazar: 2 }));
C.antes = fila("comprar el día ANTES (imposible: causalidad)", construir({ desplazar: -1 }));
C.bid = fila("CONTROL: el mismo print pero AL BID", construir({ lado: -1 }));
C.acciones = fila("sólo ACCIONES (fuera índices y ETF)", base.filter((f) => !INDICES.has(f.ticker)));
C.indices = fila("sólo ÍNDICES y ETF", base.filter((f) => INDICES.has(f.ticker)));
C.sueltos = fila("sólo prints SUELTOS (no pata de spread)", base.filter((f) => f.patas === 1));
C.patas = fila("sólo prints que SON pata de spread", base.filter((f) => f.patas > 1));
C.calls = fila("sólo prints de CALL", base.filter((f) => f.tipo === "C"));
C.puts = fila("sólo prints de PUT", base.filter((f) => f.tipo === "P"));
for (const p of [1e6, 5e6, 10e6]) C[`p${p}`] = fila(`umbral de prima ≥$${(p / 1e6).toFixed(0)}M`, construir({ minPrem: p }));

// ── 4. DEJAR FUERA UN TICKER CADA VEZ ───────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`3. DEJANDO FUERA UN ACTIVO CADA VEZ — ¿vive el efecto en uno solo?`);
console.log(`${"═".repeat(104)}\n`);
{
  const c = new Map();
  for (const f of base) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const ts = [...c.entries()].filter(([, n]) => n >= 15).sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [t] of ts) { const f = base.filter((x) => x.ticker !== t); out.push({ t, n: f.length, tt: tPorDia(f, "seguir").t, m: media(f.map((x) => x.seguir)) }); }
  out.sort((a, b) => Math.abs(a.tt) - Math.abs(b.tt));
  console.log(`   ${ts.length} activos con ≥15 entradas. t sin cada uno:`);
  for (const o of out.slice(0, 6)) console.log(`     sin ${o.t.padEnd(6)} n=${String(o.n).padStart(4)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}   ${Math.abs(o.tt) >= LISTON ? "sigue cruzando" : "◄ deja de cruzar"}`);
  console.log(`     …`);
  for (const o of out.slice(-2)) console.log(`     sin ${o.t.padEnd(6)} n=${String(o.n).padStart(4)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}`);
  C.dejarFuera = { peor: out[0], mejor: out[out.length - 1], nActivos: ts.length, cuantosSiguenCruzando: out.filter((o) => Math.abs(o.tt) >= LISTON).length };
  console.log(`\n   Cruza el listón en ${C.dejarFuera.cuantosSiguenCruzando} de ${out.length} versiones. Si sólo cruzara quitando pocos, viviría en un activo.`);
}

// ── 5. PERMUTACIÓN ──────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`4. PERMUTACIÓN — ${fmt(PERM)} barajas: misma fecha, misma dirección, ACTIVO sorteado entre los que cotizaban`);
console.log(`${"═".repeat(104)}\n`);
{
  const azar = rng(20260821);
  const porFecha = new Map();
  for (const f of base) { if (!porFecha.has(f.fechaY)) porFecha.set(f.fechaY, []); porFecha.get(f.fechaY).push(f.dir); }
  const nulos = [];
  for (let it = 0; it < PERM; it++) {
    const md = [];
    for (const [dY, dirs] of porFecha) {
      const cand = porDia.get(dY);
      if (!cand?.length) continue;
      const gd = gDia.get(dY);
      let s = 0;
      for (const d of dirs) { const x = cand[Math.floor(azar() * cand.length)]; s += d * (x.g - gd); }
      md.push(s / dirs.length);
    }
    nulos.push(media(md));
  }
  const obs = tPorDia(base, "seguir").m, mN = media(nulos), sN = sd(nulos);
  const p = (nulos.filter((x) => Math.abs(x - mN) >= Math.abs(obs - mN)).length + 1) / (nulos.length + 1);
  console.log(`   observado ${(100 * obs).toFixed(2)}%  ·  nulo ${(100 * mN).toFixed(2)}% ± ${(100 * sN).toFixed(2)}%  ·  z=${((obs - mN) / sN).toFixed(2)}  ·  p=${p.toFixed(4)}`);
  C.perm = { obs, z: (obs - mN) / sN, p };
}

// ── 6. EL DINERO ────────────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`5. EL DINERO — con precios reales, sobre $${fmt(CUENTA)}`);
console.log(`${"═".repeat(104)}\n`);
const D = {};
{
  const prima = media(base.map((f) => f.primaDesv));
  const retD = media(base.map((f) => f.retDesv)), retS = media(base.map((f) => f.retSeguir));
  const diasPos = media(base.map((f) => f.diasPos));
  const ciclos = 365 / diasPos;
  const acierto = base.filter((f) => f.retDesv > f.retSeguir).length / base.length;
  const costeVeh = media(todosPool.map((x) => x.m));
  const ne = nEfectiva(base, K_SAL);
  console.log(`   comprar la opción CONTRARIA a la del print   : ${(100 * retD).toFixed(2)}% por operación   ($${fmt(prima * retD)} por contrato de $${fmt(prima)})`);
  console.log(`   comprar la MISMA dirección que el print      : ${(100 * retS).toFixed(2)}% por operación`);
  console.log(`   el mismo vehículo sin señal (moneda)         : ${(100 * costeVeh).toFixed(2)}% por operación`);
  console.log(`   acierta el lado el ${(100 * acierto).toFixed(1)}% de las veces  ·  para empatar hace falta el 52,8%  →  ${acierto > 0.528 ? "por encima" : "por debajo"}`);
  console.log(`\n   días en posición ${diasPos.toFixed(1)} · ${ciclos.toFixed(1)} ciclos/año · ${(base.length / new Set(base.map((f) => f.fechaY)).size).toFixed(1)} señales al día (sobran para llenar plazas)`);
  console.log(`   n EFECTIVA: ${ne.porTicker} apuestas no solapadas por activo · ${ne.ventanas} ventanas de calendario independientes · ${new Set(base.map((f) => f.fechaY)).size} días`);
  console.log(`\n   ${"capital".padStart(9)} ${"contratos".padStart(9)} ${"$/año".padStart(10)}   ${"SPY sobre ese capital".padStart(22)}`);
  for (const cap of [0.05, 0.1, 0.2]) {
    const n = Math.max(1, Math.floor((CUENTA * cap) / prima));
    const anual = prima * retD * ciclos * n;
    console.log(`   ${("$" + fmt(CUENTA * cap)).padStart(9)} ${String(n).padStart(9)} ${("$" + fmt(anual)).padStart(10)}   ${("$" + fmt(CUENTA * cap * 0.14)).padStart(22)}`);
    if (cap === 0.1) Object.assign(D, { capital: CUENTA * cap, contratos: n, anual, prima, retD, retS, ciclos, acierto, diasPos, costeVeh, ne });
  }
}

// ── 7. POTENCIA Y CUÁNTO FALTA ──────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`6. LO QUE FALTA`);
console.log(`${"═".repeat(104)}\n`);
{
  const p = potencia(base.map((f) => ({ pnl: f.seguir, ticker: f.ticker, fecha: f.fecha })), 0.029);
  console.log(`   ${p.mensaje}\n`);
  const faltan = Math.ceil(V.nDias * ((LISTON / Math.abs(V.t)) ** 2 - 1));
  if (Math.abs(V.t) >= LISTON) console.log(`   La t por día (${V.t.toFixed(2)}) YA cruza el listón de ${LISTON} con ${V.nDias} días de flujo.`);
  else console.log(`   La t por día es ${V.t.toFixed(2)} y el listón ${LISTON}: harían falta ~${faltan} días de mercado MÁS (${(faltan / 21).toFixed(1)} meses) para establecerla.`);
  console.log(`   MarketSnack sólo guarda ${new Set(eventos.map((e) => e.dia)).size} días hacia atrás, así que esos días hay que esperarlos hacia adelante.`);
  C.faltan = Math.abs(V.t) >= LISTON ? 0 : faltan;
}

writeFileSync("scripts/print-7-veredicto.json", JSON.stringify({
  liston: LISTON, universo: conCad.length, ultimoDia: ULTIMO,
  cobertura: { prints: nCubiertos / nPrints, prima: primaCubierta / primaTotal, nPrints },
  veredicto: V, controles: C, dinero: D,
}, null, 1));
console.log(`\n  → scripts/print-7-veredicto.json\n`);
