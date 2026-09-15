# Casa en Orden 3.0 — PWA con notificaciones, sin Firebase

Esta versión parte del respaldo `Respaldo_AppsScript_Casa_en_Orden_20260821_000533.zip` y conserva la app, la Hoja de cálculo y los comprobantes en Google Drive. GitHub y Cloudflare solo publican la versión instalable y entregan las notificaciones Web Push.

No tienes que crear un proyecto de Firebase, generar llaves VAPID, configurar una cuenta de servicio ni copiar secretos entre plataformas. La primera pantalla hace esa configuración automáticamente.

## Qué contiene

| Carpeta | Para qué sirve |
|---|---|
| `apps-script/` | La versión actualizada del proyecto de Google Apps Script. |
| `pwa-cloudflare/` | El proyecto que se sube a GitHub y se publica en Cloudflare. |

## Instalación rápida

### 1. Actualiza Apps Script

1. Abre la Hoja de cálculo de Casa en Orden.
2. Entra a **Extensiones → Apps Script**.
3. Reemplaza el contenido de tus archivos por los cinco archivos de `apps-script/`:
   - `Code.gs`
   - `Index.html`
   - `Scripts.html`
   - `Styles.html`
   - `appsscript.json`
4. Guarda el proyecto.
5. En el selector de funciones, ejecuta una vez `setupCasaEnOrden_` y acepta los permisos de Google.
6. Ve a **Implementar → Administrar implementaciones**, edita tu Web App y elige **Nueva versión**.
7. Confirma estas opciones:
   - **Ejecutar como:** Yo.
   - **Quién tiene acceso:** Cualquier usuario.
8. Implementa y copia la URL que termina en `/exec`.

> Usa la implementación `/exec`, no la URL del editor ni la implementación de prueba `/dev`.

### 2. Sube la parte de Cloudflare a GitHub

Puedes hacerlo igual que con el proyecto de la boda:

1. Crea un repositorio privado nuevo en GitHub.
2. Sube **el contenido completo de este paquete**, respetando las carpetas.
3. En Cloudflare entra a **Workers & Pages → Create → Import a repository**.
4. Selecciona el repositorio y usa:
   - **Root directory:** `pwa-cloudflare`
   - **Build command:** déjalo vacío.
   - **Deploy command:** `npx wrangler deploy`
5. Pulsa **Deploy**.

Cloudflare creará automáticamente el almacenamiento seguro del hogar durante esa primera publicación. No necesitas crear KV, variables ni secretos.

### 3. Vincula el primer teléfono

1. Abre la dirección `*.workers.dev` que te entregue Cloudflare.
2. Pega la URL `/exec` de Apps Script.
3. Elige **Axel** o **Laura**.
4. Crea un PIN de al menos 6 caracteres y guárdalo; será el PIN compartido del hogar.
5. Toca **Crear hogar y activar**.
6. Cuando el teléfono pregunte, elige **Permitir notificaciones**.
7. Debes recibir una notificación de prueba.
8. Toca **Instalar** o usa **menú ⋮ → Agregar a pantalla de inicio**.

En ese proceso se generan las llaves Web Push, se protege la Web App y Apps Script se enlaza con Cloudflare sin copiar ninguna clave a mano.

### 4. Vincula el segundo teléfono

1. Abre la misma URL de Cloudflare.
2. Elige a la otra persona.
3. Escribe el mismo PIN.
4. Permite las notificaciones e instala la app.

## Prueba final

1. En el teléfono de Laura agrega, por ejemplo, **Leche** a Despensa.
2. El teléfono de Axel debe recibir el aviso aun con la app cerrada.
3. Márcalo como comprado desde Axel; Laura debe recibir el cambio.

La app no envía el aviso al teléfono que realizó la acción. Por eso es importante que un teléfono esté identificado como Axel y el otro como Laura.

## Cómo se actualiza después

- Un cambio enviado a la rama principal de GitHub vuelve a publicar automáticamente la PWA en Cloudflare.
- Un cambio dentro de `apps-script/` requiere crear una **nueva versión** de la misma implementación en Apps Script.
- Conserva la misma URL `/exec` y el mismo Worker para no tener que volver a vincular los teléfonos.

## Si algo no funciona

### La pantalla dice que no puede enlazar Apps Script

- Confirma que pegaste una URL que termina en `/exec`.
- Revisa que implementaste la versión nueva.
- Confirma que la Web App está ejecutándose como tú y con acceso para cualquier usuario.

### No llega la notificación

- En Android abre **Ajustes → Aplicaciones → Chrome o Samsung Internet → Notificaciones** y verifica que estén permitidas.
- Revisa también el permiso del sitio dentro del navegador.
- No uses modo incógnito.
- Comprueba que los dos teléfonos estén vinculados con personas distintas.

### Apps Script dice que ya está enlazado con otra PWA

En la Hoja de cálculo usa el menú **Casa en Orden → Restablecer enlace de notificaciones**. Después vuelve a abrir la URL correcta de Cloudflare. Esto no elimina pendientes ni comprobantes.

### Olvidé el PIN

El PIN no se puede leer porque se guarda como un hash. Para empezar de nuevo:

1. En `pwa-cloudflare/src/worker.js`, cambia `casa-en-orden-v3` por `casa-en-orden-v4`.
2. Sube el cambio a GitHub y espera la nueva publicación.
3. En la Hoja usa **Casa en Orden → Restablecer enlace de notificaciones**.
4. Vuelve a vincular ambos teléfonos y crea un PIN nuevo.

## Privacidad y seguridad

- El PIN se guarda como hash, no como texto legible.
- La URL de Apps Script solo se entrega a teléfonos que demostraron conocer el PIN.
- Todas las lecturas y cambios de Apps Script requieren un token creado automáticamente para el hogar.
- El secreto que permite enviar notificaciones se guarda en propiedades privadas de Apps Script.
- La Web App se publica con acceso amplio porque se muestra dentro de la PWA, pero abrir directamente su URL no permite leer ni cambiar tus datos.
- Los pendientes continúan en tu Hoja de cálculo y los comprobantes en tu Drive.

## Requisitos

- Android con una versión reciente de Chrome o Samsung Internet.
- Una cuenta gratuita de GitHub.
- Una cuenta gratuita de Cloudflare Workers.
- La Hoja y el proyecto de Apps Script existentes.

