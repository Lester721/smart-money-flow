// H2 DEL PRE-REGISTRO — ¿predice el DESEQUILIBRIO compra/venta de MarketSnack?
//
// H1 (su `score`) se midió aparte. Esto prueba otra cosa distinta: no lo que ellos puntúan, sino
// quién tomó la iniciativa. Su campo `side` tiene siete categorías, mucho más fino que las tres
// nuestras, y es el dato que llevamos días persiguiendo por otro camino.
//
//   compran con prisa : ASKSIDE, ABOVE_ASK, AT_ASK    -> +
//   venden con prisa  : BIDSIDE, BELOW_BID, AT_BID    -> −
//   MIDMKT                                            -> no cuenta, no se le inventa lado
//
// Desequilibrio del ticker-día = (prima compradora − prima vendedora) / prima total, en [−1, +1].
// Se prueba si predice el rendimiento del subyacente SIN FIRMAR — aquí la dirección la pone el
// desequilibrio, no su etiqueta `sentiment`. Si el desequilibrio comprador predice subidas, el
// rendimiento firmado por el desequilibrio saldrá positivo.
//
// Mismas defensas que en H1: entrada al CIERRE del día (imposible mirar el futuro), agregación
// por ticker-día (nada de contar diez operaciones del mismo día como diez datos), precios de
// ThetaData y no suyos, y partición temporal en dos mitades.
//
// Uso: node scripts/marketsnack/medir-desequilibrio.mjs

import fs from "node:fs";
import path from "node:path";
import rl from "node:readline";

const FLUJO = process.argv[2] || "data/marketsnack/flujo-prima1000k.jsonl";
const CACHE = "data/marketsnack/cierres";
const HORIZONTES = [1, 3, 5];
const GRUPOS = 5;

const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);

const parsear = (s) => { const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(s); return m ? { raiz: m[1], tipo: m[3] } : null; };

console.log(`═══ H2 · ¿PREDICE EL DESEQUILIBRIO COMPRA/VENTA? ═══\n`);

const ev = new Map();
let usadas = 0;
for await (const l of rl.createInterface({ input: fs.createReadStream(FLUJO) })) {
  if (!l.trim()) continue;
  let t; try { t = JSON.parse(l); } catch { continue; }
  const p = parsear(t.symbol ?? ""); if (!p || !t.timestamp || !(t.premium > 0)) continue;
  const lado = COMPRA.has(t.side) ? 1 : VENTA.has(t.side) ? -1 : 0;
  usadas++;
  const k = `${p.raiz}|${t.timestamp.slice(0, 10)}`;
  let e = ev.get(k);
  if (!e) { e = { raiz: p.raiz, dia: t.timestamp.slice(0, 10), compra: 0, venta: 0, medio: 0, n: 0 }; ev.set(k, e); }
  if (lado === 1) e.compra += t.premium; else if (lado === -1) e.venta += t.premium; else e.medio += t.premium;
  e.n++;
}
console.log(`   operaciones: ${usadas.toLocaleString("es-ES")}  ·  eventos ticker-día: ${ev.size.toLocaleString("es-ES")}`);

const serie = (r) => { try { const j = JSON.parse(fs.readFileSync(path.join(CACHE, `${r}.json`), "utf8")); return j || null; } catch { return null; } };

const muestra = [];
for (const e of ev.values()) {
  const s = serie(e.raiz); if (!s) continue;
  const i = s.findIndex(([f]) => f === e.dia); if (i < 0) continue;
  const clasificada = e.compra + e.venta;
  if (clasificada <= 0) continue;
  const dese = (e.compra - e.venta) / clasificada;     // en [−1, +1]
  if (dese === 0) continue;
  const entrada = s[i][1];
  const fila = { raiz: e.raiz, dia: e.dia, dese, n: e.n };
  let alguno = false;
  for (const h of HORIZONTES) {
    if (i + h >= s.length) continue;
    // Firmado POR EL DESEQUILIBRIO: si hay presión compradora y sube, acierta.
    fila[`r${h}`] = ((s[i + h][1] - entrada) / entrada) * Math.sign(dese) * 100;
    fila[`b${h}`] = ((s[i + h][1] - entrada) / entrada) * 100;   // bruto, para el control
    alguno = true;
  }
  if (alguno) muestra.push(fila);
}
console.log(`   eventos con rendimiento: ${muestra.length.toLocaleString("es-ES")}\n`);

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const de = (a) => { const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const t2 = (a, b) => { const va = de(a) ** 2, vb = de(b) ** 2; return (media(a) - media(b)) / Math.sqrt(va / a.length + vb / b.length); };
const t1 = (a) => media(a) / (de(a) / Math.sqrt(a.length));

function medir(filas, etiqueta) {
  console.log(`${"─".repeat(72)}\n${etiqueta}   (n = ${filas.length})`);
  const res = {};
  for (const h of HORIZONTES) {
    const con = filas.filter((f) => f[`r${h}`] != null).sort((a, b) => a.dese - b.dese);
    if (con.length < 50) continue;
    const tam = Math.floor(con.length / GRUPOS), g = [];
    for (let q = 0; q < GRUPOS; q++) {
      const tr = con.slice(q * tam, q === GRUPOS - 1 ? con.length : (q + 1) * tam);
      g.push({ d: media(tr.map((f) => f.dese)), r: media(tr.map((f) => f[`b${h}`])), n: tr.length, vals: tr.map((f) => f[`b${h}`]) });
    }
    // Aquí lo que debe crecer es el rendimiento BRUTO con el desequilibrio: más presión
    // compradora -> más sube. Por eso se mira el bruto, no el firmado.
    const t = t2(g[GRUPOS - 1].vals, g[0].vals);
    const mono = g.every((x, i) => i === 0 || x.r >= g[i - 1].r);
    const firmado = con.map((f) => f[`r${h}`]);
    console.log(`\n   +${h} día(s)  ·  n = ${con.length}`);
    console.log(`     grupo   desequilibrio   rendimiento BRUTO   n`);
    g.forEach((x, i) => console.log(`       G${i + 1}       ${x.d.toFixed(2).padStart(6)}         ${(x.r >= 0 ? "+" : "") + x.r.toFixed(3)}%`.padEnd(52) + `${x.n}`));
    console.log(`     G5 − G1 = ${(g[4].r - g[0].r >= 0 ? "+" : "") + (g[4].r - g[0].r).toFixed(3)}%  ·  t = ${t.toFixed(2)}  ·  monótona: ${mono ? "SÍ" : "NO"}`);
    console.log(`     rendimiento firmado por el desequilibrio: ${(media(firmado) >= 0 ? "+" : "") + media(firmado).toFixed(3)}%  ·  t = ${t1(firmado).toFixed(2)}`);
    res[h] = { spread: g[4].r - g[0].r, t, mono, n: con.length, firmado: media(firmado), tFirmado: t1(firmado) };
  }
  console.log("");
  return res;
}

const todo = medir(muestra, "TODA LA MUESTRA");
const porFecha = [...muestra].sort((a, b) => (a.dia < b.dia ? -1 : 1));
const c = Math.floor(porFecha.length / 2);
const pri = medir(porFecha.slice(0, c), "PRIMERA MITAD");
const seg = medir(porFecha.slice(c), "SEGUNDA MITAD");

console.log(`${"═".repeat(72)}\nVEREDICTO H2 CONTRA EL PRE-REGISTRO\n`);
for (const h of HORIZONTES) {
  const a = todo[h]; if (!a) continue;
  const cond = {
    "monótona": a.mono, "t > 2": Math.abs(a.t) > 2, "n ≥ 200": a.n >= 200,
    "mismo signo en las dos mitades": !!(pri?.[h] && seg?.[h] && Math.sign(pri[h].spread) === Math.sign(seg[h].spread) && Math.sign(a.spread) === Math.sign(pri[h].spread)),
  };
  console.log(`   +${h}d:  ${Object.entries(cond).map(([k, v]) => `${v ? "✓" : "✗"} ${k}`).join("   ")}  →  ${Object.values(cond).every(Boolean) ? "pasa lo estadístico" : "NO pasa"}`);
}
console.log("");
