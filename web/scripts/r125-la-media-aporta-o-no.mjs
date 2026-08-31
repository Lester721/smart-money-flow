// ══ ¿EL MÉRITO ES DE LA MEDIA O DE LA CALL? ══ Lester, 2026-08-28.
//
// r123 dejó en pie una sola cosa: la misma call pero sobre índice en vez de sobre empresas.
// Sharpe 0,71 · 0,73 y 0,77 en las dos mitades · gana a SPY a crédito por 1-2,5 puntos.
// Con un punto flojo grande: SON 64 OPERACIONES.
//
// Aquí se ataca ese punto flojo separando las dos cosas que van juntas en esa regla:
//   (a) LA CALL      — comprar convexidad: sube más de lo que baja (medido: beta 3,17 vs 2,83)
//   (b) LA MEDIA     — elegir el momento: sólo entrar con el índice bajo su media de 20 días
//
// Si el mérito es de (a), la media SOBRA y la regla pasa a ser «tener siempre una puesta»:
// eso se mide con 2.643 días en vez de con 64 casillas, y deja de depender de la suerte.
// Si el mérito es de (b), entonces son 64 operaciones y hay que decirlo y no tocarlo más.
//
// Se enseñan LAS DOS MITADES desde el primer momento, como en r122, para no repetir lo de r121.
process.env.CAMINOS = "caminos-indice.json";
const { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const spy1 = spyApalancado(1);
const A = "20201231", B = "20210101";
const guarda = OPS.map((o) => o.ma);
// el motor descarta ma >= 0, así que para admitir entradas SOBRE la media hay que
// reescribir el campo con un valor negativo que conserve el orden de preferencia.
const marcar = (sel, orden) => { for (let i = 0; i < OPS.length; i++)
  OPS[i].ma = sel(OPS[i], guarda[i]) ? orden(OPS[i], guarda[i]) : 999; };

console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas de índice: " + OPS.length.toLocaleString("en-US") +
  "  (bajo la media " + guarda.filter((m) => m < 0).length.toLocaleString("en-US") +
  " · sobre la media " + guarda.filter((m) => m >= 0).length.toLocaleString("en-US") + ")");
console.log("  EL LISTÓN — comprar SPY y dormir: " + spy1.cagr.toFixed(1) + "% al año · caída −" +
  spy1.caida.toFixed(0) + "% · Sharpe " + spy1.sharpe.toFixed(2));
console.log("  las posiciones abiertas van a PRECIO DE HOY");
console.log("");

console.log("  ══ 1 · ¿APORTA LA MEDIA DE 20 DÍAS? ══  (2 huecos al 8%, el ocioso en SPY)");
console.log("");
console.log("  " + "cuándo se entra".padEnd(26) + "TODO".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
console.log("  " + " ".repeat(26) + "al año  caída   Sh   ops".padStart(26) + "al año  caída   Sh".padStart(22) + "al año  caída   Sh".padStart(22));
function linea(nombre, sel, orden = (o, m) => m, tam = 0.08, huecos = 2) {
  marcar(sel, orden);
  const T = banda({ tam, huecos, modo: "spy" });
  const qA = banda({ tam, huecos, modo: "spy", hasta: A });
  const qB = banda({ tam, huecos, modo: "spy", desdeD: B });
  const q = simular({ tam, huecos, modo: "spy" });
  console.log("  " + nombre.padEnd(26) +
    ((T.a.toFixed(1)+"%").padStart(7) + ("−"+T.c.toFixed(0)+"%").padStart(7) + T.s.toFixed(2).padStart(6) + String(q.ops).padStart(6)).padStart(26) +
    ((qA.a.toFixed(1)+"%").padStart(7) + ("−"+qA.c.toFixed(0)+"%").padStart(7) + qA.s.toFixed(2).padStart(6)).padStart(22) +
    ((qB.a.toFixed(1)+"%").padStart(7) + ("−"+qB.c.toFixed(0)+"%").padStart(7) + qB.s.toFixed(2).padStart(6)).padStart(22));
  return { T, q }; }
linea("bajo la media (la regla)", (o, m) => m < 0);
linea("SIEMPRE (sin la media)",   () => true, () => -1);
linea("sólo SOBRE la media",      (o, m) => m >= 0, () => -1);
console.log("");

console.log("  ══ 2 · ¿SPY, QQQ, O LOS DOS? ══  (siempre puesta, 2 huecos al 8%)");
console.log("");
console.log("  " + "universo".padEnd(26) + "TODO".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
linea("SPY + QQQ",  () => true, () => -1);
linea("sólo SPY",   (o) => o.tk === "SPY", () => -1, 0.08, 1);
linea("sólo QQQ",   (o) => o.tk === "QQQ", () => -1, 0.08, 1);
console.log("");

console.log("  ══ 3 · LA FRONTERA ══  siempre puesta, contra los dos listones");
console.log("");
marcar(() => true, () => -1);
const REJ = []; for (const h of [1, 2, 3]) for (let tm = 0.03; tm <= 0.361; tm += 0.01) REJ.push([h, Math.round(tm*1000)/1000]);
const PT = REJ.map(([h, tm]) => ({ h, tm, ...banda({ tam: tm, huecos: h, modo: "spy" }) }));
marcar((o, m) => m < 0, (o, m) => m);
const PTma = REJ.map(([h, tm]) => ({ h, tm, ...banda({ tam: tm, huecos: h, modo: "spy" }) }));
const FSPY = []; for (let L = 1; L <= 3.01; L += 0.05) { const r = spyApalancado(L); FSPY.push({ L: Math.round(L*100)/100, a: r.cagr, c: r.caida, s: r.sharpe }); }
const mej = (p, o) => { const ok = p.filter((x) => x.c <= o); return ok.length ? ok.sort((a,b)=>b.a-a.a)[0] : null; };
const OBJ = [25, 30, 35, 40, 50, 60];
console.log("  " + "".padEnd(22) + OBJ.map((o) => ("≤" + o + "%").padStart(10)).join(""));
for (const [nom, p] of [["siempre puesta", PT], ["bajo la media", PTma]]) {
  let l = "  " + nom.padEnd(22);
  for (const o of OBJ) { const x = mej(p, o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(10); }
  console.log(l); }
let l = "  " + "SPY a crédito".padEnd(22);
for (const o of OBJ) { const x = mej(FSPY, o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(10); }
console.log(l);
console.log("  " + "SPY y dormir".padEnd(22) + (spy1.cagr.toFixed(1)+"%").padStart(10) + "  ← caída −" + spy1.caida.toFixed(0) + "%");
console.log("");
console.log("  mejor Sharpe:");
for (const [nom, p] of [["siempre puesta", PT], ["bajo la media", PTma]]) { const x = p.slice().sort((a,b)=>b.s-a.s)[0];
  console.log("    " + nom.padEnd(22) + x.s.toFixed(2) + "   (" + x.h + " huecos al " + (100*x.tm).toFixed(0) +
    "%, " + x.a.toFixed(1) + "% al año, caída −" + x.c.toFixed(0) + "%)"); }
console.log("    " + "SPY y dormir".padEnd(22) + spy1.sharpe.toFixed(2) + "   ← el listón");
console.log("    " + "SPY a crédito, mejor".padEnd(22) + FSPY.slice().sort((a,b)=>b.s-a.s)[0].s.toFixed(2));
console.log("");
