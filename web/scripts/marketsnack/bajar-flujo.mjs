// DESCARGADOR DEL FLUJO HISTÓRICO DE MARKETSNACK.
//
// Su `flow_feed` no es un archivo consultable por fechas: el parámetro `period` no cambia el
// rango devuelto. Lo único que funciona es el paginador `next_page_token`, que camina hacia atrás
// en el tiempo — y sí cruza de un día al anterior (comprobado el 2026-08-12).
//
// Por eso esto es un descargador y no una consulta: hay que caminar hacia atrás página a página
// hasta la fecha objetivo. Con prima ≥ $1M y el mercado entero salen unas 37 páginas por sesión.
//
// ╔═══ EDUCACIÓN Y RESPETO CON EL SERVIDOR ═══╗
// MarketSnack es de Victor. Miles de peticiones seguidas son carga real para él. Hay una pausa
// entre peticiones y el ritmo es visible en pantalla. Si empieza a devolver errores, se para: NO
// se reintenta en bucle contra un servidor que se está quejando.
//
// Guarda en JSONL según avanza y anota el último token, así que se puede cortar y continuar.
//
// Uso:
//   node scripts/marketsnack/bajar-flujo.mjs --hasta 2026-05-01 --prima 1000000
//   node scripts/marketsnack/bajar-flujo.mjs --hasta 2026-08-01 --continuar

import fs from "node:fs";
import path from "node:path";

const BASE = "https://app.marketsnack.com";
const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };

const HASTA = arg("--hasta");                       // fecha objetivo hacia atrás, YYYY-MM-DD
const PRIMA = Number(arg("--prima", 1000000));
const MAX_PAGINAS = Number(arg("--max", 20000));
const PAUSA_MS = Number(arg("--pausa", 250));
const CONTINUAR = process.argv.includes("--continuar");

if (!HASTA) { console.log("Falta --hasta YYYY-MM-DD (hasta qué fecha hacia atrás)"); process.exit(1); }

const DIR = path.join("data", "marketsnack");
const SALIDA = path.join(DIR, `flujo-prima${Math.round(PRIMA / 1000)}k.jsonl`);
const ESTADO = path.join(DIR, `flujo-prima${Math.round(PRIMA / 1000)}k.estado.json`);
fs.mkdirSync(DIR, { recursive: true });

const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();
if (!C) { console.log("✗ sin MARKETSNACK_COOKIE en .env.local"); process.exit(1); }

let token = null, paginas = 0, total = 0;
if (CONTINUAR && fs.existsSync(ESTADO)) {
  const e = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  token = e.token; paginas = e.paginas ?? 0; total = e.total ?? 0;
  console.log(`   continuando desde la página ${paginas} (${total} registros ya guardados)\n`);
}

const fichero = fs.createWriteStream(SALIDA, { flags: CONTINUAR ? "a" : "w" });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

console.log(`═══ BAJAR FLUJO DE MARKETSNACK ═══`);
console.log(`   prima mínima : $${PRIMA.toLocaleString("es-ES")}`);
console.log(`   hasta        : ${HASTA}`);
console.log(`   pausa        : ${PAUSA_MS} ms entre peticiones`);
console.log(`   salida       : ${SALIDA}\n`);

const t0 = Date.now();
let masAntigua = null, fallos = 0;
const dias = new Set();

while (paginas < MAX_PAGINAS) {
  paginas++;
  const p = new URLSearchParams();
  p.set("filter[scope]", "all");
  p.set("period", "1m");
  p.set("filter[premium][gte]", String(PRIMA));
  if (token) p.set("next_page_token", token);

  let j;
  try {
    const r = await fetch(`${BASE}/api/flow_feed?${p}`, {
      headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
      signal: AbortSignal.timeout(60000),
    });
    if (r.status === 401 || r.status === 403 || (r.status >= 300 && r.status < 400)) {
      console.log(`\n   ✗ ${r.status}: la sesión caducó. Hay que volver a copiar la cookie.`); break;
    }
    if (r.status === 429) { console.log(`\n   ⚠ 429: nos está pidiendo que bajemos el ritmo. PARO.`); break; }
    if (r.status !== 200) { console.log(`\n   ✗ HTTP ${r.status}. PARO — no insisto contra un servidor que falla.`); break; }
    j = await r.json();
    fallos = 0;
  } catch (e) {
    fallos++;
    console.log(`   ⚠ fallo de red (${fallos}/3): ${String(e.message).slice(0, 60)}`);
    if (fallos >= 3) { console.log(`   PARO tras 3 fallos seguidos.`); break; }
    await dormir(3000); paginas--; continue;
  }

  const lista = j.list ?? [];
  if (!lista.length) { console.log(`\n   página ${paginas}: vacía — se acabó el histórico disponible.`); break; }

  for (const t of lista) { fichero.write(JSON.stringify(t) + "\n"); if (t.timestamp) dias.add(t.timestamp.slice(0, 10)); }
  total += lista.length;
  const fechas = lista.map((t) => t.timestamp).filter(Boolean).sort();
  masAntigua = fechas[0] ?? masAntigua;

  if (paginas % 25 === 0) {
    const min = (Date.now() - t0) / 60000;
    console.log(`   pág ${String(paginas).padStart(5)}  ·  ${String(total).padStart(7)} regs  ·  atrás hasta ${masAntigua?.slice(0, 16)}  ·  ${dias.size} días  ·  ${min.toFixed(1)} min`);
    fs.writeFileSync(ESTADO, JSON.stringify({ token, paginas, total, masAntigua }, null, 1));
  }

  if (masAntigua && masAntigua.slice(0, 10) < HASTA) { console.log(`\n   ✓ alcanzada la fecha objetivo ${HASTA}`); break; }

  token = j.meta?.next_page_token;
  if (!token) { console.log(`\n   página ${paginas}: sin token siguiente — FIN DEL HISTÓRICO DISPONIBLE.`); break; }

  await dormir(PAUSA_MS);
}

fs.writeFileSync(ESTADO, JSON.stringify({ token, paginas, total, masAntigua }, null, 1));
fichero.end();

const listaDias = [...dias].sort();
console.log(`\n═══ RESUMEN ═══`);
console.log(`   páginas       : ${paginas}`);
console.log(`   registros     : ${total.toLocaleString("es-ES")}`);
console.log(`   días distintos: ${listaDias.length}`);
console.log(`   rango         : ${listaDias[0] ?? "—"}  →  ${listaDias[listaDias.length - 1] ?? "—"}`);
console.log(`   minutos       : ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`   archivo       : ${SALIDA}\n`);
if (listaDias.length < 20) {
  console.log(`   ⚠ Con ${listaDias.length} días de mercado NO se llega a los 200 eventos`);
  console.log(`     independientes que exige el pre-registro. Ver docs/preregistro-marketsnack.md\n`);
}
