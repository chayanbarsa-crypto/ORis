"""
Genera un extracto sintético con maquetación de **dos columnas**.

El primer fixture (`generar_extracto_ejemplo.py`) usa una sola columna de
importe con signo. Un extracto real reveló que esa suposición no es general:
muchos bancos —Trade Republic entre ellos— imprimen dos columnas separadas,
«entrada de dinero» y «salida de dinero», con las cifras **siempre en positivo**.
El signo lo determina la columna, no el número.

Es la clase de detalle que un fixture inventado por quien escribe el extractor
nunca revela, porque se inventa con la forma que el extractor ya espera.

Este documento reproduce esa maquetación con datos inventados:
  * dos columnas de importe, sin signo
  * fechas en formato español abreviado, partidas en dos líneas
  * columna de saldo corrido
  * varias páginas, para que la tabla se corte

Ejecutar:  packages/core/.venv/bin/python tests/generar_extracto_dos_columnas.py
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

IBAN = "ES9121000418450200051332"  # mod-97 válido, cuenta inventada
SALDO_INICIAL = Decimal("4.02")

MESES = {
    1: "ene", 2: "feb", 3: "mar", 4: "abr", 5: "may", 6: "jun",
    7: "jul", 8: "ago", 9: "sep", 10: "oct", 11: "nov", 12: "dic",
}

# (día, mes, tipo, descripción, importe con signo)
APUNTES = [
    (1, 5, "Interés", "Interest payment", Decimal("0.07")),
    (9, 5, "Transferencia", "Ingreso desde cuenta propia", Decimal("300.00")),
    (10, 5, "Tarjeta", "COMERCIO EJEMPLO", Decimal("-15.00")),
    (10, 5, "Tarjeta", "COMERCIO EJEMPLO", Decimal("-15.00")),
    (10, 5, "Tarjeta", "TIENDA UNO", Decimal("-3.83")),
    (11, 5, "Tarjeta", "SUPERMERCADO", Decimal("-3.65")),
    (11, 5, "Tarjeta", "SUPERMERCADO", Decimal("-2.25")),
    (13, 5, "Tarjeta", "BAZAR", Decimal("-8.29")),
    (14, 5, "Tarjeta", "FRUTERIA", Decimal("-7.44")),
    (2, 6, "Transferencia", "Ingreso desde cuenta propia", Decimal("150.00")),
    (5, 6, "Tarjeta", "CAFE", Decimal("-0.10")),
    (5, 6, "Tarjeta", "PAN", Decimal("-0.20")),
    (18, 6, "Tarjeta", "LIBRERIA", Decimal("-24.90")),
    (1, 7, "Interés", "Interest payment", Decimal("0.05")),
    (7, 7, "Transferencia", "Pago recibido", Decimal("75.50")),
    (12, 7, "Tarjeta", "TRANSPORTE", Decimal("-11.20")),
    (29, 7, "Tarjeta", "FARMACIA", Decimal("-18.75")),
    (1, 8, "Interés", "Interest payment", Decimal("0.06")),
    (4, 8, "Transferencia", "Envío a ahorro", Decimal("-400.00")),
    (13, 8, "Tarjeta", "PANADERIA", Decimal("-2.40")),
]


def construir() -> dict:
    saldo = SALDO_INICIAL
    movimientos = []
    for dia, mes, _tipo, concepto, importe in APUNTES:
        saldo += importe
        movimientos.append(
            {
                "fecha": f"2026-{mes:02d}-{dia:02d}",
                "fecha_valor": None,
                "concepto": concepto,
                "importe": f"{importe:.2f}",
                "saldo": f"{saldo:.2f}",
            }
        )
    return {
        "banco": "Banco Sintético, Sucursal en España",
        "iban": IBAN,
        "periodo_inicio": "2026-05-01",
        "periodo_fin": "2026-08-13",
        "saldo_inicial": f"{SALDO_INICIAL:.2f}",
        "saldo_final": f"{saldo:.2f}",
        "movimientos": movimientos,
        "paginas_ilegibles": [],
    }


def _es(d: Decimal) -> str:
    entero, _, dec = f"{abs(d):.2f}".partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    return f"{'.'.join(grupos)},{dec} €"


def escribir_pdf(datos: dict, destino: pathlib.Path) -> None:
    estilos = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=estilos["Heading1"], fontSize=13, spaceAfter=2)
    celda = ParagraphStyle("celda", parent=estilos["Normal"], fontSize=7.5, leading=9)

    doc = SimpleDocTemplate(
        str(destino),
        pagesize=A4,
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title="Estado de cuenta",
        author="ORis (documento sintético)",
    )

    entradas = sum(
        (Decimal(m["importe"]) for m in datos["movimientos"] if Decimal(m["importe"]) > 0),
        Decimal("0.00"),
    )
    salidas = sum(
        (-Decimal(m["importe"]) for m in datos["movimientos"] if Decimal(m["importe"]) < 0),
        Decimal("0.00"),
    )

    partes = [
        Paragraph("ESTADO DE CUENTA", h1),
        Paragraph(datos["banco"], estilos["Normal"]),
        Paragraph(f"IBAN {datos['iban']}", estilos["Normal"]),
        Paragraph(
            f"FECHA {datos['periodo_inicio']} - {datos['periodo_fin']}", estilos["Normal"]
        ),
        Paragraph("NOMBRE APELLIDO APELLIDO (titular ficticio)", estilos["Normal"]),
        Spacer(1, 5 * mm),
        Paragraph("RESUMEN DE ESTADO DE CUENTA", estilos["Heading3"]),
    ]

    resumen = Table(
        [
            ["PRODUCTO", "BALANCE INICIAL", "ENTRADA DE DINERO", "SALIDA DE DINERO", "BALANCE FINAL"],
            [
                "Cuenta corriente",
                _es(Decimal(datos["saldo_inicial"])),
                _es(entradas),
                _es(salidas),
                _es(Decimal(datos["saldo_final"])),
            ],
        ],
        colWidths=[38 * mm, 34 * mm, 34 * mm, 34 * mm, 34 * mm],
    )
    resumen.setStyle(
        TableStyle(
            [
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 7.5),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
            ]
        )
    )
    partes += [resumen, Spacer(1, 6 * mm),
               Paragraph("TRANSACCIONES DE CUENTA", estilos["Heading3"])]

    # Aquí está lo que importa: DOS columnas de importe, ambas sin signo.
    filas = [
        [
            Paragraph("<b>FECHA</b>", celda),
            Paragraph("<b>TIPO</b>", celda),
            Paragraph("<b>DESCRIPCIÓN</b>", celda),
            Paragraph("<b>ENTRADA DE DINERO</b>", celda),
            Paragraph("<b>SALIDA DE DINERO</b>", celda),
            Paragraph("<b>BALANCE</b>", celda),
        ]
    ]
    for (dia, mes, tipo, concepto, importe), m in zip(APUNTES, datos["movimientos"]):
        # Fecha partida en dos líneas, como la imprime el banco real.
        fecha_txt = f"{dia:02d} {MESES[mes]}<br/>2026"
        entrada = _es(importe) if importe > 0 else ""
        salida = _es(-importe) if importe < 0 else ""
        filas.append(
            [
                Paragraph(fecha_txt, celda),
                Paragraph(tipo, celda),
                Paragraph(concepto, celda),
                Paragraph(entrada, celda),
                Paragraph(salida, celda),
                Paragraph(_es(Decimal(m["saldo"])), celda),
            ]
        )

    tabla = Table(
        filas,
        colWidths=[18 * mm, 24 * mm, 62 * mm, 24 * mm, 24 * mm, 22 * mm],
        repeatRows=1,
    )
    tabla.setStyle(
        TableStyle(
            [
                ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eeeeee")),
                ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]
        )
    )
    partes += [tabla, Spacer(1, 4 * mm),
               Paragraph("Documento sintético generado por ORis para pruebas.",
                         estilos["Normal"])]
    doc.build(partes)


if __name__ == "__main__":
    FIXTURES.mkdir(parents=True, exist_ok=True)
    datos = construir()
    escribir_pdf(datos, FIXTURES / "extracto_dos_columnas.pdf")
    (FIXTURES / "extracto_dos_columnas.json").write_text(
        json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"{len(datos['movimientos'])} movimientos")
    print(f"  {datos['saldo_inicial']} -> {datos['saldo_final']}")
