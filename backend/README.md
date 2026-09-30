# Backend — API del conjunto

API REST en FastAPI con **Clean Architecture**. Reutiliza el motor de visión del proyecto (`src/lpr`)
para leer el video de las cámaras.

## Arquitectura

Las dependencias apuntan hacia adentro: `presentation → application → domain`, y `infrastructure`
implementa los puertos que define el dominio.

```text
app/
  domain/           Modelo: entidades, reglas y puertos. Sin FastAPI ni SQLAlchemy.
    entities/         User, VehicleEvent, Visit, Ticket (+ historial)
    value_objects/    Plate (normaliza y compara placas), enums
    services/         reconciliation.py: compara una visita con lo que vieron las cámaras
    repositories/     interfaces (ports.py)
  application/      Casos de uso: AuthService, TicketService, VisitService, VehicleEventService, CameraService
  infrastructure/   SQLAlchemy (SQLite), bcrypt + JWT, adaptador de cámara (motor de visión)
  presentation/     Controladores REST (routers/) y DTOs JSON (schemas/dto.py)
  container.py      Raíz de composición: arma todo
  main.py           App FastAPI, manejo de errores, arranque/parada de la cámara
```

Correspondencia con MVC: **Modelo** = `domain` + `infrastructure/persistence`; **Controlador** =
`presentation/routers`; **Vista** = los DTOs JSON y la web (`frontend/`).

## Cómo funciona el respaldo de cámaras

Al registrar una visita con vehículo, `VisitService` busca eventos de cámara en **±10 minutos**:

| Resultado | Cuándo |
|---|---|
| `verified` | La cámara leyó la misma placa (tolera 1 carácter mal leído y confusiones como O/0, B/8) |
| `possible` | Vio un vehículo del mismo tipo pero no pudo leer la placa: el guardia confirma con la foto |
| `no_camera_evidence` | No vio nada, o solo vehículos con otra placa |
| `not_applicable` | Ingreso a pie |

`GET /api/visits/unmatched-vehicles` lista los vehículos (por defecto motos) que la cámara vio cruzar y
ningún guardia registró.

## Endpoints (prefijo `/api`; documentación interactiva en `/docs`)

| Área | Endpoints | Permiso |
|---|---|---|
| Sesión | `POST /auth/login`, `GET /auth/me` | público / autenticado |
| Usuarios | `GET/POST /users`, `PATCH /users/{id}` | administración |
| Cámaras | `GET /cameras`, `GET /cameras/{id}/stream` (video MJPEG anotado), `GET /cameras/{id}/snapshot.jpg` | guardia y administración |
| Accesos | `GET /vehicle-events`, `/vehicle-events/summary`, `/vehicle-events/{id}/snapshot` | guardia y administración |
| Visitas | `POST/GET /visits`, `PATCH /visits/{id}/exit`, `GET /visits/{id}/camera-match`, `POST /visits/{id}/confirm-camera-event`, `GET /visits/unmatched-vehicles` | guardia y administración |
| Tickets | `POST/GET /tickets`, `GET /tickets/{id}`, `/tickets/stats`, `POST /tickets/{id}/comments` | guardia y administración |
| Tickets (gestión) | `PATCH /tickets/{id}/status`, `PATCH /tickets/{id}/assign` | solo administración |
| Inicio | `GET /dashboard` | guardia y administración |

Las imágenes y el video (`<img>` no envía cabeceras) aceptan el token también como `?access_token=`.

## Configuración

Copiar `.env.example` a `.env` (no se sube a git). Lo importante:

- `JWT_SECRET`: clave para firmar sesiones (mínimo 32 caracteres). Si falta, se genera una temporal.
- `DATABASE_URL`: SQLite en `db/conjunto.db` por defecto; PostgreSQL cambiando solo esta línea.
- `LPR_CONFIG_PATH`: `config/config.yaml` define la fuente de video (archivo o RTSP), el modelo y la línea de conteo.
- `CAMERA_ENABLED=false`: arranca la API sin cámara (para trabajar solo con tickets y visitas).
- `CAMERA_LOOP=true`: repite el video de prueba sin fin (cada vuelta vuelve a contar los vehículos).

Para pasar de un video de prueba a la cámara real basta cambiar `source` en `config/config.yaml`
(ver el README de la raíz).

## Comandos

```powershell
cd backend
python -m app.scripts.seed_demo --demo                              # usuarios y datos de ejemplo
python -m uvicorn app.main:create_app --factory --port 8000         # API
pytest                                                              # (desde la raíz) toda la suite
```

## Límites conocidos

- La lectura de placas depende de la cámara real: el video aéreo de prueba no tiene placas legibles,
  así que ahí el respaldo llega como `possible` (mismo tipo de vehículo). La precisión con placas de
  motos hay que medirla con video de la entrada real.
- Con el video de prueba, cada reinicio de la API vuelve a procesar el video y a guardar sus vehículos
  (con una cámara real en vivo esto no ocurre). Para empezar limpio, borrar `db/conjunto.db`.
- La hora de un evento es la del procesamiento; con video en vivo coincide con la real.
- Las tablas se crean al arrancar (`create_all`); si el esquema cambia hará falta una herramienta de
  migraciones (Alembic).
- El token en `?access_token=` queda en los registros de acceso del servidor: en producción usar HTTPS y
  no exponer esos registros.
