// El TCP a nj-a/nj-b:20000 ABRE, pero el Terminal dice que no puede conectar. Así que el fallo
// está por encima del TCP. Este script mira las dos capas siguientes:
//
//   1. TCP crudo: ¿el servidor manda algo? ¿nos cierra la conexión y a los cuántos ms?
//      (un servidor que acepta y cierra en seguida = te está rechazando después del saludo)
//   2. TLS: ¿completa el saludo? ¿qué certificado presenta y quién lo emite?
//      Si el emisor dice Norton/Symantec, es un intermediario local. Si es una CA privada,
//      el truststore del JDK no lo va a aceptar nunca.
//
// config.toml define `tls = true` explícitamente para mdds_server pero NO dice nada de FPSS,
// así que puede que FPSS ni siquiera use TLS. Eso también se ve aquí.

import net from "node:net";
import tls from "node:tls";

const OBJETIVOS = [["nj-a.thetadata.us", 20000], ["nj-b.thetadata.us", 20000], ["nj-a.thetadata.us", 20200]];

function tcpHondo(host, port, ms = 6000) {
  return new Promise((res) => {
    const t0 = Date.now();
    const s = new net.Socket();
    let bytes = 0, conectado = 0;
    s.setTimeout(ms);
    s.on("connect", () => { conectado = Date.now() - t0; });
    s.on("data", (d) => { bytes += d.length; });
    s.on("close", () => res({ conectado, bytes, cerradoEn: Date.now() - t0, quienCerro: "servidor" }));
    s.on("timeout", () => { s.destroy(); res({ conectado, bytes, cerradoEn: null, quienCerro: "seguía abierto" }); });
    s.on("error", (e) => res({ conectado, bytes, error: e.code }));
    s.connect(port, host);
  });
}

function tlsHondo(host, port, ms = 8000) {
  return new Promise((res) => {
    const s = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: ms }, () => {
      const c = s.getPeerCertificate();
      res({ ok: true, autorizado: s.authorized, motivo: s.authorizationError,
            sujeto: c?.subject?.CN, emisor: c?.issuer?.CN || c?.issuer?.O, protocolo: s.getProtocol() });
      s.destroy();
    });
    s.on("timeout", () => { s.destroy(); res({ ok: false, motivo: "timeout en el saludo TLS" }); });
    s.on("error", (e) => { s.destroy(); res({ ok: false, motivo: e.code || String(e.message).slice(0, 60) }); });
  });
}

for (const [host, port] of OBJETIVOS) {
  console.log(`\n═══ ${host}:${port} ═══`);
  const t = await tcpHondo(host, port);
  console.log(`  TCP  conectó en ${t.conectado}ms · recibió ${t.bytes} bytes · ${t.error ? "error " + t.error : t.quienCerro === "servidor" ? `el SERVIDOR cerró a los ${t.cerradoEn}ms` : "seguía abierto a los 6s"}`);
  const l = await tlsHondo(host, port);
  if (l.ok) console.log(`  TLS  saludo OK · ${l.protocolo} · cert de "${l.sujeto}" emitido por "${l.emisor}" · ¿confiable? ${l.autorizado ? "sí" : "NO — " + l.motivo}`);
  else console.log(`  TLS  falló: ${l.motivo}`);
}

console.log(`
Cómo leerlo:
  · TCP abierto + servidor cierra rápido + TLS falla  -> FPSS no habla TLS: es protocolo propio.
    Entonces el problema NO es el truststore y hay que preguntarle a ThetaData directamente.
  · TLS OK con emisor "Norton"/"Symantec"             -> intermediario local rompiendo el saludo.
  · TLS OK y confiable                                -> la red y el TLS están bien; el rechazo
    es de autenticación de FPSS, o sea de la cuenta.`);
