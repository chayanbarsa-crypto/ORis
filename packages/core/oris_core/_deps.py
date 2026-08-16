"""
Dependencias opcionales del núcleo de ORis.

Se importan de forma defensiva: el paquete debe poder importarse aunque falte
alguna. Cada consumidor comprueba su bandera `HAS_*` antes de usarlas y degrada
con elegancia en vez de reventar en el arranque.

Extraído sin cambios de `auditoria-documental-idp/app.py` (sección 1).
"""

from __future__ import annotations

import os
from datetime import timezone


try:  # Extractor preferido: rápido y con buenos metadatos.
    import pymupdf as fitz  # Nombre moderno del paquete (PyMuPDF >= 1.24).

    HAS_PYMUPDF = True
except ImportError:  # pragma: no cover - depende del entorno
    try:
        import fitz  # Alias histórico, aún válido en versiones antiguas.

        HAS_PYMUPDF = True
    except ImportError:
        HAS_PYMUPDF = False

try:
    from pypdf import PdfReader, PdfWriter

    HAS_PYPDF = True
except ImportError:  # pragma: no cover
    HAS_PYPDF = False

try:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import (
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    HAS_REPORTLAB = True
except ImportError:  # pragma: no cover
    HAS_REPORTLAB = False

try:
    import anthropic

    HAS_ANTHROPIC = True
except ImportError:  # pragma: no cover
    HAS_ANTHROPIC = False

try:  # Hora peninsular: el contenedor de despliegue corre en UTC.
    from zoneinfo import ZoneInfo

    ZONA_HORARIA = ZoneInfo("Europe/Madrid")
except Exception:  # pragma: no cover - falta el paquete tzdata
    ZONA_HORARIA = timezone.utc

try:  # Carga ANTHROPIC_API_KEY desde .env si existe.
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # pragma: no cover
    pass
