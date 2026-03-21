require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./db/database');

const app = express();
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
//  RUTAS DE AUTENTICACIÓN (públicas)
// ─────────────────────────────────────────

// POST /api/auth/login
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
app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) await db.logout(token);
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
});

// GET /api/auth/verificar
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
