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

# 2. Cargar datos semilla (opcional)
npm run seed

# 3. Iniciar servidor
npm start

# 4. Abrir en el navegador
http://localhost:3000
```

> La base de datos `db/logitrack.db` se crea automáticamente al primer inicio.

## Datos semilla

El proyecto incluye un script para cargar envíos de ejemplo para probar el CRUD:

```bash
npm run seed
```

Este comando inserta varios registros de `envios` con distintos estados (`creado`, `en tránsito`, `en sucursal`, `entregado`) usando `INSERT OR IGNORE`, por lo que se puede ejecutar más de una vez sin duplicar los tracking IDs fijos.

## Reset de base

Si querés limpiar la base y volver al estado inicial, podés ejecutar:

```bash
npm run reset-db
```

Este comando vacía las tablas `sesiones`, `envios` y `usuarios`, reinicia la estructura y vuelve a crear el usuario administrador inicial si está configurado en el `.env`.

Flujo recomendado para pruebas:

```bash
npm run reset-db
npm run seed
```

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
