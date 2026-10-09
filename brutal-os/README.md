# Brutal OS

Plataforma administrativa de **LA BRUTAL** (Grupo Brutal). Diseño inspirado en el lenguaje
visual actual de Apple (Liquid Glass de iOS 26/27, shelves con foco de tvOS, listas agrupadas
de Ajustes, controles en cápsula, modo claro y oscuro).

**Módulos completos:** Empleados (BBDD maestra) y Nómina.
**Coming soon:** RRHH, Pagos, Facturación, Impuestos, Clientes, Terceros, Índice documental, Legal y Reportes.

```bash
cd brutal-os
npm install
npm run dev        # http://localhost:5173
npm test           # 19 pruebas del motor de nómina y de contratos
npm run build      # typecheck + build de producción en dist/
```

Esta demo funciona **sin backend**: los datos (todos ficticios) viven en el navegador para poder
recorrer la plataforma de punta a punta. Usa “Ver como” en la barra lateral para cambiar entre
Administrador, Coordinación y Empleado. Los códigos de verificación se muestran como “correo
simulado”. El modelo de producción (PostgreSQL + RLS) está en [`supabase/schema.sql`](supabase/schema.sql)
y la arquitectura en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

## Estructura

```
src/
  domain/      Lógica pura y probada: motor de nómina, contratos FIJO, alertas, fechas, catálogos
  data/        Repositorio (store), datos ficticios, selectores de gráficas, archivos (IndexedDB)
  components/  Sistema de diseño: tarjetas, KPI, cápsulas segmentadas, hojas modales, OTP, toasts
  pages/       Inicio, Empleados (+ ficha 360°, alta por pasos, importador), Nómina, Configuración, Coming soon
supabase/      Esquema de producción con Row Level Security
docs/          Arquitectura, modelo de datos, mapa de navegación, gráficas y preguntas abiertas
```
