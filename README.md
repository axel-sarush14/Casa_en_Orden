# PWA de Casa en Orden 5.1

El contenido de esta carpeta debe quedar directamente en la raíz del repositorio conectado a Cloudflare.

```bash
npm install
npm run check
npm run dev
```

Configuración de Cloudflare:

- **Root directory:** `/`
- **Build command:** vacío
- **Deploy command:** `npx wrangler deploy`

Esta versión no usa Workers AI ni requiere un binding `AI`. Conserva Web Push directo, Durable Objects y la instalación existente.

Al actualizar, conserva el nombre del Worker, `HOME_OBJECT_NAME`, `HOME_REGISTRY` y `manifest.id`. El enlace NFC sigue siendo:

```text
https://TU-WORKER.workers.dev/?modo=nfc
```

Consulta la guía completa en el `README.md` de la carpeta superior.
