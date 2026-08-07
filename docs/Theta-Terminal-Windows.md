# Theta Terminal en Windows con antivirus (Norton)

Cómo dejar corriendo el Theta Terminal en la máquina de Lester. En Linux/Railway nada de
esto hace falta — es un problema exclusivo de Windows con un antivirus que inspecciona TLS.

## El síntoma

```
ERROR: Error contacting auth server. (certificate_unknown)
PKIX path building failed: unable to find valid certification path to requested target
```

Puede aparecer de dos formas, y son **dos fallos distintos**:

| Cuándo | Qué pasa |
|---|---|
| Al arrancar, y el Terminal muere | No pudo bajar el jar real. No arranca nada. |
| A los ~30 s de arrancar, repitiéndose cada segundo | Arrancó y **sirve datos**, pero el refresco de sesión falla en bucle. |

El segundo es el traicionero: el backtest parece ir bien y el log se llena de basura.

## Por qué pasa

Norton se mete en medio de cada conexión HTTPS (*MITM*) y reemplaza el certificado del
servidor por uno suyo, firmado por `Norton Web/Mail Shield Root`. Windows confía en esa raíz
porque Norton la instaló al instalarse. **Java no**: trae su propio almacén de certificados
(`cacerts`) y ahí esa raíz no existe.

Se comprueba así — el emisor debería ser una CA pública, no Norton:

```bash
echo | openssl s_client -connect nexus-api.thetadata.us:443 -servername nexus-api.thetadata.us 2>/dev/null | openssl x509 -noout -issuer
```

## La solución: un truststore propio

Copiar el `cacerts` de Java y añadirle la raíz de Norton. Así Java sigue confiando en todas
las CA públicas **y además** en la del antivirus.

Apuntar Java al almacén de Windows (`-Djavax.net.ssl.trustStoreType=Windows-ROOT`) **no
alcanza**: arranca, pero deja el refresco de sesión fallando en bucle.

### 1. Exportar la raíz de Norton (PowerShell)

```powershell
$c = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -like '*Norton Web/Mail Shield Root*' }
$b64 = [System.Convert]::ToBase64String($c.RawData, 'InsertLineBreaks')
"-----BEGIN CERTIFICATE-----`r`n$b64`r`n-----END CERTIFICATE-----" |
  Set-Content -Path web\norton-root.crt -Encoding ascii
```

### 2. Armar el truststore

```bash
JH="/c/Users/leste/AppData/Local/Programs/Eclipse Adoptium/jdk-21.0.12.8-hotspot"
cp "$JH/lib/security/cacerts" theta-truststore.jks
"$JH/bin/keytool" -importcert -noprompt -trustcacerts \
  -alias norton-mitm -file norton-root.crt \
  -keystore theta-truststore.jks -storepass changeit
```

### 3. Usarlo

```bash
THETA_TRUSTSTORE="C:/Users/leste/dev/agente-tito-metralleta/web/theta-truststore.jks" \
  node scripts/with-theta.mjs npx tsx scripts/backtest-strategy.ts
```

`with-theta.mjs` lo pasa por **`JAVA_TOOL_OPTIONS`**, no como argumento `-D`. Es a propósito:
el jar que lanzamos es solo un *bootstrap* que descarga el Terminal real y lo arranca en
**otro JVM**. Ese hijo no hereda los `-D` de la línea de comandos, pero sí las variables de
entorno — y es justo donde el fallo se manifiesta.

### 4. Verificar

```bash
grep -c "auth server" scripts/<tu-log>.log   # tiene que dar 0
```

## Notas

- El `.jks` y el `.crt` están en `.gitignore`: solo sirven en esta máquina.
- Si Norton se reinstala o rota su raíz, hay que repetir el paso 1 y 2.
- Sin el truststore, el Terminal **igual sirve datos** — pero no confíes en que aguante una
  corrida larga, porque la sesión no se está renovando.

## Límite de historia (no es TLS, pero muerde igual)

Con la suscripción **Stocks VALUE**, `/v3/stock/history/eod` solo devuelve ~5,5 años. Más atrás
responde:

```
PERMISSION_DENIED: Requesting stock history requiring a PROFESSIONAL subscription
```

El backtest **descarta en silencio** las señales sin barra de precio, así que un run "de 10
años" puede salir con la mitad de la muestra sin avisar. **Siempre revisar el rango real de
las barras** antes de creerle a un resultado:

```bash
node -e "const b=require('./scripts/cache-theta/SPY_bars_20201122_20270308.json'); console.log(b.length, b[0].time, b[b.length-1].time)"
```

El **flujo de opciones sí llega a 2016**; lo que falta son los precios del subyacente. Para
extender hacia atrás hace falta una fuente de cierres diarios **sin ajustar por splits** — los
strikes históricos están en dólares pre-split (AAPL 2016 cotizaba ~$110, no los ~$27
ajustados de hoy).
