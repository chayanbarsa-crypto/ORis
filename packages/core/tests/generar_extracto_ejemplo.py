"""
Genera el extracto bancario sintético que usan los tests.

No es un extracto real de ningún banco: es un documento de una página con
saldos declarados y ocho apuntes que cuadran exactamente, más su transcripción
esperada en JSON. Sirve para dos cosas:

  * probar el motor de extracción de punta a punta sin exponer datos bancarios
    reales de nadie;
  * dar a la validación un caso conocido-bueno del que derivar los casos malos.

Ejecutar:  packages/core/.venv/bin/python tests/generar_extracto_ejemplo.py

⚠️ Un extracto sintético vale para verificar la *validación*, no la *extracción*.
Lo difícil de los extractos reales es que cada banco los maqueta a su manera, y
este documento tiene una maquetación sola. Cuando haya un PDF real de un banco,
añadirlo como segundo fixture.
"""

from __future__ import annotations

import json
import pathlib
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

AQUI = pathlib.Path(__file__).parent
FIXTURES = AQUI / "fixtures"

IBAN = "ES9121000418450200051332"  # mod-97 válido; cuenta inventada
SALDO_INICIAL = Decimal("1250.00")

# concepto, fecha, importe
APUNTES = [
    ("2026-01-03", "NOMINA EMPRESA EJEMPLO SL", Decimal("2100.00")),
    ("2026-01-05", "RECIBO LUZ ENERO", Decimal("-78.45")),
    ("2026-01-07", "COMPRA SUPERMERCADO", Decimal("-42.10")),
    ("2026-01-09", "TRANSFERENCIA A AHORRO", Decimal("-500.00")),
    ("2026-01-14", "CAFE", Decimal("-0.10")),
    ("2026-01-14", "PAN", Decimal("-0.20")),
    ("2026-01-20", "DEVOLUCION COMPRA ONLINE", Decimal("19.99")),
    ("2026-01-28", "CUOTA MANTENIMIENTO", Decimal("-12.00")),
]


def construir() -> dict:
    """Calcula los saldos corridos y devuelve la transcripción esperada."""
    saldo = SALDO_INICIAL
    movimientos = []
    for fecha, concepto, importe in APUNTES:
        saldo += importe
        movimientos.append(
            {
                "fecha": fecha,
                "fecha_valor": None,
                "concepto": concepto,
                "importe": f"{importe:.2f}",
                "saldo": f"{saldo:.2f}",
            }
        )
    return {
        "banco": "Banco de Ejemplo",
        "iban": IBAN,
        "periodo_inicio": "2026-01-01",
        "periodo_fin": "2026-01-31",
        "saldo_inicial": f"{SALDO_INICIAL:.2f}",
        "saldo_final": f"{saldo:.2f}",
        "movimientos": movimientos,
        "paginas_ilegibles": [],
    }


def _es(valor: str) -> str:
    """1234.56 -> «1.234,56»: formato de presentación, como lo haría un banco."""
    d = Decimal(valor)
    entero, _, dec = f"{abs(d):.2f}".partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    return f"{'-' if d < 0 else ''}{'.'.join(grupos)},{dec}"


def escribir_pdf(datos: dict, destino: pathlib.Path) -> None:
    estilos = getSampleStyleSheet()
    titulo = ParagraphStyle(
        "titulo", parent=estilos["Heading1"], fontSize=14, spaceAfter=4
    )
    doc = SimpleDocTemplate(
        str(destino),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title="Extracto de ejemplo",
        author="ORis",
    )

    partes = [
        Paragraph("EXTRACTO DE CUENTA", titulo),
        Paragraph(datos["banco"], estilos["Normal"]),
        Paragraph(f"IBAN: {datos['iban']}", estilos["Normal"]),
        Paragraph(
            f"Periodo: {datos['periodo_inicio']} a {datos['periodo_fin']}",
            estilos["Normal"],
        ),
        Spacer(1, 6 * mm),
        Paragraph(
            f"<b>Saldo inicial: {_es(datos['saldo_inicial'])} EUR</b>",
            estilos["Normal"],
        ),
        Spacer(1, 3 * mm),
    ]

    filas = [["Fecha", "Concepto", "Importe", "Saldo"]]
    for m in datos["movimientos"]:
        filas.append(
            [m["fecha"], m["concepto"], _es(m["importe"]), _es(m["saldo"])]
        )

    tabla = Table(filas, colWidths=[24 * mm, 82 * mm, 28 * mm, 28 * mm])
    tabla.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8.5),
                ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8e8e8")),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]
        )
    )
    partes.append(tabla)
    partes += [
        Spacer(1, 4 * mm),
        Paragraph(
            f"<b>Saldo final: {_es(datos['saldo_final'])} EUR</b>", estilos["Normal"]
        ),
        Spacer(1, 8 * mm),
        Paragraph("Pág. 1 de 1", estilos["Normal"]),
    ]
    doc.build(partes)


if __name__ == "__main__":
    FIXTURES.mkdir(parents=True, exist_ok=True)
    datos = construir()
    escribir_pdf(datos, FIXTURES / "extracto_ejemplo.pdf")
    (FIXTURES / "extracto_ejemplo.json").write_text(
        json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"Escritos {len(datos['movimientos'])} movimientos")
    print(f"  saldo inicial {datos['saldo_inicial']} -> final {datos['saldo_final']}")
