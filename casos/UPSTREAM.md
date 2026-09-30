# Origen del código de estas carpetas

- Repositorio: https://github.com/roboflow/supervision
- Rama: `develop` (versión 0.31.0.dev0)
- Commit copiado: `eaa9419a6f8029c1a0051741250b3bed9f052f1c` (2026-09-29)
- Licencia: MIT (ver `LICENSE-supervision.md`; el aviso de copyright se conserva)
- Carpetas copiadas de `examples/`: tracking → 01, traffic_analysis → 02, speed_estimation → 03,
  time_in_zone → 04, count_people_in_zone → 05, heatmap_and_track → 06.
  `compact_mask` (benchmarks internos de la librería) no se copió: no es un caso de uso.
- Clon completo (no versionado): `_upstream/supervision`.

Los scripts se copiaron tal cual salvo cambios mínimos marcados con `# LOCAL` (leer zonas o
calibración de un JSON, pesos y clases configurables, guardar video en el caso 04). Para ver
exactamente qué cambió: `diff -r _upstream/supervision/examples/<caso> casos/<carpeta>`.
