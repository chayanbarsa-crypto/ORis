"""
Modelo de dominio de la auditoría: severidades, reglas de negocio y resultado.

Es la capa que no sabe de PDFs, ni de HTTP, ni de interfaz. Todo lo demás
depende de esto y nada de esto depende de nada más.

Extraído sin cambios de `auditoria-documental-idp/app.py` (secciones 2 y 3).
Se han dejado fuera las constantes propias de la demo pública (título de la
app, datos RGPD del responsable, ficheros de ejemplo, tope de lote): pertenecen
a la interfaz, no al dominio.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from typing import Any

SEVERIDADES = ["Crítica", "Alta", "Media", "Baja", "Informativa"]
PESO_SEVERIDAD = {  # Penalización sobre el % de cumplimiento.
    "Crítica": 22,
    "Alta": 12,
    "Media": 6,
    "Baja": 2,
    "Informativa": 0,
}
COLOR_SEVERIDAD = {
    "Crítica": "#b3261e",
    "Alta": "#e8710a",
    "Media": "#c8a600",
    "Baja": "#4a7dbd",
    "Informativa": "#6c757d",
}



@dataclass(frozen=True)
class Regla:
    """Una regla del checklist de negocio."""

    id: str
    nombre: str
    descripcion: str
    # Instrucción que se inyecta en el prompt del modelo en el modo IA real.
    criterio_ia: str


CATALOGO_REGLAS: list[Regla] = [
    Regla(
        id="R01",
        nombre="Verificación de Firmas",
        descripcion="Presencia, ubicación y legibilidad de firmas y sellos.",
        criterio_ia=(
            "Comprueba que el documento está firmado: busca firmas manuscritas, "
            "firmas digitales, sellos y bloques 'Firmado por'. Señala firmas "
            "ausentes, ilegibles, sin identificación del firmante o sin fecha."
        ),
    ),
    Regla(
        id="R02",
        nombre="Cumplimiento de Fechas",
        descripcion="Coherencia cronológica y vigencia de las fechas.",
        criterio_ia=(
            "Verifica todas las fechas: formato homogéneo, coherencia cronológica "
            "(inicio anterior a fin), vigencia respecto a la fecha de emisión y "
            "ausencia de fechas futuras imposibles o campos de fecha vacíos."
        ),
    ),
    Regla(
        id="R03",
        nombre="Validación de Importes",
        descripcion="Cuadre aritmético, divisas e impuestos.",
        criterio_ia=(
            "Valida los importes: que base imponible + impuestos = total, que la "
            "divisa sea consistente, que los decimales y separadores sean "
            "correctos y que no haya importes negativos o ausentes injustificados."
        ),
    ),
    Regla(
        id="R04",
        nombre="Estructura de Datos",
        descripcion="Campos obligatorios, secciones y numeración.",
        criterio_ia=(
            "Revisa la estructura: presencia de los campos obligatorios "
            "(emisor, receptor, identificador del documento, objeto), numeración "
            "de páginas, secciones completas y ausencia de campos marcador sin "
            "rellenar del tipo 'XXXX' o '[pendiente]'."
        ),
    ),
    Regla(
        id="R05",
        nombre="Identificadores Fiscales",
        descripcion="Formato y presencia de NIF/CIF/IBAN.",
        criterio_ia=(
            "Comprueba los identificadores fiscales y bancarios: formato válido de "
            "NIF/CIF/NIE e IBAN, presencia de ambos cuando el documento lo exige y "
            "coherencia entre el identificador y el nombre de la entidad."
        ),
    ),
    Regla(
        id="R06",
        nombre="Protección de Datos (LOPD)",
        descripcion="Datos personales expuestos y cláusulas informativas.",
        criterio_ia=(
            "Detecta datos personales sensibles expuestos sin anonimizar y verifica "
            "la presencia de la cláusula informativa de protección de datos "
            "(RGPD/LOPDGDD) cuando el tipo de documento la requiere."
        ),
    ),
]

REGLAS_POR_NOMBRE = {r.nombre: r for r in CATALOGO_REGLAS}
# Todas activas por defecto: así el checklist cubre los 7 errores del
# documento de ejemplo y quien lo revise ve el recuento completo.
REGLAS_POR_DEFECTO = [r.nombre for r in CATALOGO_REGLAS]


@dataclass
class Hallazgo:
    """Una incidencia detectada por el motor de auditoría."""

    regla: str
    pagina: int
    severidad: str
    estado: str  # Cumple | No cumple | Requiere revisión
    descripcion: str
    evidencia: str = ""
    sugerencia: str = ""


@dataclass
class ResultadoAuditoria:
    """Salida completa de una auditoría, serializable a JSON."""

    documento: str
    motor: str
    modelo: str | None
    fecha_utc: str
    paginas: int
    tamano_kb: float
    reglas_aplicadas: list[str]
    cumplimiento: int
    resumen: str
    hallazgos: list[Hallazgo] = field(default_factory=list)
    metadatos: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        datos = asdict(self)
        datos["hallazgos"] = [asdict(h) for h in self.hallazgos]
        return datos

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)
