"""
Categorización de movimientos.

El orden importa y no es el obvio: **primero las reglas, y sólo lo que no case
va al modelo**. No es una optimización de coste, aunque también lo sea. Es que
una regla es determinista y auditable —«casó con este patrón»— mientras que una
categoría puesta por el modelo hay que revisarla. Cuanto menos trabajo le toque
al modelo, menos hay que revisar.

Tres decisiones:

1. **Las reglas casan patrones, no comercios.** Sobre un extracto real de 92
   movimientos, las raíces de comercio que se repiten cubren el 53 %. Pero mirando
   las que aparecían una sola vez —CASQUERIA, FRUTERIA, LIDL, EL SABROSO,
   ALITAS— resulta que casi todas son alimentación. Una regla por comercio exacto
   deja fuera al comercio nuevo; una por patrón lo caza la primera vez.

2. **Lo manual gana siempre.** `origen = 'manual'` no lo sobrescribe ni una regla
   ni el modelo. Sin esta garantía, un reprocesado borra en silencio el trabajo
   del usuario — y como el resultado *parece* bien categorizado, no se nota.

3. **Un traspaso entre cuentas propias no es ingreso ni gasto.** En el extracto
   real, 8 de los 15 ingresos eran transferencias del titular a sí mismo. Contarlas
   como ingreso infla los ingresos del mes en cientos de euros y descuadra
   cualquier presupuesto. Es la categoría que más equivocaciones evita.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Iterable, Literal

from .contratos import reglas_base

Origen = Literal["regla", "ia", "manual"]

# ---------------------------------------------------------------------------
# Normalización del concepto
# ---------------------------------------------------------------------------

# El tipo de operación no es el comercio: «Transacción con tarjeta AHORRAMAS»
# es una compra en AHORRAMAS, y dejar el prefijo hace que todos los pagos con
# tarjeta parezcan el mismo comercio.
_TIPOS = re.compile(
    r"^(TRANSACCION CON TARJETA|TRANSFERENCIA|OPERAR|RECIBO"
    r"|ADEUDO|BIZUM|PAGO|COMPRA|CARGO|ABONO)\b\s*"
)

# Coletillas del banco que no identifican a nadie.
#
# ⚠️ Lo que se borra aquí deja de existir para las reglas. «MARKUP» parece
# ruido —lo añade el banco, no el comercio— pero es justo lo que distingue una
# comisión de cambio de la compra que la originó. Borrarlo dejaba la regla de
# Comisiones sin nada que casar, en silencio y con prioridad 90.
# Regla general: si una regla depende de una palabra, esa palabra no es ruido.
_RUIDO = re.compile(
    r"\b(EXCHANGE RATE ECB|INCOMING TRANSFER FROM|OUTGOING TRANSFER FOR"
    r"|INTEREST PAYMENT|BUY TRADE|SELL TRADE|SAVINGS PLAN EXECUTION"
    r"|DIVIDEND FOR ISIN|PENDING)\b"
)

_IBAN = re.compile(r"\bES\d{22}\b")
_ISIN = re.compile(r"\b[A-Z]{2}[0-9A-Z]{10}\b")
# Ojo con los puntos: «S.L.» se queda en «S L» al retirar los signos, y un
# \b(SL)\b no casa con eso. Por eso el patrón admite la forma separada.
_FORMA_JURIDICA = re.compile(r"\b(S ?L ?U|S ?L|S ?A|SCA|CB|SCOOP)\b\s*$|\b(S ?L ?U|S ?L|S ?A|SCA|CB|SCOOP)\b")


def normalizar_concepto(concepto: str) -> str:
    """Reduce un concepto bancario a su raíz de comercio.

    «Transacción con tarjeta AHORRAMAS S.L. 4521» -> «AHORRAMAS»

    Sin esto, el mismo comercio se cuenta varias veces porque el banco le añade
    referencias, forma jurídica o el tipo de operación delante.
    """
    txt = unicodedata.normalize("NFKD", concepto)
    txt = txt.encode("ascii", "ignore").decode().upper()
    txt = re.sub(r"\s+", " ", txt).strip()
    txt = _TIPOS.sub("", txt)
    txt = _RUIDO.sub(" ", txt)
    txt = _IBAN.sub(" ", txt)
    txt = _ISIN.sub(" ", txt)
    txt = re.sub(r"\b\d+\b", " ", txt)
    txt = re.sub(r"[^A-Z ]+", " ", txt)          # antes de la forma jurídica
    txt = re.sub(r"\s+", " ", txt).strip()
    txt = _FORMA_JURIDICA.sub(" ", txt)
    return re.sub(r"\s+", " ", txt).strip()


# ---------------------------------------------------------------------------
# Reglas
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Regla:
    """Una regla de categorización.

    `patron` casa contra el concepto **normalizado**. `prioridad` desempata
    cuando varias casan: gana la más alta, y a igualdad gana la primera.

    `signo` restringe la regla a cargos o a abonos. Hace falta porque el mismo
    texto significa cosas distintas según la dirección: una transferencia a tu
    propio nombre es un traspaso entrante o saliente, no lo mismo.
    """

    categoria: str
    patron: str
    prioridad: int = 0
    signo: Literal["cargo", "abono", "cualquiera"] = "cualquiera"
    #: Sobre qué texto casa el patrón. `raiz` es el concepto normalizado —lo
    #: normal—; `crudo` es el concepto tal cual vino del banco.
    #:
    #: Hace falta porque la normalización borra a propósito IBAN, ISIN y
    #: referencias: son ruido para identificar un comercio. Pero una regla que
    #: busca *precisamente* un IBAN no encontraría nunca nada sobre la raíz.
    #: Dos veces me ha mordido este mismo fallo —una con «MARKUP», otra con el
    #: IBAN—, y las dos en silencio: la regla existe, tiene prioridad alta, y
    #: no casa jamás.
    sobre: Literal["raiz", "crudo"] = "raiz"

    def casa(self, raiz: str, crudo: str, importe: Decimal) -> bool:
        if self.signo == "cargo" and importe >= 0:
            return False
        if self.signo == "abono" and importe <= 0:
            return False
        texto = raiz if self.sobre == "raiz" else crudo.upper()
        return re.search(self.patron, texto) is not None


# El catálogo se carga del contrato compartido, no se declara aquí: la web
# aplica exactamente las mismas reglas y una segunda copia en TypeScript
# acabaría discrepando de ésta. Ver apps/web/contratos/README.md.
REGLAS_BASE: tuple[Regla, ...] = tuple(Regla(**r) for r in reglas_base())

# El nombre exacto de la categoría que no es ni ingreso ni gasto. Como cadena
# suelta aparecía en tres sitios; escrito distinto en uno solo, los traspasos
# dejarían de excluirse de los totales sin dar ningún error.
CATEGORIA_TRASPASO = "Traspaso entre cuentas propias"


# ---------------------------------------------------------------------------
# Motor
# ---------------------------------------------------------------------------


@dataclass
class Asignacion:
    """Resultado de categorizar un movimiento."""

    posicion: int
    concepto: str
    raiz: str
    categoria: str | None
    origen: Origen | None
    regla: str | None = None


@dataclass
class ResultadoCategorizacion:
    asignaciones: list[Asignacion] = field(default_factory=list)

    @property
    def por_regla(self) -> list[Asignacion]:
        return [a for a in self.asignaciones if a.origen == "regla"]

    @property
    def sin_categorizar(self) -> list[Asignacion]:
        """Lo que hay que mandar al modelo. Cuanto más corta, mejor."""
        return [a for a in self.asignaciones if a.categoria is None]

    @property
    def cobertura(self) -> float:
        if not self.asignaciones:
            return 0.0
        cubiertos = len(self.asignaciones) - len(self.sin_categorizar)
        return cubiertos / len(self.asignaciones)


def categorizar(
    movimientos: Iterable[dict],
    reglas: Iterable[Regla] = REGLAS_BASE,
) -> ResultadoCategorizacion:
    """Aplica las reglas a los movimientos.

    Cada movimiento es un dict con al menos `concepto` e `importe`. Si trae
    `categoria` con `origen = 'manual'`, se respeta sin tocarlo — ver decisión 2
    de la cabecera del módulo.
    """
    ordenadas = sorted(reglas, key=lambda r: -r.prioridad)
    resultado = ResultadoCategorizacion()

    for i, mov in enumerate(movimientos):
        concepto = mov.get("concepto", "")
        importe = Decimal(str(mov.get("importe", "0")))
        posicion = mov.get("posicion", i)

        # Lo manual es intocable. Ni se evalúan las reglas.
        if mov.get("origen") == "manual" and mov.get("categoria"):
            resultado.asignaciones.append(
                Asignacion(posicion, concepto, normalizar_concepto(concepto),
                           mov["categoria"], "manual")
            )
            continue

        raiz = normalizar_concepto(concepto)
        elegida = next(
            (r for r in ordenadas if r.casa(raiz, concepto, importe)), None
        )

        resultado.asignaciones.append(
            Asignacion(
                posicion=posicion,
                concepto=concepto,
                raiz=raiz,
                categoria=elegida.categoria if elegida else None,
                origen="regla" if elegida else None,
                regla=elegida.patron if elegida else None,
            )
        )

    return resultado


# ---------------------------------------------------------------------------
# Reglas personales — la mitad que ningún catálogo puede traer de fábrica
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class Perfil:
    """Lo que ORis necesita saber del titular para categorizar bien.

    Sobre un extracto real, la categoría más frecuente entre las que las reglas
    genéricas NO cazaban era «transferencia del titular a sí mismo»: 8 de 92
    movimientos, todos con el nombre completo del titular en el concepto.

    Ningún catálogo de comercios puede traer eso de fábrica, y es justo el caso
    donde equivocarse cuesta más caro: contar un traspaso propio como ingreso
    infla los ingresos del mes y descuadra el presupuesto entero.

    Los bancos tampoco ayudan: Trade Republic escribe «Incoming transfer from
    <NOMBRE>» sin usar nunca la palabra «traspaso», así que buscar esa palabra
    no encuentra nada.
    """

    nombre: str = ""
    ibans: tuple[str, ...] = ()
    #: Personas cuyos movimientos son transferencias personales, no compras.
    allegados: tuple[str, ...] = ()


def _patron_nombre(nombre: str) -> str:
    """Patrón tolerante a que el banco recorte o reordene el nombre.

    «JORDY CHAYANN VICENTE ABAD» debe casar aunque el concepto traiga sólo
    «JORDY VICENTE» o el nombre truncado por ancho de columna. Se exige que
    aparezcan al menos las dos primeras palabras significativas.
    """
    partes = [p for p in normalizar_concepto(nombre).split() if len(p) > 2]
    if not partes:
        return r"(?!x)x"  # patrón que nunca casa
    if len(partes) == 1:
        return r"\b" + re.escape(partes[0]) + r"\b"
    return r"\b" + re.escape(partes[0]) + r"\b.*\b" + re.escape(partes[1]) + r"\b"


def reglas_para(perfil: Perfil, base: Iterable[Regla] = REGLAS_BASE) -> tuple[Regla, ...]:
    """Devuelve el catálogo base más las reglas que dependen del titular."""
    personales: list[Regla] = []

    if perfil.nombre:
        # Prioridad 110: por encima de todo, incluida la regla genérica de
        # traspaso. Si el concepto lleva tu nombre, es dinero tuyo moviéndose
        # entre cuentas tuyas — no es ingreso ni gasto, pase lo que pase.
        personales.append(
            Regla(CATEGORIA_TRASPASO, _patron_nombre(perfil.nombre), 110)
        )

    for iban in perfil.ibans:
        personales.append(
            Regla(
                CATEGORIA_TRASPASO,
                r"\b" + re.escape(iban.upper()) + r"\b",
                110,
                sobre="crudo",   # la normalización borra los IBAN a propósito
            )
        )

    for persona in perfil.allegados:
        personales.append(
            Regla("Transferencias personales", _patron_nombre(persona), 105)
        )

    return tuple(personales) + tuple(base)
