"""
oris_core — núcleo de auditoría documental de ORis.

Python puro, sin interfaz. Extraído de `auditoria-documental-idp/app.py`, que
resultó estar ya completamente desacoplado de Streamlit: no había una sola
llamada a `st.` en las 1.205 líneas de lógica. La extracción es un corte, no
una reescritura, y los dos PDFs de ejemplo lo verifican.
"""

from .categorias import (
    REGLAS_BASE,
    Asignacion,
    Perfil,
    ResultadoCategorizacion,
    categorizar,
    normalizar_concepto,
    reglas_para,
)
from .dominio import (
    CATALOGO_REGLAS,
    COLOR_SEVERIDAD,
    PESO_SEVERIDAD,
    REGLAS_POR_DEFECTO,
    REGLAS_POR_NOMBRE,
    SEVERIDADES,
    Hallazgo,
    Regla,
    ResultadoAuditoria,
)
from .pdf import es_pdf, extraer_campos, leer_pdf
from .reglas import auditar_por_reglas, calcular_cumplimiento
from .extractos import (
    ESQUEMA_MOVIMIENTOS,
    Movimiento,
    ResultadoExtraccion,
    extraer_movimientos,
    parsear_respuesta,
    validar,
)
from .informes import (
    construir_informe_markdown,
    construir_pdf_corregido,
    construir_pdf_informe,
    nombre_base,
)

__all__ = [
    "CATALOGO_REGLAS", "COLOR_SEVERIDAD", "PESO_SEVERIDAD", "REGLAS_POR_DEFECTO",
    "REGLAS_POR_NOMBRE", "SEVERIDADES", "Hallazgo", "Regla", "ResultadoAuditoria",
    "es_pdf", "extraer_campos", "leer_pdf",
    "auditar_por_reglas", "calcular_cumplimiento",
    "ESQUEMA_MOVIMIENTOS", "Movimiento", "ResultadoExtraccion",
    "extraer_movimientos", "parsear_respuesta", "validar",
    "REGLAS_BASE", "Asignacion", "Perfil", "ResultadoCategorizacion",
    "categorizar", "normalizar_concepto", "reglas_para",
    "construir_informe_markdown", "construir_pdf_corregido",
    "construir_pdf_informe", "nombre_base",
]
