"""
Red de seguridad de la extracción de extractos bancarios.

Estos tests no llaman a la API: alimentan el validador con la transcripción del
extracto sintético y con variantes deliberadamente rotas. Lo que se comprueba
no es que el modelo lea bien —eso sólo lo dice un extracto real— sino que
**cuando el modelo se deje algo, la validación lo cace en vez de dar los
movimientos por buenos**.

Ejecutar:  packages/core/.venv/bin/python -m pytest tests -q
"""

from __future__ import annotations

import copy
import json
import pathlib
import sys
from decimal import Decimal

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from oris_core.extractos import (  # noqa: E402
    ESQUEMA_MOVIMIENTOS,
    _iban_valido,
    parsear_respuesta,
    validar,
)

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


@pytest.fixture
def transcripcion() -> dict:
    """La transcripción correcta del extracto sintético."""
    return json.loads((FIXTURES / "extracto_ejemplo.json").read_text(encoding="utf-8"))


def _validar(bruto: dict):
    return validar(parsear_respuesta(bruto, "extracto_ejemplo.pdf"))


# ---------------------------------------------------------------------------
# El caso bueno
# ---------------------------------------------------------------------------


def test_extracto_correcto_cuadra(transcripcion):
    res = _validar(transcripcion)
    incumplimientos = [h for h in res.hallazgos if h.estado == "No cumple"]
    assert incumplimientos == [], [h.descripcion for h in incumplimientos]
    assert res.cuadra
    assert len(res.movimientos) == 8


def test_el_dinero_es_decimal_exacto(transcripcion):
    """Café (0,10) + pan (0,20) = 0,30 clavado. Con float daría 0,30000000000000004."""
    res = _validar(transcripcion)
    cafe = next(m for m in res.movimientos if m.concepto == "CAFE")
    pan = next(m for m in res.movimientos if m.concepto == "PAN")
    assert isinstance(cafe.importe, Decimal)
    assert cafe.importe + pan.importe == Decimal("-0.30")


def test_el_cuadre_completo_es_exacto(transcripcion):
    res = _validar(transcripcion)
    assert res.saldo_inicial + res.suma_movimientos == res.saldo_final


# ---------------------------------------------------------------------------
# Los casos malos: cada uno simula un fallo real de extracción
# ---------------------------------------------------------------------------


def test_un_movimiento_perdido_rompe_el_cuadre(transcripcion):
    """El fallo que más importa: el modelo se salta una línea del PDF."""
    roto = copy.deepcopy(transcripcion)
    perdido = roto["movimientos"].pop(3)  # TRANSFERENCIA A AHORRO, -500,00

    res = _validar(roto)

    assert not res.cuadra
    cuadre = next(h for h in res.hallazgos if h.regla == "Cuadre de saldos")
    assert cuadre.estado == "No cumple"
    assert cuadre.severidad == "Crítica"
    # La evidencia debe permitir reconstruir el desvío a mano.
    assert "500,00" in cuadre.descripcion, cuadre.descripcion
    assert perdido["concepto"] == "TRANSFERENCIA A AHORRO"


def test_un_importe_mal_leido_rompe_el_cuadre(transcripcion):
    """Un dígito cambiado: -78,45 leído como -78,54."""
    roto = copy.deepcopy(transcripcion)
    roto["movimientos"][1]["importe"] = "-78.54"

    res = _validar(roto)

    assert not res.cuadra
    cuadre = next(h for h in res.hallazgos if h.regla == "Cuadre de saldos")
    assert cuadre.estado == "No cumple"
    assert "0,09" in cuadre.descripcion, cuadre.descripcion


def test_el_salto_de_saldo_localiza_donde_falta_el_apunte(transcripcion):
    """El cuadre dice que falta algo; la continuidad dice dónde."""
    roto = copy.deepcopy(transcripcion)
    roto["movimientos"].pop(3)

    res = _validar(roto)

    salto = next(h for h in res.hallazgos if h.regla == "Continuidad del saldo")
    assert salto.estado == "No cumple"
    assert "TRANSFERENCIA A AHORRO" not in salto.evidencia
    # Señala el apunte inmediatamente posterior al hueco.
    assert "CAFE" in salto.evidencia, salto.evidencia


def test_fechas_desordenadas_se_detectan(transcripcion):
    roto = copy.deepcopy(transcripcion)
    roto["movimientos"][6]["fecha"] = "2026-01-02"  # devolución, antes de la nómina

    res = _validar(roto)

    orden = next(h for h in res.hallazgos if h.regla == "Orden cronológico")
    assert orden.estado == "No cumple"


def test_iban_con_un_digito_cambiado_se_detecta(transcripcion):
    """La longitud sigue siendo 24: sólo el mod-97 lo caza."""
    roto = copy.deepcopy(transcripcion)
    original = roto["iban"]
    roto["iban"] = original[:-1] + ("3" if original[-1] != "3" else "4")

    res = _validar(roto)

    assert len(roto["iban"]) == len(original) == 24
    iban = next(h for h in res.hallazgos if h.regla == "Identificador de cuenta")
    assert iban.estado == "No cumple"


def test_paginas_ilegibles_bloquean_el_guardado(transcripcion):
    roto = copy.deepcopy(transcripcion)
    roto["paginas_ilegibles"] = [2, 3]

    res = _validar(roto)

    assert not res.cuadra
    integridad = next(
        h for h in res.hallazgos if h.regla == "Integridad de la extracción"
    )
    assert integridad.severidad == "Crítica"
    assert "2, 3" in integridad.evidencia


# ---------------------------------------------------------------------------
# No evaluable ≠ incumplimiento
# ---------------------------------------------------------------------------


def test_sin_saldo_declarado_es_no_evaluable_no_incumplimiento(transcripcion):
    """Regla heredada del auditor: mejor decir «no sé» que inventar un veredicto."""
    roto = copy.deepcopy(transcripcion)
    roto["saldo_inicial"] = None

    res = _validar(roto)

    cuadre = next(h for h in res.hallazgos if h.regla == "Cuadre de saldos")
    assert cuadre.estado == "Requiere revisión"
    assert "No evaluable" in cuadre.descripcion
    # No evaluable no cuenta como incumplimiento: no se ha probado nada malo.
    assert res.cuadra


def test_apunte_ilegible_se_descarta_y_se_declara(transcripcion):
    """Nunca se guarda un movimiento a medias en silencio."""
    roto = copy.deepcopy(transcripcion)
    roto["movimientos"][2]["importe"] = "ilegible"

    res = _validar(roto)

    assert len(res.movimientos) == 7
    integridad = next(
        h for h in res.hallazgos if h.regla == "Integridad de la extracción"
    )
    assert integridad.estado == "No cumple"


# ---------------------------------------------------------------------------
# Invariantes generales
# ---------------------------------------------------------------------------


def test_todo_hallazgo_cita_su_evidencia(transcripcion):
    """La misma invariante que el motor de auditoría: nada sin respaldo."""
    for mutacion in (
        lambda d: d["movimientos"].pop(3),
        lambda d: d.__setitem__("paginas_ilegibles", [2]),
        lambda d: d.__setitem__("iban", "ES0000000000000000000000"),
    ):
        roto = copy.deepcopy(transcripcion)
        mutacion(roto)
        res = _validar(roto)
        sin_evidencia = [
            h.descripcion
            for h in res.hallazgos
            if h.estado != "Cumple" and not (h.evidencia or "").strip()
        ]
        assert sin_evidencia == []


def test_el_esquema_es_estricto():
    """Sin additionalProperties:false el modelo puede colar campos inventados."""
    assert ESQUEMA_MOVIMIENTOS["additionalProperties"] is False
    item = ESQUEMA_MOVIMIENTOS["properties"]["movimientos"]["items"]
    assert item["additionalProperties"] is False
    assert set(item["required"]) == set(item["properties"])
    assert set(ESQUEMA_MOVIMIENTOS["required"]) == set(ESQUEMA_MOVIMIENTOS["properties"])


def test_los_importes_del_esquema_son_texto_no_numero():
    """Un número JSON llega como float y 0,10 deja de ser 0,10."""
    item = ESQUEMA_MOVIMIENTOS["properties"]["movimientos"]["items"]
    assert item["properties"]["importe"]["type"] == "string"
    assert ESQUEMA_MOVIMIENTOS["properties"]["saldo_final"]["type"] == ["string", "null"]


def test_iban_mod97():
    assert _iban_valido("ES9121000418450200051332")
    assert _iban_valido("es91 2100 0418 4502 0005 1332")  # tolera espacios y minúsculas
    assert not _iban_valido("ES9121000418450200051333")   # último dígito cambiado
    assert not _iban_valido("ES912100041845020005133")    # 23 caracteres
    assert not _iban_valido("")


# ---------------------------------------------------------------------------
# Maquetación de dos columnas — el fallo que un extracto real destapó
# ---------------------------------------------------------------------------


@pytest.fixture
def dos_columnas() -> dict:
    """Transcripción correcta de un extracto con columnas entrada/salida."""
    return json.loads(
        (FIXTURES / "extracto_dos_columnas.json").read_text(encoding="utf-8")
    )


def test_dos_columnas_transcrito_bien_cuadra(dos_columnas):
    res = _validar(dos_columnas)
    assert res.cuadra, [h.descripcion for h in res.hallazgos if h.estado == "No cumple"]
    assert len(res.movimientos) == 20


def test_una_salida_leida_como_entrada_rompe_el_cuadre(dos_columnas):
    """El error específico de las dos columnas: la cifra va sin signo en el PDF.

    Si el modelo se fija en el número y no en la columna, un cargo de 400,00 €
    entra como abono. El desvío es el doble del importe — 800,00 €, no 400,00 —
    porque no es que falte: es que está con el signo cambiado.
    """
    roto = copy.deepcopy(dos_columnas)
    salida = next(m for m in roto["movimientos"] if m["importe"] == "-400.00")
    salida["importe"] = "400.00"

    res = _validar(roto)

    assert not res.cuadra
    cuadre = next(h for h in res.hallazgos if h.regla == "Cuadre de saldos")
    assert cuadre.estado == "No cumple"
    assert "800,00" in cuadre.descripcion, cuadre.descripcion


def test_el_saldo_corrido_delata_el_signo_cambiado(dos_columnas):
    """Cuando el banco imprime saldo corrido, la contradicción es local.

    El saldo del propio apunte no cambia al invertir el signo del importe, así
    que la continuidad señala exactamente esa fila. Es la comprobación que hace
    útil la columna de balance que traen casi todos los extractos.
    """
    roto = copy.deepcopy(dos_columnas)
    for m in roto["movimientos"]:
        if m["concepto"] == "FARMACIA":
            m["importe"] = "18.75"  # era -18.75

    res = _validar(roto)

    salto = next(h for h in res.hallazgos if h.regla == "Continuidad del saldo")
    assert salto.estado == "No cumple"
    assert "FARMACIA" in salto.evidencia, salto.evidencia


def test_el_prompt_explica_las_dos_columnas():
    """Sin esta instrucción el modelo transcribe los cargos en positivo."""
    from oris_core.extractos import PROMPT_SISTEMA

    assert "dos columnas" in PROMPT_SISTEMA
    assert "salida" in PROMPT_SISTEMA
    # Y debe decirle que use el saldo corrido para comprobarse a sí mismo.
    assert "saldo" in PROMPT_SISTEMA


def test_el_esquema_avisa_del_signo_por_columna():
    item = ESQUEMA_MOVIMIENTOS["properties"]["movimientos"]["items"]
    assert "columna de salida" in item["properties"]["importe"]["description"]
