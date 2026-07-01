# Entrenamiento — Juan David

App de seguimiento de entrenamiento: **multiusuario** (perfiles sin contraseña), rutina
personalizada según objetivo/nivel/días, registro de series, progreso, peso corporal mensual,
calendario de días entrenados, suplementos y guía de ejercicios.

## Arquitectura

- **Frontend:** React + Vite (PWA). Funciona **offline** (local-first con `localStorage`).
- **Backend:** Vercel Serverless Functions en `/api` (`users`, `sync`).
- **Base de datos:** Neon (Postgres). Cada perfil y sus registros se guardan en Neon y se
  **sincronizan** cuando hay conexión (ideal para el gym con señal intermitente).

### Perfiles y personalización
- Onboarding sin contraseña: eliges un perfil o creas uno con nombre, sexo, edad, altura, peso,
  nivel y objetivo + días por semana.
- La rutina se **genera** según los días/semana (split de 3 a 6 días) y ajusta reps y descanso
  según el objetivo (fuerza / hipertrofia / perder grasa / mantener) y el nivel.

### Temporizador de descanso
- Arranca solo al registrar cada serie, con duración según tu objetivo.
- Al terminar el descanso: vibra, suena y manda notificación (si diste permiso).
- Nota: por ser una web no puede abrir el reloj nativo del iPhone; el aviso funciona mientras la
  app está abierta o en segundo plano reciente.

## Configuración de la base de datos (Neon)

1. La cadena de conexión va en la variable de entorno **`DATABASE_URL`** (nunca en el código).
   - **Local:** copia `.env.example` a `.env.local` y pon tu cadena de Neon.
   - **Vercel:** Project → Settings → Environment Variables → agrega `DATABASE_URL` (todos los
     entornos) con la cadena *pooled* de Neon.
2. Crea las tablas una vez:
   ```bash
   npm install
   npm run db:setup
   ```
   > ⚠️ Seguridad: si tu cadena de conexión se expuso alguna vez, **rota la contraseña** en el
   > panel de Neon y actualiza `DATABASE_URL`.

> Nota: no hay autenticación por diseño (cualquiera con la URL puede elegir un perfil). Es como
> un dispositivo compartido. Se puede añadir un PIN por perfil más adelante.

## Peso corporal y notificaciones

- Cada 30 días desde tu último registro, la app te muestra automáticamente un modal para actualizar tu peso, con estadísticas de evolución (delta desde el inicio y una gráfica).
- Puedes activar notificaciones del navegador desde la pestaña **Progreso**. Importante: esto usa la `Notification API` del navegador, que **solo se dispara mientras tienes la app abierta o la abres de nuevo** — no es una notificación push real en segundo plano (eso requeriría un servidor con claves VAPID y un endpoint de push, que está fuera del alcance de un sitio estático). En la práctica, como revisarás la app seguido para registrar tus series, el aviso aparecerá cuando la abras y ya haya pasado el mes.
- Si más adelante quieres notificaciones push de verdad (que lleguen aunque no abras la app), se puede agregar con un backend pequeño (ej. Vercel Functions + Web Push) — dímelo y lo construimos.

## Cómo subirla a Vercel (5 minutos)

### Opción A — Sin usar la terminal (más fácil)
1. Ve a https://vercel.com y entra con tu cuenta (GitHub, Google, etc.).
2. Sube esta carpeta a un repositorio nuevo en GitHub:
   - Ve a https://github.com/new, crea un repo (ej. `gymtracker`).
   - Sube todos estos archivos (botón "Add file → Upload files" en GitHub, arrastra la carpeta completa).
3. En Vercel, clic en **"Add New… → Project"**, selecciona ese repositorio.
4. Vercel detecta automáticamente que es un proyecto Vite — deja la configuración por defecto y da clic en **Deploy**.
5. En 1-2 minutos tendrás una URL tipo `https://gymtracker-tuusuario.vercel.app`.

### Opción B — Con terminal (si tienes Node.js instalado)
```bash
cd gymtracker
npm install
npx vercel
```
Sigue las instrucciones en pantalla (te pedirá iniciar sesión en Vercel desde el navegador). Al terminar te dará la URL pública.

## Instalarla como app en tu celular

Una vez tengas la URL de Vercel:

**iPhone (Safari):**
1. Abre la URL en Safari.
2. Toca el botón compartir (el cuadrado con la flecha hacia arriba).
3. Selecciona **"Agregar a pantalla de inicio"**.
4. Listo — queda con ícono propio y abre a pantalla completa, como una app nativa.

**Android (Chrome):**
1. Abre la URL en Chrome.
2. Toca los tres puntos (⋮) arriba a la derecha.
3. Selecciona **"Instalar app"** o **"Agregar a pantalla de inicio"**.
4. Listo.

Tus datos (series, suplementos, días entrenados) se guardan en el almacenamiento local de tu celular, así que quedan aunque cierres la app.
