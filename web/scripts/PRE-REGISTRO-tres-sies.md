# PRE-REGISTRO · «LOS TRES SÍES»

**Congelado el 2026-08-20. No se toca ni un número.**

Si en algún momento cambio un parámetro de este documento porque los resultados no gustan, el
forward-test deja de valer y hay que empezar de cero. Ése es todo su sentido: es lo único que
ninguno de los dos puede manosear.

---

## LA REGLA

A las **11:00 ET**, sobre **SPXW con vencimiento del mismo día**:

1. ¿El SPX está **por encima de su media de 5 sesiones**? *(cierres hasta ayer)*
2. ¿Está **por encima de su media de 50 sesiones**? *(cierres hasta ayer)*
3. ¿El cóndor de **±45 puntos, alas de 50**, paga **≥ $100** de crédito? *(bid al vender, ask al comprar)*

**Los tres sí → se abre 1 contrato. Cualquier no → no se opera ese día.**

- Se sostiene hasta el cierre. **Sin stop, sin recompra, sin cerrar el lado tocado.**
- **1 contrato. Siempre.** No se sube aunque vaya bien.
- Comisión: $0,03 por contrato y pata.

---

## LO QUE EL BACKTEST DICE QUE DEBE PASAR

1.072 días medidos (2022-04 → 2026-08), de los cuales la regla opera **218** (~51 al año).

| | esperado |
|---|---|
| días que opera | **20%** de las sesiones |
| acierto | **94,5%** |
| crédito mediano cobrado | **$190** |
| $/año | **$7.366** |
| peor día | −$4.725 |
| peor racha acumulada | −$7.093 |
| t de la media diaria | 3,57 |

Por año: 2022 +$8.294 · 2023 +$2.078 · 2024 +$5.053 · 2025 +$6.561 · 2026 +$9.349

---

## ⚠️ LAS CUATRO DEBILIDADES, ESCRITAS ANTES DE EMPEZAR

Si esto muere, morirá por una de éstas. Ninguna es una sorpresa y ninguna vale como excusa
posterior — están todas aquí desde el primer día.

1. **n = 218, no 1.072.** La regla opera un día de cada cinco. Una t alta con muestra corta se
   mueve mucho con pocos días.
2. **El umbral de $100 salió de estos datos.** Pasó el cruce de períodos, pero el número concreto
   se eligió mirando 2022-2026.
3. **MA5 y MA50 salieron de un barrido.** Misma objeción.
4. **LA PEOR, Y LA QUE MÁS PESA:** sobre estos mismos 1.072 días se han probado **~300
   configuraciones** entre todos los análisis del proyecto. Con esa cuenta, el listón de
   Bonferroni no es 2 sino ≈**4,0**, y la regla da **3,57**: **NO lo cruza**.
   **El forward-test es precisamente lo que arregla esto**, porque los días nuevos no
   participaron en elegir nada y el listón vuelve a ser 2.

---

## QUÉ CONTARÁ COMO FRACASO

Declarado ahora para que no se pueda mover después:

- **acierto por debajo del 85%** con 30 cierres o más *(el backtest dice 94,5%)*
- **crédito mediano por debajo de $120** *(el backtest dice $190)* — sería la señal de que la
  prima medida no existe en vivo, que es como murieron el credit spread y el cóndor de EVA
- **más de una pérdida de más de $4.000** en los primeros 50 días
- **$/operación negativo** con 60 cierres o más

Con menos de 30 cierres **no se concluye nada**, ni bueno ni malo.

---

## LO QUE NO SE HARÁ

- **No se ejecutan órdenes.** Esto es papel. Lester decide y ejecuta.
- **No se cambian los parámetros.** Si se me ocurre una mejora, se ANOTA y espera al final.
- **No se elige qué días contar.** Todos los días con tres síes entran en el cuaderno.

---

## POR QUÉ EXISTE ESTE DOCUMENTO

Lester, el 2026-08-20: *"¿Se te ocurre alguna buena excusa para no proceder con un forward test?
Mañana no me vas a decir que cometí un error, que la muestra estaba mal, o cualquier otro
trabalenguas tuyo sobre la metodología que mate tu idea de hoy. Porque esto ha sido la historia
mía contigo: creas y matas más estrategias que tokens."*

Tiene razón. Todas las estrategias muertas hasta hoy se mataron **con otro backtest sobre los
mismos días viejos**. Ese ciclo no tiene fondo. Este documento existe para separar dos cosas que
no son iguales:

- **«el forward-test dice que no gana»** → es un RESULTADO, y vale.
- **«encontré un fallo en mi propio análisis»** → es lo que lleva 27 días sufriendo.

Lo primero se acepta. Lo segundo queda cerrado el día que se firma este papel.
