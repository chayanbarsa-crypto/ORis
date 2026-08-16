---
proyecto: ORis
estado: superada parcialmente
origen: [[IRES]], [[Auditoría Documental IDP]]
fecha: 2026-08-16
tags: [oris, ires, auditoria, idp, fusion, arquitectura]
---

# ORis — fusión de IRES + Auditoría Documental IDP

> ⚠️ **Nota histórica.** Este es el análisis inicial de los dos proyectos y sigue
> siendo válido como retrato de lo que aportaba cada uno. La decisión de
> arquitectura de la sección 2 quedó **superada** al concretarse el objetivo
> (extractos bancarios, categorización y persistencia multidispositivo).
> La arquitectura vigente está en [[ORis — Arquitectura]].

> Nota de trabajo generada en sesión con Claude Code (remoto).
> Repos leídos directamente: `chayanbarsa-crypto/IRES` (privado) y
> `chayanbarsa-crypto/auditoria-documental-idp` (público).

---

## 1. Qué es cada proyecto hoy

### IRES — la cara
Next.js 15 · React 19 · TypeScript · Tailwind 3 · framer-motion. **Fase 1 completa.**

Aporta **identidad e interfaz**, no lógica de negocio:

- Desbloqueo por constelación de Piscis (`Alrescha → Omicron → Eta → Tau → Phi`),
  con PIN de respaldo tras 3 fallos.
- Campo estelar en canvas único (un `requestAnimationFrame`, no un nodo React por estrella).
- Máquina de estados de 10 estados × 6 emociones (`lib/ires/state.ts`) que traduce
  "qué está haciendo" y "con qué tono" a parámetros de animación (pulso, halo,
  actividad estelar, partículas, ondas).
- Tema centralizado: **el color nunca se escribe en un componente**.
- Huecos declarados y deshabilitados a propósito: `ChatPanel`, `FinanceSidebar`,
  `lib/voice/`, y el contrato `IresBackend` en `lib/ai/types.ts` **sin implementar**.

> Regla de oro heredada: *no se simula backend*. Lo que no existe está
> deshabilitado y lo dice.

### Auditoría Documental IDP — el motor
Python 3.11 · Streamlit · PyMuPDF/pypdf · reportlab · SDK de Anthropic.
**Un solo fichero, `app.py`, 2.256 líneas. Producto terminado y desplegable.**

Aporta **lógica de negocio real y verificable**:

- Ingesta de PDF en memoria (sin persistencia en disco) + extracción de campos.
- Catálogo de 6 reglas deterministas (`class Regla`, `VALIDADORES`): firmas,
  fechas, importes, estructura, identificadores fiscales, protección de datos.
  Cada hallazgo se ancla a su página y **cita la evidencia**; si faltan campos se
  declara *no evaluable* en vez de inventar.
- Modelo de dominio: `Hallazgo`, `ResultadoAuditoria`, 5 severidades con pesos,
  `calcular_cumplimiento()`.
- Motor IA alternativo contra `claude-opus-5` con JSON Schema estricto y adjunto
  del PDF nativo (≤25 MB / ≤100 páginas).
- Salidas: informe Markdown, PDF de informe, PDF corregido, JSON para ERP/CRM.
- Panel de lote y captura de leads con aviso SMTP + RGPD.

### El choque
| | IRES | Auditoría IDP |
|---|---|---|
| Stack | TypeScript / Next.js | Python / Streamlit |
| Madurez | Fase 1, sin backend | Producto completo |
| Qué aporta | Interfaz, identidad, estados | Reglas, PDF, IA, informes |
| Ejecución | `npm run dev` | `streamlit run app.py` |

**No comparten ni una línea.** La fusión es de arquitectura, no de ficheros.

---

## 2. Las tres fusiones posibles

### A · Todo a TypeScript
Portar las 6 reglas y el manejo de PDF a Next.js. Un solo despliegue en Vercel.
❌ Se tira el trabajo maduro: no hay equivalente sólido de PyMuPDF + reportlab,
y reescribir 2.256 líneas verificadas introduce regresiones donde hoy hay certeza.

### B · Monorepo: ORis (Next.js) + motor (FastAPI) — **recomendada**
El shell de IRES se convierte en la cara de ORis. El `app.py` se parte en un
paquete Python limpio y se expone por HTTP. Streamlit deja de ser la interfaz y
pasa a ser, como mucho, una demo secundaria del mismo motor.

```
oris/
  apps/
    web/        ← IRES tal cual: constelación, campo estelar, estados, tema
    engine/     ← FastAPI sobre el núcleo extraído de app.py
  packages/
    core/       ← reglas, modelo de dominio, PDF, motor IA (Python puro)
  docs/         ← esta bóveda de Obsidian
```

✅ Conserva las dos inversiones íntegras.
✅ El contrato `IresBackend` (`lib/ai/types.ts`) ya existe y **encaja tal cual**:
   es la frontera que estaba esperando a tener algo detrás.
✅ La máquina de estados cobra sentido real: `analyzing` mientras el motor audita,
   `alert` si hay hallazgos críticos, `success` si el cumplimiento es 100 %.
⚠️ Dos despliegues (Vercel + Render/Fly/HF Spaces) y CORS entre ellos.

### C · Todo a Streamlit
Meter IRES dentro de Streamlit. ❌ Streamlit no puede sostener el canvas, el
desbloqueo por constelación ni las animaciones. Se pierde toda la identidad.

---

## 3. Cómo se conectan de verdad (opción B)

El puente ya está escrito en IRES; sólo hay que implementarlo.

```ts
// lib/ai/types.ts — YA EXISTE en IRES
export interface IresBackend {
  send(messages: readonly ChatMessage[]): Promise<IresResponse>;
}
```

Se amplía a la auditoría sin romper nada:

```ts
export interface OrisBackend extends IresBackend {
  audit(files: File[], rules: string[], mode: 'rules' | 'ai'): Promise<AuditResult>;
}
```

Y del lado Python, `ResultadoAuditoria` ya es serializable a ese `AuditResult`:
el `ESQUEMA_SALIDA` con JSON Schema que usa el modo IA sirve como **contrato
compartido entre los dos lenguajes**. Es el punto de fusión natural.

Mapeo de estados IRES ← auditoría:

| Evento del motor | Estado ORis | Emoción |
|---|---|---|
| Subiendo/leyendo PDF | `processing` | `processing` |
| Aplicando reglas | `analyzing` | `processing` |
| Hallazgo crítico | `alert` | `risk` |
| 100 % cumplimiento | `success` | `positive` |
| Esperando al usuario | `idle` | `analytical` |

---

## 4. Plan por fases

| Fase | Trabajo | Resultado |
|---|---|---|
| **0** | Crear repo `ORis` vacío, monorepo, mover IRES a `apps/web` | Arranca `npm run dev` |
| **1** | Extraer `app.py` → `packages/core` (dominio, reglas, PDF, IA). Sin tocar lógica. | Tests sobre los 7 defectos del PDF de ejemplo |
| **2** | `apps/engine`: FastAPI con `POST /audit` y `POST /chat` | Motor accesible por HTTP |
| **3** | Implementar `OrisBackend` en el web y conectar `FinanceSidebar` → panel de auditoría | Primer flujo end-to-end |
| **4** | Cablear la máquina de estados a los eventos reales del motor | La constelación reacciona a la auditoría |
| **5** | Despliegue: web en Vercel, motor en Render/HF Spaces | ORis en línea |

**Fase 1 es la crítica.** Los 2 PDFs de ejemplo (`ejemplo_conforme.pdf` = 0
incumplimientos, `ejemplo_con_errores.pdf` = 7) son la red de seguridad: si tras
extraer el núcleo siguen dando exactamente ese resultado, la refactorización es
correcta.

---

## 5. Decisiones pendientes

- [ ] ¿Se mantiene la captura de leads / RGPD en ORis, o eso se queda sólo en la demo pública de Streamlit?
- [ ] ¿ORis es privado (herramienta personal, como IRES) o público (escaparate, como la auditoría)?
- [ ] El desbloqueo por constelación **no es seguridad** (lo dice `accessConfig.ts`). Si ORis toca documentos reales, hace falta auth de servidor.
- [ ] ¿La parte financiera de IRES (`FinanceSidebar`) sigue viva, o ORis es puramente auditoría documental?

---

## Enlaces
- Repo IRES: https://github.com/chayanbarsa-crypto/IRES (privado)
- Repo Auditoría: https://github.com/chayanbarsa-crypto/auditoria-documental-idp
