# Historial de cambios

## 4.1.0 — 2026-09-16

- Unifica el catálogo para buscar en todos los productos sin filtrar por el tipo del pendiente.
- Ordena los resultados por coincidencia del nombre y de las palabras de la descripción.
- Simplifica el alta y la edición a nombre del producto, descripción o referencia, enlace de compra e imagen.
- Evita que elegir un producto cambie la categoría seleccionada del pendiente.
- Consolida los campos antiguos de producto, marca, modelo, especificaciones, presentación y ubicación en una descripción compatible.
- Conserva los productos, pendientes, teléfonos vinculados, PIN y suscripciones de la versión 4.0.

## 4.0.0 — 2026-09-11

- Fija por separado el dueño de cada teléfono como persona 1 o persona 2.
- Restaura automáticamente el perfil propio al abrir la app.
- Mantiene el cambio manual de persona como una acción temporal.
- Agrega acceso rápido NFC con saludo por dispositivo, alta de pendiente y acceso a la app.
- Enruta Web Push solo a los dispositivos de la persona contraria y excluye el dispositivo de origen.
- Sustituye la actualización periódica por sincronización al guardar, recibir un push, abrir, volver o actualizar manualmente.
- Agrega servicios de pago único y recurrente con ocho frecuencias.
- Genera de forma idempotente el siguiente pago al completar un servicio recurrente.
- Agrega catálogo doméstico con alias, ubicación, marca, modelo, especificación, presentación, imagen y enlace.
- Migra sin borrar las 18 columnas originales de `Pendientes`.
- Conserva la identidad de instalación y el almacenamiento de 3.0 para actualizar sin crear otra app.

## 3.0.0 — 2026-08-21

- Agrega PWA instalable y notificaciones Web Push directas sin Firebase.
- Genera automáticamente las llaves VAPID, el PIN y los secretos del puente.
- Protege los métodos de Apps Script con un token del hogar.
- Conserva Sheets y Drive como fuente de datos.
