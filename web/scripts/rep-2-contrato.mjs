// LA REPETICION · 2 — SEGUIRLO DE VERDAD: comprar EL CONTRATO QUE ESTAN GOLPEANDO.
//
// El pase 1 midió el racimo con el vehículo barato (esquina 5%/90d). Pero "seguir el racimo"
// leído como lo leería Lester mirando la pantalla es COMPRAR ESE CONTRATO. Aquí se mide eso.
//
// LA TRAMPA QUE YA NOS COMIMOS DOS VECES (2026-08-16 y en el pase 5 de print): el contrato del
// flujo tiene la horquilla MAS ESTRECHA que sus vecinos, y comprar al ask una horquilla del 2,7%
// contra una del 4,3% regala 1,6 puntos SIN QUE NADIE HAYA ACERTADO NADA. Por eso el control no
// es "un contrato cualquiera": son sus GEMELOS — mismo activo, mismo día, mismo tipo, misma
// distancia al dinero, mismo plazo y MISMA HORQUILLA.
//
// PRECIOS REALES: entrada = ASK de la cadena de cierre del día del racimo. Salida = BID de la
// cadena del día de salida. Si el contrato ya no está en la cadena de salida vale CERO (el
// descargador filtra bid<=0: "no está" = "sin comprador"). Nunca medio, nunca Black-Scholes.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-2-contrato.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import {
  cadena, cierres, diasDe, tickersConCadena, limpiarCache,
  dias, media, sd, tUna, pctl, fmt, rng, nEfectiva,
} from "./print-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const SALIDA = 5;                    // días de calendario; salida corta para no solapar
const PRUEBAS = 120;
const LISTON = listonT(PRUEBAS);
const SORTEOS = 500;
const TOL_DTE = 15;                  // el gemelo tiene que vencer +/-15 días del original
const TOL_MNY = 0.02;                // y estar a +/-2 puntos de la misma distancia al dinero
const TOL_HORQ = 0.25;               // y su horquilla relativa a +/-25% de la del original

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
const okSigno = (t) => !!t && Math.sign(t[0]) === Math.sign(t[1]) && Math.sign(t[1]) === Math.sign(t[2]);

console.log(`\n${"#".repeat(104)}`);
console.log(`LA REPETICION · 2 — comprar EL CONTRATO del racimo, contra sus GEMELOS de horquilla`);
console.log(`${"#".repeat(104)}`);
console.log(`  listón |t| >= ${LISTON} · salida a ${SALIDA} días · cadenas hasta ${ULTIMO}\n`);

// ── 1. RACIMOS (mismo motor que el pase 1) ──────────────────────────────────────────────────
const racimos = [];
for (const dia of diasFlujo("100k")) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map();
  for (const o of crudos) {
    const cid = o.trade_condition_id;
    if (BASURA.has(cid) || ACCOPC.has(cid) || MULTI.has(cid)) continue;
    const q = parseOCC(o.symbol);
    if (!q || !setCad.has(q.raiz) || !setDias.get(q.raiz)?.has(dY)) continue;
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60 + Number(o.timestamp.slice(17, 19)) / 3600;
    if (!(et >= 9.5 && et < 15)) continue;
    const k = `${o.symbol}|${lado}`;
    let r = g.get(k);
    if (!r) r = { dY, tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike, lado, n: 0, prem: 0, mayor: 0, t0: 99, t1: -99 };
    r.n++; r.prem += o.premium;
    if (o.premium > r.mayor) r.mayor = o.premium;
    if (et < r.t0) r.t0 = et;
    if (et > r.t1) r.t1 = et;
    g.set(k, r);
  }
  for (const r of g.values()) racimos.push(r);
}
console.log(`  racimos con cadena y antes de las 15:00 ET: ${fmt(racimos.length)}`);

// ── 2. MEDIR CADA RACIMO CON PRECIOS REALES + SUS GEMELOS ───────────────────────────────────
const porTk = new Map();
for (const r of racimos) {
  if (r.prem < 1e6) continue;                        // por debajo de $1M no es un racimo grande
  if (!porTk.has(r.tk)) porTk.set(r.tk, []);
  porTk.get(r.tk).push(r);
}

const filas = [];
let sinEntrada = 0, sinSalida = 0, sinGemelos = 0, salidasReales = 0, salidasCero = 0;
for (const [tk, lista] of porTk) {
  limpiarCache();
  const md = diasPorTk.get(tk), cl = cierres(tk);
  const porDia = new Map();
  for (const r of lista) { if (!porDia.has(r.dY)) porDia.set(r.dY, []); porDia.get(r.dY).push(r); }
  for (const [dY, rs] of porDia) {
    if (dY > ULTIMO) continue;
    const S = cl?.[dY];
    if (!(S > 0)) continue;
    const cad = cadena(tk, dY);
    if (!cad) continue;
    const dSal = md.find((d) => d > dY && dias(dY, d) >= SALIDA);
    if (!dSal) continue;
    const cadSal = cadena(tk, dSal);
    if (!cadSal) continue;

    // universo del día: todo contrato cotizado, con su distancia, plazo, horquilla y RETORNO real
    const univ = [];
    for (const exp of Object.keys(cad)) {
      const dte = dias(dY, exp);
      if (dte < 1 || exp <= dSal) continue;           // que no venza antes de la salida
      for (const clave of Object.keys(cad[exp])) {
        const [ks, tipo] = clave.split("|");
        const K = Number(ks);
        const [bid, ask] = cad[exp][clave];
        if (!(ask > 0) || !(bid > 0)) continue;
        const mny = tipo === "C" ? K / S - 1 : 1 - K / S;
        const q = cadSal[exp]?.[clave];
        univ.push({ exp, K, tipo, dte, mny, ask, horq: (ask - bid) / ask, ret: (q ? q[0] : 0) / ask - 1, hayPuja: !!q });
      }
    }
    if (!univ.length) continue;
    const idx = new Map(univ.map((u) => [`${u.exp}|${u.K}|${u.tipo}`, u]));

    for (const r of rs) {
      const yo = idx.get(`${r.exp}|${r.K}|${r.tipo}`);
      if (!yo) { sinEntrada++; continue; }
      if (yo.hayPuja) salidasReales++; else salidasCero++;
      const gem = univ.filter((u) => u !== yo && u.tipo === yo.tipo
        && Math.abs(u.dte - yo.dte) <= TOL_DTE
        && Math.abs(u.mny - yo.mny) <= TOL_MNY
        && Math.abs(u.horq - yo.horq) <= TOL_HORQ * yo.horq);
      if (gem.length < 3) { sinGemelos++; continue; }
      filas.push({
        ticker: tk, fechaY: dY, fecha: `${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`,
        n: r.n, prem: r.prem, mayor: r.mayor, lado: r.lado, tipo: r.tipo,
        minutos: r.n > 1 ? (r.t1 - r.t0) * 60 : 0, hora: r.t0,
        dte: yo.dte, mny: yo.mny, horq: yo.horq, horqGem: media(gem.map((g) => g.horq)),
        prima: yo.ask * 100, nGem: gem.length,
        ret: yo.ret,
        retGem: media(gem.map((g) => g.ret)),
        exceso: yo.ret - media(gem.map((g) => g.ret)),
        diasPos: dias(dY, dSal),
      });
    }
  }
}
console.log(`  medidos ${fmt(filas.length)} racimos >=$1M con contrato en cadena y >=3 gemelos`);
console.log(`     descartados: ${fmt(sinEntrada)} sin cotización de entrada · ${fmt(sinGemelos)} sin gemelos suficientes`);
console.log(`     salidas: ${fmt(salidasReales)} con puja real (${((100 * salidasReales) / (salidasReales + salidasCero)).toFixed(2)}%) · ${fmt(salidasCero)} sin puja = valen 0\n`);

const ask = filas.filter((f) => f.lado === 1);
radiografia(ask, ["ret", "retGem", "exceso", "horq", "horqGem", "prima", "n", "prem", "dte", "mny"],
  "racimos AL ASK >=$1M con gemelos", { cerosLegitimos: ["ret", "retGem", "exceso"] });

const linea = (nombre, f, campo = "exceso") => {
  if (f.length < 40) { console.log(`  ${nombre.padEnd(44)} n=${String(f.length).padStart(5)}  — muestra corta`); return null; }
  const td = tPorDia(f, campo), te = tercios(f, campo);
  const ne = nEfectiva(f, SALIDA);
  const m = media(f.map((x) => x[campo]));
  console.log(`  ${nombre.padEnd(44)} n=${String(f.length).padStart(5)} ${String(td.nDias).padStart(3)}d nef=${String(ne.porTicker).padStart(4)} ${(100 * m).toFixed(2).padStart(7)}%  t ${td.t.toFixed(2).padStart(6)}${Math.abs(td.t) >= LISTON ? " <<" : "   "} tercios ${te ? te.map((x) => (100 * x).toFixed(1)).join("/") : "-"}${okSigno(te) ? " ok" : " x"}`);
  return { nombre, n: f.length, nDias: td.nDias, nEfectiva: ne.porTicker, ventanas: ne.ventanas, media: m, t: td.t, tercios: te, mismoSigno: okSigno(te), cruza: Math.abs(td.t) >= LISTON };
};

// ── 3. ¿ESTA LA TRAMPA DE LA HORQUILLA? ─────────────────────────────────────────────────────
console.log(`${"=".repeat(104)}`);
console.log(`1. PRIMERO LA TRAMPA: ¿es el contrato del racimo más líquido que sus gemelos?`);
console.log(`${"=".repeat(104)}\n`);
{
  const a = ask.filter((f) => f.n >= 3 && f.prem >= 2.5e6);
  console.log(`   horquilla del contrato del racimo : ${(100 * media(a.map((f) => f.horq))).toFixed(2)}%`);
  console.log(`   horquilla de sus gemelos          : ${(100 * media(a.map((f) => f.horqGem))).toFixed(2)}%   (emparejados a proposito)`);
  console.log(`   diferencia                        : ${(100 * media(a.map((f) => f.horq - f.horqGem))).toFixed(2)} puntos`);
  console.log(`   gemelos por evento (mediana)      : ${pctl(a.map((f) => f.nGem), 0.5)}`);
  console.log(`\n   Si la diferencia es ~0, el exceso que salga NO puede ser peaje. Es la prueba que faltó el 16 ago.`);
}

// ── 4. LA REJILLA ───────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`2. EXCESO SOBRE LOS GEMELOS — comprar el contrato del racimo al ask, vender al bid a ${SALIDA}d`);
console.log(`${"=".repeat(104)}\n`);
const rej = [];
for (const N of [1, 2, 3, 5, 10]) for (const X of [1e6, 2.5e6, 5e6]) {
  const f = ask.filter((x) => (N === 1 ? x.n === 1 : x.n >= N) && x.prem >= X);
  const r = linea(`${N === 1 ? "print UNICO" : `N>=${N}`} · >=$${(X / 1e6).toFixed(1)}M`, f);
  if (r) rej.push({ ...r, N, X });
}

console.log(`\n  Y EL RETORNO CRUDO (no el exceso), que es lo que entra en la cuenta corriente:\n`);
for (const N of [1, 3, 10]) for (const X of [2.5e6]) {
  const f = ask.filter((x) => (N === 1 ? x.n === 1 : x.n >= N) && x.prem >= X);
  linea(`${N === 1 ? "print UNICO" : `N>=${N}`} · >=$${(X / 1e6).toFixed(1)}M  CRUDO`, f, "ret");
}

// ── 5. ESCALERA Y EMPAREJADO POR PRIMA ──────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`3. ¿APORTA REPETIR SOBRE EL TAMAÑO? — escalera por N con la prima total sujeta`);
console.log(`${"=".repeat(104)}\n`);
const escalera = [];
for (const [lo, hi, et] of [[1, 1, "1 print"], [2, 2, "2 prints"], [3, 4, "3-4 prints"], [5, 9, "5-9 prints"], [10, 29, "10-29 prints"], [30, Infinity, "30+ prints"]]) {
  const f = ask.filter((x) => x.n >= lo && x.n <= hi && x.prem >= 2.5e6);
  const r = linea(`  ${et} (prima >=$2,5M)`, f);
  if (r) escalera.push({ ...r, lo, hi });
}
console.log("");
const emparejado = [];
console.log(`  ${"cubo de prima".padEnd(12)} ${"UNICO (n=1)".padStart(22)} ${"RACIMO (n>=3)".padStart(22)}  ${"diferencia".padStart(11)} ${"t Welch".padStart(8)}`);
for (const [a, b, et] of [[1e6, 2.5e6, "$1-2,5M"], [2.5e6, 5e6, "$2,5-5M"], [5e6, 1e12, ">=$5M"]]) {
  const u = ask.filter((x) => x.n === 1 && x.prem >= a && x.prem < b);
  const r = ask.filter((x) => x.n >= 3 && x.prem >= a && x.prem < b);
  if (u.length < 40 || r.length < 40) { console.log(`  ${et.padEnd(12)} muestra corta (${u.length} / ${r.length})`); continue; }
  const mu = media(u.map((x) => x.exceso)), mr = media(r.map((x) => x.exceso));
  const su = sd(u.map((x) => x.exceso)), sr = sd(r.map((x) => x.exceso));
  const tw = (mr - mu) / Math.sqrt(su * su / u.length + sr * sr / r.length);
  console.log(`  ${et.padEnd(12)} ${(`${(100 * mu).toFixed(2)}%  n=${u.length}`).padStart(22)} ${(`${(100 * mr).toFixed(2)}%  n=${r.length}`).padStart(22)}  ${((100 * (mr - mu)).toFixed(2) + "%").padStart(11)} ${tw.toFixed(2).padStart(8)}`);
  emparejado.push({ cubo: et, unico: { n: u.length, media: mu }, racimo: { n: r.length, media: mr }, dif: mr - mu, tWelch: tw });
}

// ── 6. CONTROLES ────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`4. CONTROLES sobre N>=3 · >=$2,5M`);
console.log(`${"=".repeat(104)}\n`);
const base = ask.filter((f) => f.n >= 3 && f.prem >= 2.5e6);
const C = {};
C.base = linea("BASE: racimo AL ASK", base);
C.bid = linea("PLACEBO: el mismo racimo AL BID", filas.filter((f) => f.lado === -1 && f.n >= 3 && f.prem >= 2.5e6));
C.apretado = linea("racimo APRETADO (<=30 min)", base.filter((f) => f.minutos <= 30));
C.lento = linea("racimo LENTO (>60 min)", base.filter((f) => f.minutos > 60));
C.repartido = linea("racimo REPARTIDO (mayor <25% del total)", base.filter((f) => f.mayor / f.prem < 0.25));
C.dominado = linea("racimo DOMINADO (mayor >50%)", base.filter((f) => f.mayor / f.prem > 0.5));
C.calls = linea("sólo CALL", base.filter((f) => f.tipo === "C"));
C.puts = linea("sólo PUT", base.filter((f) => f.tipo === "P"));
C.acciones = linea("sólo ACCIONES", base.filter((f) => !INDICES.has(f.ticker)));
C.indices = linea("sólo INDICES y ETF", base.filter((f) => INDICES.has(f.ticker)));
C.cerca = linea("contrato CERCA del dinero (<5%)", base.filter((f) => f.mny < 0.05));
C.lejos = linea("contrato LEJOS (>=10%)", base.filter((f) => f.mny >= 0.10));
C.corto = linea("plazo CORTO (<30d)", base.filter((f) => f.dte < 30));
C.largo = linea("plazo LARGO (>=60d)", base.filter((f) => f.dte >= 60));
C.manana = linea("racimo de la MAÑANA (<12 ET)", base.filter((f) => f.hora < 12));
C.tarde = linea("racimo de la TARDE (>=12 ET)", base.filter((f) => f.hora >= 12));

// ── 7. DEJAR FUERA UN ACTIVO ────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`5. DEJANDO FUERA UN ACTIVO CADA VEZ`);
console.log(`${"=".repeat(104)}\n`);
const fuera = [];
{
  const c = new Map();
  for (const f of base) c.set(f.ticker, (c.get(f.ticker) ?? 0) + 1);
  const ts = [...c.entries()].filter(([, n]) => n >= 15).sort((a, b) => b[1] - a[1]);
  for (const [t] of ts) {
    const f = base.filter((x) => x.ticker !== t);
    fuera.push({ t, n: f.length, tt: tPorDia(f, "exceso").t, m: media(f.map((x) => x.exceso)) });
  }
  fuera.sort((a, b) => Math.abs(a.tt) - Math.abs(b.tt));
  console.log(`   ${ts.length} activos con >=15 entradas. Los que más lo debilitan:`);
  for (const o of fuera.slice(0, 4)) console.log(`     sin ${o.t.padEnd(6)} n=${String(o.n).padStart(4)}  media ${(100 * o.m).toFixed(2).padStart(6)}%  t ${o.tt.toFixed(2).padStart(6)}   ${Math.abs(o.tt) >= LISTON ? "sigue cruzando" : "<< deja de cruzar"}`);
  console.log(`   Cruza el listón en ${fuera.filter((o) => Math.abs(o.tt) >= LISTON).length} de ${fuera.length} versiones.`);
  console.log(`   mayor activo: ${c.size ? [...c.entries()].sort((a, b) => b[1] - a[1])[0].map(String).join(" con ") : "-"} de ${base.length} (${((100 * [...c.values()].sort((a, b) => b - a)[0]) / base.length).toFixed(1)}%)`);
}

// ── 8. AZAR ─────────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`6. CONTRA EL AZAR — ${SORTEOS} sorteos: en vez del contrato del racimo, uno de sus gemelos`);
console.log(`${"=".repeat(104)}\n`);
{
  // El sorteo natural aquí es el propio conjunto de gemelos: mismo activo, mismo día, misma
  // distancia, mismo plazo y misma horquilla. Si el racimo no bate a un gemelo sorteado, no elige.
  const az = rng(20260820);
  for (const [nombre, f] of [["racimo N>=3 >=$2,5M", base], ["print único >=$2,5M", ask.filter((x) => x.n === 1 && x.prem >= 2.5e6)]]) {
    if (f.length < 40) continue;
    const obs = tPorDia(f, "ret").m;
    const nulos = [];
    for (let it = 0; it < SORTEOS; it++) {
      // se re-muestrea el retorno del gemelo MEDIO con ruido de su propia dispersión no está
      // disponible aquí, así que se sortea entre los eventos del mismo día el gemelo de otro
      const pd = new Map();
      for (const x of f) { if (!pd.has(x.fechaY)) pd.set(x.fechaY, []); pd.get(x.fechaY).push(x); }
      const md = [];
      for (const [, v] of pd) md.push(media(v.map(() => v[Math.floor(az() * v.length)].retGem)));
      nulos.push(media(md));
    }
    const mN = media(nulos), sN = sd(nulos);
    console.log(`  ${nombre.padEnd(24)} contrato del racimo ${(100 * obs).toFixed(2).padStart(7)}%  ·  gemelo sorteado ${(100 * mN).toFixed(2).padStart(7)}% ±${(100 * sN).toFixed(2)}  ·  z=${((obs - mN) / sN).toFixed(2)}`);
  }
}

// ── 9. DINERO ───────────────────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}`);
console.log(`7. EN DOLARES AL AÑO sobre $${fmt(CUENTA)}`);
console.log(`${"=".repeat(104)}\n`);
const dinero = [];
for (const [nombre, f] of [["racimo N>=3 >=$2,5M", base], ["print único >=$2,5M", ask.filter((x) => x.n === 1 && x.prem >= 2.5e6)], ["gemelo sorteado (el azar)", base]]) {
  if (f.length < 40) continue;
  const campo = nombre.startsWith("gemelo") ? "retGem" : "ret";
  const prima = media(f.map((x) => x.prima));
  const m = media(f.map((x) => x[campo]));
  const diasPos = media(f.map((x) => x.diasPos));
  const nCtr = Math.max(1, Math.floor((CUENTA * 0.1) / prima));
  const comprometido = nCtr * prima;
  const anual = comprometido * m * (365 / diasPos);
  const acierto = (100 * f.filter((x) => x[campo] > 0).length) / f.length;
  console.log(`  ${nombre.padEnd(26)} ${String(f.length).padStart(5)} ops · prima $${fmt(prima).padStart(6)} · ${nCtr} ctr = $${fmt(comprometido).padStart(6)} · ${(100 * m).toFixed(2).padStart(7)}%/op · acierto ${acierto.toFixed(1)}% · ${("$" + fmt(anual)).padStart(9)}/año`);
  dinero.push({ nombre, n: f.length, prima, nCtr, comprometido, media: m, anual, acierto, diasPos });
}
console.log(`\n  (el capital comprometido de verdad es la prima pagada: si expira sin valor se pierde entero)`);

writeFileSync("scripts/rep-2-contrato.json", JSON.stringify({ LISTON, rej, escalera, emparejado, C, fuera: fuera.slice(0, 6), dinero }, null, 1));
console.log(`\n  -> scripts/rep-2-contrato.json\n`);
