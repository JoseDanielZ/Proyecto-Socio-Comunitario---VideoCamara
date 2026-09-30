# 05 · Conteo de objetos por zona

Cuántos objetos hay dentro de cada polígono en cada momento. Origen: `examples/count_people_in_zone`.

```powershell
python -m lpr.casos run conteo --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt `
  --config casos/05_conteo_en_zona/config/zonas_dron_carretera.json
```

- Zonas: JSON `{"polygons": [...]}`. Plantillas originales en `data/` (horizontal, vertical, cuartos, multi-zona).
- Sin `--weights` usa `yolo11x.pt` (COCO). Datos de ejemplo: `python -m lpr.casos descargar conteo`.
