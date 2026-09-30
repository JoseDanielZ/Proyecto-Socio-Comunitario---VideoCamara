# 04 · Tiempo de permanencia en zonas

Cuánto tiempo pasa cada objeto dentro de cada zona (etiqueta `#id mm:ss`). Origen: `examples/time_in_zone`.

```powershell
python -m lpr.casos run tiempo --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt `
  --config casos/04_tiempo_en_zona/config/zonas_dron_carretera.json
```

- Zonas: JSON con una lista de polígonos. Para dibujarlas sobre un frame: `python casos/04_tiempo_en_zona/scripts/draw_zones.py --source_path VIDEO --zone_configuration_path zonas.json` (abre una ventana; Enter cierra polígono, S guarda).
- Scripts de RTSP/stream (`*_stream_example.py`, `*_naive_stream_example.py`) y `rfdetr_*`/`inference_*`: se copian tal cual y se lanzan a mano.
- Parche local (`# LOCAL`): `--target_video_path` en `ultralytics_file_example.py` (guarda el video en vez de abrir ventana).
