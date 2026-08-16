---
proyecto: ORis
tipo: sesión
fase: 5
fecha: 2026-08-16
tags: [oris, sesion, bitacora, categorizacion, reglas]
---

# 2026-08-16 · Sesión 6 — categorización

## Antes: el SSH no llega

Se montó un túnel SSH entre el iPad y el PC «para picar código». No alcanza a
esta sesión, y conviene que quede escrito para no volver a intentarlo:

```
cliente ssh:      no instalado
~/.ssh:           vacío
agente SSH:       ninguno
puerto 22:        bloqueado
salida de red:    sólo HTTPS por un proxy interno
sesiones alcanzables: ninguna
```

El túnel conecta el iPad con el PC. Este contenedor no es ninguno de los dos:
corre aislado en la nube, sin ruta hacia esa red ni credenciales. **Lo que sí
daría acceso local es instalar Claude Code en el PC** — ahí la sesión corre
dentro de la máquina, ve el `.env`, usa la clave y habla con el Postgres.

## El diseño salió de los datos, no al revés

Midiendo sobre el extracto real de 92 movimientos:

| Enfoque | Cobertura |
|---|---|
| Comercios exactos repetidos | 51 % |
| Raíces normalizadas repetidas | 53 % |
| **Reglas por patrón** | 43 % ← menos, pero generaliza |
| **Reglas por patrón + perfil del titular** | **54 %** |

El salto de 43 % a 54 % no vino de ampliar el catálogo. Vino de mirar qué
quedaba fuera: **`JORDY CHAYANN VICENTE ABAD` × 8** — el propio titular.
Transferencias entre sus cuentas.

Y el 43 % «peor» que el 53 % de comercios exactos es engañoso: una regla por
comercio exacto cubre lo ya visto y falla con el comercio nuevo. Entre las
raíces que aparecían **una sola vez** estaban CASQUERIA, FRUTERIA, LIDL, EL
SABROSO, ALITAS, UBER EATS — todas alimentación o restauración. Una regla por
patrón las caza la primera vez que aparecen.

## Tres decisiones

### Las reglas casan patrones, no comercios
`FRUTERIA|CARNICERIA|CASQUERIA|PANADERIA|SUPERMERCAD\w*|…` cubre el comercio de
barrio que nunca estará en ningún catálogo. 13 reglas base con prioridad y
restricción de signo.

### Lo manual gana siempre
`origen = 'manual'` no lo sobrescribe ni una regla ni el modelo — ni se evalúan
las reglas. Sin esa garantía, un reprocesado borra el trabajo del usuario **en
silencio**, y como el resultado parece bien categorizado, nadie lo nota.

### Un traspaso entre cuentas propias no es ingreso ni gasto
8 de los 15 ingresos del extracto real eran transferencias del titular a sí
mismo. Contarlas como ingreso infla el mes en cientos de euros.

El banco no ayuda: Trade Republic escribe «Incoming transfer from \<NOMBRE\>» y
**no usa nunca la palabra “traspaso”**, así que buscarla no encuentra nada.
Detectarlo exige saber el nombre y los IBAN del titular — configuración por
usuario, no catálogo. Prioridad 110, por encima de todo.

## El mismo fallo, dos veces, y las dos en silencio

La normalización borra a propósito IBAN, ISIN y referencias: son ruido para
identificar un comercio. Pero **una regla que busca precisamente eso no
encuentra nunca nada** — existe, tiene prioridad alta, y no casa jamás.

1. **`MARKUP`**: lo añade el banco, no el comercio, así que parecía ruido. Es lo
   único que distingue la comisión de cambio de la compra que la originó. La
   regla de Comisiones (prioridad 90) estaba muerta.
2. **El IBAN propio**: la regla de traspaso por IBAN, muerta por lo mismo. Esta
   la cazó un test; la primera la cacé mirando la salida.

Arreglado de raíz: una `Regla` declara ahora `sobre = "raiz" | "crudo"`. La
regla general que queda escrita en el código: **si una regla depende de una
palabra, esa palabra no es ruido.**

## Verificado

41 tests (17 nuevos). Los que más valen:

```
✅ lo manual no lo sobrescribe ninguna regla
✅ un traspaso propio no es ingreso
✅ el nombre casa aunque el banco lo recorte o reordene
✅ la comisión gana al comercio que la originó
✅ MARKUP sobrevive a la normalización
✅ los IBAN propios marcan traspaso (casando sobre el texto crudo)
✅ «S.L.» y «SL» dan la misma raíz — el mismo comercio no se cuenta dos veces
✅ un comercio nunca visto cae en su categoría por patrón
```

## Lo que queda para el modelo

42 de 92 movimientos: EASYREPOST, SABELYS, PAYMONADE, ELMA, CHABELI… nombres que
ningún catálogo puede conocer. Eso es exactamente para lo que sirve el modelo, y
ahora sólo ve lo raro.

## Siguiente
1. El categorizador por IA para esos 42, con el mismo patrón que la extracción:
   JSON Schema estricto y confianza declarada por movimiento.
2. Aprendizaje: cuando el usuario corrige una categoría del modelo, ofrecer
   crear la regla. Es como el catálogo personal crece sin que nadie lo escriba.
3. La pasada real con `ANTHROPIC_API_KEY`, que sigue pendiente.
