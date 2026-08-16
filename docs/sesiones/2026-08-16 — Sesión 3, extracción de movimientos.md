---
proyecto: ORis
tipo: sesión
fecha: 2026-08-16
tags: [oris, sesion, bitacora, extraccion, ia, json-schema]
---

# 2026-08-16 · Sesión 3 — extraer los movimientos

## Lo que pedía la instrucción, y lo que se pudo hacer

La instrucción daba por hechos cuatro puntos. Tres no se sostenían al
comprobarlos:

| Punto | Realidad |
|---|---|
| «El repositorio está renombrado a `ORis`» | Sigue siendo `ORis-`, con el guion |
| «`DATABASE_URL` está configurada en `.env`» | `.env` está en `.gitignore` — y debe estarlo. Vive en tu dispositivo y **no puede** cruzar a una sesión en la nube |
| «El índice y las especificaciones están actualizados en `docs/`» | Los actualicé yo en la sesión anterior; no hay commits tuyos |
| «La bóveda está sincronizada» | ✅ correcto |

A eso se suma que **no hay ningún PDF de extractos** en el repo (los dos únicos
PDFs son las facturas del auditor) y **no hay `ANTHROPIC_API_KEY`**.

Así que la llamada real al modelo y el guardado en tu Postgres no se pudieron
ejecutar desde aquí. Lo que sí se construyó es todo lo demás, verificado.

## Qué se hizo

`packages/core/oris_core/extractos.py` — el eslabón que faltaba entre las dos
mitades de ORis. `pdf.py` sabía leer un PDF y el esquema sabía guardar
movimientos; nada convertía lo uno en lo otro.

- **`ESQUEMA_MOVIMIENTOS`**: JSON Schema estricto (`additionalProperties: false`,
  todos los campos en `required`).
- **Motor IA**: adjunta el PDF nativo, `claude-opus-5`, pensamiento adaptativo,
  salida estructurada. Por streaming, porque una petición sin streaming con
  `max_tokens` alto agota el tiempo de espera HTTP del SDK.
- **Validación determinista**: cuadre de saldos, orden cronológico, continuidad
  del saldo apunte a apunte, IBAN por mod-97, páginas ilegibles.
- **`extraer.py`**: CLI para ejecutarlo con tu clave sobre tus extractos.

## Las tres decisiones

### El dinero viaja como texto en el JSON
`json.loads` convierte los números a `float`, y un `float` no representa 0,10 €
exactamente. El esquema exige cadenas con patrón `^-?\d+\.\d{2}$` y aquí se
convierten a `Decimal`. Si el cuadre se comprobara en coma flotante fallaría por
céntimos fantasma — el mismo motivo por el que la fase 2 usa `numeric(14,2)`.

### El modelo no deduce saldos
Si el extracto no declara saldo inicial o final, el campo va a `null` y el cuadre
se declara **no evaluable**. Deducirlo sumando los movimientos haría la
comprobación circular: cuadraría siempre, incluso faltando apuntes. Es la regla
heredada del auditor — mejor *no evaluable* que inventado.

### Si no cuadra, no se guarda
`saldo_inicial + Σ movimientos = saldo_final`. Si falla, la extracción se declara
incompleta en vez de dar por buenos unos movimientos a medias. El CLI sale con
código 1 para que un script encadenado se pare en seco.

Y una comprobación que el auditor de facturas no tenía: **la continuidad del
saldo apunte a apunte**. El cuadre dice *que* falta algo; la continuidad dice
*dónde*.

## Verificado

19 tests en verde. Los nuevos alimentan el validador con la transcripción del
extracto sintético y con variantes rotas a propósito:

```
✅ un movimiento perdido rompe el cuadre, y la evidencia cifra el desvío (500,00)
✅ un dígito cambiado (-78,45 → -78,54) lo caza igual (0,09)
✅ el salto de saldo localiza el hueco: señala el apunte posterior
✅ fechas desordenadas se detectan
✅ IBAN con un dígito cambiado: 24 caracteres, sólo el mod-97 lo pilla
✅ páginas ilegibles bloquean el guardado
✅ 0,10 + 0,20 = 0,30 exacto en Decimal
✅ sin saldo declarado → «Requiere revisión», no incumplimiento
✅ apunte ilegible se descarta y se declara — nunca a medias en silencio
✅ ningún hallazgo sin evidencia citada
```

`tests/generar_extracto_ejemplo.py` genera el fixture: un extracto de una página
con 8 apuntes que cuadran, más su transcripción esperada en JSON.

## El límite de esto, dicho claramente

**Un extracto sintético verifica la validación, no la extracción.** Lo difícil de
los extractos reales es que cada banco los maqueta a su manera, y este documento
tiene una maquetación sola — la que yo elegí. Que el validador cace un
movimiento perdido está probado; que el modelo lea bien un extracto del BBVA no
lo está y no puede estarlo hasta que haya un PDF real.

Es la diferencia entre las fases 1 y 2 —donde la verificación era completa— y
esta.

## Siguiente
1. Un extracto real (aunque sea viejo) como segundo fixture, y una pasada con
   `ANTHROPIC_API_KEY` para medir la extracción de verdad.
2. La ingesta: de la salida de `extraer.py --json` a las tablas de la fase 2.
   El punto delicado es el hash de deduplicación y la transacción — o entra el
   extracto entero con sus movimientos, o no entra nada.
3. El motor de categorización: primero `reglas_categorizacion`, y sólo lo que no
   case va al modelo.
