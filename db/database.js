require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const DB_NAME = process.env.DB_NAME || 'LogiTrack.db';
const DB_PATH = path.join(__dirname, DB_NAME);

let db;
try {
  db = new Database(DB_PATH);
} catch (err) {
  console.error('No se pudo conectar con la base de datos:', err.message);
  process.exit(1);
}

// ─── TABLAS ───────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackingId TEXT UNIQUE NOT NULL,
    remitente TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    producto TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'creado',
    fechaCreacion TEXT NOT NULL,
    fechaActualizacion TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    passwordHash TEXT NOT NULL,
    intentosFallidos INTEGER NOT NULL DEFAULT 0,
    bloqueadoHasta TEXT
  );

  CREATE TABLE IF NOT EXISTS sesiones (
    token TEXT PRIMARY KEY,
    usuarioId INTEGER NOT NULL,
    creadaEn TEXT NOT NULL,
    FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
  );
`);

// ─── USUARIO INICIAL ──────────────────────────────────────────
// Crea el usuario admin al iniciar si no existe
(function crearUsuarioInicial() {
  const email = process.env.ADMIN_EMAIL;
  const pass  = process.env.ADMIN_PASS;

  if (!email || !pass) {
    console.warn('⚠️  ADMIN_EMAIL o ADMIN_PASS no definidos en .env. No se creó usuario inicial.');
    return;
  }

  const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email);
  if (existe) return;

  const passwordHash = bcrypt.hashSync(pass, 10);
  db.prepare('INSERT INTO usuarios (email, passwordHash) VALUES (?, ?)').run(email, passwordHash);
  console.log(`✅ Usuario inicial creado: ${email}`);
})();

// ─── CONSTANTES ───────────────────────────────────────────────
const MAX_INTENTOS   = 3;
const BLOQUEO_MIN    = 10;
const ESTADOS        = ['creado', 'en tránsito', 'en sucursal', 'entregado'];

// ─── FUNCIONES DE AUTENTICACIÓN ───────────────────────────────
module.exports = {

  // Iniciar sesión — devuelve { token } o { error }
  login(email, password) {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);

    if (!usuario) {
      return { error: 'Email o contraseña incorrectos.' };
    }

    // Verificar bloqueo
    if (usuario.bloqueadoHasta) {
      const hasta = new Date(usuario.bloqueadoHasta);
      if (new Date() < hasta) {
        const minutosRestantes = Math.ceil((hasta - new Date()) / 60000);
        return { error: `Cuenta bloqueada. Intentá nuevamente en ${minutosRestantes} minuto${minutosRestantes !== 1 ? 's' : ''}.` };
      } else {
        // Bloqueo expirado, resetear intentos
        db.prepare('UPDATE usuarios SET intentosFallidos = 0, bloqueadoHasta = NULL WHERE id = ?').run(usuario.id);
        usuario.intentosFallidos = 0;
        usuario.bloqueadoHasta = null;
      }
    }

    // Verificar contraseña
    const passwordCorrecta = bcrypt.compareSync(password, usuario.passwordHash);

    if (!passwordCorrecta) {
      const nuevosIntentos = usuario.intentosFallidos + 1;

      if (nuevosIntentos >= MAX_INTENTOS) {
        const bloqueadoHasta = new Date(Date.now() + BLOQUEO_MIN * 60 * 1000).toISOString();
        db.prepare('UPDATE usuarios SET intentosFallidos = ?, bloqueadoHasta = ? WHERE id = ?')
          .run(nuevosIntentos, bloqueadoHasta, usuario.id);
        return { error: `Cuenta bloqueada por ${BLOQUEO_MIN} minutos por demasiados intentos fallidos.` };
      }

      db.prepare('UPDATE usuarios SET intentosFallidos = ? WHERE id = ?')
        .run(nuevosIntentos, usuario.id);

      const intentosRestantes = MAX_INTENTOS - nuevosIntentos;
      return { error: `Email o contraseña incorrectos. Te ${intentosRestantes === 1 ? 'queda' : 'quedan'} ${intentosRestantes} intento${intentosRestantes !== 1 ? 's' : ''}.` };
    }

    // Login exitoso — resetear intentos y crear sesión
    db.prepare('UPDATE usuarios SET intentosFallidos = 0, bloqueadoHasta = NULL WHERE id = ?').run(usuario.id);

    const token = uuidv4();
    db.prepare('INSERT INTO sesiones (token, usuarioId, creadaEn) VALUES (?, ?, ?)')
      .run(token, usuario.id, new Date().toISOString());

    return { token };
  },

  // Cerrar sesión — elimina el token
  logout(token) {
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
  },

  // Verificar token — devuelve el usuario o null
  verificarToken(token) {
    if (!token) return null;
    const sesion = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
    if (!sesion) return null;
    return db.prepare('SELECT id, email FROM usuarios WHERE id = ?').get(sesion.usuarioId);
  },

  // ─── ENVÍOS ─────────────────────────────────────────────────

  crearEnvio(remitente, destinatario, producto) {
    const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const prefijo = letras[Math.floor(Math.random() * 26)] + letras[Math.floor(Math.random() * 26)];
    const numero = Math.floor(100000 + Math.random() * 900000);
    const trackingId = `${prefijo}-${numero}`;
    const ahora = new Date().toISOString();

    db.prepare(`
      INSERT INTO envios (trackingId, remitente, destinatario, producto, estado, fechaCreacion, fechaActualizacion)
      VALUES (?, ?, ?, ?, 'creado', ?, ?)
    `).run(trackingId, remitente, destinatario, producto, ahora, ahora);

    return trackingId;
  },

  listarEnvios(pagina = 1, porPagina = 10, estado = null) {
    const offset = (pagina - 1) * porPagina;
    const whereClause = estado ? 'WHERE estado = ?' : '';
    const params = estado ? [estado, porPagina, offset] : [porPagina, offset];

    const envios = db.prepare(`
      SELECT * FROM envios ${whereClause}
      ORDER BY fechaCreacion DESC
      LIMIT ? OFFSET ?
    `).all(...params);

    const { total } = db.prepare(`
      SELECT COUNT(*) as total FROM envios ${whereClause}
    `).get(...(estado ? [estado] : []));

    return {
      envios,
      paginacion: { total, pagina, porPagina, totalPaginas: Math.ceil(total / porPagina) }
    };
  },

  buscarPorTracking(trackingId) {
    return db.prepare('SELECT * FROM envios WHERE trackingId = ?').get(trackingId);
  },

  cambiarEstado(trackingId) {
    const envio = db.prepare('SELECT * FROM envios WHERE trackingId = ?').get(trackingId);
    if (!envio) return null;

    const indexActual = ESTADOS.indexOf(envio.estado);
    if (indexActual === ESTADOS.length - 1) {
      return { error: 'El envío ya fue entregado, no puede avanzar más.' };
    }

    const nuevoEstado = ESTADOS[indexActual + 1];
    const ahora = new Date().toISOString();

    db.prepare('UPDATE envios SET estado = ?, fechaActualizacion = ? WHERE trackingId = ?')
      .run(nuevoEstado, ahora, trackingId);

    return { trackingId, nuevoEstado };
  },

  ESTADOS
};
