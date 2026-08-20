// Extrae el CAMINO DEL PRECIO cada 5 minutos de los CSV de cadena 0DTE de SPXW.
// underlying_price es ÚNICO por timestamp (comprobado), así que basta leer la cabecera del
// fichero hasta cubrir las 78-79 marcas. Se leen 4.000 líneas por si el primer strike no
// cotiza en alguna barra; si aun así faltan marcas se lee el fichero entero y se DICE.
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(import.meta.dirname, "cache-theta", "gex-2026");
const SALIDA = path.join(import.meta.dirname, "hora-camino5.json");

const ficheros = fs.readdirSync(DIR).filter((f) => /^iv_\d{4}-\d{2}-\d{2}_C\.csv$/.test(f)).sort();
console.log(`${ficheros.length} ficheros de calls en ${DIR}`);

const out = {};
let completos = 0, releidos = 0, marcasTot = 0;
const t0 = Date.now();

for (let n = 0; n < ficheros.length; n++) {
  const f = ficheros[n];
  const fecha = f.slice(3, 13);
  const fd = fs.openSync(path.join(DIR, f), "r");
  const buf = Buffer.alloc(1 << 20); // 1 MB de cabecera ~ 6.000 líneas
  const leidos = fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  let texto = buf.subarray(0, leidos).toString("utf8");
  let lineas = texto.split("\n");
  lineas.pop(); // la última puede estar cortada
  const cab = lineas[0].split(",");
  const iTs = cab.indexOf("timestamp"), iUp = cab.indexOf("underlying_price");
  if (iTs < 0 || iUp < 0) throw new Error(`${f}: faltan columnas timestamp/underlying_price`);

  const camino = new Map();
  for (let i = 1; i < lineas.length; i++) {
    const p = lineas[i].split(",");
    if (p.length <= iUp) continue;
    const hm = p[iTs].slice(11, 16);
    const up = +p[iUp];
    if (!camino.has(hm) && Number.isFinite(up)) camino.set(hm, up);
  }
  // ¿cubrimos de 09:30 a 16:00 cada 5 min? = 79 marcas
  if (camino.size < 78) {
    releidos++;
    const todo = fs.readFileSync(path.join(DIR, f), "utf8").split("\n");
    camino.clear();
    for (let i = 1; i < todo.length; i++) {
      const l = todo[i]; if (!l) continue;
      const p = l.split(",");
      if (p.length <= iUp) continue;
      const hm = p[iTs].slice(11, 16), up = +p[iUp];
      if (!camino.has(hm) && Number.isFinite(up)) camino.set(hm, up);
    }
  }
  const marcas = [...camino.entries()].filter(([, v]) => v > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  marcasTot += marcas.length;
  if (marcas.length >= 77) completos++;
  out[fecha] = marcas.map(([h, v]) => [h, +v.toFixed(2)]);
  if (n % 100 === 0) console.log(`  ${n}/${ficheros.length}  ${fecha}  ${marcas.length} marcas  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

fs.writeFileSync(SALIDA, JSON.stringify(out));
console.log(`\nDías: ${Object.keys(out).length} · completos(>=77 marcas con precio>0): ${completos} · releídos enteros: ${releidos}`);
console.log(`Marcas medias por día: ${(marcasTot / ficheros.length).toFixed(1)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log(`→ ${SALIDA}`);
