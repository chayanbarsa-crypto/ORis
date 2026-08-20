"""Genera el veredicto de referencia del categorizador de Python.

Lo consume `apps/web/lib/oris/pruebas/categorizar.test.ts`: si el motor de
TypeScript y éste dejan de coincidir, ese test lo dice. Regenerar con:

    .venv/bin/python generar_esperado.py
"""
import json
from decimal import Decimal
from pathlib import Path

from oris_core.categorias import REGLAS_BASE, normalizar_concepto

BASE = Path(__file__).resolve().parents[2] / "apps" / "web" / "lib" / "oris" / "pruebas"
casos = json.loads((BASE / "conceptos.json").read_text(encoding="utf-8"))

ordenadas = sorted(REGLAS_BASE, key=lambda r: -r.prioridad)
salida = []
for caso in casos:
    raiz = normalizar_concepto(caso["concepto"])
    importe = Decimal(caso["importe"])
    ganadora = next((r for r in ordenadas if r.casa(raiz, caso["concepto"], importe)), None)
    salida.append({
        "concepto": caso["concepto"],
        "raiz": raiz,
        "categoria": ganadora.categoria if ganadora else None,
    })

(BASE / "esperado.json").write_text(
    json.dumps(salida, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print(f"{len(salida)} casos; {sum(1 for s in salida if s['categoria'])} categorizados")
