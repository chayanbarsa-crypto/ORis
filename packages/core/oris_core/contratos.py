"""Carga de los contratos compartidos con la web.

El esquema de extracción y las reglas de categorización no se declaran aquí:
viven como JSON en `apps/web/contratos/` y los leen tanto Python como
TypeScript. Ver el README de esa carpeta para el porqué.

Este módulo sólo resuelve la ruta y valida lo mínimo para que un fichero
corrupto falle al arrancar y no a mitad de una extracción.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

# oris_core/ -> core/ -> packages/ -> raíz del repositorio.
_RAIZ = Path(__file__).resolve().parents[3]
_POR_DEFECTO = _RAIZ / "apps" / "web" / "contratos"


def carpeta() -> Path:
    """Dónde están los contratos.

    `ORIS_CONTRATOS` permite apuntar a otro sitio sin tocar código, que es lo
    que hace falta cuando `oris_core` se instala fuera del repositorio.
    """
    manual = os.environ.get("ORIS_CONTRATOS")
    return Path(manual) if manual else _POR_DEFECTO


def _leer(nombre: str) -> Any:
    ruta = carpeta() / nombre
    try:
        with ruta.open(encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as e:
        raise FileNotFoundError(
            f"No encuentro el contrato {nombre} en {ruta}. Si oris_core está "
            "fuera del repositorio, define ORIS_CONTRATOS con la ruta a "
            "apps/web/contratos."
        ) from e


def esquema_movimientos() -> dict[str, Any]:
    """El JSON Schema estricto que debe cumplir la extracción."""
    esquema = _leer("esquema-movimientos.json")
    if not isinstance(esquema, dict) or esquema.get("additionalProperties") is not False:
        raise ValueError(
            "esquema-movimientos.json no es estricto: sin "
            "additionalProperties=false el modelo puede inventarse claves."
        )
    return esquema


def reglas_base() -> list[dict[str, Any]]:
    """Las reglas deterministas de categorización, tal cual están en el JSON."""
    reglas = _leer("reglas-base.json")
    if not isinstance(reglas, list) or not reglas:
        raise ValueError("reglas-base.json debe ser una lista no vacía de reglas.")
    return reglas


def prompt_extraccion() -> str:
    """Las instrucciones que recibe el modelo al extraer un extracto.

    Va en un JSON y no como constante de Python por la misma razón que el
    esquema:
    la web pide la extracción con estas mismas palabras. Dos prompts distintos
    sobre el mismo PDF dan dos extracciones distintas.
    """
    datos = _leer("prompt-extraccion.json")
    texto = datos.get("sistema", "") if isinstance(datos, dict) else ""
    if not isinstance(texto, str) or not texto.strip():
        raise ValueError("prompt-extraccion.json no trae la clave 'sistema'.")
    return texto.strip()
