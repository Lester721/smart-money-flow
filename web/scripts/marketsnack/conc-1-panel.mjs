// CONCENTRACIÓN · PANEL.  ¿Qué fracción de la prima del día de un ticker va a UN SOLO contrato,
// a qué vencimiento, a qué distancia del dinero, y con qué relación size↔OI?
//
// HIPÓTESIS (de Lester): una apuesta CONCENTRADA, LEJOS del dinero y a CORTO plazo es alguien que
// espera un movimiento GRANDE y PRONTO. Ese es el perfil de lo que paga comprando opciones.
//
// AQUÍ NO SE MIDE NINGÚN RETORNO. Este fichero sólo construye el panel. Todo lo que entra en una
// métrica está disponible ANTES del corte horario; el retorno se añade en conc-2 y se entra al
// CIERRE de ese mismo día (posterior a los dos cortes: 12:00 y 15:45 ET).
//
// TRES DECISIONES, y por qué:
//  · PRECIO DEL SUBYACENTE = CIERRE DEL DÍA ANTERIOR, no `asset_price`. El campo asset_price viene
//    nulo en el 21-31% de las operaciones ANTES del 2026-07-16 y en el 0,0% después (ruptura de la
//    tubería de MS, ya verificada). Usarlo cambiaría la MUESTRA a mitad de período. El cierre de
//    D-1 está disponible en todo momento y no depende de MS.
//  · ÍNDICES FUERA. SPX/SPXW/NDX/RUT/VIX no tienen serie de precio en la caché (30% del flujo).
//    No se rellena: se dice. Además SPX solo es el 22% del flujo y sin tope sería "medir SPX".
//  · APALANCADOS FUERA, mismo universo que el hallazgo del LADO. No se re-elige universo.

import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const RUPTURA = "2026-07-16";
const CORTES = { "12:00": 12 * 60, "15:45": 15 * 60 + 45 };
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const VENTA  = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

const MIN_OPS = 5;        // al menos 5 prints de >=$100k ese dia
const MIN_CONTRATOS = 2;  // con 1 contrato la concentracion es 1,0 por definicion: no informa

const parseOcc = (s) => {
  const k = s.slice(-8), t = s.slice(-9, -8), d = s.slice(-15, -9), u = s.slice(0, -15);
  if (!/^\d{8}$/.test(k) || !/^[CP]$/.test(t) || !/^\d{6}$/.test(d) || !u) return null;
  return { u, call: t === "C", exp: `20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}`, K: Number(k) / 1000 };
};
const dd = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

// -- series de precio (cierres diarios) ------------------------------------------------------
const precios = {};   // T -> { fecha: cierre }
const fechasT = {};   // T -> [fechas ordenadas]
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  const T = f.slice(0, -8);
  if (APAL.has(T)) continue;
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH, f))).toString("utf8"));
  const m = {};
  for (const r of j.data) if (Number.isFinite(r.v) && r.v > 0) m[r.t.slice(0, 10)] = r.v;
  const fs2 = Object.keys(m).sort();
  if (fs2.length > 60) { precios[T] = m; fechasT[T] = fs2; }
}
console.log(`series de precio cargadas: ${Object.keys(precios).length} (apalancados excluidos)`);

const posT = {};
for (const T of Object.keys(fechasT)) { const p = {}; fechasT[T].forEach((f, i) => (p[f] = i)); posT[T] = p; }

/** vol diaria realizada de los 20 dias bursatiles que TERMINAN en `fecha` (cierre de D incluido). */
function vol20(T, fecha) {
  const i = posT[T][fecha]; if (i == null || i < 21) return null;
  const rs = [];
  for (let j = i - 19; j <= i; j++) {
    const a = precios[T][fechasT[T][j - 1]], b = precios[T][fechasT[T][j]];
    if (a > 0 && b > 0) rs.push(b / a - 1);
  }
  if (rs.length < 15) return null;
  const m = rs.reduce((s, x) => s + x, 0) / rs.length;
  return Math.sqrt(rs.reduce((s, x) => s + (x - m) ** 2, 0) / (rs.length - 1));
}
/** cierre estrictamente anterior al dia `fecha`. */
function cierrePrevio(T, fecha) {
  const i = posT[T][fecha]; if (i == null || i < 1) return null;
  return precios[T][fechasT[T][i - 1]];
}

// -- recorrer el flujo -----------------------------------------------------------------------
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const panel = { "12:00": [], "15:45": [] };
let tot = 0, sinOcc = 0, sinPrecio = 0, fueraHora = 0, sinPrima = 0;
const fueraTop = new Map();

for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  const acc = {}; for (const c of Object.keys(CORTES)) acc[c] = new Map();

  for (const l of txt.split("\n")) {
    if (!l) continue;
    const r = JSON.parse(l);
    tot++;
    const o = parseOcc(r.symbol); if (!o) { sinOcc++; continue; }
    if (!precios[o.u]) { sinPrecio++; fueraTop.set(o.u, (fueraTop.get(o.u) ?? 0) + 1); continue; }
    if (!(r.premium > 0) || !(r.size > 0)) { sinPrima++; continue; }
    const min = ((Date.parse(r.timestamp) - 4 * 3600e3) / 60000) % 1440;
    if (!(min >= 0 && min < 16 * 60)) { fueraHora++; continue; }   // solo sesion regular

    for (const [nom, lim] of Object.entries(CORTES)) {
      if (min >= lim) continue;
      let m = acc[nom].get(o.u);
      if (!m) { m = { contratos: new Map(), ops: 0, prima: 0 }; acc[nom].set(o.u, m); }
      m.ops++; m.prima += r.premium;
      let c = m.contratos.get(r.symbol);
      if (!c) { c = { exp: o.exp, K: o.K, call: o.call, prima: 0, size: 0, ops: 0, oi: null, vol: null, compra: 0, venta: 0 }; m.contratos.set(r.symbol, c); }
      c.prima += r.premium; c.size += r.size; c.ops++;
      if (r.open_interest != null) c.oi = c.oi == null ? r.open_interest : Math.max(c.oi, r.open_interest);
      if (r.volume != null) c.vol = c.vol == null ? r.volume : Math.max(c.vol, r.volume);
      if (COMPRA.has(r.side)) c.compra += r.premium; else if (VENTA.has(r.side)) c.venta += r.premium;
    }
  }

  for (const [nom, mapa] of Object.entries(acc)) {
    for (const [T, m] of mapa) {
      if (m.ops < MIN_OPS || m.contratos.size < MIN_CONTRATOS) continue;
      const S = cierrePrevio(T, dia); if (!(S > 0)) continue;
      const v20 = vol20(T, dia); if (!(v20 > 0)) continue;
      const cs = [...m.contratos.values()].sort((a, b) => b.prima - a.prima);
      const top = cs[0];
      const share = cs.map((c) => c.prima / m.prima);
      const hhi = share.reduce((s, x) => s + x * x, 0);
      const top3 = share.slice(0, 3).reduce((s, x) => s + x, 0);
      const dte = dd(dia, top.exp);
      // distancia FUERA del dinero, con signo: >0 = OTM, <0 = ITM. Con el cierre de D-1.
      const distOtm = top.call ? top.K / S - 1 : 1 - top.K / S;
      panel[nom].push({
        ticker: T, fecha: dia, tramo: dia < RUPTURA ? "antes" : "despues",
        ops: m.ops, contratos: m.contratos.size, prima: m.prima,
        concTop1: share[0], concTop3: top3, hhi,
        top1DTE: dte, top1DistOtm: distOtm, top1AbsDist: Math.abs(distOtm),
        top1Call: top.call ? 1 : 0, top1Prima: top.prima, top1Size: top.size,
        top1OI: top.oi, top1Vol: top.vol,
        top1SizeSobreOI: top.oi != null && top.oi > 0 ? top.size / top.oi : null,
        top1OIchico: top.oi != null && top.oi < 50 ? 1 : 0,
        top1Compra: top.compra, top1Venta: top.venta,
        top1LadoNeto: top.compra + top.venta > 0 ? (top.compra - top.venta) / (top.compra + top.venta) : null,
        top1Exp: top.exp, top1K: top.K,
        S, vol20: v20,
      });
    }
  }
}

const pc = (x) => ((x / tot) * 100).toFixed(1) + "%";
console.log(`\n-- CENSO ---------------------------------------------------------`);
console.log(`  operaciones en ${dias.length} dias : ${tot.toLocaleString("es-ES")}`);
console.log(`  simbolo no-OCC                   : ${sinOcc.toLocaleString("es-ES")} (${pc(sinOcc)})`);
console.log(`  sin serie de precio / apalancado : ${sinPrecio.toLocaleString("es-ES")} (${pc(sinPrecio)})`);
console.log(`  fuera de sesion regular          : ${fueraHora.toLocaleString("es-ES")} (${pc(fueraHora)})`);
console.log(`  sin prima o tamano               : ${sinPrima.toLocaleString("es-ES")} (${pc(sinPrima)})`);
console.log(`  lo que se cae por no tener precio (top 10): ${[...fueraTop].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([t,n])=>`${t} ${(n/1000).toFixed(0)}k`).join(" - ")}`);
for (const [nom, f] of Object.entries(panel)) {
  const ds = new Set(f.map((x) => x.fecha));
  const porDia = [...ds].map((d) => f.filter((x) => x.fecha === d).length).sort((a, b) => a - b);
  console.log(`\n  corte ${nom}: ${f.length} filas - ${ds.size} dias - tickers/dia mediana ${porDia[Math.floor(porDia.length/2)]} (min ${porDia[0]}, max ${porDia.at(-1)})`);
  const a = f.filter(x=>x.tramo==="antes"), b = f.filter(x=>x.tramo==="despues");
  console.log(`     antes del ${RUPTURA}: ${a.length} filas / ${new Set(a.map(x=>x.fecha)).size} dias - despues: ${b.length} filas / ${new Set(b.map(x=>x.fecha)).size} dias`);
  const cuenta = new Map(); for (const x of f) cuenta.set(x.ticker, (cuenta.get(x.ticker)??0)+1);
  console.log(`     tickers distintos: ${cuenta.size} - mayor: ${[...cuenta].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n])=>`${t} ${(100*n/f.length).toFixed(1)}%`).join(" - ")}`);
}
fs.writeFileSync(path.join(RAIZ, "conc-panel.json"), JSON.stringify(panel));
console.log(`\nOK ${path.join(RAIZ, "conc-panel.json")}`);
