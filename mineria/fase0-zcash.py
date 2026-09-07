import json, datetime, statistics

HASHRATE_SOL_S = 840_000; WATTS = 2_780; PRECIO_KWH = 0.27574
PRECIO_MAQUINA = 3_110;   COMISION_POOL = 0.01; SOL_POR_DIF = 8192/75
HALVING = datetime.date(2024,11,23); CANOPY = datetime.date(2020,11,18)
REC_PRE, REC_POST = 2.50, 1.25
KWH_DIA = WATTS*24/1000
def morir(m): raise SystemExit("VALIDACION FALLIDA: "+m)

dif={}; blk={}
for f in ('datos/zec_agg.json','datos/zec_agg2.json'):
    for r in json.load(open(f))['data']:
        for c in ('date','avg(difficulty)','count()'):
            if c not in r: morir(f"falta columna {c}")
        d=datetime.date.fromisoformat(r['date']); dif[d]=r['avg(difficulty)']; blk[d]=r['count()']
if any(v is None or v<=0 for v in dif.values()): morir("dificultad con ceros/nulos")

y=json.load(open('datos/zec_yah.json'))['chart']['result'][0]
px={datetime.datetime.fromtimestamp(t,datetime.UTC).date():c
    for t,c in zip(y['timestamp'], y['indicators']['quote'][0]['close']) if c and c>0}

HOY=max(dif); AYER=HOY-datetime.timedelta(days=1)
rec=lambda d: REC_POST if d>=HALVING else REC_PRE
def bruto(d, bloques): return (HASHRATE_SOL_S/(dif[d]*SOL_POR_DIF))*bloques*rec(d)*px[d]

# --- VALIDACION: dia completo nominal, como hace WhatToMine ---
v=bruto(HOY,1152)
print(f"VALIDACION {HOY}: dif={dif[HOY]:,.0f} ZEC=${px[HOY]:.2f}")
print(f"  calculado ${v:.2f}/dia | WhatToMine $38.32 | desvio {abs(v-38.32)/38.32*100:.2f}%")
if abs(v-38.32)/38.32 > 0.02: morir("el modelo no reproduce WhatToMine")
print(f"  luz ${KWH_DIA*PRECIO_KWH:.2f}/dia -> NETO HOY ${v*0.99-KWH_DIA*PRECIO_KWH:.2f}/dia = ${(v*0.99-KWH_DIA*PRECIO_KWH)*365:,.0f}/ano\n")

# --- SERIE: dias COMPLETOS desde Canopy hasta ayer ---
filas=[]; sinpx=0; bajos=0
d=max(CANOPY,min(dif))
while d<=AYER:
    if d in dif and d in px:
        if blk[d]<1100: bajos+=1
        b=bruto(d,blk[d]); filas.append((d,px[d],b,b*(1-COMISION_POOL)-KWH_DIA*PRECIO_KWH))
    else: sinpx+=1
    d+=datetime.timedelta(days=1)
print(f"serie: {len(filas)} dias ({filas[0][0]} -> {filas[-1][0]}) | sin precio: {sinpx} | dias raros <1100 bloques: {bajos}")
if sinpx>len(filas)*0.05: morir(f"demasiados dias sin precio: {sinpx}")

# --- COHORTES ---
pm={}; [pm.setdefault((r[0].year,r[0].month),[]).append(r) for r in filas]
idx={r[0]:i for i,r in enumerate(filas)}; res=[]
for k in sorted(pm):
    i0=idx[pm[k][0][0]]; acc=0.0; pago=None
    for n,r in enumerate(filas[i0:],1):
        acc+=r[3]
        if pago is None and acc>=PRECIO_MAQUINA: pago=n
    res.append(dict(mes=f"{k[0]}-{k[1]:02d}", disp=len(filas)-i0, pago=pago, acc=acc,
                    neto=statistics.median(r[3] for r in pm[k]), zec=statistics.median(r[1] for r in pm[k])))

VENTANA=540
justas=[c for c in res if c['disp']>=VENTANA]; recup=[c for c in justas if c['pago']]
print("\n"+"="*66)
print(f"COHORTES — comprar una Z15 Pro por ${PRECIO_MAQUINA:,} el dia 1 de cada mes")
print("="*66)
print(f"Cohortes con >={VENTANA} dias por delante (oportunidad real): {len(justas)} de {len(res)}")
print(f"  RECUPERARON los ${PRECIO_MAQUINA:,}: {len(recup)} de {len(justas)} = {len(recup)/len(justas)*100:.0f}%")
if recup:
    ds=sorted(c['pago'] for c in recup)
    print(f"  dias hasta recuperar: mediana {statistics.median(ds):.0f} ({statistics.median(ds)/30.4:.1f} meses) | min {min(ds)} | max {max(ds)}")
neg=[c for c in res if c['neto']<0]
print(f"\nMeses con la maquina QUEMANDO efectivo (neto mediano<0): {len(neg)} de {len(res)} = {len(neg)/len(res)*100:.0f}%")
print(f"\n{'mes':9}{'ZEC $':>9}{'neto $/dia':>12}{'recupero':>16}")
print("-"*46)
for c in res:
    pg=f"{c['pago']}d ({c['pago']/30.4:.1f}m)" if c['pago'] else ("NO" if c['disp']>=VENTANA else f"-- ({c['disp']}d)")
    print(f"{c['mes']:9}{c['zec']:>9.2f}{c['neto']:>12.2f}{pg:>16}")

print("\n"+"="*66); print("ANATOMIA"); print("="*66)
pos=[r for r in filas if r[3]>0]
print(f"dias con neto positivo: {len(pos)} de {len(filas)} = {len(pos)/len(filas)*100:.0f}%")
be = px[HOY]*( (KWH_DIA*PRECIO_KWH)/0.99 )/bruto(HOY,1152)
print(f"precio de ZEC en el punto de equilibrio (dificultad de hoy): ${be:.0f}  |  ZEC hoy ${px[HOY]:.2f}  ->  colchon {(px[HOY]/be-1)*100:.0f}%")
n=len(filas); mx=sum(r[1] for r in filas)/n; my=sum(r[3] for r in filas)/n
sx=(sum((r[1]-mx)**2 for r in filas)/n)**.5; sy=(sum((r[3]-my)**2 for r in filas)/n)**.5
print(f"correlacion precio ZEC vs neto $/dia: {sum((r[1]-mx)*(r[3]-my) for r in filas)/n/(sx*sy):.3f}")
d21=[d for d in dif if d.year==2021]; print(f"dificultad: mediana 2021 {statistics.median(dif[d] for d in d21):,.0f} -> hoy {dif[HOY]:,.0f}  ({dif[HOY]/statistics.median(dif[d] for d in d21):.1f}x)")
tot=sum(r[3] for r in filas); rally=sum(r[3] for r in filas if r[0]>=datetime.date(2025,10,1))
print(f"\nbeneficio total de los {len(filas)} dias: ${tot:,.0f}")
print(f"  aportado por los {len([r for r in filas if r[0]>=datetime.date(2025,10,1)])} dias desde oct-2025: ${rally:,.0f} = {rally/tot*100:.0f}%")
print(f"  aportado por 2021 (14 meses): ${sum(r[3] for r in filas if r[0]<datetime.date(2022,1,1)):,.0f}")
print(f"  aportado por 2022-01 a 2025-09 (45 meses): ${sum(r[3] for r in filas if datetime.date(2022,1,1)<=r[0]<datetime.date(2025,10,1)):,.0f}")

print("\n"+"="*66); print("CON LA REGLA DE PARADA: apagar tras 14 dias seguidos en negativo"); print("="*66)
def simula(i0, parar=True):
    acc=0.0; seg=0
    for n,r in enumerate(filas[i0:],1):
        acc+=r[3]
        seg = seg+1 if r[3]<0 else 0
        if parar and seg>=14: return acc, n
    return acc, len(filas)-i0
out=[]
for k in sorted(pm):
    i0=idx[pm[k][0][0]]
    a,dd=simula(i0,True); b,_=simula(i0,False)
    out.append((f"{k[0]}-{k[1]:02d}", a-PRECIO_MAQUINA, dd, b-PRECIO_MAQUINA))
gan=[o for o in out if o[1]>0]
print(f"cohortes con resultado FINAL positivo (tras restar los ${PRECIO_MAQUINA:,}): {len(gan)} de {len(out)} = {len(gan)/len(out)*100:.0f}%")
print(f"  con parada  : mediana ${statistics.median(o[1] for o in out):>8,.0f} | peor ${min(o[1] for o in out):>8,.0f} | mejor ${max(o[1] for o in out):>9,.0f}")
print(f"  sin parada  : mediana ${statistics.median(o[3] for o in out):>8,.0f} | peor ${min(o[3] for o in out):>8,.0f} | mejor ${max(o[3] for o in out):>9,.0f}")
print(f"  dias encendida antes de apagar: mediana {statistics.median(o[2] for o in out):.0f}")
print(f"\n{'mes':9}{'con parada':>13}{'dias ON':>10}{'sin parada':>13}")
print("-"*45)
for o in out: print(f"{o[0]:9}{o[1]:>13,.0f}{o[2]:>10}{o[3]:>13,.0f}")

print("\n"+"="*66); print("CONDICIONAL: comprar SOLO cuando el mes ya es rentable"); print("="*66)
fin={o[0]:o[1] for o in out}
for umbral,etq in ((0,"neto > $0/dia"),(5,"neto > $5/dia"),(15,"neto > $15/dia (como HOY: $19,51)")):
    sel=[c for c in res if c['neto']>umbral]
    if not sel: continue
    r=[fin[c['mes']] for c in sel]
    g=[x for x in r if x>0]
    print(f"\n{etq}  ->  {len(sel)} meses de 70")
    print(f"   acaban en positivo: {len(g)} de {len(sel)} = {len(g)/len(sel)*100:.0f}%")
    print(f"   resultado: mediana ${statistics.median(r):>8,.0f} | peor ${min(r):>8,.0f} | mejor ${max(r):>9,.0f} | media ${sum(r)/len(r):>8,.0f}")
    print(f"   meses: {', '.join(c['mes'] for c in sel)}")
