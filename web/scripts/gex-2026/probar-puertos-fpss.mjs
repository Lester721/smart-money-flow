// ¿Se alcanzan los servidores de streaming, sí o no?
//
// Por qué desde Node y no desde PowerShell: Test-NetConnection dio 13/13 fallos contra
// 131.226.212.246 mientras el Terminal (java.exe) autenticaba contra esa MISMA IP. Algo filtra
// los sondeos de powershell.exe. Node es un tercer proceso e independiente de los dos.
//
// El control es mdds-01:443 — ese SÍ funciona (MDDS está CONNECTED). Si el control abre y los
// puertos de FPSS no, el problema son los puertos. Si no abre ni el control, el sondeo no vale.

import net from "node:net";

const OBJETIVOS = [
  ["mdds-01.thetadata.us", 443, "CONTROL — este funciona seguro"],
  ["nj-a.thetadata.us", 20000, "FPSS producción"],
  ["nj-a.thetadata.us", 20001, "FPSS producción"],
  ["nj-b.thetadata.us", 20000, "FPSS producción"],
  ["nj-b.thetadata.us", 20001, "FPSS producción"],
  ["nj-a.thetadata.us", 20200, "FPSS dev (replay)"],
  ["test-server.thetadata.us", 20200, "FPSS dev (replay)"],
  ["test-server.thetadata.us", 20201, "FPSS dev (replay)"],
];

const probar = (host, port, ms = 8000) =>
  new Promise((res) => {
    const t0 = Date.now();
    const s = new net.Socket();
    const fin = (r) => { s.destroy(); res({ ...r, ms: Date.now() - t0 }); };
    s.setTimeout(ms);
    s.once("connect", () => fin({ ok: true, motivo: "abierto" }));
    s.once("timeout", () => fin({ ok: false, motivo: "timeout (paquetes descartados)" }));
    s.once("error", (e) => fin({ ok: false, motivo: e.code || String(e.message).slice(0, 40) }));
    s.connect(port, host);
  });

console.log("═══ ¿SE ALCANZAN LOS SERVIDORES DE STREAMING? ═══\n");
for (const [host, port, nota] of OBJETIVOS) {
  const r = await probar(host, port);
  console.log(`${r.ok ? "✓" : "✗"} ${`${host}:${port}`.padEnd(34)} ${String(r.ms + "ms").padStart(7)}  ${r.motivo.padEnd(30)} ${nota}`);
}

console.log(`
Lectura:
  · control ✓ y FPSS ✗  ->  los puertos altos están bloqueados aquí (firewall/ISP/Norton).
                            La solución es local: abrirlos. No es de ThetaData.
  · control ✓ y FPSS ✗ con "ECONNREFUSED" -> sus servidores rechazan activamente: es suyo.
    ("timeout" = alguien descarta los paquetes en silencio. "refused" = llegó y dijo que no.)
  · control ✗            ->  este sondeo no vale para nada, ignorarlo entero.`);
