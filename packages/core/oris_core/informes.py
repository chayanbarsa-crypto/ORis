"""
Entregables: informe en Markdown, informe en PDF y documento corregido.

Extraído sin cambios de `auditoria-documental-idp/app.py` (sección 7).
"""

from __future__ import annotations

import io
import re
from datetime import datetime, timezone
from typing import Any

from ._deps import HAS_PYPDF, HAS_REPORTLAB
from .dominio import COLOR_SEVERIDAD, SEVERIDADES, ResultadoAuditoria

if HAS_REPORTLAB:  # pragma: no cover
    from ._deps import (
        A4, PageBreak, Paragraph, ParagraphStyle, SimpleDocTemplate, Spacer,
        Table, TableStyle, colors, getSampleStyleSheet, mm,
    )
if HAS_PYPDF:  # pragma: no cover
    from ._deps import PdfReader, PdfWriter


def construir_informe_markdown(res: ResultadoAuditoria) -> str:
    """Informe legible en Markdown (plan B si no hay reportlab)."""
    lineas = [
        f"# Informe de auditoría documental — {res.documento}",
        "",
        f"- **Fecha (UTC):** {res.fecha_utc}",
        f"- **Motor:** {res.motor}" + (f" ({res.modelo})" if res.modelo else ""),
        f"- **Páginas:** {res.paginas}  |  **Tamaño:** {res.tamano_kb} KB",
        f"- **Cumplimiento global:** {res.cumplimiento} %",
        f"- **Reglas aplicadas:** {', '.join(res.reglas_aplicadas)}",
        "",
        "## Resumen ejecutivo",
        "",
        res.resumen,
        "",
        "## Incidencias detectadas",
        "",
    ]
    abiertas = [h for h in res.hallazgos if h.estado != "Cumple"]
    if not abiertas:
        lineas.append("_Sin incidencias abiertas._")
    for i, h in enumerate(abiertas, start=1):
        lineas += [
            f"### {i}. [{h.severidad}] {h.regla} — página {h.pagina or 'n/d'}",
            "",
            f"- **Estado:** {h.estado}",
            f"- **Descripción:** {h.descripcion}",
            f"- **Evidencia:** {h.evidencia or '—'}",
            f"- **Corrección propuesta:** {h.sugerencia or '—'}",
            "",
        ]
    lineas += [
        "---",
        "",
        f"Generado por el Módulo de Auditoría Documental Inteligente (IDP). "
        f"Contacto: {CONTACTO_TELEFONO}",
    ]
    return "\n".join(lineas)


def construir_pdf_informe(res: ResultadoAuditoria) -> bytes | None:
    """Genera con reportlab el PDF del informe de auditoría."""
    if not HAS_REPORTLAB:
        return None

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=f"Auditoría IDP — {res.documento}",
    )
    estilos = getSampleStyleSheet()
    h1 = ParagraphStyle("h1x", parent=estilos["Heading1"], fontSize=16, spaceAfter=10)
    h2 = ParagraphStyle("h2x", parent=estilos["Heading2"], fontSize=12, spaceAfter=6)
    normal = ParagraphStyle("nx", parent=estilos["BodyText"], fontSize=9, leading=13)
    pie = ParagraphStyle(
        "pie", parent=estilos["BodyText"], fontSize=8, textColor=colors.grey
    )

    elementos: list[Any] = [
        Paragraph("Informe de Auditoría Documental Inteligente (IDP)", h1),
        Paragraph(f"<b>Documento:</b> {res.documento}", normal),
        Paragraph(f"<b>Fecha (UTC):</b> {res.fecha_utc}", normal),
        Paragraph(
            f"<b>Motor:</b> {res.motor}" + (f" — {res.modelo}" if res.modelo else ""),
            normal,
        ),
        Paragraph(
            f"<b>Páginas:</b> {res.paginas} &nbsp;&nbsp; "
            f"<b>Tamaño:</b> {res.tamano_kb} KB &nbsp;&nbsp; "
            f"<b>Cumplimiento:</b> {res.cumplimiento} %",
            normal,
        ),
        Paragraph(f"<b>Reglas aplicadas:</b> {', '.join(res.reglas_aplicadas)}", normal),
        Spacer(1, 8),
        Paragraph("Resumen ejecutivo", h2),
        Paragraph(res.resumen, normal),
        Spacer(1, 10),
        Paragraph("Detalle de incidencias", h2),
    ]

    filas = [["#", "Severidad", "Regla", "Pág.", "Descripción y corrección propuesta"]]
    abiertas = [h for h in res.hallazgos if h.estado != "Cumple"]
    for i, h in enumerate(abiertas, start=1):
        detalle = h.descripcion
        if h.sugerencia:
            detalle += f"<br/><i>Corrección: {h.sugerencia}</i>"
        filas.append(
            [
                str(i),
                h.severidad,
                Paragraph(h.regla, normal),
                str(h.pagina or "—"),
                Paragraph(detalle, normal),
            ]
        )
    if len(filas) == 1:
        filas.append(["—", "—", "—", "—", Paragraph("Sin incidencias abiertas.", normal)])

    tabla = Table(filas, colWidths=[10 * mm, 22 * mm, 34 * mm, 12 * mm, 96 * mm])
    tabla.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f1f5f9")]),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    elementos += [
        tabla,
        Spacer(1, 12),
        Paragraph(
            "Informe generado automáticamente por el Módulo de Auditoría "
            f"Documental Inteligente (IDP). Contacto: {CONTACTO_TELEFONO}",
            pie,
        ),
    ]

    doc.build(elementos)
    return buffer.getvalue()


def construir_pdf_corregido(datos_originales: bytes, res: ResultadoAuditoria) -> bytes | None:
    """Devuelve el PDF original con el informe de auditoría anexado al final.

    Requiere reportlab (para el informe) y pypdf (para la fusión). Si falta
    pypdf se devuelve únicamente el informe en PDF.
    """
    informe = construir_pdf_informe(res)
    if informe is None:
        return None
    if not HAS_PYPDF:
        return informe

    try:
        escritor = PdfWriter()
        for pagina in PdfReader(io.BytesIO(datos_originales)).pages:
            escritor.add_page(pagina)
        for pagina in PdfReader(io.BytesIO(informe)).pages:
            escritor.add_page(pagina)
        escritor.add_metadata(
            {
                "/Title": f"Auditoría IDP — {res.documento}",
                "/Subject": f"Cumplimiento {res.cumplimiento} %",
                "/Producer": "Módulo de Auditoría Documental Inteligente (IDP)",
            }
        )
        salida = io.BytesIO()
        escritor.write(salida)
        return salida.getvalue()
    except Exception:  # PDF cifrado o corrupto: al menos entregamos el informe.
        return informe


def nombre_base(nombre_fichero: str) -> str:
    """Nombre de fichero saneado para los descargables."""
    base = re.sub(r"\.pdf$", "", nombre_fichero, flags=re.IGNORECASE)
    return re.sub(r"[^\w\-]+", "_", base)[:60] or "documento"
