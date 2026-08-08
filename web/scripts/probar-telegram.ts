// Comprueba que los avisos de Telegram funcionan, de punta a punta.
//
// Uso:  node --env-file=.env.local --import tsx scripts/probar-telegram.ts
//
// Antes hay que añadir a .env.local (que git ignora) las DOS líneas del bot que ya usa Wally.
// Están en:  C:\Users\leste\OneDrive\Desktop\Wally\API\.env
//
//   TELEGRAM_BOT_TOKEN=...
//   TELEGRAM_CHAT_ID=...
//
// Separa los dos fallos posibles en vez de dar un "no funciona" genérico: si el token es malo,
// getMe lo dice sin tocar el chat; si el chat_id es malo, getMe pasa y sendMessage falla.

import { avisar, comprobarBot } from "../lib/telegram";

(async () => {
  console.log("\n## Prueba de avisos por Telegram\n");

  const bot = await comprobarBot();
  if (!bot.ok) {
    console.log(`   ✗ El TOKEN no sirve: ${bot.motivo}`);
    console.log(`\n   Copia TELEGRAM_BOT_TOKEN desde Wally\\API\\.env a web\\.env.local`);
    process.exit(1);
  }
  console.log(`   ✓ Token OK — bot @${bot.nombre}`);

  const r = await avisar(
    `<b>EVA conectada</b> 🛡️\n\n` +
      `Prueba de avisos desde el proyecto de opciones.\n\n` +
      `A partir de ahora te llegan aquí:\n` +
      `• cuando el forward-test alcance los 100 cierres de alta convicción\n` +
      `• cuando termine un backtest largo\n` +
      `• si algo se rompe en los cron de Railway\n\n` +
      `<i>Los avisos son de una sola vía. Para conversar, la sesión de escritorio.</i>`,
  );

  if (!r.enviado) {
    console.log(`   ✗ El token vale pero NO se pudo enviar: ${r.motivo}`);
    console.log(`     Casi seguro es TELEGRAM_CHAT_ID. Cópialo también desde Wally.`);
    process.exit(1);
  }
  console.log(`   ✓ Mensaje enviado — míralo en el móvil.\n`);
})();
