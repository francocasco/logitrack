require('dotenv').config();
const { createClient } = require('@libsql/client');
const { inicializar } = require('./database');

const client = createClient({
  url: process.env.TURSO_URL || 'file:./db/database.db',
  authToken: process.env.TURSO_TOKEN || undefined
});

async function resetearBase() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS envios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingId TEXT UNIQUE NOT NULL,
      remitente TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      producto TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'creado',
      fechaCreacion TEXT NOT NULL,
      fechaActualizacion TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'cliente'
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      telefono TEXT NOT NULL,
      nombreUsuario TEXT NOT NULL,
      passwordHash TEXT NOT NULL,
      intentosFallidos INTEGER NOT NULL DEFAULT 0,
      bloqueadoHasta TEXT,
      fechaCreacion TEXT NOT NULL,
      rol TEXT NOT NULL DEFAULT 'Cliente'
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuarioId INTEGER NOT NULL,
      creadaEn TEXT NOT NULL,
      FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
    )
  `);

  await client.execute('DELETE FROM sesiones');
  await client.execute('DELETE FROM historial_estados');
  await client.execute('DELETE FROM historial_envios');
  await client.execute('DELETE FROM log_estructuracion');
  await client.execute('DELETE FROM envios');
  await client.execute('DELETE FROM usuarios');

  try {
    await client.execute("DELETE FROM sqlite_sequence WHERE name IN ('sesiones', 'historial_estados', 'historial_envios', 'log_estructuracion', 'envios', 'usuarios')");
  } catch (error) {
    console.warn('ℹ️ No se pudo reiniciar sqlite_sequence:', error.message);
  }

  await inicializar();

  const [envios, usuarios, sesiones] = await Promise.all([
    client.execute('SELECT COUNT(*) AS total FROM envios'),
    client.execute('SELECT COUNT(*) AS total FROM usuarios'),
    client.execute('SELECT COUNT(*) AS total FROM sesiones')
  ]);

  console.log('🧹 Base reseteada correctamente.');
  console.table([
    { tabla: 'envios', total: Number(envios.rows[0].total) },
    { tabla: 'usuarios', total: Number(usuarios.rows[0].total) },
    { tabla: 'sesiones', total: Number(sesiones.rows[0].total) }
  ]);
}

resetearBase().catch((error) => {
  console.error('❌ Error al resetear la base:', error);
  process.exit(1);
});
