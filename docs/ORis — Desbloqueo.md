---
proyecto: ORis
tipo: referencia
fecha: 2026-08-17
tags: [oris, desbloqueo, constelacion, pin, accesibilidad]
---

# ORis — desbloqueo

## Los puntos, numerados

La constelación muestra en **verde** y **numerados** los nodos que hay que unir,
con una línea discontinua entre ellos. Se desvanece en cuanto empiezas a trazar:
ya no hace falta, y dejarla encima competiría con tu propio trazo.

La guía **lee `UNLOCK_SEQUENCE`** de `lib/constellation/pisces.ts`. Cambiar el
patrón cambia los números solos — no hay que tocar el dibujo.

### Por qué verde, y por qué no es el verde de IRES

El color va en `lib/ires/theme.ts` como `GUIA`, fuera de la paleta de emociones
a propósito. Las emociones dicen *cómo está* ORis; esto es una instrucción para
quien mira. Mezclarlas haría que la guía cambiara de color según el ánimo de la
constelación, que es lo contrario de lo que necesita algo que se lee como una
instrucción.

Sobre el fondo real `#040814` da **10,40:1** de contraste — muy por encima del
4,5:1 que pide WCAG AA para texto pequeño, que es lo que son estos números.

Y la línea guía es **discontinua**, no sólo verde: el trazo del usuario es
continuo. Quien no distinga los colores sigue viendo dos cosas distintas.

## El PIN, tras 3 intentos

El flujo ya estaba en IRES (`MAX_PATTERN_ATTEMPTS = 3`). Lo que faltaba era el
valor.

**El PIN no está en el código.** `accessConfig.ts` lo advierte desde la Fase 1 y
tiene razón: escrito en el fuente, queda en el historial de git para siempre en
cuanto el repositorio se comparta, y de ahí no se saca sin reescribir el
historial. Vive en `.env.local`, que está en `.gitignore`:

```bash
echo 'NEXT_PUBLIC_UNLOCK_PIN=1692' > apps/web/.env.local
```

Es una variable `NEXT_PUBLIC_`, así que **viaja al navegador**. Mantenerla fuera
del repositorio evita que quede en el historial, pero no la oculta a quien abra
las herramientas de desarrollo. Sigue siendo una cerradura de conveniencia, no
seguridad — cuando ORis maneje extractos reales hará falta autenticación de
servidor.

Sin la variable no hay respaldo: al tercer intento la pantalla dice *«Sin PIN
configurado: define NEXT_PUBLIC_UNLOCK_PIN en .env.local»* en vez de ofrecer un
teclado que nunca abriría.

## Sobre enseñar el patrón

Numerar los puntos elimina lo poco de secreto que tenía el trazo: quien mire la
pantalla lo ve. Es un cambio consciente, y encaja con lo que el propio código ya
decía — el desbloqueo por constelación **nunca fue seguridad**. Un patrón que no
se recuerda deja fuera al dueño, que es el único fallo que aquí importa.

Si algún día se quiere sin guía, es un booleano: `mostrarGuia` en
`PiscesConstellation`.

## Verificado en un navegador real

```
intento 1: «Patrón no reconocido · 2 intentos restantes»
intento 2: «Patrón no reconocido · 1 intento restante»
intento 3: «Patrón bloqueado tras 3 intentos · introduce el PIN»
teclado PIN visible: true
PIN 1692 abre ORis: true
```

La primera vez la comprobación dio `false` **y el código estaba bien**: mi
aserción buscaba texto que seguía en el DOM. Las capturas lo desmintieron.
