# PWA de Casa en Orden 5.0

Esta carpeta debe quedar en la raíz del repositorio conectado a Cloudflare.

```bash
npm install
npm run check
npm run dev
```

Configuración de Cloudflare:

- **Root directory:** `/`
- **Build command:** vacío
- **Deploy command:** `npx wrangler deploy`

El binding `AI` de `wrangler.jsonc` habilita Workers AI sin API keys. El Worker usa `@cf/black-forest-labs/flux-1-schnell` para crear imágenes ilustrativas del catálogo y autentica cada solicitud con el dispositivo vinculado.

Al actualizar, conserva el nombre del Worker, `HOME_OBJECT_NAME`, `HOME_REGISTRY` y `manifest.id`. El enlace NFC sigue siendo:

```text
https://TU-WORKER.workers.dev/?modo=nfc
```

Consulta la guía completa en el `README.md` de la carpeta superior.
