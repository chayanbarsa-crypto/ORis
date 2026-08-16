"""
Red de seguridad del motor de categorización.

Los movimientos de estos tests son inventados, pero las formas que toman salen
de un extracto real: el prefijo de tipo delante del comercio, la forma jurídica
con puntos, la comisión de cambio pegada al nombre del comercio, y las
transferencias del titular a sí mismo.

Ejecutar:  packages/core/.venv/bin/python -m pytest tests -q
"""

from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from oris_core.categorias import (  # noqa: E402
    REGLAS_BASE,
    Perfil,
    Regla,
    categorizar,
    normalizar_concepto,
    reglas_para,
)


def mov(concepto: str, importe: str, **extra) -> dict:
    return {"concepto": concepto, "importe": importe, **extra}


# ---------------------------------------------------------------------------
# Normalización
# ---------------------------------------------------------------------------


def test_el_tipo_de_operacion_no_es_el_comercio():
    """Sin quitarlo, todos los pagos con tarjeta parecen el mismo comercio."""
    assert normalizar_concepto("Transacción con tarjeta AHORRAMAS") == "AHORRAMAS"
    assert normalizar_concepto("Transferencia Incoming transfer from ANA") == "ANA"


def test_la_forma_juridica_con_puntos_tambien_se_quita():
    """«S.L.» se queda en «S L» al retirar los signos, y \\b(SL)\\b no casa."""
    assert normalizar_concepto("Transacción con tarjeta EASYREPOST S.L.") == "EASYREPOST"
    assert normalizar_concepto("Transacción con tarjeta EASYREPOST SL") == "EASYREPOST"
    # El mismo comercio contado dos veces es lo que esto evita.
    assert normalizar_concepto("EASYREPOST S.L. 4521") == normalizar_concepto("EASYREPOST SL")


def test_se_retiran_referencias_iban_e_isin():
    assert "ES61" not in normalizar_concepto(
        "Transferencia from ANA LOPEZ (ES6101829465670205725249)"
    )
    assert "IE00" not in normalizar_concepto("Operar Buy trade IE00B4L5Y983 iShares")


def test_markup_sobrevive_a_la_normalizacion():
    """Si una regla depende de una palabra, esa palabra no es ruido.

    «MARKUP» lo añade el banco, no el comercio, así que parece ruido — pero es
    lo único que distingue la comisión de cambio de la compra que la originó.
    Borrarlo dejaba la regla de Comisiones sin nada que casar, en silencio.
    """
    raiz = normalizar_concepto(
        "Transacción con tarjeta Paymonade Exchange rate ECB rate markup"
    )
    assert "MARKUP" in raiz


# ---------------------------------------------------------------------------
# Reglas: prioridad y signo
# ---------------------------------------------------------------------------


def test_la_comision_gana_al_comercio_que_la_origino():
    """Si no, la comisión se cuenta como otra compra en el mismo sitio."""
    r = categorizar([
        mov("Transacción con tarjeta AHORRAMAS", "-12.00"),
        mov("Transacción con tarjeta AHORRAMAS rate markup", "-0.35"),
    ])
    assert r.asignaciones[0].categoria == "Alimentación"
    assert r.asignaciones[1].categoria == "Comisiones"


def test_el_signo_restringe_la_regla():
    """El mismo texto significa cosas distintas según la dirección."""
    r = categorizar([
        mov("Nomina empresa", "1800.00"),   # abono -> Nómina
        mov("Nomina empresa", "-1800.00"),  # cargo -> la regla no aplica
    ])
    assert r.asignaciones[0].categoria == "Nómina"
    assert r.asignaciones[1].categoria != "Nómina"


def test_una_regla_de_mas_prioridad_gana():
    reglas = (
        Regla("Ganadora", r"\bFOO\b", 50),
        Regla("Perdedora", r"\bFOO\b", 10),
    )
    r = categorizar([mov("FOO", "-1.00")], reglas)
    assert r.asignaciones[0].categoria == "Ganadora"


# ---------------------------------------------------------------------------
# La invariante que protege el trabajo del usuario
# ---------------------------------------------------------------------------


def test_lo_manual_no_lo_sobrescribe_ninguna_regla():
    """Sin esto, un reprocesado borra el trabajo del usuario en silencio.

    Y como el resultado *parece* bien categorizado, nadie lo nota.
    """
    r = categorizar([
        mov("Transacción con tarjeta AHORRAMAS", "-12.00",
            categoria="Regalos", origen="manual"),
    ])
    assert r.asignaciones[0].categoria == "Regalos"
    assert r.asignaciones[0].origen == "manual"


def test_lo_manual_sin_categoria_no_bloquea_las_reglas():
    """`origen` manual pero sin categoría no es una decisión del usuario."""
    r = categorizar([
        mov("Transacción con tarjeta AHORRAMAS", "-12.00", origen="manual"),
    ])
    assert r.asignaciones[0].categoria == "Alimentación"
    assert r.asignaciones[0].origen == "regla"


# ---------------------------------------------------------------------------
# Perfil del titular
# ---------------------------------------------------------------------------


def test_un_traspaso_propio_no_es_ingreso():
    """La equivocación más cara: infla los ingresos del mes.

    El banco no usa la palabra «traspaso» — escribe «Incoming transfer from
    <NOMBRE>». Sólo saber el nombre del titular permite distinguirlo.
    """
    perfil = Perfil(nombre="ANA MARIA LOPEZ GARCIA")
    movimientos = [mov("Transferencia Incoming transfer from ANA MARIA LOPEZ GARCIA", "300.00")]

    sin_perfil = categorizar(movimientos)
    con_perfil = categorizar(movimientos, reglas_para(perfil))

    assert sin_perfil.asignaciones[0].categoria is None
    assert con_perfil.asignaciones[0].categoria == "Traspaso entre cuentas propias"


def test_el_nombre_casa_aunque_el_banco_lo_recorte():
    """Los bancos truncan por ancho de columna o reordenan apellidos."""
    perfil = Perfil(nombre="ANA MARIA LOPEZ GARCIA")
    reglas = reglas_para(perfil)
    for concepto in (
        "Transferencia from ANA MARIA LOPEZ",
        "Transferencia ANA MARIA L",
        "Outgoing transfer for ANA MARIA LOPEZ GARCIA",
    ):
        r = categorizar([mov(concepto, "-50.00")], reglas)
        assert r.asignaciones[0].categoria == "Traspaso entre cuentas propias", concepto


def test_el_traspaso_propio_gana_a_cualquier_otra_regla():
    perfil = Perfil(nombre="ANA LOPEZ")
    r = categorizar(
        [mov("Transferencia ANA LOPEZ nomina", "1000.00")],
        reglas_para(perfil),
    )
    assert r.asignaciones[0].categoria == "Traspaso entre cuentas propias"


def test_los_ibans_propios_tambien_marcan_traspaso():
    perfil = Perfil(nombre="", ibans=("ES9121000418450200051332",))
    r = categorizar(
        [mov("Transferencia a ES9121000418450200051332", "-100.00")],
        reglas_para(perfil),
    )
    assert r.asignaciones[0].categoria == "Traspaso entre cuentas propias"


def test_perfil_vacio_no_rompe_nada():
    reglas = reglas_para(Perfil())
    assert len(reglas) == len(REGLAS_BASE)
    r = categorizar([mov("Transacción con tarjeta LIDL", "-30.00")], reglas)
    assert r.asignaciones[0].categoria == "Alimentación"


# ---------------------------------------------------------------------------
# Cobertura
# ---------------------------------------------------------------------------


def test_las_reglas_casan_patrones_no_comercios_exactos():
    """Un comercio nuevo que nunca se ha visto debe caer en su categoría."""
    r = categorizar([
        mov("Transacción con tarjeta CASQUERIA HERMANOS", "-14.20"),
        mov("Transacción con tarjeta FRUTERIA LA ESQUINA", "-7.44"),
        mov("Transacción con tarjeta PANADERIA SAN JOSE", "-2.40"),
        mov("Transacción con tarjeta FCIA M CARMEN", "-18.75"),
    ])
    assert [a.categoria for a in r.asignaciones] == [
        "Alimentación", "Alimentación", "Alimentación", "Salud",
    ]


def test_la_cobertura_se_mide_y_lo_no_cubierto_se_declara():
    r = categorizar([
        mov("Transacción con tarjeta LIDL", "-30.00"),
        mov("Transacción con tarjeta COMERCIO DESCONOCIDO XYZ", "-9.99"),
    ])
    assert r.cobertura == 0.5
    assert len(r.sin_categorizar) == 1
    assert r.sin_categorizar[0].raiz == "COMERCIO DESCONOCIDO XYZ"


def test_cada_asignacion_por_regla_dice_que_regla_fue():
    """Una categoría automática sin trazabilidad no se puede auditar."""
    r = categorizar([mov("Transacción con tarjeta MERCADONA", "-30.00")])
    a = r.asignaciones[0]
    assert a.origen == "regla"
    assert a.regla and "MERCADONA" in a.regla
