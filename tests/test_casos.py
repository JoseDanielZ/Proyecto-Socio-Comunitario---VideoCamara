import json
from pathlib import Path

import pytest

from lpr.casos import CASOS, CASOS_DIR, RAIZ, CasoError, construir_comando, main


def test_all_cases_present_with_scripts():
    assert set(CASOS) == {"linea", "tracking", "flujo", "velocidad", "tiempo", "conteo", "calor"}
    for caso in CASOS.values():
        carpeta = CASOS_DIR / caso.carpeta
        assert carpeta.is_dir(), carpeta
        assert (carpeta / "LEEME.md").exists()
        if caso.clave == "linea":
            continue
        for variante in caso.variantes.values():
            assert (carpeta / variante.script).exists(), f"{caso.clave}: {variante.script}"


def test_copied_scripts_are_valid_python():
    for script in CASOS_DIR.glob("0[1-6]_*/**/*.py"):
        compile(script.read_text(encoding="utf-8"), str(script), "exec")


def test_local_patches_are_marked():
    for carpeta, archivo in [
        ("02_flujo_vehicular", "ultralytics_example.py"),
        ("03_velocidad", "ultralytics_example.py"),
        ("04_tiempo_en_zona", "ultralytics_file_example.py"),
        ("06_mapa_de_calor", "script.py"),
    ]:
        assert "# LOCAL" in (CASOS_DIR / carpeta / archivo).read_text(encoding="utf-8")


def test_builds_command_with_absolute_paths_and_default_output():
    comando, cwd = construir_comando(
        "tracking", video="data/videos/a.mp4", weights="models/w.pt", python="py"
    )
    assert cwd == CASOS_DIR / "01_tracking"
    assert comando[:2] == ["py", "ultralytics_example.py"]
    valores = dict(zip(comando[2::2], comando[3::2]))
    assert Path(valores["--source_video_path"]) == (Path("data/videos/a.mp4")).resolve()
    assert Path(valores["--source_weights_path"]).is_absolute()
    assert Path(valores["--target_video_path"]).name == "tracking_ultralytics.mp4"


def test_extra_args_are_appended_last():
    comando, _ = construir_comando(
        "calor", video="a.mp4", weights="w.pt", extra=["--classes", "[0,1]"], python="py"
    )
    assert comando[-2:] == ["--classes", "[0,1]"]


def test_flujo_passes_zone_config_flag():
    comando, _ = construir_comando(
        "flujo", video="a.mp4", weights="w.pt", config="z.json", python="py"
    )
    assert "--zones_config_path" in comando


def test_velocidad_maps_weights_and_calibration_flags():
    comando, _ = construir_comando(
        "velocidad", video="a.mp4", weights="w.pt", config="c.json", python="py"
    )
    assert "--weights" in comando and "--calibration_path" in comando


def test_linea_runs_project_pipeline_with_default_config():
    comando, cwd = construir_comando("linea", video="a.mp4", python="py")
    assert comando[:3] == ["py", "-m", "lpr.main"]
    assert "--config" in comando and "--video" in comando
    assert cwd == RAIZ


def test_unknown_case_is_rejected():
    with pytest.raises(CasoError, match="no existe"):
        construir_comando("inexistente", video="a.mp4")


def test_unknown_variant_is_rejected():
    with pytest.raises(CasoError, match="variante"):
        construir_comando("tracking", variante="yolo_nas", video="a.mp4")


def test_missing_required_option_is_rejected():
    with pytest.raises(CasoError, match="--weights"):
        construir_comando("tracking", video="a.mp4")
    with pytest.raises(CasoError, match="--config"):
        construir_comando("tiempo", video="a.mp4")


def test_option_not_supported_by_variant_is_rejected():
    with pytest.raises(CasoError, match="no admite --weights"):
        construir_comando("tracking", variante="rfdetr", video="a.mp4", weights="w.pt")


def test_main_reports_error_with_exit_code_2(capsys):
    assert main(["run", "inexistente", "--video", "a.mp4"]) == 2
    assert "no existe" in capsys.readouterr().err


def test_list_command_prints_every_case(capsys):
    assert main(["list"]) == 0
    salida = capsys.readouterr().out
    for clave in CASOS:
        assert clave in salida


def _cargar(carpeta: str, nombre: str):
    return json.loads((CASOS_DIR / carpeta / "config" / nombre).read_text(encoding="utf-8"))


def test_drone_zone_configs_are_valid():
    flujo = _cargar("02_flujo_vehicular", "zonas_dron_carretera.json")
    assert len(flujo["zone_in"]) == len(flujo["zone_out"]) <= 4
    assert all(len(p) >= 3 for p in flujo["zone_in"] + flujo["zone_out"])

    calibracion = _cargar("03_velocidad", "calibracion_dron_carretera.json")
    assert len(calibracion["source"]) == 4
    assert calibracion["target_width"] > 0 and calibracion["target_height"] > 0

    tiempo = _cargar("04_tiempo_en_zona", "zonas_dron_carretera.json")
    assert all(len(p) >= 3 for p in tiempo)

    conteo = _cargar("05_conteo_en_zona", "zonas_dron_carretera.json")
    assert all(len(p) >= 3 for p in conteo["polygons"])
