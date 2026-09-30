"""Lanzador de los casos de uso de la carpeta casos/ (copias de los ejemplos de
roboflow/supervision). Uso:

    python -m lpr.casos list
    python -m lpr.casos run flujo --video data/videos/x.mp4 --weights models/y.pt
    python -m lpr.casos descargar velocidad
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CASOS_DIR = RAIZ / "casos"
SALIDA_DIR = RAIZ / "data" / "output"

# Opciones genéricas del lanzador; cada script upstream las llama distinto.
OPCIONES = ("video", "weights", "out", "config")


class CasoError(Exception):
    pass


@dataclass(frozen=True)
class Variante:
    script: str  # relativo a la carpeta del caso
    flags: dict[str, str]  # opción genérica -> flag del script
    obligatorias: tuple[str, ...] = ("video",)


@dataclass(frozen=True)
class Caso:
    clave: str
    carpeta: str
    titulo: str
    descripcion: str
    variantes: dict[str, Variante] = field(default_factory=dict)
    descarga: tuple[str, ...] | None = None  # comando (relativo a la carpeta) para bajar datos de ejemplo
    modelo_por_defecto: str = "ultralytics"


_VIDEO = "--source_video_path"
_OUT = "--target_video_path"

CASOS: dict[str, Caso] = {
    "linea": Caso(
        clave="linea",
        carpeta="00_linea_tipo_color",
        titulo="Cruce de línea con tipo y color (caso propio)",
        descripcion=(
            "Cuenta los vehículos que cruzan una línea y registra tipo (auto/bus/camión/moto) y color. "
            "Usa src/lpr y config/config.yaml."
        ),
        variantes={
            "propio": Variante(
                script="(lpr.main)",
                flags={"video": "--video", "out": "--output", "config": "--config"},
                obligatorias=(),
            )
        },
        modelo_por_defecto="propio",
    ),
    "tracking": Caso(
        clave="tracking",
        carpeta="01_tracking",
        titulo="Detección + tracking + anotación",
        descripcion="Detecta y sigue todos los objetos del video con ID persistente. Base más simple.",
        variantes={
            "ultralytics": Variante(
                "ultralytics_example.py",
                {"video": _VIDEO, "weights": "--source_weights_path", "out": _OUT},
                ("video", "weights"),
            ),
            "rfdetr": Variante("rfdetr_example.py", {"video": _VIDEO, "out": _OUT}),
        },
    ),
    "flujo": Caso(
        clave="flujo",
        carpeta="02_flujo_vehicular",
        titulo="Flujo vehicular entre zonas de entrada y salida",
        descripcion=(
            "Cuenta cuántos vehículos van de cada zona de entrada a cada zona de salida. "
            "Las zonas van en un JSON (--config); ver casos/02_flujo_vehicular/config/."
        ),
        variantes={
            "ultralytics": Variante(
                "ultralytics_example.py",
                {"video": _VIDEO, "weights": "--source_weights_path", "out": _OUT, "config": "--zones_config_path"},
                ("video", "weights"),
            ),
            "rfdetr": Variante(
                "rfdetr_example.py",
                {"video": _VIDEO, "out": _OUT, "config": "--zones_config_path"},
            ),
        },
        descarga=("bash", "setup.sh"),
    ),
    "velocidad": Caso(
        clave="velocidad",
        carpeta="03_velocidad",
        titulo="Estimación de velocidad (km/h)",
        descripcion=(
            "Velocidad de cada vehículo mediante transformación de perspectiva. Requiere calibrar "
            "(--config, ver casos/03_velocidad/config/): 4 puntos de la imagen y su tamaño real en metros."
        ),
        variantes={
            "ultralytics": Variante(
                "ultralytics_example.py",
                {"video": _VIDEO, "weights": "--weights", "out": _OUT, "config": "--calibration_path"},
                ("video",),
            ),
            "rfdetr": Variante(
                "rfdetr_example.py", {"video": _VIDEO, "out": _OUT, "config": "--calibration_path"}
            ),
        },
        descarga=("python", "video_downloader.py"),
    ),
    "tiempo": Caso(
        clave="tiempo",
        carpeta="04_tiempo_en_zona",
        titulo="Tiempo de permanencia en zonas",
        descripcion=(
            "Cuánto tiempo pasa cada objeto dentro de cada zona poligonal (--config: JSON con la lista de "
            "polígonos; ver casos/04_tiempo_en_zona/config/). Variantes de archivo; las de RTSP se lanzan a mano."
        ),
        variantes={
            "ultralytics": Variante(
                "ultralytics_file_example.py",
                {"video": _VIDEO, "weights": "--weights", "out": _OUT, "config": "--zone_configuration_path"},
                ("video", "config"),
            ),
        },
    ),
    "conteo": Caso(
        clave="conteo",
        carpeta="05_conteo_en_zona",
        titulo="Conteo de objetos por zona",
        descripcion=(
            "Cuenta cuántos objetos hay dentro de cada polígono en cada momento (--config: JSON "
            '{"polygons": [...]}; plantillas en casos/05_conteo_en_zona/data/ y config/).'
        ),
        variantes={
            "ultralytics": Variante(
                "ultralytics_example.py",
                {"video": _VIDEO, "weights": "--source_weights_path", "out": _OUT, "config": "--zone_configuration_path"},
                ("video", "config"),
            ),
            "rfdetr": Variante(
                "rfdetr_example.py",
                {"video": _VIDEO, "out": _OUT, "config": "--zone_configuration_path"},
                ("video", "config"),
            ),
        },
        descarga=("bash", "setup.sh"),
    ),
    "calor": Caso(
        clave="calor",
        carpeta="06_mapa_de_calor",
        titulo="Mapa de calor de movimiento",
        descripcion=(
            "Acumula las posiciones de los objetos trackeados en un mapa de calor. Por defecto solo "
            "personas (clase 0 de COCO); con otro modelo pasar --classes '[0,1,2,3]' como argumento extra."
        ),
        variantes={
            "ultralytics": Variante(
                "script.py",
                {"video": _VIDEO, "weights": "--source_weights_path", "out": _OUT},
                ("video", "weights"),
            ),
            "rfdetr": Variante("rfdetr_example.py", {"video": _VIDEO, "out": _OUT}),
        },
    ),
}


def python_de_casos() -> str:
    """Intérprete con las dependencias de los casos (.venv-casos); si no existe, el actual."""
    for candidato in (RAIZ / ".venv-casos" / "Scripts" / "python.exe", RAIZ / ".venv-casos" / "bin" / "python"):
        if candidato.exists():
            return str(candidato)
    return sys.executable


def obtener_caso(clave: str) -> Caso:
    caso = CASOS.get(clave)
    if caso is None:
        raise CasoError(f"Caso '{clave}' no existe. Casos disponibles: {', '.join(CASOS)}")
    return caso


def _ruta(valor: str) -> str:
    # Los scripts corren con cwd en la carpeta del caso: se pasan rutas absolutas.
    return str(Path(valor).resolve())


def salida_por_defecto(caso: Caso, variante: str) -> Path:
    return SALIDA_DIR / f"{caso.clave}_{variante}.mp4"


def construir_comando(
    clave: str,
    variante: str | None = None,
    video: str | None = None,
    weights: str | None = None,
    out: str | None = None,
    config: str | None = None,
    extra: list[str] | None = None,
    python: str | None = None,
) -> tuple[list[str], Path]:
    """Devuelve (comando, directorio de trabajo) para ejecutar un caso."""
    caso = obtener_caso(clave)
    variante = variante or caso.modelo_por_defecto
    if variante not in caso.variantes:
        raise CasoError(
            f"El caso '{clave}' no tiene la variante '{variante}'. Disponibles: {', '.join(caso.variantes)}"
        )
    v = caso.variantes[variante]
    dados = {"video": video, "weights": weights, "out": out, "config": config}

    for opcion in v.obligatorias:
        if not dados[opcion]:
            raise CasoError(f"El caso '{clave}' ({variante}) necesita --{opcion}")
    for opcion, valor in dados.items():
        if valor and opcion not in v.flags:
            raise CasoError(f"El caso '{clave}' ({variante}) no admite --{opcion}")

    if "out" in v.flags and not out:
        dados["out"] = str(salida_por_defecto(caso, variante))

    argumentos: list[str] = []
    for opcion in OPCIONES:
        valor = dados[opcion]
        if valor and opcion in v.flags:
            argumentos += [v.flags[opcion], _ruta(valor)]
    argumentos += extra or []

    if clave == "linea":
        return [python or sys.executable, "-m", "lpr.main"] + _con_config_por_defecto(argumentos), RAIZ

    carpeta = CASOS_DIR / caso.carpeta
    return [python or python_de_casos(), v.script, *argumentos], carpeta


def _con_config_por_defecto(argumentos: list[str]) -> list[str]:
    if "--config" in argumentos:
        return argumentos
    return ["--config", str(RAIZ / "config" / "config.yaml"), *argumentos]


def _entorno_con_scripts() -> dict[str, str]:
    """Pone la carpeta de scripts del entorno de casos en PATH (para 'gdown')."""
    entorno = dict(os.environ)
    scripts = Path(python_de_casos()).parent
    entorno["PATH"] = str(scripts) + os.pathsep + entorno.get("PATH", "")
    return entorno


def cmd_list() -> None:
    print(f"Casos disponibles (carpeta {CASOS_DIR}):\n")
    for caso in CASOS.values():
        print(f"  {caso.clave:<10} {caso.titulo}")
        print(f"  {'':<10} {caso.descripcion}")
        print(f"  {'':<10} variantes: {', '.join(caso.variantes)}   carpeta: casos/{caso.carpeta}\n")


def cmd_run(args: argparse.Namespace, extra: list[str]) -> int:
    comando, cwd = construir_comando(
        args.caso, args.variante, args.video, args.weights, args.out, args.config, extra
    )
    SALIDA_DIR.mkdir(parents=True, exist_ok=True)
    print("Ejecutando:", " ".join(comando), f"\n(cwd: {cwd})")
    return subprocess.run(comando, cwd=cwd, env=_entorno_con_scripts()).returncode


def cmd_descargar(clave: str) -> int:
    caso = obtener_caso(clave)
    if not caso.descarga:
        print(f"El caso '{clave}' no tiene datos de ejemplo para descargar (usa tu propio video).")
        return 0
    comando = list(caso.descarga)
    if comando[0] == "python":
        comando[0] = python_de_casos()
    print("Ejecutando:", " ".join(comando), f"(cwd: casos/{caso.carpeta})")
    return subprocess.run(comando, cwd=CASOS_DIR / caso.carpeta, env=_entorno_con_scripts()).returncode


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")  # acentos en consolas de Windows
    parser = argparse.ArgumentParser(prog="python -m lpr.casos", description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="accion", required=True)
    sub.add_parser("list", help="Lista los casos disponibles")

    run = sub.add_parser("run", help="Ejecuta un caso; lo que vaya tras -- se pasa al script")
    run.add_argument("caso")
    run.add_argument("--variante", help="ultralytics | rfdetr | propio (según el caso)")
    run.add_argument("--video")
    run.add_argument("--weights", help="pesos del detector (.pt)")
    run.add_argument("--out", help="video de salida (por defecto data/output/<caso>_<variante>.mp4)")
    run.add_argument("--config", help="JSON de zonas/calibración (o config.yaml en el caso 'linea')")

    desc = sub.add_parser("descargar", help="Baja los datos de ejemplo del caso (video/modelo upstream)")
    desc.add_argument("caso")

    argv = sys.argv[1:] if argv is None else argv
    extra: list[str] = []
    if "--" in argv:
        corte = argv.index("--")
        argv, extra = argv[:corte], argv[corte + 1 :]
    args = parser.parse_args(argv)

    try:
        if args.accion == "list":
            cmd_list()
            return 0
        if args.accion == "run":
            return cmd_run(args, extra)
        return cmd_descargar(args.caso)
    except CasoError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
