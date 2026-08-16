---
proyecto: ORis
tipo: procedimiento
tags: [obsidian, ipad, git, sincronizacion]
---

# Sincronizar ORis con Obsidian en el iPad

## El problema
Esta sesión de Claude corre en un contenedor **en la nube**, no en tu PC ni en tu
iPad. No puedo escribir directamente en tu bóveda de Obsidian: no la veo. Lo único
que puedo tocar son repositorios de GitHub.

## La solución: que el repo *sea* parte de la bóveda

El repo `ORis` incluirá una carpeta `docs/` escrita en Markdown con enlaces
`[[wiki]]` y frontmatter YAML — es decir, **ya es una bóveda de Obsidian**. Todo lo
que yo escriba ahí aparece en Obsidian en cuanto sincronices.

### Montaje en iPad (una sola vez)

1. Instala **Working Copy** (App Store). Es el cliente de Git de iOS.
2. En Working Copy: *Repositories* → **+** → *Clone repository* → tu repo `ORis`.
   Inicia sesión con GitHub y autoriza.
3. Abre **Obsidian** → *Open folder as vault*… o mejor: dentro de Working Copy,
   pulsa el repo → menú **⋯** → *Setup Folder Sync* → elige la carpeta de tu
   bóveda de Obsidian y enlaza `docs/`.
4. A partir de ahí: yo hago push → tú pulsas *Pull* en Working Copy → las notas
   aparecen en Obsidian. Y al revés: editas en Obsidian, *Commit & Push* en
   Working Copy, y yo lo leo en la siguiente sesión.

> Alternativa sin Working Copy: el plugin **Obsidian Git** funciona en iOS pero es
> notablemente más frágil con repos grandes. Working Copy es el camino fiable.

## Ficheros que adjuntes en el chat

Si me adjuntas ficheros aquí, **no llegan solos a Obsidian**. El circuito es:

```
adjuntas en el chat  →  yo los guardo en el repo (docs/adjuntos/)
                     →  push  →  Pull en Working Copy  →  Obsidian
```

Dímelo cuando adjuntes algo y lo commiteo ahí con una nota de contexto.

## Esta conversación

Queda registrada en [[ORis — Fusión IRES + Auditoría IDP]]. Cada sesión de trabajo
añadirá su propia nota en `docs/sesiones/`, para que la bóveda conserve el
razonamiento y no sólo el código.
