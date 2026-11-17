# Finanzas — personal y casa

App personal (PWA para iPhone) inspirada en la filosofía de apps como monAI: **registrar cada
movimiento casi sin esfuerzo** y entender a dónde se va la plata. Con un giro propio:
**cada gasto se clasifica como 👤 Personal o 🏠 Casa**, porque tú pagas los gastos del hogar.

## Qué hace

| Pantalla | Para qué |
|---|---|
| **Resumen** | Gastado del mes, comparación justa con el mismo día del mes pasado, tarjetas Personal / Casa con presupuesto, cuánto te queda **por día**, y en qué categorías se va. |
| **¿Personal o Casa?** | Cada movimiento nuevo llega sin clasificar y la app te pregunta con dos botones grandes. Opción "Recordar para este comercio" (apagada por defecto, para que siempre te pregunte). |
| **Movimientos** | Lista por día, buscador, filtros Todos / Personal / Casa / Pendientes. Tocar para editar. |
| **Ajustes** | Presupuestos, conexión con el banco, tasa del dólar, comercios recordados, exportar a Excel. |

Criterios financieros incluidos:
- **Pago de tarjeta de crédito y traslados entre tus cuentas NO cuentan como gasto** (si no, contarías la misma compra dos veces: al comprar y al pagar la tarjeta).
- Muestra cuánto gastaste con **crédito** este mes (ya está comprometido para el próximo pago).
- **Tasa de ahorro** (meta sana: ≥ 20 % de los ingresos).
- Alerta si un presupuesto va más rápido que el mes.
- Costo **anual** de tus suscripciones.

## ¿Se puede conectar directo al banco?

Sí, pero con matices. Opciones en Colombia, de más fácil a más compleja:

1. **Notificaciones del banco → Atajo de iPhone (incluido, recomendado).** Tu banco ya te
   manda un SMS / correo / push por cada compra. Una automatización de Atajos lo reenvía a
   `/api/ingest`; la app lo lee (monto, comercio, tarjeta, crédito/débito, fecha) y te pregunta
   Personal o Casa. Gratis, inmediato y sin entregarle tu clave del banco a nadie.
   El lector reconoce los formatos típicos de Bancolombia, Davivienda, BBVA, Nu, Banco de Bogotá,
   Falabella, Colpatria, Lulo, Nequi, etc. Si alguno no lo lee bien, pégame un ejemplo y lo ajusto.
2. **Pegar la notificación a mano** (botón "📋 Pegar notificación del banco" al agregar).
3. **Agregadores de Open Finance (Belvo, Prometeo, etc.).** Leen los movimientos directo del banco,
   pero son servicios pagos pensados para empresas, piden tu usuario del banco a través de su
   widget, y la cobertura varía por banco. Colombia está implementando Open Finance
   (Decreto 1297 de 2022 + reglas de la Superfinanciera), así que esto debería volverse más fácil.
   Se puede agregar después sin cambiar el resto de la app.

## Configuración (10 minutos)

1. **Base de datos:** usa tu Neon (puede ser la misma del gym; las tablas se llaman `fin_*`).
2. **Vercel:** *Add New → Project* → este repo → **Root Directory: `finanzas`** → variables:
   - `DATABASE_URL` = cadena de Neon
   - `FIN_TOKEN` = una clave larga que inventes (ej. generada por un gestor de contraseñas)
3. Las tablas se crean solas en el primer uso (o manualmente con `npm run db:setup`).
4. En el iPhone: abre la URL en Safari → Compartir → **Agregar a inicio**. En **Ajustes** de la app
   pega tu `FIN_TOKEN` y toca *Sincronizar ahora*.
5. **Atajo automático** (Atajos → Automatización → +):
   - Disparador **Mensaje** (o **Correo**), remitente = tu banco (ej. 85540 de Bancolombia),
     "El mensaje contiene" `$`, **Ejecutar inmediatamente**.
   - Acción **Obtener contenido de URL**: `https://TU-APP.vercel.app/api/ingest`, método **POST**,
     encabezado `x-token` = tu `FIN_TOKEN`, cuerpo **JSON** con campo `text` = variable *Mensaje*.

Sin token la app también funciona 100 % local (los datos quedan solo en el teléfono).

## Técnico

- React + Vite (PWA), estilo iOS nativo (fuente del sistema, listas agrupadas, sheets, modo oscuro).
- Local-first (`localStorage`) + respaldo en Neon (`/api/state`) + bandeja de notificaciones (`/api/ingest`).
- Protegido con una sola llave (`FIN_TOKEN`), pensado para uso personal.
- `npm run dev` para desarrollo local.
