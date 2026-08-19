"""Invariantes de los contratos compartidos.

Estos tests no prueban código: prueban los dos ficheros JSON de
`apps/web/contratos/`. Son datos que leen dos lenguajes distintos, así que un
error tipográfico ahí no lo caza el compilador de ninguno de los dos — lo
descubriría un extracto mal categorizado semanas después.
"""

from __future__ import annotations

import re

import pytest

from oris_core.categorias import REGLAS_BASE, CATEGORIA_TRASPASO
from oris_core.contratos import esquema_movimientos, reglas_base


# ---------------------------------------------------------------------------
# El esquema
# ---------------------------------------------------------------------------

def test_el_esquema_es_estricto_en_todos_los_niveles():
    """`additionalProperties: false` en cada objeto, no sólo en la raíz.

    Un objeto anidado laxo deja al modelo colar claves dentro de cada
    movimiento, que es justo donde más daño hace.
    """
    faltan: list[str] = []

    def recorrer(nodo, ruta: str) -> None:
        if isinstance(nodo, dict):
            if nodo.get("type") == "object" and nodo.get("additionalProperties") is not False:
                faltan.append(ruta or "raíz")
            for clave, valor in nodo.items():
                recorrer(valor, f"{ruta}.{clave}" if ruta else clave)
        elif isinstance(nodo, list):
            for i, valor in enumerate(nodo):
                recorrer(valor, f"{ruta}[{i}]")

    recorrer(esquema_movimientos(), "")
    assert faltan == [], f"objetos sin additionalProperties=false: {faltan}"


def test_todas_las_propiedades_son_obligatorias():
    """Un campo opcional es un campo que el modelo omitirá el día malo."""

    def recorrer(nodo, ruta: str) -> None:
        if isinstance(nodo, dict):
            if nodo.get("type") == "object" and "properties" in nodo:
                declaradas = set(nodo["properties"])
                requeridas = set(nodo.get("required", []))
                assert declaradas == requeridas, (
                    f"en {ruta or 'raíz'} sobran o faltan en required: "
                    f"{declaradas ^ requeridas}"
                )
            for clave, valor in nodo.items():
                recorrer(valor, f"{ruta}.{clave}" if ruta else clave)
        elif isinstance(nodo, list):
            for i, valor in enumerate(nodo):
                recorrer(valor, f"{ruta}[{i}]")

    recorrer(esquema_movimientos(), "")


def test_los_importes_son_cadenas_y_nunca_numeros():
    """Un `number` en JSON es coma flotante y el cuadre fallaría por céntimos."""
    esquema = esquema_movimientos()
    mov = esquema["properties"]["movimientos"]["items"]["properties"]
    for campo in ("importe", "saldo"):
        tipos = mov[campo]["type"]
        tipos = tipos if isinstance(tipos, list) else [tipos]
        assert "number" not in tipos, f"{campo} admite number: sería coma flotante"
        assert "string" in tipos, f"{campo} debería ser cadena"


# ---------------------------------------------------------------------------
# Las reglas
# ---------------------------------------------------------------------------

def test_todos_los_patrones_compilan():
    for r in reglas_base():
        try:
            re.compile(r["patron"])
        except re.error as e:  # pragma: no cover - sólo si alguien rompe el JSON
            pytest.fail(f"{r['categoria']}: patrón inválido ({e})")


def test_los_patrones_van_en_mayusculas_y_sin_acentos():
    """El concepto se normaliza antes de comparar.

    Un patrón con minúsculas o con tildes compila igual y no casa nunca: el
    fallo es silencioso, que es la peor clase.
    """
    for r in reglas_base():
        # Fuera las secuencias de escape antes de mirar: la `b` de `\b` y la
        # `d` de `\d` son minúsculas y no tienen nada que ver con el texto que
        # se busca.
        literal = re.sub(r"\\.", "", r["patron"])
        letras = [c for c in literal if c.isalpha()]
        assert all(c.isupper() for c in letras), f"{r['categoria']}: hay minúsculas en el patrón"
        assert all(c.isascii() for c in letras), f"{r['categoria']}: hay acentos en el patrón"


def test_el_traspaso_gana_a_todo_lo_demas():
    """Si otra regla lo empata o lo supera, un traspaso podría contarse como ingreso."""
    traspasos = [r for r in REGLAS_BASE if r.categoria == CATEGORIA_TRASPASO]
    assert traspasos, "no hay ninguna regla que detecte traspasos entre cuentas propias"
    techo = max(r.prioridad for r in REGLAS_BASE if r.categoria != CATEGORIA_TRASPASO)
    assert min(r.prioridad for r in traspasos) > techo


def test_las_reglas_que_necesitan_el_texto_crudo_lo_declaran():
    """La normalización borra IBAN, ISIN y referencias.

    Una regla que busque esos fragmentos y declare `raiz` no casará jamás. Ya
    pasó con dos reglas antes de que el campo `sobre` existiera.
    """
    senales = ("ES\\d", "IBAN", "ISIN", "[A-Z]{2}\\d{10}")
    for r in reglas_base():
        if any(s in r["patron"] for s in senales):
            assert r["sobre"] == "crudo", (
                f"{r['categoria']} busca algo que la normalización borra "
                "pero compara contra la raíz"
            )


def test_no_hay_dos_reglas_identicas():
    vistas = [(r["categoria"], r["patron"]) for r in reglas_base()]
    assert len(vistas) == len(set(vistas)), "hay reglas duplicadas"
