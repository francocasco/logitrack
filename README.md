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
# Documentación Swagger — LogiTrack

## Introducción

Para la documentación de los endpoints del sistema se implementó Swagger, utilizando la especificación OpenAPI Specification.

Esta herramienta permite generar automáticamente una interfaz web interactiva donde se pueden visualizar, entender y probar los distintos endpoints de la API sin necesidad de herramientas externas como Postman.

Su uso facilita tanto el desarrollo como las tareas de testing, permitiendo validar rápidamente el comportamiento del sistema.

---

## Acceso a la documentación

Una vez iniciado el servidor, la documentación se encuentra disponible en:

http://localhost:3000/api-docs

Desde esta URL se accede a una interfaz gráfica donde se listan todos los endpoints disponibles, junto con sus métodos HTTP, parámetros, ejemplos de entrada y posibles respuestas.

---

## Funcionalidades documentadas

La documentación incluye todos los endpoints implementados en el sistema, organizados en dos grandes grupos:

### 1. Autenticación

* **POST /api/auth/login**

  * Permite iniciar sesión en el sistema mediante email y contraseña.
  * Devuelve un token de autenticación.

* **POST /api/auth/logout**

  * Permite cerrar la sesión del usuario autenticado.

* **GET /api/auth/verificar**

  * Verifica si el token enviado es válido o ha expirado.

---

### 2. Gestión de envíos

* **POST /api/envios**

  * Permite crear un nuevo envío.
  * Requiere autenticación previa.
  * Valida los datos de entrada (remitente, destinatario, producto).

* **GET /api/envios**

  * Devuelve una lista paginada de envíos.
  * Permite filtrar por estado.
  * Incluye parámetros opcionales como página y cantidad por página.

* **GET /api/envios/{trackingId}**

  * Permite consultar un envío específico mediante su tracking ID.

* **PATCH /api/envios/{trackingId}/estado**

  * Permite actualizar el estado de un envío dentro del flujo logístico.

---

## Seguridad

Los endpoints de gestión de envíos están protegidos mediante autenticación basada en token.

Para acceder a estos endpoints, es necesario:

1. Realizar login mediante `/api/auth/login`.
2. Obtener el token.
3. Enviar el token en el header:

Authorization: Bearer <token>

Swagger permite ingresar este token manualmente al probar los endpoints protegidos.

---

## Uso de Swagger

La interfaz de Swagger permite:

* Visualizar todos los endpoints disponibles.
* Consultar la estructura de datos requerida para cada operación.
* Ejecutar solicitudes directamente desde el navegador.
* Analizar las respuestas del servidor en tiempo real.
* Validar códigos de estado HTTP (200, 400, 401, 404, 500).

---

## Implementación técnica

La integración de Swagger se realizó utilizando las librerías:

* swagger-ui-express
* swagger-jsdoc

Se configuró un objeto de definición OpenAPI dentro del servidor, indicando:

* Versión de la API
* Información general del sistema
* Servidor base (localhost:3000)
* Archivos donde se documentan los endpoints

Los endpoints fueron documentados mediante comentarios en formato JSDoc directamente en el archivo principal del servidor (`server.js`), permitiendo que la documentación se genere automáticamente a partir del código.

---

## Beneficios de la implementación

La incorporación de Swagger aporta múltiples ventajas:

* Documentación centralizada y siempre actualizada.
* Mejora la comprensión del sistema para nuevos desarrolladores.
* Facilita el testing manual sin herramientas externas.
* Permite validar rápidamente cambios en la API.
* Mejora la calidad del producto final.

---

## Conclusión

La integración de Swagger en LogiTrack permite contar con una documentación clara, interactiva y alineada con estándares de la industria, facilitando tanto el desarrollo como la validación del sistema.

Esta herramienta resulta fundamental para garantizar la mantenibilidad y escalabilidad del proyecto.
