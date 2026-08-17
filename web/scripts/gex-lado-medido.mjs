// EL GEX CON EL LADO MEDIDO, NO SUPUESTO
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-lado-medido.mjs
//
// ═══ EL PROBLEMA ══════════════════════════════════════════════════════════════════════════
//
// `lib/gex.ts` firma la exposición con la convención `+call / −put`:
//
//     const gex = gamma * r.openInterest * 100 * spot * spot * 0.01;
//     if (r.contractType === "call") s.callGex += gex; else s.putGex -= gex;   (equivalente)
//
// Eso da por hecho quién está a cada lado. Y el 2026-08-16 se midió sobre 228.882 operaciones
// reales con su horquilla del momento: **el 52,1% de los dólares en calls los inició un comprador
// y el 49,5% de los de puts los inició un vendedor**. Los dos en la moneda al aire. El supuesto no
// se sostiene.
//
// Pero al mirarlo de cerca el problema es peor que un supuesto flojo. LA GAMMA DE UNA CALL Y DE UNA
// PUT CON EL MISMO STRIKE Y VENCIMIENTO ES IDÉNTICA. Lo que decide el signo de la exposición del
// creador de mercado no es si el contrato es call o put — es si él está LARGO o CORTO de él:
//
//     el cliente COMPRA (call o put) → el creador queda CORTO → gamma NEGATIVA → amplifica
//     el cliente VENDE  (call o put) → el creador queda LARGO → gamma POSITIVA → amortigua
//
// O sea que `+call/−put` asigna signos OPUESTOS a dos cosas que tienen el MISMO signo. Sólo acierta
// si además se cumple "los clientes compran calls y venden puts", que es justo lo que no se cumple.
//
// ═══ QUÉ HACE ESTE SCRIPT ═════════════════════════════════════════════════════════════════
//
// Calcula el GEX de las dos maneras para los 8 símbolos con flujo (2024-2026) y las compara:
//
//   ASUMIDO — como hoy: +call / −put.
//   MEDIDO  — cada contrato firmado por quién inició sus operaciones, acumulado a lo largo de su
//             vida y pesado por prima. Si de un contrato no hay ni una operación en la cinta, NO
//             SE INVENTA un signo: se cuenta aparte y se dice cuánto OI queda sin firmar.
//
// LO QUE SE MIDE: cuántas veces cambia el SIGNO del GEX total del día. Si casi nunca cambia, el
// supuesto daba igual. Si cambia a menudo, el GEX que usamos es otra cosa que la que creíamos.
//
// ⚠️ NO SE PUEDE ARREGLAR EL GEX DEL CÓNDOR CON ESTO. El cóndor opera SPX, y de SPX tenemos
// cotizaciones pero NO la cinta de operaciones — sin cinta no hay lado. Esto mide el tamaño del
// problema en las acciones, que es donde sí hay datos.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { bsGamma, impliedVol } from "../lib/blackScholes";

const FDIR = "scripts/cache-theta/flujo-historico";
const OIDIR = "scripts/cache-theta/oi-ancho";
const CDIR = "scripts/cache-theta/cadenas";
const CIE = "scripts/cache-theta/cierres";
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const px = new Map();
for (const f of readdirSync(CIE)) px.set(f.replace(".json", ""), JSON.parse(readFileSync(`${CIE}/${f}`, "utf8")));

// ── 1. Quién inició, acumulado por contrato ─────────────────────────────────
// clave: TICKER|VENC|STRIKE|C → { comprado, vendido } en dólares de prima.
// Se acumula sobre TODA la cinta disponible: el signo de un contrato lo define el conjunto de
// operaciones que lo construyeron, no la última.
const lado = new Map();
for (const f of readdirSync(FDIR)) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(readFileSync(`${FDIR}/${f}`, "utf8"));
  for (const n of j.notables ?? []) {
    if (!(n.bid > 0) || !(n.ask > 0)) continue;
    const ancho = n.ask - n.bid;
    const pos = ancho > 0 ? (n.price - n.bid) / ancho : 0.5;
    if (pos > 0.3 && pos < 0.7) continue;                    // a medias: no aporta signo
    const k = `${j.sym}|${String(n.exp).replace(/-/g, "")}|${n.strike}|${n.right}`;
    const v = lado.get(k) ?? { comprado: 0, vendido: 0 };
    if (pos >= 0.7) v.comprado += n.prima; else v.vendido += n.prima;
    lado.set(k, v);
  }
}
console.log(`\n${lado.size.toLocaleString("es-ES")} contratos con lado medido en la cinta\n`);

// ── 2. GEX de las dos maneras, día a día ────────────────────────────────────
const dias = [...new Set(readdirSync(OIDIR).map((f) => f.match(/_d(\d{8})\.json$/)?.[1]).filter(Boolean))]
  .filter((d) => d >= "20240102").sort();
const TICKERS = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];

let iguales = 0, distintos = 0, sinFirmar = 0, firmado = 0;
const filas = [];

for (const dia of dias) {
  for (const t of TICKERS) {
    const fo = `${OIDIR}/${t}_d${dia}.json`, fc = `${CDIR}/${t}_d${dia}.json`;
    if (!existsSync(fo) || !existsSync(fc)) continue;
    const spot = px.get(t)?.[dia];
    if (!(spot > 0)) continue;
    const oi = JSON.parse(readFileSync(fo, "utf8"));
    const cad = JSON.parse(readFileSync(fc, "utf8"));

    let gAsumido = 0, gMedido = 0;
    for (const [exp, grupo] of Object.entries(oi)) {
      const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
      if (dte <= 0 || dte > 60) continue;                    // el GEX vive en lo cercano
      const T = dte / 365;
      const gc = cad[exp] ?? {};
      for (const [clave, n] of Object.entries(grupo)) {
        const K = Number(clave.slice(0, -2)), cnt = Number(n) || 0;
        if (!(K > 0) || !(cnt > 0)) continue;
        if (K < spot * 0.85 || K > spot * 1.15) continue;    // sólo cerca del dinero
        const ba = gc[clave];
        if (!ba || !(ba[0] > 0) || !(ba[1] > 0)) continue;
        const esCall = clave.slice(-1) === "C";
        const iv = impliedVol((ba[0] + ba[1]) / 2, spot, K, T, esCall ? "call" : "put");
        if (!(iv > 0) || !Number.isFinite(iv)) continue;
        const g = bsGamma(spot, K, T, iv) * cnt * 100 * spot * spot * 0.01;
        if (!Number.isFinite(g)) continue;

        const v = lado.get(`${t}|${exp}|${K}|${clave.slice(-1)}`);
        // 🔴 CORREGIDO — LA COMPARACIÓN ERA INJUSTA.
        // Antes: gAsumido sumaba TODA la cadena y gMedido sólo la mitad que se puede firmar. Dos
        // números calculados sobre universos distintos dan correlación baja aunque los signos sean
        // idénticos, así que el r=0,126 medía sobre todo eso. Ahora los DOS se calculan sobre
        // exactamente los mismos contratos: los que tienen lado en la cinta.
        if (!v || v.comprado + v.vendido === 0) { sinFirmar += g; continue; }
        firmado += g;
        gAsumido += esCall ? g : -g;                          // la convención de hoy
        // cliente compra → creador CORTO → gamma negativa. Y al revés. Igual para call que para put.
        const netoCliente = (v.comprado - v.vendido) / (v.comprado + v.vendido);
        gMedido += -netoCliente * g;
      }
    }
    if (gAsumido === 0 || gMedido === 0) continue;
    filas.push({ dia, t, gAsumido, gMedido });
    if (Math.sign(gAsumido) === Math.sign(gMedido)) iguales++; else distintos++;
  }
}

console.log(`═══ ¿CAMBIA EL SIGNO AL MEDIR EL LADO? ═══\n`);
console.log(`  ${filas.length.toLocaleString("es-ES")} días-símbolo comparados`);
console.log(`  MISMO signo:    ${iguales.toLocaleString("es-ES")} (${((iguales / (iguales + distintos)) * 100).toFixed(1)}%)`);
console.log(`  SIGNO OPUESTO:  ${distintos.toLocaleString("es-ES")} (${((distintos / (iguales + distintos)) * 100).toFixed(1)}%)`);
console.log(`\n  gamma que SÍ se pudo firmar con la cinta: ${((firmado / (firmado + sinFirmar)) * 100).toFixed(1)}%`);
console.log(`  (el resto no tiene ni una operación en la cinta — se deja fuera, no se le inventa signo)`);

// ── ¿CUÁL DE LAS DOS PREDICE DE VERDAD? ─────────────────────────────────────
// Que discrepen NO dice cuál es la buena. El GEX promete una cosa concreta: gamma positiva alta =
// el creador amortigua = el precio se mueve MENOS al día siguiente. Se mide eso, y gana la versión
// que lo cumpla. Si no lo cumple ninguna, el problema no es el signo — es el GEX.
{
  const porDia = new Map();
  for (const f of filas) {
    const p = px.get(f.t); if (!p) continue;
    const ds = Object.keys(p).sort();
    const i = ds.indexOf(f.dia); if (i < 62 || i + 1 >= ds.length) continue;
    const hoy = p[ds[i]], man = p[ds[i + 1]];
    if (!(hoy > 0) || !(man > 0)) continue;
    const rr = [];
    for (let k = i - 61; k < i; k++) { const a1 = p[ds[k]], b1 = p[ds[k + 1]]; if (a1 > 0 && b1 > 0) rr.push(b1 / a1 - 1); }
    if (rr.length < 30) continue;
    const m = rr.reduce((a1, b1) => a1 + b1, 0) / rr.length;
    const sd = Math.sqrt(rr.reduce((a1, x) => a1 + (x - m) ** 2, 0) / (rr.length - 1));
    if (!(sd > 0)) continue;
    f.mag = Math.abs(man / hoy - 1) / sd;
    if (!porDia.has(f.dia)) porDia.set(f.dia, []);
    porDia.get(f.dia).push(f);
  }
  // relativo al resto de símbolos del mismo día: el movimiento del mercado no decide por nosotros
  for (const g of porDia.values()) {
    const m = g.reduce((a1, x) => a1 + x.mag, 0) / g.length;
    for (const x of g) x.magRel = x.mag - m;
  }
  const con = filas.filter((f) => f.magRel != null);
  console.log(`\n═══ ¿CUÁL PREDICE QUE EL PRECIO SE MUEVA MENOS? ═══\n`);
  console.log(`  ${con.length.toLocaleString("es-ES")} días-símbolo con movimiento del día siguiente\n`);
  for (const [campo, nombre] of [["gAsumido", "GEX ASUMIDO (+call/−put, el de hoy)"], ["gMedido", "GEX MEDIDO (por quién inició)"]]) {
    const s2 = [...con].sort((a1, b1) => a1[campo] - b1[campo]);
    const k = Math.floor(s2.length / 3);
    const bajo = s2.slice(0, k), alto = s2.slice(2 * k);
    const mb = bajo.reduce((a1, x) => a1 + x.magRel, 0) / bajo.length;
    const ma = alto.reduce((a1, x) => a1 + x.magRel, 0) / alto.length;
    const vb = bajo.reduce((a1, x) => a1 + (x.magRel - mb) ** 2, 0) / (bajo.length - 1);
    const va = alto.reduce((a1, x) => a1 + (x.magRel - ma) ** 2, 0) / (alto.length - 1);
    const t = (ma - mb) / Math.sqrt(va / alto.length + vb / bajo.length);
    console.log(`  ${nombre.padEnd(38)} gamma alta ${(ma * 100).toFixed(1).padStart(6)}% · gamma baja ${(mb * 100).toFixed(1).padStart(6)}% · ` +
                `diferencia ${((ma - mb) * 100).toFixed(1).padStart(6)}%  t=${t.toFixed(2)}`);
  }
  console.log(`\n  (el GEX promete que gamma ALTA = MENOS movimiento, o sea DIFERENCIA NEGATIVA)`);
}

// correlación entre las dos versiones
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const A = filas.map((f) => f.gAsumido), B = filas.map((f) => f.gMedido);
const mA = media(A), mB = media(B);
const cov = filas.reduce((a, f, i) => a + (A[i] - mA) * (B[i] - mB), 0);
const sA = Math.sqrt(A.reduce((a, x) => a + (x - mA) ** 2, 0)), sB = Math.sqrt(B.reduce((a, x) => a + (x - mB) ** 2, 0));
console.log(`\n  correlación entre el GEX asumido y el medido: ${(cov / (sA * sB)).toFixed(3)}`);
console.log(`  (1,0 = son lo mismo y el supuesto daba igual · cerca de 0 = son señales distintas)`);
