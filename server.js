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
function requireAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const usuario = db.verificarToken(token);

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
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'El email y la contraseña son obligatorios.' });
  }

  try {
    const resultado = db.login(email.trim().toLowerCase(), password);

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
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) db.logout(token);
  res.json({ mensaje: 'Sesión cerrada correctamente.' });
});

// GET /api/auth/verificar — para que el frontend compruebe si el token sigue siendo válido
app.get('/api/auth/verificar', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  const usuario = db.verificarToken(token);

  if (!usuario) {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }

  res.json({ email: usuario.email });
});

// ─────────────────────────────────────────
//  RUTAS API (protegidas)
// ─────────────────────────────────────────

// POST /api/envios — Crear envío
app.post('/api/envios', requireAuth, (req, res) => {
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
    const trackingId = db.crearEnvio(remitente.trim(), destinatario.trim(), producto.trim());
    res.status(201).json({ mensaje: 'Envío creado exitosamente.', trackingId });
  } catch (err) {
    console.error('Error al crear envío:', err.message);
    res.status(500).json({ error: 'No se pudo crear el envío. Intente nuevamente.' });
  }
});

// GET /api/envios — Listar envíos
app.get('/api/envios', requireAuth, (req, res) => {
  const pagina    = Math.max(1, parseInt(req.query.pagina) || 1);
  const porPagina = Math.min(50, Math.max(1, parseInt(req.query.porPagina) || 10));
  const estado    = req.query.estado || null;

  try {
    const resultado = db.listarEnvios(pagina, porPagina, estado);
    res.json(resultado);
  } catch (err) {
    console.error('Error al listar envíos:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los envíos.' });
  }
});

// GET /api/envios/:trackingId — Buscar y ver detalle
app.get('/api/envios/:trackingId', requireAuth, (req, res) => {
  try {
    const envio = db.buscarPorTracking(req.params.trackingId.toUpperCase());
    if (!envio) {
      return res.status(404).json({ error: 'Envío no encontrado.' });
    }
    res.json(envio);
  } catch (err) {
    console.error('Error al buscar envío:', err.message);
    res.status(500).json({ error: 'No se pudo consultar el envío.' });
  }
});

// PATCH /api/envios/:trackingId/estado — Avanzar estado
app.patch('/api/envios/:trackingId/estado', requireAuth, (req, res) => {
  try {
    const resultado = db.cambiarEstado(req.params.trackingId.toUpperCase());
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

app.listen(PORT, () => {
  console.log(`\n✅ LogiTrack corriendo en http://localhost:${PORT}\n`);
});
