// Mandar un mensaje suelto a Lester por Telegram desde la sesión de escritorio.
//   node --env-file=.env.local --import tsx scripts/decir.ts "texto"
//
// Sin await de primer nivel: tsx compila a CJS y ahí no está soportado.
import { avisar } from "../lib/telegram";

const texto = process.argv.slice(2).join(" ");
if (!texto) { console.log('uso: decir.ts "texto"'); process.exit(1); }

// `avisar` manda con parse_mode HTML, así que un "<-" en el texto se lee como etiqueta y
// Telegram devuelve 400 en vez de mandar el mensaje. Aquí el texto es plano: se escapa.
const escapar = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

(async () => {
  const r = await avisar(escapar(texto));
  console.log(r.enviado ? "enviado" : `NO enviado: ${r.motivo}`);
})();
