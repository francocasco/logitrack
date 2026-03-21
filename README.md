# LogiTrack — MVP Sistema Logístico

Sistema logístico simple y funcional con Node.js, Express y SQLite.

## Estructura del proyecto

```
logitrack/
├── server.js              ← Servidor Express + rutas API
├── package.json
├── db/
│   └── database.js        ← Lógica SQLite (se crea sola al iniciar)
└── public/
    ├── index.html          ← SPA (única página HTML)
    ├── css/
    │   └── style.css
    └── js/
        └── app.js          ← Lógica del frontend
```

## Instalación y uso

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar servidor
npm start

# 3. Abrir en el navegador
http://localhost:3000
```

> La base de datos `db/logitrack.db` se crea automáticamente al primer inicio.

## API endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `POST` | `/api/envios` | Crear envío |
| `GET` | `/api/envios` | Listar todos |
| `GET` | `/api/envios/:trackingId` | Buscar por tracking |
| `PATCH` | `/api/envios/:trackingId/estado` | Avanzar estado |

## Flujo de estados

```
creado → en tránsito → en sucursal → entregado
```
