# 01 · Detección + tracking

Detecta todos los objetos del modelo y les asigna un ID persistente (ByteTrack). Sirve de base
para cualquier otro caso. Origen: `examples/tracking` de supervision (sin modificar).

```powershell
python -m lpr.casos run tracking --video data/videos/215295_medium.mp4 --weights models/geotrax_hbb_yolov8s_1920_v1.pt
```

- `--weights` es obligatorio en la variante `ultralytics`. La variante `rfdetr` usa RF-DETR (COCO) y no admite pesos propios.
- Salida por defecto: `data/output/tracking_ultralytics.mp4`.
