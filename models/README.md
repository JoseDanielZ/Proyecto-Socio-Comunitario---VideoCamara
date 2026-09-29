# models/

Aquí se guardan los pesos de los modelos usados por el pipeline. No se versionan en git (ver `.gitignore`).

- `yolov8n.pt` — detector de vehículos/motos. Se descarga automáticamente la primera vez que corre `ultralytics` si no está presente aquí; también se puede descargar manualmente desde [Ultralytics](https://github.com/ultralytics/ultralytics).
- Modelos de `fast-alpr` (detección y OCR de placa) — se descargan automáticamente en el caché de la librería la primera vez que se usa `ALPR(...)`; no requieren colocarse manualmente en esta carpeta salvo que se usen pesos personalizados (ver `plate_detector_model`/`ocr_model` en `config/config.yaml`).
