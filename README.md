# Casa en Orden 4.2 — fotos desde cámara o galería

Esta versión actualiza Casa en Orden 4.1 sin borrar pendientes, productos del catálogo, fotos existentes, la Hoja de cálculo ni comprobantes de Drive. Ahora las fotos de los productos se pueden tomar con la cámara o seleccionar desde la galería del teléfono.

GitHub y Cloudflare publican la PWA y entregan Web Push directo. No usa Firebase ni requiere crear llaves manualmente.

## Novedades

- Cada teléfono queda identificado de forma permanente como **Axel** o **Lau/Laura**.
- Al abrir normalmente, la app entra con el perfil propio del teléfono.
- El cambio de persona dentro de la app es temporal y no modifica al dueño del dispositivo.
- Un tag NFC puede abrir el acceso rápido con **Agregar pendiente** o **Ver la aplicación**, usando automáticamente la identidad del teléfono.
- Los avisos se envían únicamente a los dispositivos de la otra persona y nunca al dispositivo que hizo el cambio.
- Ya no consulta los datos cada dos minutos: actualiza al guardar, recibir un push, abrir o regresar a la app, y al tocar el botón de actualización.
- Los servicios pueden ser de pago **Único** o **Recurrente**.
- Al marcar como pagado un servicio recurrente, se genera una sola vez el siguiente vencimiento.
- El catálogo es único para toda la casa: busca coincidencias sin importar si el pendiente es de despensa, servicio, reparación u otro tipo.
- El formulario del catálogo se reduce a nombre del producto, descripción o referencia, enlace de compra e imagen.
- Los datos anteriores de producto, marca, modelo, especificaciones, presentación y ubicación se conservan y se muestran juntos en la descripción.
- El campo de URL de imagen se sustituye por **Tomar o elegir foto**.
- La app muestra una vista previa y reduce automáticamente las fotos grandes antes de subirlas.
- Las fotos se guardan en una carpeta de Drive y se muestran en el catálogo, los resultados de búsqueda y el producto seleccionado.

## Contenido del paquete

| Carpeta | Uso |
|---|---|
| `apps-script/` | Código actualizado de Google Apps Script. |
| `pwa-cloudflare/` | PWA y Worker que se publican desde GitHub en Cloudflare. |

## Actualizar una instalación 4.1 existente

### 1. Actualiza Apps Script

1. Abre la Hoja de cálculo de Casa en Orden.
2. Entra a **Extensiones → Apps Script**.
3. Sustituye el contenido de los cinco archivos con los de `apps-script/`:
   - `Code.gs`
   - `Index.html`
   - `Scripts.html`
   - `Styles.html`
   - `appsscript.json`
4. Guarda el proyecto.
5. Regresa a la Hoja y recárgala.
6. Usa **Casa en Orden → Configurar hojas**. La operación conserva los pendientes y el catálogo existentes.
7. Ve a **Implementar → Administrar implementaciones**, edita la Web App, selecciona **Nueva versión** y pulsa **Implementar**.
8. Conserva la misma URL que termina en `/exec`.

### 2. Actualiza GitHub y Cloudflare

1. En tu repositorio existente, reemplaza el contenido con esta versión, respetando las carpetas.
2. Confirma los cambios en la misma rama que Cloudflare despliega.
3. Espera a que termine la publicación de Cloudflare.

No cambies el nombre del Worker, el binding `HOME_REGISTRY`, el `manifest.id` ni `HOME_OBJECT_NAME`. Se conservarán el PIN, los teléfonos vinculados, las llaves Web Push y la app ya instalada.

### 3. Confirma el dueño de cada teléfono

- En el teléfono de Axel, abre la app y entra a **Perfil → Este teléfono es de…**. Selecciona Axel si fuera necesario.
- En el teléfono de Lau, repite el proceso y selecciona Lau/Laura.
- Esa selección queda guardada por dispositivo. No tendrán que elegir usuario cada vez que entren.
- Si alguien usa por un momento el teléfono de la otra persona, puede tocar el nombre de la barra superior. Ese cambio solo afecta el registro que haga en ese momento; al volver a abrir, se recupera el dueño fijo.

## Instalación nueva

### 1. Apps Script

1. Vincula el proyecto a una Hoja de cálculo.
2. Copia los cinco archivos de `apps-script/`.
3. Guarda, recarga la Hoja y usa **Casa en Orden → Configurar hojas**.
4. Implementa como Web App con:
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario.
5. Copia la URL `/exec`.

### 2. GitHub y Cloudflare

1. Sube el paquete a un repositorio privado de GitHub.
2. En Cloudflare abre **Workers & Pages → Create → Import a repository**.
3. Configura:
   - **Root directory:** `pwa-cloudflare`
   - **Build command:** vacío
   - **Deploy command:** `npx wrangler deploy`
4. Publica el proyecto.

Cloudflare crea el almacenamiento y las llaves Web Push automáticamente. No necesitas KV, Firebase, variables ni secretos manuales.

### 3. Primer teléfono

1. Abre la URL `*.workers.dev`.
2. Pega la URL `/exec` de Apps Script.
3. Elige de quién es el teléfono.
4. Crea un PIN compartido de al menos 6 caracteres.
5. Permite las notificaciones.
6. Instala la app desde el botón mostrado o desde **menú ⋮ → Agregar a pantalla de inicio**.

### 4. Segundo teléfono

1. Abre la misma URL de Cloudflare.
2. Elige al dueño de ese teléfono.
3. Introduce el mismo PIN.
4. Permite las notificaciones e instala la app.

## Configurar el tag NFC

Graba en el tag un registro de tipo **URL/Enlace** con esta dirección:

```text
https://TU-WORKER.workers.dev/?modo=nfc
```

Sustituye `TU-WORKER` por tu dirección real. Usa exactamente el mismo dominio con el que instalaste la PWA.

Al acercar cualquiera de los dos teléfonos:

1. La PWA reconoce al dueño registrado en ese dispositivo.
2. Muestra **Hola, Axel** o **Hola, Lau**.
3. Permite elegir **Agregar pendiente** o **Ver la aplicación**.
4. Si quien acerca el teléfono no es su dueño, puede cambiar de persona solo para esa entrada.

Si Android pregunta con qué abrir el enlace, elige Casa en Orden o el mismo navegador con el que instalaste la PWA. Un teléfono nuevo deberá vincularse con el PIN antes de usar el acceso rápido.

## Servicios únicos y recurrentes

Al crear un pendiente de tipo **Servicio**:

- **Único:** se registra una sola fecha o pago.
- **Recurrente:** selecciona semanal, quincenal, mensual, bimestral, trimestral, semestral, anual o una cantidad personalizada de días.
- **Repetir el mismo monto:** actívalo solo si normalmente no cambia.

Cuando un recurrente se marca como pagado, el pago actual conserva su comprobante e historial y la app crea el siguiente pendiente. La protección por `AnteriorID` impide generar el mismo siguiente pago dos veces.

## Catálogo unificado

1. Entra a **Perfil → Catálogo doméstico → Agregar**.
2. Escribe el **Nombre del producto**, por ejemplo `Lámpara de cocina`.
3. En **Descripción o referencia** reúne solo lo que necesiten recordar, por ejemplo `20 W · 127 V · 22 cm · luz blanca LED`.
4. Si conviene, añade el enlace de compra y pulsa **Tomar o elegir foto**. Android permitirá abrir la cámara o escoger una imagen de la galería.
5. Al crear cualquier pendiente, busca palabras del nombre o la descripción en **Buscar en todo el catálogo**. No es necesario seleccionar antes la categoría correcta.
6. La app ordena primero las coincidencias más cercanas y completa el título, el detalle y el enlace; todavía puedes ajustarlos para ese pendiente.

Elegir un producto del catálogo no cambia el tipo del pendiente: **Despensa**, **Servicio**, **Reparación** y **Otro** siguen sirviendo para organizar la lista. Los productos pueden desactivarse sin borrarlos y los pendientes anteriores conservan la información que tenían al momento de crearse.

Los productos guardados en 4.0 no necesitan capturarse otra vez. Al abrirlos, la app combina automáticamente el producto, marca, modelo, especificaciones, presentación y ubicación anteriores en la nueva descripción. La hoja conserva las columnas antiguas internamente para mantener compatibilidad con los datos existentes.

### Fotos del catálogo

- No se solicita una URL: la foto se toma o se elige directamente desde el teléfono.
- Antes de subirla, la app la convierte a JPG y limita su dimensión máxima para ahorrar espacio y datos móviles.
- Al editar un producto, no elegir otra foto conserva la actual; **Quitar** elimina su vínculo del catálogo.
- La primera carga crea automáticamente en Drive la carpeta `Casa en Orden - Fotos del catálogo`.
- Cada imagen se habilita como visible mediante enlace para que pueda mostrarse en los dos teléfonos sin pedir inicio de sesión. El enlace es difícil de adivinar, pero no debe usarse para fotografías privadas o sensibles.

## Cómo se actualiza la información

- El teléfono que guarda un cambio actualiza su pantalla inmediatamente.
- El teléfono de la otra persona recibe el push y, si la app está abierta, recarga los datos por ese evento.
- Al abrir o volver a la app también se sincroniza.
- El botón circular de actualización fuerza una consulta manual.
- No existe un temporizador de dos minutos.

Si un teléfono tiene los avisos bloqueados, no puede recibir el evento mientras la app está cerrada; recuperará los cambios al abrirla o volver a ella.

## Prueba recomendada

1. Desde el teléfono de Lau agrega `Leche`.
2. Solo los dispositivos registrados como Axel deben recibir el aviso.
3. Desde Axel márcalo como comprado.
4. Solo los dispositivos de Lau deben recibir el cambio.
5. Acerca ambos teléfonos al mismo tag NFC y verifica que cada uno muestre su propio saludo.
6. Crea un servicio recurrente de prueba, márcalo pagado y confirma que aparezca exactamente un siguiente vencimiento.
7. Busca un producto del catálogo desde un tipo de pendiente distinto y confirma que también aparezca.
8. Edita ese producto, toma una foto, guarda y verifica que la miniatura aparezca en ambos teléfonos.

## Solución de problemas

### Un teléfono abre con el perfil equivocado

Entra a **Perfil → Este teléfono es de…**, selecciona a la persona correcta y vuelve a abrir la app. Es un ajuste local de ese dispositivo.

### No llega una notificación

- Verifica el permiso en **Ajustes → Aplicaciones → Chrome o Samsung Internet → Notificaciones**.
- Revisa el permiso del sitio dentro del navegador.
- No uses modo incógnito.
- Confirma que cada teléfono tenga un dueño diferente.
- Prueba agregar desde un teléfono y observa el otro; la app excluye deliberadamente al dispositivo de origen.

### Apps Script dice que ya está enlazado

Usa **Casa en Orden → Restablecer enlace de notificaciones** en la Hoja y vuelve a abrir la PWA correcta. Esto no elimina pendientes, catálogo ni comprobantes.

### Olvidé el PIN

El PIN se almacena como hash y no puede recuperarse. Para reiniciar el hogar, cambia `HOME_OBJECT_NAME` en `pwa-cloudflare/src/worker.js` por un nombre nuevo y único, publica, restablece el enlace desde la Hoja y vuelve a vincular ambos teléfonos.

## Privacidad

- El PIN se guarda como hash.
- La URL de Apps Script solo se entrega a teléfonos vinculados.
- Leer o modificar datos requiere el token privado creado para el hogar.
- El secreto de envío permanece en las propiedades privadas de Apps Script.
- Los datos siguen en tu Hoja de cálculo y los archivos en tu Drive.

## Requisitos

- Android con Chrome o Samsung Internet reciente.
- La Hoja y el proyecto de Apps Script.
- GitHub y Cloudflare Workers.
