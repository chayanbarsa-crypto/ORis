#!/usr/bin/env python3
"""
Extrae los movimientos de un extracto bancario y comprueba que cuadren.

    export ANTHROPIC_API_KEY=sk-ant-...
    .venv/bin/python extraer.py mi-extracto.pdf
    .venv/bin/python extraer.py mi-extracto.pdf --json > movimientos.json

Sin `--json` imprime un resumen legible. Con `--json` escribe la transcripción
completa en stdout, lista para que la ingesta la guarde en la base de datos.

El código de salida es 1 si la extracción no cuadra: así un script que encadene
extracción y guardado se para en seco en lugar de escribir movimientos
incompletos.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from oris_core import es_pdf, extraer_movimientos, leer_pdf  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pdf", type=pathlib.Path, help="Extracto bancario en PDF")
    ap.add_argument("--json", action="store_true", help="Volcar la transcripción")
    args = ap.parse_args()

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("Falta ANTHROPIC_API_KEY en el entorno.", file=sys.stderr)
        return 2

    datos = args.pdf.read_bytes()
    if not es_pdf(datos):
        print(f"{args.pdf} no parece un PDF.", file=sys.stderr)
        return 2

    paginas, _ = leer_pdf(datos)
    res = extraer_movimientos(datos, args.pdf.name, api_key, paginas)

    if args.json:
        print(
            json.dumps(
                {
                    "documento": res.documento,
                    "banco": res.banco,
                    "iban": res.iban,
                    "periodo_inicio": res.periodo_inicio and res.periodo_inicio.isoformat(),
                    "periodo_fin": res.periodo_fin and res.periodo_fin.isoformat(),
                    "saldo_inicial": res.saldo_inicial and str(res.saldo_inicial),
                    "saldo_final": res.saldo_final and str(res.saldo_final),
                    "cuadra": res.cuadra,
                    "movimientos": [
                        {
                            "fecha": m.fecha.isoformat(),
                            "fecha_valor": m.fecha_valor and m.fecha_valor.isoformat(),
                            "concepto": m.concepto,
                            "importe": str(m.importe),
                            "saldo": m.saldo and str(m.saldo),
                            "posicion": m.posicion,
                        }
                        for m in res.movimientos
                    ],
                    "hallazgos": [
                        {
                            "regla": h.regla,
                            "severidad": h.severidad,
                            "estado": h.estado,
                            "descripcion": h.descripcion,
                            "evidencia": h.evidencia,
                        }
                        for h in res.hallazgos
                    ],
                },
                indent=2,
                ensure_ascii=False,
            )
        )
    else:
        print(f"{res.documento} — {res.banco or 'banco no identificado'}")
        print(f"  IBAN: {res.iban or '(no consta)'}")
        print(f"  Movimientos: {len(res.movimientos)}")
        if res.saldo_inicial is not None and res.saldo_final is not None:
            print(
                f"  {res.saldo_inicial} + {res.suma_movimientos} = {res.saldo_final}"
            )
        print()
        for h in res.hallazgos:
            marca = {"Cumple": "OK ", "Requiere revisión": "?? "}.get(h.estado, "!! ")
            print(f"  {marca}[{h.severidad}] {h.regla}: {h.descripcion}")
            if h.evidencia:
                print(f"       {h.evidencia}")

    if not res.cuadra:
        print(
            "\nLa extracción NO cuadra. No guardes estos movimientos.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
