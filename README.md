# Casa en Orden 4.3.2 — arranque reforzado en la app instalada

Esta versión corrige el bloqueo en **Preparando tu hogar…** que puede ocurrir aun cuando la implementación de Apps Script sea la correcta. El origen es el arranque dentro del marco externo de Google: algunos teléfonos bloquean su almacenamiento local o no entregan a tiempo el primer mensaje de Cloudflare. La versión 4.3.2 tolera ambas situaciones y conserva pendientes, catálogo, fotos, Hoja de cálculo, PIN, teléfonos y comprobantes.

GitHub y Cloudflare publican la PWA y entregan Web Push directo. No usa Firebase ni requiere crear llaves manualmente.

## Novedades

- Tolera que Android bloquee `localStorage` dentro del marco de Apps Script, sin detener el JavaScript.
- Entrega la configuración del puente por dos vías: `postMessage` y un fragmento privado del iframe que no se envía al servidor.
- Inicia correctamente aunque el navegador haya terminado de construir el documento antes de registrar el evento de arranque.
- La PWA consulta primero en red `app.js`, `app.css` y el manifiesto para no seguir usando una copia anterior después de publicar GitHub.
- Valida al iniciar que `Index.html` y `Scripts.html` contengan juntos los controles de fotografía de la versión 4.3.2.
- Si los archivos no coinciden, muestra instrucciones claras en pantalla en lugar de dejar el cargador indefinidamente.
- Si Cloudflare o Apps Script no terminan de enlazarse, muestra el error y un botón para volver a intentar.
- Cada teléfono queda identificado de forma permanente como **Axel** o **Lau/Laura**.
- Al abrir normalmente, la app entra con el perfil propio del teléfono.
- El cambio de persona dentro de la app es temporal y no modifica al dueño del dispositivo.
- Un tag NFC puede abrir el acceso rápido con **Agregar pendiente** o **Ver la aplicación**, usando automáticamente la identidad del teléfono.
- Los avisos se envían únicamente a los dispositivos de la otra persona y nunca al dispositivo que hizo el cambio.
- Ya no consulta los datos cada dos minutos: actualiza al guardar, recibir un push, abrir o regresar a la app, y al tocar el botón de actualización.
- Los servicios pueden ser de pago **Único** o **Recurrente**.
- Al marcar como pagado un servicio recurrente, se genera una sola vez el siguiente vencimiento.
- El catálogo es único para toda la casa: busca coincidencias sin importar si el pendiente es de despensa, servicio, reparación u otro tipo.
- En **Nuevo pendiente**, el catálogo ya no despliega productos al abrir: las coincidencias aparecen solamente después de escribir y se limitan a las siete más cercanas.
- El formulario del catálogo se reduce a nombre del producto, descripción o referencia, enlace de compra e imagen.
- Los datos anteriores de producto, marca, modelo, especificaciones, presentación y ubicación se conservan y se muestran juntos en la descripción.
- El campo de URL de imagen se sustituye por **Tomar o elegir foto**.
- La app muestra una vista previa y reduce automáticamente las fotos grandes antes de subirlas.
- Los pendientes de despensa, reparación u otro tipo también permiten **Tomar o elegir foto** al momento de registrarlos.
- La foto propia del pendiente se muestra como miniatura en la lista y en grande al abrir el detalle; si no tiene una, puede usar la imagen vinculada del catálogo.
- Los servicios conservan su flujo separado de comprobante, compatible con fotografía o PDF.
- Las fotos se guardan en Drive y se muestran en ambos teléfonos.

## Contenido del paquete

| Carpeta | Uso |
|---|---|
| `apps-script/` | Código actualizado de Google Apps Script. |
| `pwa-cloudflare/` | PWA y Worker que se publican desde GitHub en Cloudflare. |

## Corregir una instalación que se queda cargando

Para esta corrección deben actualizarse **Apps Script y GitHub/Cloudflare**, porque la nueva conexión alternativa usa ambos lados:

1. En Apps Script sustituye **completos** `Index.html`, `Scripts.html` y `Styles.html` con los tres archivos de este paquete. No mezcles fragmentos.
2. Sustituye también `Code.gs` y `appsscript.json` para dejar los cinco archivos en la misma versión.
3. Pulsa **Guardar proyecto** y espera a que termine.
4. Ve a **Implementar → Administrar implementaciones → Editar**.
5. En **Versión**, elige **Nueva versión** y pulsa **Implementar**. No basta con guardar el editor.
6. Conserva la misma URL `/exec`.
7. En GitHub reemplaza también la carpeta `pwa-cloudflare` con la de este paquete, confirma los cambios y espera a que Cloudflare marque el despliegue como correcto.
8. En el teléfono, cierra Casa en Orden desde aplicaciones recientes y vuelve a abrirla. Si estaba abierta durante el despliegue, ciérrala y ábrela una segunda vez. No hace falta desinstalarla.

No restablezcas el enlace, no cambies el PIN y no vuelvas a registrar los teléfonos.

## Actualizar una instalación 4.2 o 4.3 existente

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
6. El área de resultados permanece oculta mientras el buscador esté vacío. Al escribir, la app muestra como máximo siete coincidencias, ordena primero las más cercanas y completa el título, el detalle y el enlace; todavía puedes ajustarlos para ese pendiente.

Elegir un producto del catálogo no cambia el tipo del pendiente: **Despensa**, **Servicio**, **Reparación** y **Otro** siguen sirviendo para organizar la lista. Los productos pueden desactivarse sin borrarlos y los pendientes anteriores conservan la información que tenían al momento de crearse.

Los productos guardados en 4.0 no necesitan capturarse otra vez. Al abrirlos, la app combina automáticamente el producto, marca, modelo, especificaciones, presentación y ubicación anteriores en la nueva descripción. La hoja conserva las columnas antiguas internamente para mantener compatibilidad con los datos existentes.

### Fotos del catálogo

- No se solicita una URL: la foto se toma o se elige directamente desde el teléfono.
- Antes de subirla, la app la convierte a JPG y limita su dimensión máxima para ahorrar espacio y datos móviles.
- Al editar un producto, no elegir otra foto conserva la actual; **Quitar** elimina su vínculo del catálogo.
- La primera carga crea automáticamente en Drive la carpeta `Casa en Orden - Fotos del catálogo`.
- Cada imagen se habilita como visible mediante enlace para que pueda mostrarse en los dos teléfonos sin pedir inicio de sesión. El enlace es difícil de adivinar, pero no debe usarse para fotografías privadas o sensibles.

## Fotos al crear un pendiente

- En **Despensa**, **Reparación** y **Otro**, pulsa **Tomar o elegir foto**. Android mostrará la cámara y la galería disponibles en el teléfono.
- La app enseña una vista previa antes de guardar, permite cambiarla o quitarla y la reduce automáticamente para ahorrar datos.
- Al guardar, la foto aparece como miniatura en la lista y en tamaño grande dentro del detalle del pendiente.
- Si seleccionaste un producto del catálogo y no agregas una foto especial, la app utiliza la imagen de ese producto como referencia.
- Al editar un pendiente, no elegir otra foto conserva la existente; **Quitar** desvincula la foto del registro.
- Para **Servicio**, el mismo espacio cambia a **Comprobante del servicio** y acepta una imagen o un PDF, como en las versiones anteriores.
- La primera foto de un pendiente crea en Drive la carpeta `Casa en Orden - Fotos de pendientes`.
- Las fotos de pendientes se habilitan mediante enlace para que se vean en los dos teléfonos. Evita fotografías privadas o sensibles.

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
9. Abre **Nuevo pendiente** y confirma que no se muestre ninguna lista del catálogo hasta escribir en el buscador.
10. Registra un artículo de despensa con **Tomar o elegir foto** y comprueba que aparezca en la tarjeta y en su detalle.
11. Crea o edita un servicio y confirma que el selector siga aceptando comprobantes en imagen o PDF.

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
- Las fotos del catálogo y de pendientes usan enlaces no listados para poder mostrarse en ambos teléfonos; no deben contener información sensible.

## Requisitos

- Android con Chrome o Samsung Internet reciente.
- La Hoja y el proyecto de Apps Script.
- GitHub y Cloudflare Workers.
