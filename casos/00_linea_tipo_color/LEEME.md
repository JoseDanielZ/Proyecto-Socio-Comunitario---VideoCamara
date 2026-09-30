# 00 · Cruce de línea con tipo y color (caso propio)

Este es el pipeline del proyecto (`src/lpr/`), no viene de supervision. Cuenta los vehículos
que cruzan una línea y registra tipo (auto, bus, camión, moto) y color; guarda cada cruce en SQLite.

```powershell
python -m lpr.casos run linea --video data/videos/215295_medium.mp4 --out data/output/linea.mp4
# o directo:
python -m lpr.main --config config/config.yaml --preview --output data/output/resultado.mp4
```

- Línea, modelo y umbrales: `config/config.yaml` (`line_zones`, `models`).
- Vista aérea (dron): `python -m lpr.download_models` baja el detector `geo-trax`.
- Resultado sobre el video de prueba: 25 vehículos cruzan la línea (ver README raíz).
