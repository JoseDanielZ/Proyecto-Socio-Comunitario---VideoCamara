# 02 · Flujo vehicular entre zonas

Cuenta cuántos vehículos van de cada zona de **entrada** a cada zona de **salida** (número sobre la
zona de salida, del color de la de entrada). Origen: `examples/traffic_analysis`.

```powershell
python -m lpr.casos run flujo --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt `
  --config casos/02_flujo_vehicular/config/zonas_dron_carretera.json
```

- Zonas: JSON `{"zone_in": [polígonos], "zone_out": [polígonos]}` (mismo número, máximo 4 pares). Sin `--config` se usan las del video original de supervision.
- Datos de ejemplo originales: `python -m lpr.casos descargar flujo` (Google Drive vía gdown).
- Parche local (marcado `# LOCAL`): parámetro `--zones_config_path`.
