# Casos de uso

Cada carpeta es un caso ya codificado (copiado de los ejemplos de [supervision](https://github.com/roboflow/supervision),
ver `UPSTREAM.md`). Se lanzan con un solo comando; cada carpeta tiene su `LEEME.md`.

| Clave | Carpeta | Qué hace |
|---|---|---|
| `linea` | `00_linea_tipo_color` | Cuenta vehículos que cruzan una línea, con tipo y color (caso propio) |
| `tracking` | `01_tracking` | Detección + tracking con IDs |
| `flujo` | `02_flujo_vehicular` | Cuántos vehículos van de una zona de entrada a una de salida |
| `velocidad` | `03_velocidad` | Velocidad (km/h) por vehículo, con calibración de perspectiva |
| `tiempo` | `04_tiempo_en_zona` | Tiempo de permanencia en zonas |
| `conteo` | `05_conteo_en_zona` | Objetos dentro de cada polígono |
| `calor` | `06_mapa_de_calor` | Mapa de calor de movimiento |

```powershell
python -m lpr.casos list
python -m lpr.casos run <clave> --video RUTA [--weights PESOS] [--config JSON] [--out SALIDA] [-- args extra]
python -m lpr.casos descargar <clave>     # datos de ejemplo originales, si el caso los tiene
```

## Entornos

- Caso `linea`: el `.venv` del proyecto.
- Casos 01–06: `.venv-casos` (`python -m venv .venv-casos` y `.venv-casos\Scripts\pip install -r casos\requirements.txt`).
  El lanzador lo usa solo si existe. Las variantes `inference_*` (Roboflow Inference) no se pueden usar en
  Python 3.14 y además piden API key.

## Qué modelo usar

| Escena | Pesos |
|---|---|
| Vista aérea / dron | `models/geotrax_hbb_yolov8s_1920_v1.pt` (`python -m lpr.download_models`); clases 0 car, 1 bus, 2 truck, 3 motorcycle |
| Cámara a nivel de calle o personas | YOLO COCO (`yolov8s.pt`, `yolo11x.pt`): 0 persona, 2 auto, 3 moto, 5 bus, 7 camión |

Las variantes `rfdetr` usan RF-DETR con clases COCO y no aceptan pesos propios: no ven bien vehículos desde arriba.
