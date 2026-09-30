# LPR Conjunto — base de reconocimiento de placas

Pipeline base para detectar y trackear vehículos/motos, leer su placa y registrar
cada entrada/salida (fecha, hora, placa) en un conjunto residencial. Construido
sobre [`supervision`](https://github.com/roboflow/supervision) (detección/tracking/anotación),
`ultralytics` (YOLO) y `fast-alpr` (detección + OCR de placa).

## Sistema del conjunto (API + web)

Además del motor de visión, el repositorio incluye el sistema completo para el conjunto: una
**API REST** (`backend/`, FastAPI, Clean Architecture) y una **web adaptada a celular**
(`frontend/`, React). Tres módulos sobre la misma base:

| Módulo | Qué resuelve |
|---|---|
| Cámaras y accesos | Procesa el video, guarda cada vehículo que cruza (hora, tipo, color, placa, foto) y muestra el **video en vivo con cajas y conteo** |
| Visitas, deliveries y proveedores | El guardia registra el ingreso (p. ej. moto de Uber) y el sistema lo **respalda con lo que vio la cámara**; avisa las motos que la cámara vio y nadie registró |
| Tickets | Solicitudes y daños con seguimiento hasta resolverse (abierto → en proceso → resuelto → cerrado) |

Arranque en desarrollo (dos terminales, desde la raíz del proyecto):

```powershell
# 1) Backend: API en http://localhost:8000  (documentación interactiva en /docs)
.venv\Scripts\Activate.ps1
python -m lpr.download_models                         # una vez: detector para vista aérea
cd backend
python -m app.scripts.seed_demo --demo                # una vez: usuarios y datos de ejemplo
python -m uvicorn app.main:create_app --factory --port 8000

# 2) Frontend: web en http://localhost:5173
cd frontend
npm install                                           # una vez
npm run dev
```

Usuarios de ejemplo (cambiarlos antes de usar en serio): `admin / admin123` (administración) y
`guardia1 / guardia123` (guardia). Detalle de la arquitectura, permisos y configuración:
[backend/README.md](backend/README.md) y [frontend/README.md](frontend/README.md).

Pruebas: `pytest` (motor de visión + backend) y `cd frontend && npm test`.

## Requisitos

- **Python 3.11+.** El proyecto se desarrolló y probó de extremo a extremo con Python
  3.14.3 en Windows (CPU y GPU NVIDIA) — funciona, pero con una salvedad conocida:
  el pin `numpy<2.0` que se suele recomendar para máxima compatibilidad **no tiene wheel
  para Python 3.14** y falla al compilar desde código fuente (requiere un compilador C que
  no viene instalado por defecto en Windows). La solución ya aplicada en `pyproject.toml`
  es no fijar el techo de versión de numpy (`numpy>=1.26`), lo cual instala NumPy 2.x, que
  sí trae wheel para 3.14 y es compatible con el resto de dependencias.
  - Si se prefiere GPU o máxima compatibilidad de wheels, Python 3.11/3.12 siguen siendo
    una alternativa válida (`py -3.12 -m venv .venv`), pero no es obligatorio.
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

### Usar la GPU NVIDIA (mucho más rápido)

`pip install` trae PyTorch solo para CPU. Con una GPU NVIDIA, instalar la build con CUDA en el
mismo entorno (no hay que cambiar código: ultralytics usa la GPU automáticamente):

```bash
pip install "torch==2.14.0+cu130" "torchvision==0.29.0+cu130" --index-url https://download.pytorch.org/whl/cu130 --extra-index-url https://pypi.org/simple
python -c "import torch; print(torch.cuda.is_available())"   # debe imprimir True
```

Medido en una RTX 4050 Laptop sobre el video de prueba (346 frames, 1280x720): el pipeline
principal pasó de ~2 min 10 s en CPU a ~16 s en GPU con el mismo resultado; el caso `tracking`
de 4 min 40 s a 24 s. `cu130` requiere un driver con CUDA 13; con drivers más viejos usar `cu126`.
El mismo comando sirve para `.venv-casos`.

Los modelos de `fast-alpr` se descargan solos la primera vez que se usa el OCR de placas.
El detector de vehículos para **vista aérea (dron)** se baja con:

```bash
python -m lpr.download_models     # guarda models/geotrax_hbb_yolov8s_1920_v1.pt (~25 MB)
```

(Modelo [`rfonod/geo-trax`](https://huggingface.co/rfonod/geo-trax), CC BY 4.0. Los modelos
COCO como `yolov8n.pt` ven muy pocos autos desde arriba; sirven para cámaras a nivel de calle,
con `imgsz: 640` en `config.yaml`.)

## Uso rápido con un video de prueba (sin cámara)

1. Colocar el video en `data/videos/` y apuntar `source.path_or_url` en `config/config.yaml`
   (viene configurado `data/videos/215295_medium.mp4`, una carretera vista desde un dron).
2. Poner la línea de conteo en `line_zones` (`start`/`end` en píxeles del video; en el ejemplo
   es vertical en x=640 porque el tráfico va de lado a lado).
3. Correr con ventana en vivo (`q` para cerrar) y guardando el video anotado:

   ```bash
   python -m lpr.main --config config/config.yaml --preview --output data/output/resultado.mp4
   ```

   Se dibuja cada vehículo con `#id tipo color`, su estela de movimiento, la línea de conteo y un
   panel con el total de vehículos que la cruzaron, por tipo y por color. Al terminar se imprime
   el listado de cada vehículo contado. Un vehículo se cuenta una sola vez (su primer cruce).
4. Revisar los eventos registrados:

   ```bash
   sqlite3 db/conteo_carretera.db "select tracker_id, vehicle_type, vehicle_color, direction from events;"
   ```

## Casos de uso (copiados de supervision)

Además del cruce de línea con tipo y color, el proyecto incluye en `casos/` otros escenarios ya
codificados (tracking, flujo entre zonas, velocidad, tiempo en zona, conteo por zona, mapa de
calor), cada uno en su carpeta y lanzable con un solo comando:

```powershell
python -m lpr.casos list
python -m lpr.casos run flujo --video data/videos/215295_medium.mp4 `
  --weights models/geotrax_hbb_yolov8s_1920_v1.pt `
  --config casos/02_flujo_vehicular/config/zonas_dron_carretera.json
```

Detalle de cada caso, entornos y qué modelo usar según la escena: [casos/README.md](casos/README.md).

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
backend/                API REST del sistema del conjunto (FastAPI, Clean Architecture)
frontend/               Web en React adaptada a celular
casos/                  Casos de uso copiados de supervision (velocidad, zonas, mapa de calor...)
config/config.yaml     Configuración: fuente de video, modelos, líneas, base de datos
src/lpr/
  main.py               Punto de entrada (CLI)
  config.py             Carga y validación de config.yaml
  video_source.py        Fuente de video unificada (archivo o RTSP) con reconexión
  detection.py            Detección de vehículos/motos (YOLO + supervision)
  tracking.py              Tracking (ByteTrack) para no contar dos veces el mismo vehículo
  line_zone.py             Línea de conteo, mapeo a entrada/salida
  plate_detector.py         Recorte del vehículo para pasar al motor de placa
  color.py                    Color dominante del vehículo (HSV)
  download_models.py          Descarga del detector aéreo
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
| `vehicle_color` | Color dominante (blanco, negro, gris, rojo, azul, celeste, amarillo...) |
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
