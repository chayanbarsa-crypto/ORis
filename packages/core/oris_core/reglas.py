"""
Motor A — reglas deterministas.

Analiza el texto realmente extraído del PDF: cuadre aritmético de importes,
orden cronológico de fechas, formato de NIF/CIF e IBAN, marcadores sin
rellenar, continuidad de la paginación, firmas en blanco y vigencia de la
cláusula de protección de datos.

Dos invariantes que no se negocian:
  * Cada hallazgo cita la evidencia encontrada, así el informe se puede
    contrastar con el documento.
  * Si una regla no encuentra los campos que necesita, se declara
    *no evaluable* en lugar de inventar un hallazgo.

Extraído sin cambios de `auditoria-documental-idp/app.py` (sección 5).
"""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .pdf import extraer_campos
from .dominio import (
    CATALOGO_REGLAS,
    PESO_SEVERIDAD,
    SEVERIDADES,
    Hallazgo,
    Regla,
    ResultadoAuditoria,
)

# evidencia lo que ha encontrado, de forma que cualquiera pueda contrastar el
# informe contra el documento. Si un campo no aparece, la regla lo declara
# «no evaluable» en lugar de inventarse un hallazgo.

RE_FECHA = re.compile(r"\b(\d{2})/(\d{2})/(\d{4})\b")
RE_FECHA_ISO = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
RE_IMPORTE = re.compile(r"-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}")
RE_IMPORTE_ANGLOSAJON = re.compile(r"\b\d{1,3}(?:,\d{3})+\.\d{2}\b")
RE_CIF = re.compile(r"^[A-HJNP-SUVW]-?\d{7}[0-9A-J]$", re.IGNORECASE)
RE_NIF = re.compile(r"^\d{8}[A-Z]$", re.IGNORECASE)
RE_PLACEHOLDER = re.compile(
    r"\[[^\]]{0,40}(?:pendiente|pdte|rellenar|completar|tbd|por definir)[^\]]{0,40}\]|X{4,}",
    re.IGNORECASE,
)
RE_PAGINA = re.compile(r"P[áa]g(?:ina)?\.?\s*(\d+)", re.IGNORECASE)

# Valores que, apareciendo en un campo, significan «aquí no hay nada».
VALORES_VACIOS = {
    "", "-", "—", "--", "n/a", "na", "no consta", "(no consta)",
    "pendiente", "[pendiente]", "por determinar",
}


def _es_vacio(valor: str) -> bool:
    """True si el valor está en blanco o es un marcador de hueco."""
    limpio = valor.strip().lower()
    if limpio in VALORES_VACIOS:
        return True
    # Líneas de firma sin rellenar: solo guiones bajos, puntos o espacios.
    return bool(limpio) and all(c in "_.· " for c in limpio)


def _campo(campos: dict[str, tuple[str, int]], *prefijos: str) -> tuple[str, int] | None:
    """Primer campo cuya etiqueta empiece por alguno de los prefijos dados."""
    for prefijo in prefijos:
        for etiqueta, valor in campos.items():
            if etiqueta.startswith(prefijo):
                return valor
    return None


def _a_numero(texto: str) -> float | None:
    """Convierte «1.210,00 EUR» en 1210.0. None si no hay ningún importe."""
    encontrado = RE_IMPORTE.search(texto)
    if not encontrado:
        return None
    return float(encontrado.group(0).replace(".", "").replace(",", "."))


def _formato_es(numero: float) -> str:
    """1210.0 -> «1.210,00» (separador de miles y decimal españoles)."""
    return f"{numero:,.2f}".translate(str.maketrans({",": ".", ".": ","}))


def _a_fecha(texto: str) -> datetime | None:
    """Convierte la primera fecha DD/MM/AAAA encontrada; None si no hay."""
    encontrado = RE_FECHA.search(texto)
    if not encontrado:
        return None
    dia, mes, anio = (int(g) for g in encontrado.groups())
    try:
        return datetime(anio, mes, dia)
    except ValueError:  # fecha imposible, p. ej. 31/02
        return None


def _lineas_con_etiqueta(paginas: list[str], etiqueta: str) -> list[tuple[str, int]]:
    """Todos los valores de una etiqueta repetida -> [(valor, página), ...].

    `extraer_campos` se queda con la primera aparición de cada etiqueta; esta
    función sirve para las que salen varias veces (dos firmas, dos CIF...).
    """
    patron = re.compile(rf"^{re.escape(etiqueta)}\s*:?\s*(.*)$", re.IGNORECASE)
    resultados: list[tuple[str, int]] = []
    for n_pagina, texto in enumerate(paginas, start=1):
        lineas = [ln.strip() for ln in texto.splitlines()]
        for i, linea in enumerate(lineas):
            coincidencia = patron.match(linea)
            if not coincidencia:
                continue
            valor = coincidencia.group(1).strip()
            if not valor and i + 1 < len(lineas) and not lineas[i + 1].endswith(":"):
                valor = lineas[i + 1].strip()
            resultados.append((valor, n_pagina))
    return resultados


def _hallazgo(
    regla: Regla,
    pagina: int,
    severidad: str,
    descripcion: str,
    evidencia: str,
    sugerencia: str,
) -> Hallazgo:
    return Hallazgo(
        regla=regla.nombre,
        pagina=pagina,
        severidad=severidad,
        estado="No cumple",
        descripcion=descripcion,
        evidencia=evidencia,
        sugerencia=sugerencia,
    )


def _no_evaluable(regla: Regla, motivo: str) -> Hallazgo:
    """La regla no ha encontrado los campos que necesita para pronunciarse."""
    return Hallazgo(
        regla=regla.nombre,
        pagina=0,
        severidad="Informativa",
        estado="Requiere revisión",
        descripcion=f"No evaluable automáticamente: {motivo}.",
        evidencia="El motor de reglas no localiza los campos necesarios.",
        sugerencia="Revisión manual, o usa el motor de IA para documentos "
        "con estructura libre.",
    )


# --- Una función por regla -------------------------------------------------


def _regla_firmas(regla, campos, paginas, texto) -> list[Hallazgo]:
    firmas = _lineas_con_etiqueta(paginas, "Fdo.") + _lineas_con_etiqueta(paginas, "Firmado por")
    if not firmas:
        return [_no_evaluable(regla, "no se localiza ningún bloque de firma")]

    hallazgos = []
    for valor, pagina in firmas:
        if _es_vacio(valor):
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Crítica",
                    "Bloque de firma sin firmante identificado.",
                    f"Se lee «Fdo.: {valor or '(en blanco)'}».",
                    "Recabar la firma y el nombre completo del firmante.",
                )
            )
        elif not (RE_NIF.search(valor.replace(" ", "")) or "NIF" in valor.upper()):
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Media",
                    "Firma sin documento identificativo del firmante.",
                    f"Se lee «Fdo.: {valor}», sin NIF asociado.",
                    "Añadir el NIF junto al nombre del firmante.",
                )
            )
    return hallazgos


def _regla_fechas(regla, campos, paginas, texto) -> list[Hallazgo]:
    hallazgos = []
    inicio = _campo(campos, "fecha de inicio", "fecha inicio")
    fin = _campo(campos, "fecha de fin", "fecha fin", "fecha de vencimiento")

    if inicio and fin:
        f_inicio, f_fin = _a_fecha(inicio[0]), _a_fecha(fin[0])
        if f_inicio and f_fin and f_fin < f_inicio:
            hallazgos.append(
                _hallazgo(
                    regla, fin[1], "Alta",
                    "La fecha de fin es anterior a la fecha de inicio.",
                    f"Inicio {inicio[0]} — Fin {fin[0]}.",
                    "Corregir la fecha de fin o justificar el periodo.",
                )
            )
    elif not inicio and not fin:
        if not RE_FECHA.search(texto):
            return [_no_evaluable(regla, "el documento no contiene fechas")]

    if RE_FECHA_ISO.search(texto) and RE_FECHA.search(texto):
        hallazgos.append(
            _hallazgo(
                regla, 1, "Media",
                "Conviven dos formatos de fecha en el mismo documento.",
                "Se detectan DD/MM/AAAA y AAAA-MM-DD.",
                "Homogeneizar todas las fechas a DD/MM/AAAA.",
            )
        )
    return hallazgos


def _regla_importes(regla, campos, paginas, texto) -> list[Hallazgo]:
    hallazgos = []
    base = _campo(campos, "base imponible", "base")
    impuesto = _campo(campos, "iva", "igic", "impuesto")
    total = _campo(campos, "total")

    if base and impuesto and total:
        n_base, n_imp, n_total = (_a_numero(c[0]) for c in (base, impuesto, total))
        if None not in (n_base, n_imp, n_total):
            esperado = round(n_base + n_imp, 2)
            if abs(esperado - n_total) > 0.01:
                hallazgos.append(
                    _hallazgo(
                        regla, total[1], "Crítica",
                        "El total no cuadra con la suma de base imponible e impuestos.",
                        f"{base[0]} + {impuesto[0]} = {_formato_es(esperado)} EUR, "
                        f"pero el documento declara {total[0]}.",
                        f"Corregir el total: debería ser {_formato_es(esperado)} EUR.",
                    )
                )
    else:
        return [_no_evaluable(regla, "no se localizan base imponible, impuesto y total")]

    if RE_IMPORTE_ANGLOSAJON.search(texto):
        hallazgos.append(
            _hallazgo(
                regla, 1, "Baja",
                "Uso inconsistente del separador decimal.",
                f"Se detecta el formato anglosajón «{RE_IMPORTE_ANGLOSAJON.search(texto).group(0)}».",
                "Unificar al formato español: 1.234,56.",
            )
        )
    return hallazgos


def _regla_estructura(regla, campos, paginas, texto) -> list[Hallazgo]:
    hallazgos = []

    vistos: set[str] = set()
    for coincidencia in RE_PLACEHOLDER.finditer(texto):
        marcador = coincidencia.group(0)
        if marcador.lower() in vistos:
            continue
        vistos.add(marcador.lower())
        pagina = next(
            (i for i, p in enumerate(paginas, start=1) if marcador in p), 1
        )
        etiqueta = next(
            (k for k, (v, _) in campos.items() if marcador in v), None
        )
        hallazgos.append(
            _hallazgo(
                regla, pagina, "Alta",
                "Campo obligatorio sin rellenar.",
                f"Marcador «{marcador}»" + (f" en el campo «{etiqueta}»." if etiqueta else "."),
                "Completar el campo antes de dar el documento por válido.",
            )
        )

    # Continuidad de la paginación (solo si el documento la declara).
    numeros = [
        int(m.group(1))
        for pagina in paginas
        for m in [RE_PAGINA.search(pagina)]
        if m
    ]
    if len(numeros) >= 2 and numeros != list(range(numeros[0], numeros[0] + len(numeros))):
        hallazgos.append(
            _hallazgo(
                regla, 1, "Media",
                "La numeración de páginas no es continua.",
                f"Secuencia detectada: {numeros}.",
                "Regenerar el documento con paginación correlativa.",
            )
        )
    return hallazgos


def _regla_identificadores(regla, campos, paginas, texto) -> list[Hallazgo]:
    hallazgos = []
    identificadores = (
        _lineas_con_etiqueta(paginas, "CIF")
        + _lineas_con_etiqueta(paginas, "NIF")
        + _lineas_con_etiqueta(paginas, "NIF/CIF")
    )
    ibans = _lineas_con_etiqueta(paginas, "IBAN")

    if not identificadores and not ibans:
        return [_no_evaluable(regla, "no se localizan identificadores fiscales ni bancarios")]

    for valor, pagina in identificadores:
        limpio = valor.strip().replace(" ", "")
        # El vacío se evalúa sobre el valor original: «(no consta)» pierde su
        # espacio al normalizar y dejaría de reconocerse.
        if _es_vacio(valor) or _es_vacio(limpio):
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Crítica",
                    "Identificador fiscal ausente.",
                    f"Se lee «{valor or '(en blanco)'}» en lugar de un NIF/CIF.",
                    "Completar el identificador fiscal de la entidad.",
                )
            )
        elif not (RE_CIF.match(limpio) or RE_NIF.match(limpio)):
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Alta",
                    "El identificador fiscal no tiene un formato válido.",
                    f"Valor encontrado: «{valor}».",
                    "Verificar el NIF/CIF contra el censo y corregirlo.",
                )
            )

    for valor, pagina in ibans:
        limpio = valor.strip().replace(" ", "").upper()
        if _es_vacio(limpio):
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Alta", "IBAN ausente.",
                    "El campo IBAN está vacío.",
                    "Solicitar el certificado de titularidad bancaria.",
                )
            )
        elif limpio.startswith("ES") and len(limpio) != 24:
            hallazgos.append(
                _hallazgo(
                    regla, pagina, "Alta",
                    "El IBAN no tiene la longitud correcta para España.",
                    f"«{valor}» tiene {len(limpio)} caracteres; un IBAN español tiene 24.",
                    "Corregir el IBAN: faltan o sobran dígitos.",
                )
            )
    return hallazgos


def _regla_proteccion_datos(regla, campos, paginas, texto) -> list[Hallazgo]:
    normalizado = texto.upper()
    derogada = "15/1999" in normalizado or "LOPD 15" in normalizado
    vigente = "RGPD" in normalizado or "LOPDGDD" in normalizado or "3/2018" in normalizado

    if derogada:
        return [
            _hallazgo(
                regla, 1, "Alta",
                "La cláusula de protección de datos cita normativa derogada.",
                "Se menciona la LOPD 15/1999, sustituida en 2018.",
                "Actualizar la referencia al RGPD (UE) 2016/679 y la LOPDGDD 3/2018.",
            )
        ]
    if not vigente:
        return [
            _hallazgo(
                regla, 1, "Alta",
                "Falta la cláusula informativa de protección de datos.",
                "No se localiza mención al RGPD ni a la LOPDGDD.",
                "Incorporar la cláusula informativa al pie del documento.",
            )
        ]
    return []


VALIDADORES = {
    "R01": _regla_firmas,
    "R02": _regla_fechas,
    "R03": _regla_importes,
    "R04": _regla_estructura,
    "R05": _regla_identificadores,
    "R06": _regla_proteccion_datos,
}


def auditar_por_reglas(
    datos: bytes,
    nombre: str,
    paginas_texto: list[str],
    metadatos: dict[str, Any],
    reglas: list[Regla],
) -> ResultadoAuditoria:
    """Audita el documento aplicando las validaciones deterministas.

    No hay aleatoriedad ni plantillas: dos ejecuciones sobre el mismo PDF dan
    exactamente el mismo informe, y cada hallazgo cita el texto que lo motiva.
    """
    texto = "\n".join(paginas_texto)
    campos = extraer_campos(paginas_texto)

    hallazgos: list[Hallazgo] = []
    if not texto.strip():
        # PDF escaneado sin capa de texto: decirlo, no fabricar hallazgos.
        for regla in reglas:
            hallazgos.append(
                _no_evaluable(regla, "el PDF no contiene texto extraíble (¿escaneado?)")
            )
    else:
        for regla in reglas:
            validador = VALIDADORES.get(regla.id)
            if validador is None:
                continue
            hallazgos.extend(validador(regla, campos, paginas_texto, texto))

    # Las reglas que no han producido ningún hallazgo se registran como conformes.
    reglas_con_hallazgo = {h.regla for h in hallazgos}
    for regla in reglas:
        if regla.nombre not in reglas_con_hallazgo:
            hallazgos.append(
                Hallazgo(
                    regla=regla.nombre,
                    pagina=0,
                    severidad="Informativa",
                    estado="Cumple",
                    descripcion=f"Sin incidencias: «{regla.nombre}» se valida correctamente.",
                    evidencia="Todas las comprobaciones de la regla se han superado.",
                    sugerencia="",
                )
            )

    hallazgos.sort(key=lambda h: (SEVERIDADES.index(h.severidad), h.pagina))
    cumplimiento = calcular_cumplimiento(hallazgos)

    incumplimientos = [h for h in hallazgos if h.estado == "No cumple"]
    revisables = [h for h in hallazgos if h.estado == "Requiere revisión"]
    criticos = sum(1 for h in incumplimientos if h.severidad == "Crítica")

    partes = [
        f"Se han revisado {len(paginas_texto)} página(s) contra "
        f"{len(reglas)} regla(s) de negocio."
    ]
    if incumplimientos:
        partes.append(
            f"El documento alcanza un {cumplimiento} % de cumplimiento con "
            f"{len(incumplimientos)} incumplimiento(s), "
            f"{criticos} de ellos críticos."
        )
        partes.append(
            "Se recomienda subsanar las incidencias críticas antes de dar el "
            "documento por válido."
            if criticos
            else "No hay bloqueantes críticos, pero conviene corregir lo detectado."
        )
    else:
        partes.append(
            f"El documento supera todas las validaciones aplicadas "
            f"({cumplimiento} % de cumplimiento)."
        )
    if revisables:
        partes.append(
            f"{len(revisables)} regla(s) no son evaluables automáticamente y "
            "requieren revisión manual o el motor de IA."
        )

    return ResultadoAuditoria(
        documento=nombre,
        motor="Reglas deterministas (sin IA)",
        modelo=None,
        fecha_utc=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        paginas=len(paginas_texto),
        tamano_kb=round(len(datos) / 1024, 1),
        reglas_aplicadas=[r.nombre for r in reglas],
        cumplimiento=cumplimiento,
        resumen=" ".join(partes),
        hallazgos=hallazgos,
        metadatos=metadatos,
    )


def calcular_cumplimiento(hallazgos: list[Hallazgo]) -> int:
    """Puntúa de 0 a 100 penalizando cada incidencia según su severidad."""
    penalizacion = sum(
        PESO_SEVERIDAD.get(h.severidad, 0) for h in hallazgos if h.estado != "Cumple"
    )
    return max(0, min(100, 100 - penalizacion))
