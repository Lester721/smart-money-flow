// DONDE VIVE LA COLA — las mismas senales de regimen, pero medidas contra el PEOR DIA,
// el percentil 5 y la CAIDA ACUMULADA, no contra la media. Es el hueco que nadie habia mirado.
//
// Para cada senal: se parten los 653 dias en tercios por esa senal y se mira que pasa si solo
// se opera cada tercio. La pregunta no es "cual gana mas" sino "esta la cola en un tercio".
//
// AVISO DE METODO: los cortes de los tercios usan TODA la muestra. Eso es un pelin de futuro en
// el UMBRAL (no en la senal). Sirve para explorar; lo que sobreviva se re-mide en cola-4 con
// umbral de ventana creciente, que solo mira el pasado.

import { cargar, metricas, eur } from "./cola-lib.mjs";
import { radiografia } from "../lib/radiografia";

const F = cargar();
const N = F.length;
radiografia(F, ["pl", "credito", "sigmaPct", "sigmaRatio", "movManana", "hueco", "rangoAyer",
                "vix", "vixCambio", "term9", "term3m", "vvix", "ma200", "distMax", "riesgoMax"],
            "senales a las 11:00", { maxCeros: 0.35 });

const base = metricas(F.map((f) => f.pl), N);
const NULO = base.anual / base.dd;
console.log("\nBASE (1 contrato todos los dias): " + eur(base.anual) + "/ano · peor " + eur(base.peor) +
            " · p1 " + eur(base.p1) + " · p5 " + eur(base.p5) + " · caida " + eur(base.dd));
console.log("\nEL NULO DE REFERENCIA: bajar el tamano un k% recorta ingreso y caida EN LA MISMA PROPORCION.");
console.log("  eficiencia nula = " + NULO.toFixed(2) + " $ de ingreso anual perdidos por cada $ de caida eliminado.");
console.log("  Una regla SOLO vale si su eficiencia es MENOR que " + NULO.toFixed(2) + ". Si no, es peor que operar mas pequeno.\n");

const SENALES = [
  ["sigmaPct", "sigma esperado del resto de sesion (%)"],
  ["credito", "credito cobrado ($)"],
  ["movManana", "% ya movido de la apertura a las 11:00"],
  ["extremo", "que tan al borde del rango de la manana"],
  ["hueco", "% de hueco de apertura"],
  ["rangoAyer", "% de rango de ayer"],
  ["vix", "VIX al cierre de AYER"],
  ["vixCambio", "% que cambio el VIX ayer"],
  ["term9", "VIX9D / VIX de ayer"],
  ["term3m", "VIX / VIX3M de ayer"],
  ["vvix", "VVIX al cierre de AYER"],
  ["ma200", "% de distancia a la media de 200"],
  ["distMax", "% de distancia al maximo de 60"],
];

console.log("## LA COLA POR TERCIOS — solo se opera el tercio indicado (los otros dias, tamano 0)\n");
console.log("| senal | tercio | n | media/op | $/ano | peor dia | p5 | caida |");
console.log("|---|---|---|---|---|---|---|---|");
const resumen = [];
for (const [campo, desc] of SENALES) {
  const val = F.filter((f) => f[campo] != null && isFinite(f[campo]));
  if (val.length < 300) { console.log("| `" + campo + "` | — | " + val.length + " | sin muestra | | | | |"); continue; }
  const ord = [...val].sort((a, b) => a[campo] - b[campo]);
  const k = Math.floor(ord.length / 3);
  const grupos = [["BAJO", ord.slice(0, k)], ["MEDIO", ord.slice(k, 2 * k)], ["ALTO", ord.slice(2 * k)]];
  for (const [nom, g] of grupos) {
    const set = new Set(g.map((f) => f.fecha));
    const m = metricas(F.map((f) => (set.has(f.fecha) ? f.pl : 0)), N);
    console.log("| `" + campo + "` | " + nom + " | " + m.n + " | " + eur(m.media) + " | " + eur(m.anual) +
                " | " + eur(m.peor) + " | " + eur(m.p5) + " | " + eur(m.dd) + " |");
  }
  resumen.push({ campo, desc });
}

console.log("\n## SALTARSE UN TERCIO — eficiencia contra el nulo de " + NULO.toFixed(2) + " (menor = mejor)\n");
console.log("| senal | tercio fuera | dias | $/ano | perdido/ano | peor dia | p1 | p5 | caida | caida quitada | eficiencia |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const efis = [];
for (const r of resumen) {
  const val = F.filter((f) => f[r.campo] != null && isFinite(f[r.campo]));
  const ord = [...val].sort((a, b) => a[r.campo] - b[r.campo]);
  const k = Math.floor(ord.length / 3);
  for (const salta of ["BAJO", "MEDIO", "ALTO"]) {
    const fuera = new Set((salta === "BAJO" ? ord.slice(0, k) : salta === "MEDIO" ? ord.slice(k, 2 * k) : ord.slice(2 * k)).map((f) => f.fecha));
    const m = metricas(F.map((f) => (fuera.has(f.fecha) ? 0 : f.pl)), N);
    const perdido = base.anual - m.anual, quitado = base.dd - m.dd;
    efis.push({ campo: r.campo, salta, m, perdido, quitado, efi: quitado > 0 ? perdido / quitado : Infinity });
  }
}
for (const e of efis.sort((a, b) => a.efi - b.efi)) {
  console.log("| `" + e.campo + "` | " + e.salta + " | " + e.m.n + " | " + eur(e.m.anual) + " | " + eur(e.perdido) +
              " | " + eur(e.m.peor) + " | " + eur(e.m.p1) + " | " + eur(e.m.p5) + " | " + eur(e.m.dd) + " | " + eur(e.quitado) +
              " | " + (isFinite(e.efi) ? e.efi.toFixed(2) : "inf") + (e.efi < NULO ? " OK" : "") + " |");
}

// EL CONTROL QUE DECIDE: saltarse 1/3 de los dias AL AZAR ya recorta la caida. Cuanto?
console.log("\n## CONTROL AL AZAR — saltarse 218 dias elegidos a sorteo, 2.000 sorteos\n");
let semilla = 12345;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const ddAzar = [], peorAzar = [], efiAzar = [];
for (let s = 0; s < 2000; s++) {
  const ix = F.map((_, i) => i);
  for (let i = ix.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [ix[i], ix[j]] = [ix[j], ix[i]]; }
  const fuera = new Set(ix.slice(0, Math.floor(N / 3)));
  const m = metricas(F.map((f, i) => (fuera.has(i) ? 0 : f.pl)), N);
  ddAzar.push(m.dd); peorAzar.push(m.peor);
  const q = base.dd - m.dd;
  efiAzar.push(q > 0 ? (base.anual - m.anual) / q : Infinity);
}
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
console.log("  caida tras saltarse 1/3 al azar: mediana " + eur(q(ddAzar, 0.5)) + " · mejor 5% " + eur(q(ddAzar, 0.05)) +
            " · mejor 1% " + eur(q(ddAzar, 0.01)));
console.log("  peor dia tras saltarse 1/3 al azar: mediana " + eur(q(peorAzar, 0.5)) + " · mejor 5% " + eur(q(peorAzar, 0.95)));
const efiFin = efiAzar.filter(isFinite).sort((a, b) => a - b);
console.log("  eficiencia del azar: mediana " + efiFin[Math.floor(efiFin.length * 0.5)].toFixed(2) +
            " · el 5% mas afortunado baja de " + efiFin[Math.floor(efiFin.length * 0.05)].toFixed(2));
console.log("\n  -> cualquier regla con eficiencia peor que el 5% mas afortunado del azar NO esta eligiendo nada.");
