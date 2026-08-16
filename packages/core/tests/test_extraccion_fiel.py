"""
Red de seguridad de la extracción del núcleo.

El núcleo de ORis salió de `auditoria-documental-idp/app.py` por corte, no por
reescritura. Estos dos documentos son la prueba de que el corte fue fiel: si el
conforme deja de dar 0 incumplimientos, o el defectuoso deja de dar exactamente
7 — uno por cada defecto deliberado —, la extracción rompió algo.

Ejecutar:  packages/core/.venv/bin/python -m pytest packages/core/tests -q
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from oris_core import (  # noqa: E402
    CATALOGO_REGLAS,
    auditar_por_reglas,
    calcular_cumplimiento,
    leer_pdf,
)

FIXTURES = pathlib.Path(__file__).parent / "fixtures"

# Los 7 defectos deliberados del documento con errores, por regla.
DEFECTOS_ESPERADOS = {
    "Validación de Importes": 1,      # TOTAL 1.310,00 € cuando 1.000,00 + 210,00 = 1.210,00 €
    "Cumplimiento de Fechas": 1,      # fin (15/02/2026) anterior al inicio (01/03/2026)
    "Estructura de Datos": 1,         # Nº de factura sin rellenar: [PENDIENTE]
    "Identificadores Fiscales": 2,    # CIF "(no consta)" + IBAN de 23 caracteres
    "Verificación de Firmas": 1,      # firma del receptor en blanco
    "Protección de Datos (LOPD)": 1,  # cita la LOPD 15/1999, derogada en 2018
}


def _auditar(nombre: str):
    datos = (FIXTURES / nombre).read_bytes()
    paginas, metadatos = leer_pdf(datos)
    return auditar_por_reglas(datos, nombre, paginas, metadatos, list(CATALOGO_REGLAS))


def test_documento_conforme_no_tiene_incumplimientos():
    res = _auditar("ejemplo_conforme.pdf")
    incumplimientos = [h for h in res.hallazgos if h.estado != "Cumple"]
    assert incumplimientos == [], [h.descripcion for h in incumplimientos]
    assert calcular_cumplimiento(res.hallazgos) == 100


def test_documento_con_errores_tiene_exactamente_siete():
    res = _auditar("ejemplo_con_errores.pdf")
    incumplimientos = [h for h in res.hallazgos if h.estado != "Cumple"]
    assert len(incumplimientos) == 7, [h.descripcion for h in incumplimientos]


def test_cada_defecto_cae_en_su_regla():
    res = _auditar("ejemplo_con_errores.pdf")
    por_regla: dict[str, int] = {}
    for h in res.hallazgos:
        if h.estado != "Cumple":
            por_regla[h.regla] = por_regla.get(h.regla, 0) + 1
    assert por_regla == DEFECTOS_ESPERADOS


def test_todo_hallazgo_cita_su_evidencia():
    """Invariante del motor: nada de hallazgos sin respaldo en el documento."""
    res = _auditar("ejemplo_con_errores.pdf")
    sin_evidencia = [
        h.descripcion for h in res.hallazgos
        if h.estado != "Cumple" and not (h.evidencia or "").strip()
    ]
    assert sin_evidencia == []
