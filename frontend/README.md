# Frontend — web del conjunto

React 19 + Vite + TypeScript. Pensada primero para el celular del guardia (barra de pestañas abajo,
botones de 48 px, texto grande) y adaptada a escritorio (menú lateral).

## Comandos

Desde la raíz del proyecto (es un monorepo con npm workspaces; un solo `npm install`):

```powershell
npm install
npm run dev                          # API + web (http://localhost:5173, reenvía /api al puerto 8000)
npm run dev -w @conjunto/frontend    # solo la web
npm run build -w @conjunto/frontend  # revisa tipos y genera dist/
npm test -w @conjunto/frontend       # vitest
```

El backend debe estar corriendo (ver el README de la raíz). Para probar desde el celular en la misma red:
`npm run dev -w @conjunto/frontend -- --host` y abrir `http://IP-DEL-PC:5173`.

## Tipos de la API

`src/api/types.ts` no define tipos: reexporta los de `@conjunto/contracts`, el mismo paquete que usa el backend
para validar y responder. Si el backend cambia un campo, esta web deja de compilar hasta adaptarse.

## Estructura

```text
src/
  api/          cliente HTTP (sesión, errores legibles), endpoints; tipos = contrato compartido
  auth/         contexto de sesión (sessionStorage) y cierre automático si vence
  components/   Shell (menú), Verdict (resultado de la cámara), ui (chips, filas, video en vivo)
  pages/        Inicio, Visitas (lista, nueva, detalle), Cámara, Accesos, Tickets, Usuarios
  styles/       tokens.css (colores y medidas) y app.css
public/         favicon.svg (logo provisional) y manifest (agregar a pantalla de inicio)
```

## Cambiar el logo y el nombre

- Nombre: `frontend/.env` con `VITE_CONJUNTO_NAME=Nombre del conjunto`.
- Logo: reemplazar `public/favicon.svg` y el SVG de `src/components/Logo.tsx` (`LogoMark`).
- Colores: `src/styles/tokens.css` (`--pine` es el verde de marca).

## Decisiones de diseño

- Una sola familia tipográfica, Atkinson Hyperlegible, pensada para leerse bien con sol y prisa.
- El resultado de la cámara (respaldado, posible, sin respaldo) es el elemento principal: panel grande con
  foto, icono y texto; el color nunca va solo.
- Estados y errores dicen qué pasó y qué hacer; los fallos del servidor no muestran texto técnico.
