// PANEL (root, día) DE VOLATILIDAD IMPLÍCITA DEL FLUJO — construcción, sin medir nada todavía.
//
// REGLA DE ORO: sólo entra lo observable ANTES de la hora de corte del propio día D, y el
// retorno se mide desde el CIERRE de D en adelante. Entre el último dato usado (19:00Z = 15:00 ET)
// y el precio de entrada (cierre, 20:00Z = 16:00 ET) hay una hora entera de separación.
//
// Las normalizaciones por ticker (media/desviación de su IV) usan SÓLO días ANTERIORES a D.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const DIR = path.join(RAIZ,"flujo-100k");
const CHART = path.join(RAIZ,"aux","chart-all");
const RE = /^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;

const CORTE_H = 19;          // hora UTC de corte (15:00 ET, una hora antes del cierre)
const MIN_OPS = 30;          // operaciones con IV válida por (root, día)
const MIN_LADO = 10;         // por lado para el desbalance compra/venta
const MIN_PREV = 10;         // días previos mínimos para normalizar contra su propia historia
const VENT_PREV = 20;        // ventana de normalización (días anteriores)
const MIN_ROOTS_DIA = 20;    // ancho mínimo del corte transversal

const COMPRA = new Set(["ASKSIDE","AT_ASK","ABOVE_ASK"]);
const VENTA  = new Set(["BIDSIDE","AT_BID","BELOW_BID"]);

// ── precios ────────────────────────────────────────────────────────────────────────────────
const precio = new Map();  // root -> Map(fecha -> cierre)
for (const f of fs.readdirSync(CHART)) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART,f))).toString("utf8"));
  precio.set(j.symbol, new Map(j.data.map(p=>[p.t.slice(0,10), p.v])));
}
const CAL = [...precio.get("SPY").keys()].sort();   // calendario de mercado = fechas de SPY
const idxCal = new Map(CAL.map((d,i)=>[d,i]));

// ── recorrido del flujo ────────────────────────────────────────────────────────────────────
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).sort().map(f=>f.slice(0,10));
const panel = [];
const diag = { filas:0, corte:0, ivMala:0, quoteMala:0, sinPrecio:0, celdas:0, celdasPocas:0 };

for (const dia of dias) {
  const L = zlib.gunzipSync(fs.readFileSync(path.join(DIR,dia+".jsonl.gz"))).toString("utf8").split("\n");
  const agg = new Map();  // root -> acumuladores
  for (const ln of L) {
    if (!ln) continue;
    const r = JSON.parse(ln); diag.filas++;
    if (r.timestamp.slice(0,10) !== dia) continue;
    if (Number(r.timestamp.slice(11,13)) >= CORTE_H) { diag.corte++; continue; }   // POSTERIOR AL CORTE
    const iv = r.implied_volatility;
    if (iv == null || !Number.isFinite(iv) || iv <= 0) { diag.ivMala++; continue; }
    if (!(r.bid_price > 0) || !(r.ask_price > 0) || r.bid_price > r.ask_price) { diag.quoteMala++; continue; }
    const p = Number(r.premium); if (!Number.isFinite(p) || p <= 0) continue;
    const m = RE.exec(r.symbol); if (!m) continue;
    const root = m[1];
    if (!precio.has(root)) { diag.sinPrecio++; continue; }
    let a = agg.get(root);
    if (!a) { a = {n:0, wp:0, wpi:0, nc:0, wpc:0, wpic:0, nv:0, wpv:0, wpiv:0}; agg.set(root,a); }
    a.n++; a.wp += p; a.wpi += p*iv;
    if (COMPRA.has(r.side)) { a.nc++; a.wpc += p; a.wpic += p*iv; }
    else if (VENTA.has(r.side)) { a.nv++; a.wpv += p; a.wpiv += p*iv; }
  }
  for (const [root,a] of agg) {
    diag.celdas++;
    if (a.n < MIN_OPS) { diag.celdasPocas++; continue; }
    const ivPond = a.wpi / a.wp;
    const ivC = a.nc >= MIN_LADO ? a.wpic/a.wpc : null;
    const ivV = a.nv >= MIN_LADO ? a.wpiv/a.wpv : null;
    panel.push({ fecha:dia, root, nOps:a.n, primaTotal:a.wp, ivPond,
                 ivCompra:ivC, ivVenta:ivV,
                 ivSkew: (ivC!=null&&ivV!=null) ? ivC-ivV : null,
                 ivSkewRel: (ivC!=null&&ivV!=null) ? (ivC-ivV)/ivPond : null });
  }
}
console.log("diagnóstico de construcción:", JSON.stringify(diag));

// ── normalización contra el PASADO de cada ticker (nunca contra el futuro) ─────────────────
panel.sort((a,b)=> a.root===b.root ? a.fecha.localeCompare(b.fecha) : a.root.localeCompare(b.root));
const porRoot = new Map();
for (const f of panel) { if(!porRoot.has(f.root)) porRoot.set(f.root,[]); porRoot.get(f.root).push(f); }
for (const [root, filas] of porRoot) {
  for (let i=0;i<filas.length;i++) {
    const prev = filas.slice(Math.max(0,i-VENT_PREV), i).map(x=>x.ivPond);   // ESTRICTAMENTE ANTERIORES
    if (prev.length < MIN_PREV) { filas[i].ivZ = null; continue; }
    const mu = prev.reduce((a,x)=>a+x,0)/prev.length;
    const sd = Math.sqrt(prev.reduce((a,x)=>a+(x-mu)**2,0)/(prev.length-1));
    filas[i].ivZ = sd>0 ? (filas[i].ivPond-mu)/sd : null;
  }
}

// ── retornos FUTUROS del subyacente desde el cierre de D ───────────────────────────────────
const HOR = [1,5,20];
let extremos = 0;
for (const f of panel) {
  const m = precio.get(f.root); const i = idxCal.get(f.fecha);
  const p0 = i!=null ? m.get(f.fecha) : null;
  f.p0 = p0 ?? null;
  for (const h of HOR) {
    const dh = (i!=null && i+h < CAL.length) ? CAL[i+h] : null;
    const ph = dh ? m.get(dh) : null;
    f["ret"+h] = (p0>0 && ph>0) ? ph/p0 - 1 : null;
  }
  if (f.ret1!=null && Math.abs(f.ret1) > 0.25) extremos++;
}
console.log(`filas de panel ${panel.length} · retornos |1d|>25% ${extremos} (posibles splits sin ajustar)`);

fs.writeFileSync(path.join(RAIZ,"iv-panel.json"), JSON.stringify(panel));
const conRet = panel.filter(f=>f.ret1!=null).length;
console.log(`con ret1 ${conRet} · con ret5 ${panel.filter(f=>f.ret5!=null).length} · con ret20 ${panel.filter(f=>f.ret20!=null).length}`);
console.log(`con ivZ ${panel.filter(f=>f.ivZ!=null).length} · con ivSkew ${panel.filter(f=>f.ivSkew!=null).length}`);
const roots = new Set(panel.map(f=>f.root));
console.log(`roots ${roots.size} · días ${new Set(panel.map(f=>f.fecha)).size}`);
