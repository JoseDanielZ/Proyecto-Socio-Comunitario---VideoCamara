# Backend — API del conjunto

API REST en **Node.js + TypeScript** (Express 5, SQLite). Comparte con el frontend el contrato de tipos
(`packages/contracts`) y recibe de la cámara, por HTTP, lo que detecta el motor de visión (Python).

## Estructura (por función del negocio)

```text
src/
  server.ts        arranca: lee config, arma dependencias, escucha
  app.ts           Express: seguridad, rutas, manejo de errores
  compose.ts       raíz de composición: el ÚNICO lugar que conoce las clases concretas
  config.ts        variables de entorno validadas · db.ts SQLite + esquema
  shared/          errores, validación/autenticación HTTP, reloj
  modules/
    auth/            usuarios, login, roles (bcrypt + JWT)
    tickets/         reglas de estado, historial, asignación
    visits/          registro de ingresos · reglas de placas · conciliación con cámaras
    vehicle-events/  cruces de la cámara: filtros, resumen, fotos
    cameras/         estado, fotogramas, video en vivo (MJPEG) e ingesta desde el motor de visión
    dashboard/       resumen del inicio
tests/             reglas puras · servicios con repos en memoria · repos (memoria y SQLite) · API por HTTP
```

## SOLID en la práctica

- **S:** un servicio, una responsabilidad. `VisitsService` registra ingresos/salidas; `ReconciliationService` compara
  con cámaras; `FrameHub` guarda fotogramas; `CamerasService` lleva el estado. Las reglas (placas, conciliación,
  transiciones de ticket) son funciones puras sin I/O.
- **O:** agregar un estado de ticket es agregar una fila a `ALLOWED_TRANSITIONS`; agregar una cámara es agregarla a la
  configuración: no se modifican los servicios.
- **L:** cada repositorio tiene una versión SQLite y una en memoria, y `tests/repositories.contract.test.ts` corre
  **las mismas pruebas contra ambas**.
- **I:** cada servicio recibe solo lo que usa (p. ej. `ReconciliationService` pide "buscar eventos por ventana y por id",
  no un repositorio completo; la ingesta solo necesita `EventRecorder`).
- **D:** las interfaces se definen donde se consumen; los servicios reciben sus dependencias por constructor; las rutas
  reciben su servicio, no un contenedor; solo `compose.ts` sabe que existen SQLite, bcrypt o JWT.

## API (prefijo `/api`)

| Área | Endpoints | Permiso |
|---|---|---|
| Sesión | `POST /auth/login`, `GET /auth/me` | público / autenticado |
| Usuarios | `GET/POST /users`, `PATCH /users/:id` | administración |
| Cámaras | `GET /cameras`, `GET /cameras/:id/stream` (MJPEG), `GET /cameras/:id/snapshot.jpg` | guardia y administración |
| Accesos | `GET /vehicle-events`, `/vehicle-events/summary`, `/vehicle-events/:id/snapshot` | guardia y administración |
| Visitas | `POST/GET /visits`, `PATCH /visits/:id/exit`, `GET /visits/:id/camera-match`, `POST /visits/:id/confirm-camera-event`, `GET /visits/unmatched-vehicles` | guardia y administración |
| Tickets | `POST/GET /tickets`, `GET /tickets/:id`, `/tickets/stats`, `POST /tickets/:id/comments` | guardia y administración |
| Tickets (gestión) | `PATCH /tickets/:id/status`, `PATCH /tickets/:id/assign` | solo administración |
| Inicio | `GET /dashboard` | guardia y administración |
| Ingesta (motor de visión) | `POST /internal/vehicle-events`, `PUT /internal/cameras/:id/frame`, `POST /internal/cameras/:id/status` | clave `X-Ingest-Key` |

Las imágenes y el video (`<img>` no puede enviar cabeceras) aceptan el token también como `?access_token=`.

## Respaldo con cámaras

Al registrar una visita con vehículo se buscan eventos de cámara en **±10 minutos**:

| Resultado | Cuándo |
|---|---|
| `verified` | La cámara leyó la misma placa (tolera 1 carácter mal leído y confusiones O/0, B/8, I/1, S/5) |
| `possible` | Vio un vehículo del mismo tipo pero no pudo leer la placa: el guardia confirma con la foto |
| `no_camera_evidence` | No vio nada, o solo vehículos con otra placa |
| `not_applicable` | Ingreso a pie |

## Configuración y arranque

```powershell
copy backend\.env.example backend\.env      # y completar JWT_SECRET e INGEST_API_KEY
npm install                                 # una vez, en la raíz
npm run seed -- --demo                      # usuarios y datos de ejemplo (admin/admin123, guardia1/guardia123)
npm run dev                                 # API en :8000 y web en :5173
python -m lpr.bridge --loop                 # (otra terminal) cámara de prueba: envía eventos y video
```

`npm test -w @conjunto/backend` corre las pruebas; `npm run build -w @conjunto/backend` revisa los tipos.

## Seguridad incluida

Contraseñas con bcrypt · sesiones JWT con algoritmo fijo y expiración · límite de intentos de login (429) ·
`helmet` y CORS solo para el front · validación de toda entrada con los esquemas del contrato · las fotos solo se
sirven desde `SNAPSHOTS_DIR` · la ingesta exige una clave compartida y compara en tiempo constante · los errores 5xx
no muestran detalles internos.

## Límites conocidos

- La lectura de placas depende de la cámara real: el video aéreo de prueba no tiene placas legibles, así que ahí el
  respaldo llega como `possible`. La precisión con placas de motos hay que medirla con video de la entrada real.
- Con el video de prueba, cada vez que se lanza el puente se vuelven a guardar sus vehículos.
- Las tablas se crean al arrancar; si el esquema cambia hará falta una herramienta de migraciones.
- El token en `?access_token=` queda en los registros de acceso del servidor: en producción usar HTTPS.
- Se ejecuta con `tsx` (sin paso de compilación); para producción basta `NODE_ENV=production npm start -w @conjunto/backend`.
