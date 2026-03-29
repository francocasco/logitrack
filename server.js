require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db/database');

//Swagger
const swaggerUi = require('swagger-ui-express');
const swaggerJsDoc = require('swagger-jsdoc');

const app = express();


const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LogiTrack API",
      version: "1.0.0",
      description: "API para gestión de envíos"
    },
    servers: [
      {
        url: "http://localhost:3000"
      }
    ]
  },
  apis: ["./server.js"],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─────────────────────────────────────────
//  MIDDLEWARE DE AUTENTICACIÓN
// ─────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const usuario = await db.verificarToken(token);

  if (!usuario) {
    return res.status(401).json({ error: 'No autorizado. Iniciá sesión para continuar.' });
  }

  req.usuario = usuario;
  next();
}

// ─────────────────────────────────────────
//  RUTAS DE REGISTRO (públicas)
// ─────────────────────────────────────────

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Crear cuenta de usuario
 *     description: Registra un nuevo usuario en el sistema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: usuario@email.com
 *             telefono: "+54 11 1234-5678"
 *             nombreUsuario: juanperez
 *             password: 123456
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: Email ya registrado
 */
app.post('/api/auth/register', async (req, res) => {
  const { email, telefono, nombreUsuario, password } = req.body;

  if (!email || !telefono || !nombreUsuario || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  if (nombreUsuario.trim().length < 3) {
    return res.status(400).json({ error: 'El nombre de usuario debe tener al menos 3 caracteres.' });
  }

  try {
    const resultado = await db.crearUsuario(
      email.trim().toLowerCase(),
      telefono.trim(),
      nombreUsuario.trim(),
      password
    );

    if (resultado.error) {
      return res.status(409).json({ error: resultado.error });
    }

    res.status(201).json({ mensaje: 'Cuenta creada correctamente. Ya podés iniciar sesión.' });
  } catch (err) {
    console.error('Error al registrar usuario:', err.message);
    res.status(500).json({ error: 'No se pudo crear la cuenta. Intente nuevamente.' });
  }
});

// ─────────────────────────────────────────
//  RUTAS DE AUTENTICACIÓN (públicas)
// ─────────────────────────────────────────

// POST /api/auth/login
/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     description: Permite autenticarse y obtener un token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: usuario@email.com
 *             password: 123456
 *     responses:
 *       200:
 *         description: Login exitoso
 *       400:
 *         description: Datos incompletos
 *       401:
 *         description: Credenciales inválidas
 */
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
  }

  try {
    const resultado = await db.login(email.trim().toLowerCase(), password);
    if (resultado.error) {
      return res.status(401).json({ error: resultado.error });
    }
    res.json({ mensaje: 'Sesión iniciada correctamente.', token: resultado.token });
  } catch (err) {
    console.error('Error en login:', err.message);
    res.status(500).json({ error: 'Error al iniciar sesión. Intente nuevamente.' });
  }
});

// POST /api/auth/logout
/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Cerrar sesión
 *     description: Cierra la sesión del usuario autenticado
 *     responses:
 *       200:
 *         description: Sesión cerrada correctamente
 */
app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) await db.logout(token);
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
});

// GET /api/auth/verificar
/**
 * @swagger
 * /api/auth/verificar:
 *   get:
 *     summary: Verificar sesión
 *     description: Verifica si el token es válido
 *     responses:
 *       200:
 *         description: Token válido
 *       401:
 *         description: Token inválido o expirado
 */
app.get('/api/auth/verificar', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const usuario = await db.verificarToken(token);

  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  res.json({ email: usuario.email });
});

// ─────────────────────────────────────────
//  RUTAS API (protegidas)
// ─────────────────────────────────────────

// POST /api/envios
/**
 * @swagger
 * /api/envios:
 *   post:
 *     summary: Crear envío
 *     description: Registra un nuevo envío en el sistema
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             remitente: Juan Pérez
 *             destinatario: María López
 *             producto: Celular
 *     responses:
 *       201:
 *         description: Envío creado correctamente
 *       400:
 *         description: Datos inválidos
 */
app.post('/api/envios', requireAuth, async (req, res) => {
  const { remitente, destinatario, producto } = req.body;

  if (!remitente || !destinatario || !producto) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios: remitente, destinatario y producto.' });
  }
  if (remitente.trim().length < 2 || destinatario.trim().length < 2) {
    return res.status(400).json({ error: 'El remitente y destinatario deben tener al menos 2 caracteres.' });
  }
  if (remitente.length > 100 || destinatario.length > 100 || producto.length > 200) {
    return res.status(400).json({ error: 'Uno o más campos superan la longitud máxima permitida.' });
  }

  try {
    const trackingId = await db.crearEnvio(remitente.trim(), destinatario.trim(), producto.trim());
    res.status(201).json({ mensaje: 'Envío creado exitosamente.', trackingId });
  } catch (err) {
    console.error('Error al crear envío:', err.message);
    res.status(500).json({ error: 'No se pudo crear el envío. Intente nuevamente.' });
  }
});

// GET /api/envios
/**
 * @swagger
 * /api/envios:
 *   get:
 *     summary: Listar envíos
 *     description: Devuelve una lista paginada de envíos
 *     parameters:
 *       - in: query
 *         name: pagina
 *         schema:
 *           type: integer
 *       - in: query
 *         name: porPagina
 *         schema:
 *           type: integer
 *       - in: query
 *         name: estado
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista de envíos
 */
app.get('/api/envios', requireAuth, async (req, res) => {
  const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
  const porPagina = Math.min(50, Math.max(1, parseInt(req.query.porPagina) || 10));
  const estado    = req.query.estado || null;

  try {
    const resultado = await db.listarEnvios(pagina, porPagina, estado);
    res.json(resultado);
  } catch (err) {
    console.error('Error al listar envíos:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los envíos.' });
  }
});

// GET /api/envios/:trackingId
/**
 * @swagger
 * /api/envios/{trackingId}:
 *   get:
 *     summary: Buscar envío por tracking ID
 *     description: Devuelve un envío específico
 *     parameters:
 *       - in: path
 *         name: trackingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Envío encontrado
 *       404:
 *         description: Envío no encontrado
 */
app.get('/api/envios/:trackingId', requireAuth, async (req, res) => {
  try {
    const envio = await db.buscarPorTracking(req.params.trackingId.toUpperCase());
    if (!envio) {
      return res.status(404).json({ error: 'Envío no encontrado.' });
    }
    res.json(envio);
  } catch (err) {
    console.error('Error al buscar envío:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el envío.' });
  }
});

// PATCH /api/envios/:trackingId/estado
/**
 * @swagger
 * /api/envios/{trackingId}/estado:
 *   patch:
 *     summary: Cambiar estado del envío
 *     description: Avanza el estado del envío en el flujo logístico
 *     parameters:
 *       - in: path
 *         name: trackingId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estado actualizado correctamente
 *       400:
 *         description: Error en la transición de estado
 *       404:
 *         description: Envío no encontrado
 */
app.patch('/api/envios/:trackingId/estado', requireAuth, async (req, res) => {
  try {
    const resultado = await db.cambiarEstado(req.params.trackingId.toUpperCase());
    if (!resultado) {
      return res.status(404).json({ error: 'Envío no encontrado.' });
    }
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }
    res.json({ mensaje: `Estado actualizado a "${resultado.nuevoEstado}".`, ...resultado });
  } catch (err) {
    console.error('Error al cambiar estado:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el estado del envío.' });
  }
});

// ─────────────────────────────────────────
//  MANEJO DE ERRORES GLOBAL
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error inesperado:', err.message);
  res.status(500).json({ error: 'Ocurrió un error inesperado en el servidor.' });
});

// ─────────────────────────────────────────
//  RUTAS FRONTEND
// ─────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─────────────────────────────────────────
//  INICIO — inicializar DB antes de escuchar
// ─────────────────────────────────────────
// Solo iniciar el servidor si este archivo se ejecuta directamente (npm start)
if (require.main === module) {
  db.inicializar()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`\n✅ LogiTrack corriendo en http://localhost:${PORT}\n`);
      });
    })
    .catch(err => {
      console.error('❌ Error al inicializar la base de datos:', err.message);
      process.exit(1);
    });
}

// Exportar app para Jest + Supertest
module.exports = app;
