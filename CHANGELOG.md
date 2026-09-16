# Historial de cambios

## 4.3.0 — 2026-09-16

- Mantiene ocultos los resultados del catálogo mientras el buscador de **Nuevo pendiente** esté vacío.
- Muestra únicamente hasta siete coincidencias después de escribir una búsqueda.
- Agrega **Tomar o elegir foto** directamente al alta y edición de pendientes de despensa, reparación y otros.
- Presenta una vista previa y permite cambiar o quitar la foto antes de guardar.
- Reduce la imagen en el teléfono y la guarda en una carpeta específica de Drive.
- Muestra la foto como miniatura en la lista y en tamaño grande dentro del detalle.
- Usa como respaldo la imagen del producto vinculado en el catálogo cuando el pendiente no tiene una foto propia.
- Conserva para servicios el comprobante independiente en imagen o PDF.
- Mantiene intactos los pendientes, el catálogo, el PIN, los teléfonos vinculados y las suscripciones de la versión 4.2.

## 4.2.0 — 2026-09-16

- Sustituye la URL manual de imagen por un selector compatible con cámara y galería.
- Muestra una vista previa y permite cambiar o quitar la foto antes de guardar.
- Convierte y reduce las imágenes en el teléfono para agilizar la carga.
- Guarda las fotos del catálogo en una carpeta específica de Drive.
- Publica cada foto mediante un enlace no listado para que se vea en ambos dispositivos.
- Usa la miniatura del producto en el catálogo, la búsqueda y la selección del pendiente.
- Conserva las imágenes ya registradas y toda la configuración de la versión 4.1.

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
