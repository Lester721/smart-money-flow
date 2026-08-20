// ¿La reconstrucción de 1.121 días cuadra con los 653 que ya estaban medidos?
import { readFileSync } from "node:fs";
const nuevo = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"));
const viejo = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const N = new Map(nuevo.map((d) => [d.fecha, d]));
let ok = 0, difPl = 0, difCred = 0, difCierre = 0, ausentes = 0, peor = 0, peorF = "";
for (const v of viejo) {
  const n = N.get(v.fecha);
  if (!n) { ausentes++; console.log("  AUSENTE en el nuevo:", v.fecha); continue; }
  const dp = Math.abs(n.pl - v.pl), dc = Math.abs(n.credito - v.credito), dx = Math.abs(n.cierre - v.cierre);
  if (dp > 0.01) { difPl++; if (dp > peor) { peor = dp; peorF = v.fecha; } }
  if (dc > 0.01) difCred++;
  if (dx > 0.01) difCierre++;
  ok++;
}
console.log(`## solapamiento ${ok} días · ausentes ${ausentes}`);
console.log(`## discrepancias — pl: ${difPl} · crédito: ${difCred} · cierre: ${difCierre}`);
if (peorF) console.log(`## peor diferencia de P&L: $${peor.toFixed(2)} el ${peorF}`);
const enNuevoNoViejo = nuevo.filter((d) => d.fecha >= "2024-01-01" && !viejo.some((v) => v.fecha === d.fecha));
console.log(`## días 2024+ que el nuevo tiene y el viejo no: ${enNuevoNoViejo.length}`, enNuevoNoViejo.map((d) => d.fecha).join(" "));
// ceros y frescura del cierre: ¿el último precio del día es realmente de las 16:00?
const cuentaHoraFin = {};
for (const d of nuevo) { const h = d.h[d.h.length - 1]; cuentaHoraFin[h] = (cuentaHoraFin[h] || 0) + 1; }
console.log("## hora del último precio del día:", JSON.stringify(cuentaHoraFin));
// ¿cuántos días tienen precio CONGELADO en la última hora? (medias sesiones)
let congelados = [];
for (const d of nuevo) {
  const i15 = d.h.indexOf("15:00");
  if (i15 < 0) continue;
  const cola = d.s.slice(i15);
  if (new Set(cola).size === 1) congelados.push(d.fecha);
}
console.log(`## días con el precio CONGELADO de 15:00 al cierre (media sesión): ${congelados.length}`, congelados.join(" "));
