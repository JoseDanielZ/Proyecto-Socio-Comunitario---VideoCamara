# 06 · Mapa de calor

Acumula las posiciones de los objetos trackeados en un mapa de calor. Origen: `examples/heatmap_and_track`.

```powershell
python -m lpr.casos run calor --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt -- --classes "[0,1,2,3]"
```

- Por defecto solo mapea la clase 0 de COCO (personas). Con `geo-trax`: 0 car, 1 bus, 2 truck, 3 motorcycle.
- Parche local (`# LOCAL`): parámetro `--classes`.
