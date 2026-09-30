# Frontend — web del conjunto

React 19 + Vite + TypeScript. Pensada primero para el celular del guardia (barra de pestañas abajo,
botones de 48 px, texto grande) y adaptada a escritorio (menú lateral).

## Comandos

```powershell
cd frontend
npm install
npm run dev        # http://localhost:5173 (reenvía /api al backend en el puerto 8000)
npm run build      # revisa tipos y genera dist/
npm test           # vitest
```

El backend debe estar corriendo (ver el README de la raíz). Para probar desde el celular en la misma red:
`npm run dev -- --host` y abrir `http://IP-DEL-PC:5173`.

## Estructura

```text
src/
  api/          cliente HTTP (sesión, errores legibles), tipos y endpoints
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
