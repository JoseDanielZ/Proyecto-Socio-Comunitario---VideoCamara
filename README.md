# LPR Conjunto — base de reconocimiento de placas

Pipeline base para detectar y trackear vehículos/motos, leer su placa y registrar
cada entrada/salida (fecha, hora, placa) en un conjunto residencial. Construido
sobre [`supervision`](https://github.com/roboflow/supervision) (detección/tracking/anotación),
`ultralytics` (YOLO) y `fast-alpr` (detección + OCR de placa).

## Requisitos

- **Python 3.11 o 3.12 recomendado.** Este equipo solo tenía Python 3.14.3 instalado al
  crear el proyecto; Python 3.14 es muy reciente y algunas librerías de OCR/CV pueden no
  tener wheels publicados todavía para esa versión, causando fallos en `pip install`.
  - Recomendado: instalar Python 3.12 aparte (`winget install Python.Python.3.12` o desde
    [python.org](https://www.python.org/)) y crear el entorno virtual con esa versión:
    `py -3.12 -m venv .venv`.
  - Alternativa: seguir con Python 3.14 en modo CPU (sin GPU) — funciona para probar el
    pipeline contra archivos de video, pero si `pip install` falla en alguna dependencia,
    es la primera causa a revisar.
- Windows, Linux o macOS (el código no depende del sistema operativo).

## Instalación

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -e ".[dev,preview]"
```

`pip install -e ".[dev,preview]"` instala el proyecto en modo editable junto con las
dependencias de testing (`pytest`) y la build de OpenCV con soporte de ventana (para
`--preview`). En un servidor sin pantalla, basta con `pip install -e .`.

Los pesos del detector de vehículos (`yolov8n.pt`) y los modelos de `fast-alpr` se
descargan automáticamente la primera vez que se ejecuta el pipeline (ver `models/README.md`).

## Uso rápido con un video de prueba (sin cámara)

1. Colocar un video corto de un vehículo entrando/saliendo en `data/videos/` (por ejemplo
   `data/videos/sample_entrada.mp4`, que es el nombre por defecto en `config/config.yaml`).
2. Verificar que `config/config.yaml` tenga `source.type: "file"` apuntando a ese archivo.
3. Correr con vista de depuración para calibrar la línea de conteo contra la resolución real
   del video:

   ```bash
   python -m lpr.main --config config/config.yaml --preview
   ```

   Se abrirá una ventana con las cajas de detección, el ID de tracking de cada vehículo y la
   línea de entrada/salida con su conteo. Ajustar `line_zones.start`/`end` en `config.yaml`
   hasta que la línea quede bien ubicada, y presionar `q` para cerrar.
4. Revisar los eventos registrados:

   ```bash
   sqlite3 db/lpr.db "select * from events;"
   ```

## Pasar a una cámara real (RTSP)

1. Editar `config/config.yaml`:

   ```yaml
   source:
     type: "rtsp"
     path_or_url: "rtsp://usuario:clave@192.168.1.50:554/stream1"
   ```

   (La URL RTSP exacta depende de la marca de la cámara; normalmente está en su manual o
   panel web. Para no commitear credenciales, se pueden referenciar variables de entorno con
   `${VAR}` dentro del YAML, definidas en un `.env` local no versionado.)
2. Volver a medir las coordenadas de `line_zones` contra la resolución real de esa cámara.
3. Correr en modo headless (sin `--preview`) para uso en producción:

   ```bash
   python -m lpr.main --config config/config.yaml
   ```

   Si el stream se cae, `video_source.py` reintenta la reconexión automáticamente.

## Estructura del proyecto

```
config/config.yaml     Configuración: fuente de video, modelos, líneas, base de datos
src/lpr/
  main.py               Punto de entrada (CLI)
  config.py             Carga y validación de config.yaml
  video_source.py        Fuente de video unificada (archivo o RTSP) con reconexión
  detection.py            Detección de vehículos/motos (YOLO + supervision)
  tracking.py              Tracking (ByteTrack) para no contar dos veces el mismo vehículo
  line_zone.py             Línea de conteo, mapeo a entrada/salida
  plate_detector.py         Recorte del vehículo para pasar al motor de placa
  ocr.py                     Lectura de la placa (fast-alpr), interfaz intercambiable
  pipeline.py                Orquesta todo el flujo por frame
  db.py                       Esquema SQLite y repositorio de eventos
  annotators.py                Dibujo de depuración para --preview
models/                 Pesos de modelos (no versionados)
data/videos/            Videos de prueba (no versionados)
data/snapshots/          Recortes de placa guardados por evento (no versionados)
db/lpr.db                 Base de datos SQLite (no versionada)
tests/                  Tests unitarios (config, línea de conteo, base de datos)
```

## Base de datos

Tabla `events` en SQLite (`db/lpr.db`):

| columna | descripción |
|---|---|
| `plate_text` | Texto de la placa leído (o `NULL` si no se pudo leer) |
| `plate_confidence` | Confianza del OCR |
| `vehicle_type` | `car`, `motorcycle`, `bus` o `truck` |
| `direction` | `entrada` o `salida` |
| `tracker_id` | ID de tracking asignado por ByteTrack |
| `source_id` | Identificador de la cámara/fuente configurada |
| `timestamp` | Fecha y hora ISO 8601 (UTC) del cruce |
| `snapshot_path` | Ruta de la imagen recortada guardada (si `snapshots.enabled`) |

El conteo de entrada/salida no depende de que el OCR tenga éxito: si no se logra leer la
placa (mala iluminación, ángulo, placa sucia), el evento igual se registra con
`plate_text = NULL`.

## Tests

```bash
pytest
```

## Limitaciones conocidas / próximos pasos

- No hay dashboard ni autenticación todavía — la consulta es directa a SQLite.
- La precisión del OCR depende del ángulo/iluminación de la cámara; si `fast-alpr` no da
  buenos resultados con las placas reales del conjunto, `ocr.py` expone una interfaz
  (`PlateOCR.read`) pensada para poder sustituir el motor (por ejemplo por EasyOCR) sin tocar
  el resto del pipeline.
- Proceso único por cámara — para varias cámaras en producción conviene un supervisor de
  proceso (systemd, NSSM/Task Scheduler en Windows) que reinicie el proceso si se cae.
- Sin reentrenamiento propio de modelos: usa pesos preentrenados (COCO para vehículos,
  modelos por defecto de `fast-alpr` para placas).
