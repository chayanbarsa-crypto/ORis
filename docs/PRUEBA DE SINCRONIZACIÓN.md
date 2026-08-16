---
proyecto: ORis
tipo: prueba
fecha: 2026-08-16
tags: [oris, sincronizacion, prueba, canario]
---

# Prueba de sincronización

Este fichero es un **canario**: existe sólo para comprobar que la cadena de
sincronización llega hasta el final. Si lo estás leyendo dentro de Obsidian, esa
cadena funciona **en el dispositivo donde lo estás leyendo** — y sólo en ese.

## La marca

```
ORIS-SYNC-20260816T190414Z-F7GZIR4F
```

Escrita en el repositorio el 2026-08-16 a las 19:04 UTC, sobre el commit `bbc25d8`.

Esta marca no existe en ningún otro sitio. No se puede teclear por casualidad ni
estaba en ninguna copia anterior: si aparece en tu bóveda, ha viajado desde
GitHub hasta ahí.

## Cómo comprobarlo

En **Obsidian**, busca la marca con la búsqueda global (no abras el fichero
directamente — el objetivo es que el índice de Obsidian la haya visto):

- iPad: lupa → pega `ORIS-SYNC-20260816T190414Z-F7GZIR4F`
- PC: `Ctrl+Mayús+F` → pega `ORIS-SYNC-20260816T190414Z-F7GZIR4F`

**Un resultado** en cada dispositivo = la cadena llega. Cero resultados = se
corta antes, y el punto donde se corta lo dice la tabla de abajo.

## Dónde puede cortarse

| Eslabón | Cómo se comprueba | Si falla |
|---|---|---|
| 1. GitHub tiene el fichero | Abrir el repo en el navegador, carpeta `docs/` | El push no salió (no es tu caso: está) |
| 2. El clon local está al día | `git log --oneline -1` debe dar `bbc25d8` o posterior | Falta hacer *Pull* |
| 3. La bóveda ve el clon | El fichero aparece en el explorador de Obsidian | La bóveda apunta a otra carpeta |
| 4. El índice lo tiene | La búsqueda lo encuentra | Reiniciar Obsidian y reindexar |

## ⚠️ Dos bóvedas no son una

La sincronización del iPad y la del PC son **dos caminos independientes**:

```
GitHub ORis-  ──[Working Copy]──▶  bóveda del iPad
              ──[git / Obsidian Git]──▶  bóveda del PC
```

Working Copy es **sólo de iOS**: no existe en Windows ni en Mac. Que el iPad
esté sincronizado **no implica nada** sobre el PC — son dos clones distintos del
mismo repositorio, y cada uno hay que actualizarlo por su lado.

Y el túnel SSH entre iPad y PC tampoco los une: mueve ficheros entre esos dos
aparatos, pero no hace `git pull` por su cuenta ni conecta ninguno de los dos
con GitHub.

## Montar el eslabón del PC

Si en el PC no hay clon todavía, es una vez y ya:

```bash
# 1. Clonar el repositorio donde quieras que viva
git clone https://github.com/chayanbarsa-crypto/ORis-.git C:/Obsidian/ORis

# 2. En Obsidian: «Abrir carpeta como bóveda» -> C:/Obsidian/ORis/docs
#    (o crear un enlace simbólico desde tu bóveda actual a esa carpeta)

# 3. Cada vez que quieras lo nuevo:
cd C:/Obsidian/ORis && git pull
```

Para no acordarte de tirar del `pull`, el plugin **Obsidian Git** lo hace solo
cada X minutos. En el PC funciona bien; en iOS es donde da problemas, y por eso
allí se usa Working Copy.

## Qué contestar

Dime en cuál de los dos aparece la marca:

- **iPad sí, PC no** → falta el eslabón del PC (lo de arriba)
- **PC sí, iPad no** → falta *Pull* en Working Copy
- **En ninguno** → el clon no está donde cree la bóveda; mira la tabla
- **En los dos** → cadena completa, se puede borrar este fichero
