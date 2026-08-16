"""
Motor B — IA real contra la API de Anthropic.

Para documentos de estructura libre, donde las reglas deterministas no
encuentran campos etiquetados. Adjunta el PDF nativo cuando cabe en los límites
de la API — así el modelo *ve* firmas y maquetación — y exige salida
estructurada con JSON Schema estricto.

Extraído sin cambios de `auditoria-documental-idp/app.py` (sección 6).
"""

from __future__ import annotations

import base64
import json
from typing import Any

from ._deps import HAS_ANTHROPIC
from .dominio import Hallazgo, Regla, ResultadoAuditoria, SEVERIDADES

if HAS_ANTHROPIC:  # pragma: no cover - depende del entorno
    from ._deps import anthropic

# Modelo por defecto y límites de la API para adjuntar el PDF nativo.
MODELO_IA = "claude-opus-5"
MAX_TOKENS_IA = 16_000
MAX_MB_PDF_NATIVO = 25
MAX_PAGINAS_PDF_NATIVO = 100

# Esquema JSON estricto: garantiza que la respuesta del modelo es parseable.
ESQUEMA_SALIDA = {
    "type": "object",
    "properties": {
        "cumplimiento": {
            "type": "integer",
            "description": "Porcentaje global de cumplimiento, de 0 a 100.",
        },
        "resumen": {
            "type": "string",
            "description": "Resumen ejecutivo de la auditoría, 3-5 frases.",
        },
        "hallazgos": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "regla": {"type": "string"},
                    "pagina": {"type": "integer"},
                    "severidad": {"type": "string", "enum": SEVERIDADES},
                    "estado": {
                        "type": "string",
                        "enum": ["Cumple", "No cumple", "Requiere revisión"],
                    },
                    "descripcion": {"type": "string"},
                    "evidencia": {"type": "string"},
                    "sugerencia": {"type": "string"},
                },
                "required": [
                    "regla",
                    "pagina",
                    "severidad",
                    "estado",
                    "descripcion",
                    "evidencia",
                    "sugerencia",
                ],
                "additionalProperties": False,
            },
        },
    },
    "required": ["cumplimiento", "resumen", "hallazgos"],
    "additionalProperties": False,
}

PROMPT_SISTEMA = (
    "Eres un auditor documental senior especializado en Intelligent Document "
    "Processing. Analizas documentos PDF contra un checklist de reglas de "
    "negocio y devuelves hallazgos accionables.\n\n"
    "Criterios de trabajo:\n"
    "- Un hallazgo por incidencia concreta, anclado a la página donde aparece.\n"
    "- Si una regla se cumple sin incidencias, emite un hallazgo con "
    "estado 'Cumple' y severidad 'Informativa'.\n"
    "- La evidencia debe citar lo que se ve en el documento, no inferencias.\n"
    "- No inventes datos: si un campo no es legible, márcalo como "
    "'Requiere revisión' en lugar de asumir su contenido.\n"
    "- La sugerencia debe ser una acción concreta de subsanación."
)


def construir_prompt_usuario(reglas: list[Regla], texto: str, adjunto: bool) -> str:
    """Compone la instrucción con el checklist seleccionado."""
    checklist = "\n".join(
        f"- [{r.id}] {r.nombre}: {r.criterio_ia}" for r in reglas
    )
    partes = [
        "Audita el documento adjunto contra el siguiente checklist de reglas "
        "de negocio:\n",
        checklist,
        "\nDevuelve el resultado siguiendo estrictamente el esquema JSON "
        "solicitado. El campo 'cumplimiento' es tu valoración global de 0 a 100.",
    ]
    if not adjunto:
        partes.append(
            "\n--- TEXTO EXTRAÍDO DEL DOCUMENTO ---\n" + texto[:120_000]
        )
    return "\n".join(partes)


def auditar_con_ia(
    datos: bytes,
    nombre: str,
    paginas_texto: list[str],
    metadatos: dict[str, Any],
    reglas: list[Regla],
    api_key: str,
) -> ResultadoAuditoria:
    """Ejecuta la auditoría real contra la API de Anthropic.

    Adjunta el PDF nativo cuando cabe dentro de los límites de la API (así el
    modelo "ve" firmas, sellos y maquetación); en caso contrario envía el texto
    extraído como plan B.
    """
    if not HAS_ANTHROPIC:
        raise RuntimeError(
            "El paquete 'anthropic' no está instalado. Ejecuta: pip install anthropic"
        )

    paginas = len(paginas_texto)
    texto = "\n".join(paginas_texto)
    cliente = anthropic.Anthropic(api_key=api_key)

    # ¿Cabe el PDF nativo? Da mucha mejor precisión en firmas y maquetación.
    cabe_nativo = (
        len(datos) <= MAX_MB_PDF_NATIVO * 1024 * 1024
        and paginas <= MAX_PAGINAS_PDF_NATIVO
    )

    contenido: list[dict[str, Any]] = []
    if cabe_nativo:
        contenido.append(
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(datos).decode("ascii"),
                },
            }
        )
    contenido.append(
        {
            "type": "text",
            "text": construir_prompt_usuario(reglas, texto, adjunto=cabe_nativo),
        }
    )

    respuesta = cliente.messages.create(
        model=MODELO_IA,
        max_tokens=MAX_TOKENS_IA,
        system=PROMPT_SISTEMA,
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": ESQUEMA_SALIDA},
        },
        messages=[{"role": "user", "content": contenido}],
    )

    if respuesta.stop_reason == "refusal":
        raise RuntimeError(
            "El modelo ha declinado analizar este documento. "
            "Revisa su contenido o prueba con otro fichero."
        )

    bruto = next(
        (b.text for b in respuesta.content if getattr(b, "type", "") == "text"), ""
    )
    if not bruto:
        raise RuntimeError("La API no ha devuelto contenido analizable.")

    datos_json = json.loads(bruto)
    hallazgos = [
        Hallazgo(
            regla=str(h.get("regla", "—")),
            pagina=int(h.get("pagina", 0) or 0),
            severidad=h.get("severidad", "Informativa"),
            estado=h.get("estado", "Requiere revisión"),
            descripcion=h.get("descripcion", ""),
            evidencia=h.get("evidencia", ""),
            sugerencia=h.get("sugerencia", ""),
        )
        for h in datos_json.get("hallazgos", [])
    ]
    hallazgos.sort(
        key=lambda h: (
            SEVERIDADES.index(h.severidad) if h.severidad in SEVERIDADES else 99,
            h.pagina,
        )
    )

    uso = respuesta.usage
    metadatos_ampliados = dict(metadatos)
    metadatos_ampliados["tokens_entrada"] = getattr(uso, "input_tokens", None)
    metadatos_ampliados["tokens_salida"] = getattr(uso, "output_tokens", None)
    metadatos_ampliados["pdf_adjunto_nativo"] = cabe_nativo

    return ResultadoAuditoria(
        documento=nombre,
        motor="IA — API de Anthropic",
        modelo=MODELO_IA,
        fecha_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        paginas=paginas,
        tamano_kb=round(len(datos) / 1024, 1),
        reglas_aplicadas=[r.nombre for r in reglas],
        cumplimiento=int(datos_json.get("cumplimiento", calcular_cumplimiento(hallazgos))),
        resumen=str(datos_json.get("resumen", "")),
        hallazgos=hallazgos,
        metadatos=metadatos_ampliados,
    )

