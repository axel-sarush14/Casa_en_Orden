# PWA de Casa en Orden 4.3.3

Esta carpeta es la raíz del proyecto de Cloudflare.

```bash
npm install
npm test
npm run dev
```

Para publicar manualmente:

```bash
npm run deploy
```

Si subes **el contenido de esta carpeta** a la raíz de GitHub, como en el repositorio actual, usa:

- **Root directory:** `/`
- **Build command:** vacío
- **Deploy command:** `npx wrangler deploy`

Al actualizar desde 4.2 o 4.3, conserva `HOME_OBJECT_NAME`, el nombre del Worker, `HOME_REGISTRY` y el `manifest.id`. Así se mantienen el hogar, el PIN, las suscripciones y la instalación existente.

El enlace para el tag es `https://TU-WORKER.workers.dev/?modo=nfc`. Consulta la guía completa en el `README.md` de la carpeta superior.
