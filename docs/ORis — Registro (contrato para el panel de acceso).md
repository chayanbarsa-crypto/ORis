# El panel de registro: por dónde entra

Este documento existe para que el registro se pueda construir **en paralelo** sin
chocar con lo que ya hay. No dice cómo tiene que ser la pantalla; dice dónde
enchufarla y qué no tocar.

## Lo que ya está hecho

La puerta funciona y es real. No hay que rehacerla:

| Pieza | Archivo | Qué hace |
|---|---|---|
| Firma de sesión | `apps/web/lib/auth/sesion.ts` | Firma y verifica la cookie con HMAC. Web Crypto, así que vale en Node y en el runtime Edge. |
| PIN | `apps/web/lib/auth/pin.ts` | `scrypt` con sal. Deriva y compara en tiempo constante. |
| Entrar | `apps/web/app/api/pin/route.ts` | Comprueba el PIN y pone la cookie `oris_sesion`. `DELETE` la borra. |
| La puerta | `apps/web/middleware.ts` | Sin cookie válida, ni la página ni la API llegan a ejecutarse. |
| La pantalla | `apps/web/app/entrar/page.tsx` | Constelación + PIN. |

La cookie es `httpOnly` y va firmada: **el navegador no puede fabricarla ni
editarla**. Todo lo que decida quién eres tiene que salir de ahí, nunca de un
estado de React ni de `localStorage`.

## La costura: `USUARIO`

Hoy hay un solo usuario y vive en una constante:

```ts
// apps/web/lib/oris/usuario.ts
export const USUARIO = 'jordy';
```

La leen los cuatro sitios que escriben o consultan datos (`cargar.ts` y las tres
rutas de `app/api/`). **Ése es el único punto que el registro tiene que
cambiar**: en vez de una constante, una función que lee la sesión de la cookie.

```ts
// A donde tiene que llegar
export async function usuarioActual(): Promise<string> {
  const token = (await cookies()).get(COOKIE)?.value;
  const sesion = await verificar(token, process.env.ORIS_SECRETO!);
  if (!sesion) throw new Error('Sin sesión');   // el middleware ya lo impide
  return sesion.usuario;
}
```

Mientras esa función devuelva el identificador correcto, **todo lo demás sigue
funcionando sin tocarlo**: cada tabla ya tiene `usuario_id` y todas las consultas
ya filtran por él.

## Lo que hace falta y todavía no está

1. **Tabla de usuarios.** Hoy no existe. Como mínimo: `id`, `correo` (único),
   `pin` (la derivación de `lib/auth/pin.ts`, nunca el número), `creado_en`.
2. **El PIN sale del entorno y entra en la tabla.** `ORIS_PIN` es de un solo
   usuario por definición. `app/api/pin/route.ts` pasa a buscar por correo y
   comparar contra la fila. `ORIS_SECRETO` **se queda**: firma todas las sesiones.
3. **Límite de intentos en la base de datos.** El de ahora vive en memoria del
   proceso y sólo frena a quien ataque una misma instancia. Con varios usuarios,
   una columna `intentos` + `bloqueado_hasta` en la tabla.
4. **Aislamiento en Postgres.** Con un usuario, filtrar en la consulta basta. Con
   varios, hay que activar RLS en Supabase: un fallo al escribir un `where`
   dejaría de ser un error y pasaría a ser una fuga.

## Cuatro reglas que no se negocian

1. **El PIN nunca se guarda**, ni en el código, ni en el entorno, ni en una
   columna. Se guarda su derivación. Un volcado de la base de datos no puede
   revelar el PIN de nadie.
2. **Ninguna variable `NEXT_PUBLIC_`** para nada de esto. Viajan dentro del
   JavaScript que descarga el navegador. Ya pasó una vez en este proyecto.
3. **Nunca aceptar el `usuario_id` desde el cliente.** Ni en el cuerpo, ni en la
   URL, ni en una cabecera. Sale de la cookie firmada y de ningún otro sitio; en
   cuanto lo mande el navegador, cualquiera puede pedir los datos de cualquiera.
4. **El dinero sigue siendo `numeric(14,2)` y céntimos enteros.** El registro no
   toca esto, pero cualquier tabla nueva que lleve importes, también.

## Cómo probarlo

`apps/web/lib/auth/pruebas/auth.test.ts` ya cubre la firma y el PIN, incluidos
los casos que importan: cookie con el usuario cambiado, caducidad alargada a
mano, firma de otro secreto. Si el registro cambia el formato de la sesión, esas
pruebas tienen que seguir pasando —o cambiar a la vez y por un motivo escrito.

```
npx tsx lib/auth/pruebas/auth.test.ts
```

## Trabajar en paralelo sin pisarse

Rama `registro`, ya creada y publicada. Sale de `main` en `b1becba`.

```bash
git fetch origin
git checkout registro
```

Lo que evita los conflictos no es la rama: es **repartir los archivos**. Una
rama con los dos tocando lo mismo da exactamente el mismo lío, sólo que más
tarde y todo junto.

**De la rama `registro` (nadie más los toca):**

```
apps/web/app/registro/**            la pantalla nueva
apps/web/app/api/registro/**        el alta
apps/web/lib/auth/usuarios.ts       la tabla y sus consultas
apps/web/drizzle/**                 la migración de la tabla de usuarios
apps/web/lib/oris/usuario.ts        la costura: constante -> función
```

**De `main` (no tocar desde la rama):**

```
apps/web/components/**              interfaz, tokens de color, modo claro
apps/web/lib/oris/*.ts              agregados, series, detalle, copiloto...
apps/web/app/api/{extractos,movimientos,copiloto}/**
```

Los cuatro archivos de la columna de `main` que **leen** `USUARIO` no hace falta
tocarlos: si `usuario.ts` pasa a exportar una función con el mismo nombre, se
cambia una línea en cada uno y se hace **al fusionar**, no antes.

Zona compartida y por eso conviene avisar antes de entrar: `middleware.ts`,
`lib/auth/sesion.ts`, `app/api/pin/route.ts`. Son la puerta y ya funciona; si el
registro necesita cambiarlos, mejor decirlo que hacerlo en paralelo.

**Ponerse al día con `main` (a menudo, no al final):**

```bash
git checkout registro
git merge origin/main
```

Media hora de conflictos una vez por semana es peor que dos minutos cada día.

**Antes de fusionar, esto tiene que estar en verde:**

```bash
cd apps/web
npx tsc --noEmit
npx tsx lib/auth/pruebas/auth.test.ts
npx next build
```
