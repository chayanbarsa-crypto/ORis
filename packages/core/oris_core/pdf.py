"""
Ingesta de PDF: texto por página, metadatos y extracción de campos etiquetados.

Trabaja siempre en memoria — nada toca el disco. Prefiere PyMuPDF y cae a pypdf
si no está disponible.

Extraído sin cambios de `auditoria-documental-idp/app.py` (sección 4).
"""

from __future__ import annotations

import io
from typing import Any

from ._deps import HAS_PYMUPDF, HAS_PYPDF

if HAS_PYMUPDF:  # pragma: no cover - depende del entorno
    from ._deps import fitz
if HAS_PYPDF:  # pragma: no cover
    from ._deps import PdfReader

def leer_pdf(datos: bytes) -> tuple[list[str], dict[str, Any]]:
    """Devuelve (texto de cada página, metadatos) de un PDF en memoria.

    Prueba PyMuPDF y, si no está disponible, pypdf. Si ninguno está instalado
    devuelve valores neutros para que la demo siga siendo utilizable.
    """
    if HAS_PYMUPDF:
        with fitz.open(stream=datos, filetype="pdf") as doc:
            paginas = [pagina.get_text() for pagina in doc]
            meta = {k: v for k, v in (doc.metadata or {}).items() if v}
        return paginas, meta

    if HAS_PYPDF:
        lector = PdfReader(io.BytesIO(datos))
        paginas = [(p.extract_text() or "") for p in lector.pages]
        meta = {
            k.lstrip("/"): str(v)
            for k, v in (lector.metadata or {}).items()
            if v
        }
        return paginas, meta

    # Sin librería de PDF: estimación grosera del nº de páginas por marcadores.
    n = max(1, datos.count(b"/Type /Page") or datos.count(b"/Type/Page"))
    return [""] * n, {"aviso": "Instala pymupdf o pypdf para extraer texto."}


def extraer_campos(paginas: list[str]) -> dict[str, tuple[str, int]]:
    """Empareja «Etiqueta:» con su valor y devuelve {etiqueta: (valor, página)}.

    Los extractores de PDF devuelven la etiqueta y su valor en líneas separadas
    cuando están en columnas distintas, así que se admiten ambas formas:
    «Etiqueta: valor» en una línea y «Etiqueta:» seguida del valor en la
    siguiente. La clave se normaliza a minúsculas sin espacios sobrantes.
    """
    campos: dict[str, tuple[str, int]] = {}
    for n_pagina, texto in enumerate(paginas, start=1):
        lineas = [ln.strip() for ln in texto.splitlines()]
        for i, linea in enumerate(lineas):
            if ":" not in linea:
                continue
            etiqueta, _, resto = linea.partition(":")
            etiqueta = etiqueta.strip().lower()
            if not etiqueta or len(etiqueta) > 40:
                continue
            valor = resto.strip()
            if not valor:  # el valor viaja en la línea siguiente
                valor = lineas[i + 1].strip() if i + 1 < len(lineas) else ""
                # Si lo siguiente es otra etiqueta, este campo está vacío.
                if valor.endswith(":"):
                    valor = ""
            campos.setdefault(etiqueta, (valor, n_pagina))
    return campos


def es_pdf(datos: bytes) -> bool:
    """Comprueba la cabecera mágica del fichero."""
    return datos[:5] == b"%PDF-"

