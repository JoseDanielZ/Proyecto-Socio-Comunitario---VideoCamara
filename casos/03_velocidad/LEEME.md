# 03 · Estimación de velocidad (km/h)

Velocidad de cada vehículo con una transformación de perspectiva imagen → plano de la calle.
Origen: `examples/speed_estimation`. **Hay que calibrar por cámara.**

```powershell
python -m lpr.casos run velocidad --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt `
  --config casos/03_velocidad/config/calibracion_dron_carretera.json
```

- Calibración: JSON con `source` (4 puntos de la imagen), `target_width` y `target_height` **en metros**. El eje Y del destino es la dirección de la marcha.
- La escala del ejemplo del dron es una estimación (auto ≈ 4,5 m); con un dron en movimiento la velocidad es relativa a la cámara.
- Sin `--weights` usa `yolo11x.pt` (COCO). Datos de ejemplo originales: `python -m lpr.casos descargar velocidad`.
- Parches locales (`# LOCAL`): `--calibration_path` y `--weights`.
