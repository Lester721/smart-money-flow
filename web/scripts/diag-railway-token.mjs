// ¿POR QUÉ DICE "Not Authorized"? Prueba las combinaciones una a una.
// NUNCA imprime el token: sólo su longitud y su forma.
const T = process.env.RAILWAY_TOKEN;

console.log("── EL TOKEN, SIN ENSEÑARLO ──────────────────────────────");
if (!T) { console.error("  RAILWAY_TOKEN no llega al proceso. ¿Guardaste el fichero?"); process.exit(1); }
console.log(`  longitud: ${T.length} caracteres`);
console.log(`  empieza por: ${T.slice(0, 4)}…  termina en: …${T.slice(-4)}`);
const sospechas = [];
if (T !== T.trim()) sospechas.push("tiene espacios o saltos de línea al principio/final");
if (/^["']|["']$/.test(T)) sospechas.push("está entre comillas — quítalas");
if (T.includes(" ")) sospechas.push("tiene un espacio en medio");
if (T.length < 20) sospechas.push("es muy corto, parece incompleto");
console.log(sospechas.length ? `  ⚠ ${sospechas.join(" · ")}` : "  sin rarezas de formato");

const limpio = T.trim().replace(/^["']|["']$/g, "");

const ENDPOINTS = [
  "https://backboard.railway.com/graphql/v2",
  "https://backboard.railway.app/graphql/v2",
];
const CABECERAS = [
  ["Authorization: Bearer", { Authorization: `Bearer ${limpio}` }],
  ["Project-Access-Token",  { "Project-Access-Token": limpio }],
];
// La consulta más simple que existe: si el token vale, esto responde.
const PRUEBAS = [
  ["me { id email }", `query { me { id email } }`],
  ["projects", `query { projects { edges { node { id name } } } }`],
];

console.log("\n── PROBANDO COMBINACIONES ───────────────────────────────");
let bueno = null;
for (const url of ENDPOINTS) {
  for (const [nombreCab, cab] of CABECERAS) {
    for (const [nombreQ, query] of PRUEBAS) {
      let estado = "", detalle = "";
      try {
        const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...cab },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(20_000),
        });
        const t = await r.text();
        let j = null; try { j = JSON.parse(t); } catch { /* */ }
        if (j?.data && !j.errors?.length) {
          estado = "✅ FUNCIONA";
          detalle = JSON.stringify(j.data).slice(0, 90);
          bueno ??= { url, nombreCab, nombreQ };
        } else {
          estado = "✗";
          detalle = (j?.errors?.map((e) => e.message).join(" · ") || `HTTP ${r.status}: ${t.slice(0, 60)}`).slice(0, 90);
        }
      } catch (e) { estado = "✗"; detalle = e.message.slice(0, 60); }
      console.log(`  ${estado.padEnd(12)} ${url.replace("https://backboard.railway.", "").padEnd(14)} ` +
                  `${nombreCab.padEnd(22)} ${nombreQ.padEnd(16)} ${detalle}`);
    }
  }
}

console.log("");
if (bueno) {
  console.log(`✅ La combinación que vale: ${bueno.url}  ·  ${bueno.nombreCab}  ·  ${bueno.nombreQ}`);
  console.log("   Ajusto railway-api.mjs a esa y listo.");
} else {
  console.log("✗ Ninguna combinación autoriza. Lo más probable, por orden:");
  console.log("   1. El token se creó con 'No workspace' y el proyecto está DENTRO de un workspace.");
  console.log("      → crea otro eligiendo el workspace en el desplegable.");
  console.log("   2. Se copió a medias (mira la longitud de arriba).");
  console.log("   3. Se pegó con comillas o con un espacio.");
}
