"""
Extracción de movimientos de extractos bancarios.

Es el eslabón que faltaba entre las dos mitades de ORis: `pdf.py` sabe leer un
PDF y el esquema de la base de datos sabe guardar movimientos, pero nada
convertía lo uno en lo otro.

Cada banco maqueta el extracto a su manera, así que aquí no hay reglas
deterministas que valgan: se adjunta el PDF nativo al modelo y se exige salida
estructurada con JSON Schema estricto. Lo que sí es determinista —y lo que de
verdad importa— es la **validación posterior**:

    saldo_inicial + Σ movimientos = saldo_final

Si ese cuadre falla, la extracción se declara incompleta en lugar de dar por
buenos unos movimientos a medias. Es la misma invariante que ya traía el motor
de auditoría: mejor *no evaluable* que inventado.

Dos decisiones que sostienen el resto:

1. **El dinero viaja como texto, nunca como número JSON.** `json.loads` convierte
   los números a `float`, y un `float` no representa 0,10 € exactamente. El
   esquema exige cadenas y aquí se convierten a `Decimal`. Si el cuadre se
   comprobara en coma flotante, fallaría por céntimos fantasma.

2. **El modelo no inventa saldos.** Si el extracto no trae saldo inicial o final,
   el campo va a `null` y el cuadre se declara no evaluable — no se deduce
   sumando, porque entonces la comprobación sería circular y siempre cuadraría.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from ._deps import HAS_ANTHROPIC
from .contratos import esquema_movimientos, prompt_extraccion
from .dominio import Hallazgo

if HAS_ANTHROPIC:  # pragma: no cover - depende del entorno
    from ._deps import anthropic

MODELO_IA = "claude-opus-5"
# Los extractos largos generan muchos movimientos. Con este techo hay que ir por
# streaming: una petición sin streaming con max_tokens alto se come el tiempo de
# espera HTTP del SDK antes de terminar.
MAX_TOKENS_IA = 32_000
MAX_MB_PDF_NATIVO = 25
MAX_PAGINAS_PDF_NATIVO = 100

# Tolerancia del cuadre. Cero: con Decimal la suma es exacta, así que cualquier
# desviación es un movimiento que falta o que sobra, no un error de redondeo.
TOLERANCIA = Decimal("0.00")


# ---------------------------------------------------------------------------
# Esquema de salida
# ---------------------------------------------------------------------------
#
# No se declara aquí. Vive en `apps/web/contratos/esquema-movimientos.json` y
# lo leen por igual este extractor y la web. Duplicarlo en los dos lenguajes
# garantizaba que acabaran discrepando. Ver el README de esa carpeta.

ESQUEMA_MOVIMIENTOS: dict[str, Any] = esquema_movimientos()

# El prompt tampoco se declara aquí. Es la tercera cosa que los dos motores
# tienen que decirle al modelo palabra por palabra: si la web y el CLI piden la
# extracción con instrucciones distintas, extraen distinto del mismo PDF.
PROMPT_SISTEMA = prompt_extraccion()


# ---------------------------------------------------------------------------
# Modelo de dominio
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Movimiento:
    """Un apunte del extracto. Los importes son Decimal, nunca float."""

    fecha: date
    concepto: str
    importe: Decimal
    fecha_valor: date | None = None
    saldo: Decimal | None = None
    posicion: int = 0


@dataclass
class ResultadoExtraccion:
    """Salida completa de una extracción, con su veredicto de cuadre."""

    documento: str
    movimientos: list[Movimiento] = field(default_factory=list)
    banco: str | None = None
    iban: str | None = None
    periodo_inicio: date | None = None
    periodo_fin: date | None = None
    saldo_inicial: Decimal | None = None
    saldo_final: Decimal | None = None
    paginas_ilegibles: list[int] = field(default_factory=list)
    hallazgos: list[Hallazgo] = field(default_factory=list)

    @property
    def cuadra(self) -> bool:
        """True sólo si ninguna comprobación encontró un incumplimiento."""
        return not any(h.estado == "No cumple" for h in self.hallazgos)

    @property
    def suma_movimientos(self) -> Decimal:
        return sum((m.importe for m in self.movimientos), Decimal("0.00"))


# ---------------------------------------------------------------------------
# Conversiones
# ---------------------------------------------------------------------------


def _a_decimal(valor: str | None) -> Decimal | None:
    """Convierte a Decimal desde la cadena del esquema. Nunca pasa por float."""
    if valor is None:
        return None
    try:
        return Decimal(valor)
    except InvalidOperation:
        return None


def _a_fecha(valor: str | None) -> date | None:
    if not valor:
        return None
    try:
        return datetime.strptime(valor, "%Y-%m-%d").date()
    except ValueError:
        return None


def _formato_es(importe: Decimal) -> str:
    """Formatea para la evidencia: 1234.56 -> «1.234,56 €»."""
    entero, _, decimales = f"{abs(importe):.2f}".partition(".")
    grupos = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    signo = "-" if importe < 0 else ""
    return f"{signo}{'.'.join(grupos)},{decimales} €"


def parsear_respuesta(bruto: dict[str, Any], nombre: str) -> ResultadoExtraccion:
    """Convierte la salida del modelo al modelo de dominio.

    Descarta los apuntes cuyo importe o fecha no se dejan convertir en lugar de
    guardarlos a medias: un movimiento con importe nulo rompería el cuadre sin
    decir por qué.
    """
    movimientos: list[Movimiento] = []
    descartados = 0

    for i, item in enumerate(bruto.get("movimientos") or []):
        importe = _a_decimal(item.get("importe"))
        fecha = _a_fecha(item.get("fecha"))
        if importe is None or fecha is None:
            descartados += 1
            continue
        movimientos.append(
            Movimiento(
                fecha=fecha,
                fecha_valor=_a_fecha(item.get("fecha_valor")),
                concepto=(item.get("concepto") or "").strip(),
                importe=importe,
                saldo=_a_decimal(item.get("saldo")),
                posicion=i,
            )
        )

    res = ResultadoExtraccion(
        documento=nombre,
        movimientos=movimientos,
        banco=bruto.get("banco"),
        iban=(bruto.get("iban") or "").replace(" ", "").upper() or None,
        periodo_inicio=_a_fecha(bruto.get("periodo_inicio")),
        periodo_fin=_a_fecha(bruto.get("periodo_fin")),
        saldo_inicial=_a_decimal(bruto.get("saldo_inicial")),
        saldo_final=_a_decimal(bruto.get("saldo_final")),
        paginas_ilegibles=list(bruto.get("paginas_ilegibles") or []),
    )

    if descartados:
        res.hallazgos.append(
            Hallazgo(
                regla="Integridad de la extracción",
                pagina=1,
                severidad="Alta",
                estado="No cumple",
                descripcion=f"{descartados} apunte(s) sin fecha o importe legibles.",
                evidencia="Devueltos por el modelo con campos incompletos.",
                sugerencia="Revisar esas líneas a mano en el PDF original.",
            )
        )

    return res


# ---------------------------------------------------------------------------
# Validación — la parte que de verdad importa
# ---------------------------------------------------------------------------


def _iban_valido(iban: str) -> bool:
    """Comprueba el IBAN por el algoritmo mod-97 de la norma ISO 13616.

    Comprobar sólo la longitud —como hacía la regla heredada del auditor de
    facturas— deja pasar un dígito cambiado, que es justo el error típico al
    transcribir. El mod-97 lo detecta.
    """
    iban = iban.replace(" ", "").upper()
    if len(iban) < 15 or len(iban) > 34 or not iban[:2].isalpha():
        return False
    reordenado = iban[4:] + iban[:4]
    try:
        numerico = "".join(
            str(int(c, 36)) if c.isalpha() else c for c in reordenado
        )
    except ValueError:
        return False
    if not numerico.isdigit():
        return False
    return int(numerico) % 97 == 1


def validar(res: ResultadoExtraccion) -> ResultadoExtraccion:
    """Aplica las comprobaciones deterministas sobre lo extraído.

    De las 6 reglas del auditor de facturas sólo tres aplican a extractos
    bancarios —cuadre de importes, orden cronológico e IBAN—; firmas y
    protección de datos son de facturas y contratos. A cambio, aquí hay dos
    comprobaciones propias que una factura no necesita: la continuidad del saldo
    apunte a apunte y las páginas que el modelo declaró ilegibles.

    Cada hallazgo cita su evidencia, igual que en `reglas.py`. Y si faltan los
    datos para comprobar algo, se dice — no se da por bueno.
    """
    # --- 1. El cuadre. La comprobación que justifica todo lo demás. ---------
    if res.saldo_inicial is None or res.saldo_final is None:
        cual = "inicial" if res.saldo_inicial is None else "final"
        res.hallazgos.append(
            Hallazgo(
                regla="Cuadre de saldos",
                pagina=1,
                severidad="Media",
                estado="Requiere revisión",
                descripcion=f"No evaluable: el extracto no declara el saldo {cual}.",
                evidencia="Campo ausente en el documento.",
                sugerencia="Sin ambos saldos no se puede verificar que no falten apuntes.",
            )
        )
    else:
        esperado = res.saldo_inicial + res.suma_movimientos
        desvio = esperado - res.saldo_final
        if abs(desvio) > TOLERANCIA:
            res.hallazgos.append(
                Hallazgo(
                    regla="Cuadre de saldos",
                    pagina=1,
                    severidad="Crítica",
                    estado="No cumple",
                    descripcion=(
                        "La suma de los movimientos no lleva del saldo inicial al "
                        f"final: sobran o faltan {_formato_es(abs(desvio))}."
                    ),
                    evidencia=(
                        f"{_formato_es(res.saldo_inicial)} + "
                        f"{_formato_es(res.suma_movimientos)} = "
                        f"{_formato_es(esperado)}, pero el extracto declara "
                        f"{_formato_es(res.saldo_final)}."
                    ),
                    sugerencia=(
                        "La extracción está incompleta. No guardar estos "
                        "movimientos hasta revisar el PDF."
                    ),
                )
            )
        else:
            res.hallazgos.append(
                Hallazgo(
                    regla="Cuadre de saldos",
                    pagina=1,
                    severidad="Informativa",
                    estado="Cumple",
                    descripcion=f"El cuadre da: {len(res.movimientos)} movimientos.",
                    evidencia=(
                        f"{_formato_es(res.saldo_inicial)} + "
                        f"{_formato_es(res.suma_movimientos)} = "
                        f"{_formato_es(res.saldo_final)}."
                    ),
                )
            )

    # --- 2. Orden cronológico ----------------------------------------------
    desordenados = [
        (a, b)
        for a, b in zip(res.movimientos, res.movimientos[1:])
        if b.fecha < a.fecha
    ]
    if desordenados:
        a, b = desordenados[0]
        res.hallazgos.append(
            Hallazgo(
                regla="Orden cronológico",
                pagina=1,
                severidad="Media",
                estado="No cumple",
                descripcion=(
                    f"{len(desordenados)} apunte(s) rompen el orden de fechas."
                ),
                evidencia=(
                    f"«{b.concepto}» ({b.fecha.isoformat()}) va después de "
                    f"«{a.concepto}» ({a.fecha.isoformat()})."
                ),
                sugerencia="Puede indicar páginas leídas fuera de orden.",
            )
        )

    # --- 3. Continuidad del saldo, apunte a apunte -------------------------
    #     Localiza *dónde* se rompe el cuadre, no sólo que se rompe.
    con_saldo = [m for m in res.movimientos if m.saldo is not None]
    if len(con_saldo) >= 2:
        saltos = [
            (a, b)
            for a, b in zip(con_saldo, con_saldo[1:])
            if a.saldo + b.importe != b.saldo  # type: ignore[operator]
        ]
        if saltos:
            a, b = saltos[0]
            res.hallazgos.append(
                Hallazgo(
                    regla="Continuidad del saldo",
                    pagina=1,
                    severidad="Alta",
                    estado="No cumple",
                    descripcion=(
                        f"El saldo salta en {len(saltos)} punto(s): falta algún "
                        "apunte entre medias."
                    ),
                    evidencia=(
                        f"Tras «{a.concepto}» el saldo es {_formato_es(a.saldo)}; "  # type: ignore[arg-type]
                        f"«{b.concepto}» mueve {_formato_es(b.importe)} y deja "
                        f"{_formato_es(b.saldo)}."  # type: ignore[arg-type]
                    ),
                    sugerencia="Revisar el PDF alrededor de ese apunte.",
                )
            )

    # --- 4. IBAN ------------------------------------------------------------
    if res.iban and not _iban_valido(res.iban):
        res.hallazgos.append(
            Hallazgo(
                regla="Identificador de cuenta",
                pagina=1,
                severidad="Alta",
                estado="No cumple",
                descripcion="El IBAN no supera la comprobación mod-97.",
                evidencia=f"Se leyó «{res.iban}» ({len(res.iban)} caracteres).",
                sugerencia="Un dígito mal transcrito; contrastar con el original.",
            )
        )

    # --- 5. Páginas que el modelo no pudo leer ------------------------------
    if res.paginas_ilegibles:
        paginas = ", ".join(str(p) for p in res.paginas_ilegibles)
        res.hallazgos.append(
            Hallazgo(
                regla="Integridad de la extracción",
                pagina=res.paginas_ilegibles[0],
                severidad="Crítica",
                estado="No cumple",
                descripcion=f"El modelo no pudo leer {len(res.paginas_ilegibles)} página(s).",
                evidencia=f"Páginas declaradas ilegibles: {paginas}.",
                sugerencia="Faltan movimientos con seguridad. No guardar sin revisar.",
            )
        )

    return res


# ---------------------------------------------------------------------------
# Motor IA
# ---------------------------------------------------------------------------


def extraer_movimientos(
    datos: bytes,
    nombre: str,
    api_key: str,
    paginas_texto: list[str] | None = None,
) -> ResultadoExtraccion:
    """Extrae los movimientos de un extracto y valida el resultado.

    Adjunta el PDF nativo cuando cabe en los límites de la API — así el modelo
    *ve* la maquetación en columnas, que es justo lo que distingue un importe de
    un saldo. Sólo si no cabe cae al texto plano.
    """
    if not HAS_ANTHROPIC:
        raise RuntimeError(
            "El paquete 'anthropic' no está instalado. Ejecuta: pip install anthropic"
        )

    paginas = len(paginas_texto or [])
    cabe_nativo = len(datos) <= MAX_MB_PDF_NATIVO * 1024 * 1024 and (
        paginas == 0 or paginas <= MAX_PAGINAS_PDF_NATIVO
    )

    contenido: list[dict[str, Any]] = []
    if cabe_nativo:
        contenido.append(
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(datos).decode("ascii"),
                },
            }
        )
        instruccion = "Extrae todos los movimientos del extracto adjunto."
    else:
        instruccion = (
            "Extrae todos los movimientos del siguiente extracto bancario. "
            "El PDF excede los límites de la API, así que trabajas sobre el "
            "texto extraído y pierdes la maquetación en columnas: si no puedes "
            "distinguir un importe de un saldo, declara la página ilegible.\n\n"
            + "\n".join(paginas_texto or [])
        )
    contenido.append({"type": "text", "text": instruccion})

    cliente = anthropic.Anthropic(api_key=api_key)

    # Streaming obligatorio: con este max_tokens una petición sin streaming se
    # come el tiempo de espera HTTP del SDK antes de terminar.
    with cliente.messages.stream(
        model=MODELO_IA,
        max_tokens=MAX_TOKENS_IA,
        system=PROMPT_SISTEMA,
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": ESQUEMA_MOVIMIENTOS},
        },
        messages=[{"role": "user", "content": contenido}],
    ) as flujo:
        respuesta = flujo.get_final_message()

    # El modelo puede declinar. Comprobar antes de leer content: en una negativa
    # previa a la salida, content viene vacío y content[0] reventaría.
    if respuesta.stop_reason == "refusal":
        raise RuntimeError(
            "El modelo ha declinado procesar este documento. Revisa su contenido."
        )
    if respuesta.stop_reason == "max_tokens":
        raise RuntimeError(
            "La respuesta se ha truncado: el extracto tiene más movimientos de "
            f"los que caben en {MAX_TOKENS_IA} tokens. Divídelo por periodos."
        )

    bruto = next(
        (b.text for b in respuesta.content if getattr(b, "type", "") == "text"), ""
    )
    if not bruto:
        raise RuntimeError("El modelo no ha devuelto contenido de texto.")

    return validar(parsear_respuesta(json.loads(bruto), nombre))
