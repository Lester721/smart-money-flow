"""Vuelve a bajar los datos de la Fase 0. Ejecutar desde la carpeta mineria/."""
import urllib.request, json, os
os.makedirs('datos', exist_ok=True)
FUENTES = {
    'datos/zec_agg.json' : 'https://api.blockchair.com/zcash/blocks?a=date,avg(difficulty),count()&s=date(desc)&limit=2000',
    'datos/zec_agg2.json': 'https://api.blockchair.com/zcash/blocks?a=date,avg(difficulty),count()&s=date(desc)&limit=2000&offset=2000',
    'datos/zec_yah.json' : 'https://query1.finance.yahoo.com/v8/finance/chart/ZEC-USD?period1=1451606400&period2=1788000000&interval=1d',
}
for destino, url in FUENTES.items():
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=90) as r:
        cuerpo = r.read()
    d = json.loads(cuerpo)                      # falla ruidosamente si no es JSON
    if 'agg' in destino and not d.get('data'):
        raise SystemExit(f'{destino}: Blockchair devolvio sin datos')
    if 'yah' in destino and not d.get('chart', {}).get('result'):
        raise SystemExit(f'{destino}: Yahoo devolvio sin datos')
    open(destino, 'wb').write(cuerpo)
    print(f'{destino:24} {len(cuerpo):>9,} bytes  OK')
print('\nListo. Ahora: python fase0-zcash.py')
