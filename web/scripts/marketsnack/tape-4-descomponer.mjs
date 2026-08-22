// PANEL FLOW-TAPE · PASO 4 — DESCOMPONER LOS DOS QUE ASOMAN, Y PROBAR EL MECANISMO.
//
// El paso 3 dejó dos cosas que no son ruido plano pero tampoco pasan el listón:
//   A) racha @ 11:00ET -> r1 : +0,62 pts/día, t=2,61, y los tercios CRECEN (+0,44 +0,57 +0,83).
//   B) dirAcel @ dia   -> r1 : −0,36 pts/día, t=−2,13, y los tercios son casi IDÉNTICOS
//      (−0,31 −0,36 −0,29). Ésa es la respuesta a la pregunta del encargo: SE DA LA VUELTA.
//
// Aquí no se buscan métricas nuevas. Se pregunta si la FORMA de la cinta aporta algo por encima
// de la simple DIRECCIÓN (`neto`), que es lo único que ya se sabía medir, y si el mecanismo que
// explicaría A hace una predicción que se cumpla.
//
// MECANISMO PROPUESTO PARA A: una racha larga e ininterrumpida de prima del mismo lado no son
// "muchos participantes de acuerdo": es UNA orden grande siendo trabajada, con el ejecutor aún
// dentro. `neto` mezcla manos que se compensan; `racha` aísla la mano que empuja sin contrapartida.
// Si eso es cierto, el efecto tiene que ser MAYOR cuando la racha está hecha de POCOS prints
// GRANDES (una orden trabajada) que de muchos pequeños (consenso difuso). Eso se prueba abajo.
//
// PRUEBAS: 64 del paso 3 + 10 de aquí = 74. Listón recalculado.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-4-descomponer.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const PANEL = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");
const SALIDA = path.join(RAIZ, "scripts/marketsnack/tape-4-salida.json");
const PRUEBAS = 74, LISTON = listonT(PRUEBAS);
const MIN_SIM = 12;

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);
const corr = (a, b) => { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : null; };

const panel = JSON.parse(fs.readFileSync(PANEL, "utf8"));
const porCorte = (c) => { const m = new Map(); for (const f of panel) { if (f.corte !== c) continue; let g = m.get(f.dia); if (!g) { g = []; m.set(f.dia, g); } g.push(f); } return m; };

console.log(`=== FLOW TAPE · PASO 4 · DESCOMPOSICIÓN Y MECANISMO ===`);
console.log(`   ${PRUEBAS} pruebas acumuladas · listón |t| >= ${LISTON}\n`);

/** Largo/corto simple por una función de la fila. */
function ls(dias, fn, horiz, filtro = null) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && fn(f) != null && Number.isFinite(fn(f)) && (!filtro || filtro(f)));
    if (g.length < MIN_SIM) continue;
    const ord = [...g].sort((a, b) => fn(b) - fn(a));
    const k = Math.floor(ord.length / 3); if (k < 4) continue;
    serie.push({ dia, ls: media(ord.slice(0, k).map((f) => f[horiz])) - media(ord.slice(-k).map((f) => f[horiz])) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0), serie };
}

/** Doble ordenación: se neutraliza `control` en 3 cubos y dentro de cada cubo se ordena por `fn`. */
function lsNeutral(dias, fn, control, horiz) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g = g0.filter((f) => f[horiz] != null && fn(f) != null && control(f) != null);
    if (g.length < 15) continue;
    const pc = [...g].sort((a, b) => control(b) - control(a)), k = Math.floor(pc.length / 3);
    const alto = [], bajo = [];
    for (let b = 0; b < 3; b++) {
      const cubo = b < 2 ? pc.slice(b * k, (b + 1) * k) : pc.slice(2 * k);
      if (cubo.length < 3) continue;
      const o = [...cubo].sort((x, y) => fn(y) - fn(x)), j = Math.max(1, Math.floor(o.length / 3));
      alto.push(...o.slice(0, j).map((f) => f[horiz])); bajo.push(...o.slice(-j).map((f) => f[horiz]));
    }
    if (alto.length && bajo.length) serie.push({ dia, ls: media(alto) - media(bajo) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0), serie };
}

const linea = (nom, r) => `   ${nom.padEnd(52)} n=${String(r.n).padStart(3)}d · ${(r.m >= 0 ? "+" : "") + r.m.toFixed(4)} pts · t=${r.t.toFixed(2).padStart(6)}` +
  ` · tercios ${r.ter.map((x) => (x >= 0 ? "+" : "") + x.toFixed(3)).join(" ")} ${r.mismo ? "OK" : "--"}${Math.abs(r.t) >= LISTON ? "  <<< PASA" : ""}`;

const D11 = porCorte("11:00ET"), DIA = porCorte("dia");
const res = {};

// ══ A) ¿racha es sólo `neto` disfrazado? ═══════════════════════════════════════════════════
console.log(`== A · ¿LA FORMA APORTA ALGO SOBRE LA DIRECCIÓN? (corte 11:00 ET, horizonte 1 día) ==\n`);
const todas11 = [...D11.values()].flat().filter((f) => f.racha != null && f.neto != null);
console.log(`   correlación racha vs neto: ${corr(todas11.map((f) => f.racha), todas11.map((f) => f.neto)).toFixed(3)}  (n=${todas11.length})`);
console.log(`   |racha| = concentración de la cinta; su SIGNO = dirección. Son la misma dirección con distinto peso.\n`);

res.racha = ls(D11, (f) => f.racha, "r1");
res.neto = ls(D11, (f) => f.neto, "r1");
res.rachaNeutral = lsNeutral(D11, (f) => f.racha, (f) => f.neto, "r1");
res.netoNeutral = lsNeutral(D11, (f) => f.neto, (f) => f.racha, "r1");
res.concentracion = ls(D11, (f) => Math.abs(f.racha), "r1");
res.netoPorConc = ls(D11, (f) => f.neto * Math.abs(f.racha), "r1");
console.log(linea("racha (dirección × concentración)", res.racha));
console.log(linea("neto (dirección sola) — el control", res.neto));
console.log(linea("racha NEUTRALIZADA por neto  <- ¿aporta la forma?", res.rachaNeutral));
console.log(linea("neto NEUTRALIZADO por racha  <- ¿aporta la dirección?", res.netoNeutral));
console.log(linea("|racha| sola (concentración SIN dirección)", res.concentracion));
console.log(linea("neto × |racha| (dirección amplificada por concentración)", res.netoPorConc));

// ══ B) el mecanismo: ¿pocos prints grandes o muchos pequeños? ═══════════════════════════════
console.log(`\n== B · EL MECANISMO — si es UNA orden trabajada, mandan los prints GRANDES ==\n`);
// tamaño medio del print del día, relativo a la mediana de ESE símbolo en días ANTERIORES
const histTam = new Map();
const conTam = [];
for (const [dia, g] of [...D11].sort()) {
  for (const f of g) {
    const tam = f.prima / f.ops;
    const prev = histTam.get(f.sim);
    let tamRel = null;
    if (prev && prev.length >= 5) { const s = [...prev].sort((a, b) => a - b); tamRel = tam / s[Math.floor(s.length / 2)]; }
    if (prev) prev.push(tam); else histTam.set(f.sim, [tam]);
    conTam.push({ ...f, tamRel });
  }
}
const D11t = new Map();
for (const f of conTam) { if (f.tamRel == null) continue; let g = D11t.get(f.dia); if (!g) { g = []; D11t.set(f.dia, g); } g.push(f); }
// partir cada día por la mediana de tamRel y medir racha en cada mitad
function lsPartido(dias, fn, horiz, campo, arriba) {
  const serie = [];
  for (const [dia, g0] of [...dias].sort()) {
    const g1 = g0.filter((f) => f[horiz] != null && fn(f) != null && f[campo] != null);
    if (g1.length < 20) continue;
    const ordC = [...g1].sort((a, b) => b[campo] - a[campo]);
    const mitad = arriba ? ordC.slice(0, Math.floor(ordC.length / 2)) : ordC.slice(Math.floor(ordC.length / 2));
    if (mitad.length < MIN_SIM) continue;
    const ord = [...mitad].sort((a, b) => fn(b) - fn(a));
    const k = Math.floor(ord.length / 3); if (k < 3) continue;
    serie.push({ dia, ls: media(ord.slice(0, k).map((f) => f[horiz])) - media(ord.slice(-k).map((f) => f[horiz])) });
  }
  const v = serie.map((s) => s.ls), k3 = Math.floor(serie.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? serie.slice(i * k3, (i + 1) * k3) : serie.slice(2 * k3)).map((s) => s.ls)));
  return { n: serie.length, m: media(v), de: de(v), t: tUna(v), ter, mismo: ter.every((x) => x > 0) || ter.every((x) => x < 0) };
}
res.rachaPrintGrande = lsPartido(D11t, (f) => f.racha, "r1", "tamRel", true);
res.rachaPrintPequeno = lsPartido(D11t, (f) => f.racha, "r1", "tamRel", false);
console.log(`   PREDICCIÓN del mecanismo: la mitad de prints GRANDES separa MÁS que la de pequeños.`);
console.log(linea("racha · mitad de prints GRANDES para ese símbolo", res.rachaPrintGrande));
console.log(linea("racha · mitad de prints PEQUEÑOS", res.rachaPrintPequeno));
const cumple = res.rachaPrintGrande.m > res.rachaPrintPequeno.m;
console.log(`   -> el mecanismo ${cumple ? "SE CUMPLE" : "NO se cumple"}: grandes ${res.rachaPrintGrande.m.toFixed(3)} vs pequeños ${res.rachaPrintPequeno.m.toFixed(3)}`);

// ══ C) la pregunta del encargo: ¿continúa o se da la vuelta? ════════════════════════════════
console.log(`\n== C · LA PREGUNTA DEL ENCARGO — flujo acelerando en una dirección ==\n`);
res.dirAcelDia = ls(DIA, (f) => f.dirAcel, "r1");
res.dirAcelNeutral = lsNeutral(DIA, (f) => f.dirAcel, (f) => f.neto, "r1");
res.dirAcelNeutralTardio = lsNeutral(DIA, (f) => f.dirAcel, (f) => f.netoTardio, "r1");
res.acelDia = ls(DIA, (f) => f.acel, "r1");
console.log(linea("dirAcel (cinta completa) -> día siguiente", res.dirAcelDia));
console.log(linea("dirAcel NEUTRALIZADO por neto", res.dirAcelNeutral));
console.log(linea("dirAcel NEUTRALIZADO por netoTardio", res.dirAcelNeutralTardio));
console.log(linea("acel (ritmo, SIN dirección) — no debería predecir", res.acelDia));
console.log(`\n   El signo NEGATIVO y estable de dirAcel dice: cuando la cinta VIRA hacia un lado en su`);
console.log(`   último tramo, el subyacente hace lo CONTRARIO al día siguiente. Se DA LA VUELTA.`);

// ══ D) robustez: ¿vive en unos pocos días? ══════════════════════════════════════════════════
console.log(`\n== D · ROBUSTEZ — ¿vive el efecto en cuatro días sueltos? ==\n`);
for (const [nom, r] of [["racha @11:00ET", res.racha], ["dirAcel @dia", res.dirAcelDia]]) {
  const v = [...r.serie].sort((a, b) => Math.abs(b.ls) - Math.abs(a.ls));
  const sin3 = v.slice(3).map((s) => s.ls), sin6 = v.slice(6).map((s) => s.ls);
  const pos = r.serie.filter((s) => (r.m > 0 ? s.ls > 0 : s.ls < 0)).length;
  console.log(`   ${nom.padEnd(18)} días a favor ${pos}/${r.serie.length} (${((pos / r.serie.length) * 100).toFixed(0)}%)` +
    ` · quitando los 3 días mayores: ${media(sin3).toFixed(4)} (t=${tUna(sin3).toFixed(2)})` +
    ` · quitando 6: ${media(sin6).toFixed(4)} (t=${tUna(sin6).toFixed(2)})`);
  console.log(`   ${" ".repeat(18)} días extremos: ${v.slice(0, 3).map((s) => `${s.dia} ${s.ls >= 0 ? "+" : ""}${s.ls.toFixed(2)}`).join(" · ")}`);
}

// ══ E) qué haría falta ══════════════════════════════════════════════════════════════════════
console.log(`\n== E · QUÉ LE FALTA A CADA UNO PARA PASAR ==\n`);
for (const [nom, r] of [["racha @11:00ET -> r1", res.racha], ["dirAcel @dia -> r1", res.dirAcelDia], ["racha neutralizada por neto", res.rachaNeutral]]) {
  const nNec = Math.ceil(((LISTON * r.de) / Math.abs(r.m)) ** 2);
  const sepNec = (LISTON * r.de) / Math.sqrt(r.n);
  console.log(`   ${nom}`);
  console.log(`      hoy: ${r.m.toFixed(4)} pts/día · de ${r.de.toFixed(3)} · ${r.n} días · t=${r.t.toFixed(2)} (listón ${LISTON})`);
  console.log(`      1) días necesarios manteniendo esta separación: ${nNec} (${(nNec / 252).toFixed(1)} años). Hay ${r.n}. FALTAN ${nNec - r.n}.`);
  console.log(`      2) o separación de ${sepNec.toFixed(4)} pts/día (${(sepNec / Math.abs(r.m)).toFixed(1)}× la observada) con los ${r.n} días de ahora.`);
}

fs.writeFileSync(SALIDA, JSON.stringify({ pruebas: PRUEBAS, liston: LISTON,
  resultados: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, { ...v, serie: undefined }])),
  mecanismoSeCumple: cumple, corrRachaNeto: corr(todas11.map((f) => f.racha), todas11.map((f) => f.neto)) }, null, 1));
console.log(`\n   escrito ${SALIDA}`);
