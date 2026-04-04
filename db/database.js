require("dotenv").config();
const { createClient } = require("@libsql/client");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

// ─── CONEXIÓN A TURSO ─────────────────────────────────────────
const db = createClient({
  url: process.env.TURSO_URL || "file:./db/database.db",
  authToken: process.env.TURSO_TOKEN || undefined,
});

// ─── CONSTANTES ───────────────────────────────────────────────
const MAX_INTENTOS = 3;
const BLOQUEO_MIN = 10;
const ESTADOS = ["creado", "en tránsito", "en sucursal", "entregado"];

// ─── INICIALIZACIÓN ───────────────────────────────────────────
async function inicializar() {
  // Crear tablas si no existen

  await db.execute(`
  CREATE TABLE IF NOT EXISTS historial_estados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trackingId TEXT NOT NULL,
    estado TEXT NOT NULL,
    fechaCambio TEXT NOT NULL,
    FOREIGN KEY (trackingId) REFERENCES envios(trackingId)
  )
`);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS historial_envios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingId TEXT NOT NULL,
      remitente TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      producto TEXT NOT NULL,
      direccionEntrega TEXT,
      estadoFinal TEXT NOT NULL,
      fechaCreacion TEXT NOT NULL,
      fechaEntrega TEXT NOT NULL
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS log_estructuracion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fechaUltima TEXT NOT NULL,
      registrosProcessados INTEGER NOT NULL
    )
  `);

  await db.execute(`
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

  try {
    await db.execute(
      `ALTER TABLE envios ADD COLUMN direccionEntrega TEXT NOT NULL DEFAULT ''`,
    );
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    await db.execute(
      `ALTER TABLE envios ADD COLUMN direccionRemitente TEXT NOT NULL DEFAULT ''`,
    );
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    await db.execute(
      `ALTER TABLE envios ADD COLUMN contactoRemitente TEXT NOT NULL DEFAULT ''`,
    );
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    await db.execute(
      `ALTER TABLE envios ADD COLUMN contactoDestinatario TEXT NOT NULL DEFAULT ''`,
    );
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  await db.execute(`
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

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuarioId INTEGER NOT NULL,
      creadaEn TEXT NOT NULL,
      FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
    )
  `);

  try {
    await db.execute(`ALTER TABLE usuarios ADD COLUMN nombre VARCHAR(50) NULL`);
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  try {
    await db.execute(
      `ALTER TABLE usuarios ADD COLUMN direccion VARCHAR(50) NULL`,
    );
  } catch (error) {
    if (!error.message.toLowerCase().includes("duplicate column name")) {
      throw error;
    }
  }

  // Crear usuario admin inicial si no existe
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASS;

  if (!email || !pass) {
    console.warn("⚠️  ADMIN_EMAIL o ADMIN_PASS no definidos en .env.");
    return;
  }

  const resultado = await db.execute({
    sql: "SELECT id FROM usuarios WHERE email = ?",
    args: [email],
  });

  if (resultado.rows.length === 0) {
    const passwordHash = bcrypt.hashSync(pass, 10);
    const ahora = new Date().toISOString();

    await db.execute({
      sql: `INSERT INTO usuarios (email, telefono, nombreUsuario, passwordHash, fechaCreacion, rol)
          VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        email,
        process.env.ADMIN_PHONE || "0000000000",
        process.env.ADMIN_USERNAME || "admin",
        passwordHash,
        ahora,
        "Supervisor",
      ],
    });

    console.log(`✅ Usuario inicial creado: ${email}`);
  }
}

// ─── REGISTRO DE USUARIO ────────────────────────────────────────────

async function crearUsuario(email, telefono, nombreUsuario, password) {
  const ahora = new Date().toISOString();

  const existe = await db.execute({
    sql: "SELECT id FROM usuarios WHERE email = ?",
    args: [email],
  });
  if (existe.rows.length > 0) {
    return { error: "Ya existe una cuenta con ese email." };
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  await db.execute({
    sql: `INSERT INTO usuarios (email, telefono, nombreUsuario, passwordHash, fechaCreacion, rol)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [email, telefono, nombreUsuario, passwordHash, ahora, "Cliente"],
  });

  return { ok: true };
}

// ─── AUTENTICACIÓN ────────────────────────────────────────────

async function login(email, password) {
  const res = await db.execute({
    sql: "SELECT * FROM usuarios WHERE email = ?",
    args: [email],
  });

  const usuario = res.rows[0];
  if (!usuario) return { error: "Email o contraseña incorrectos." };

  // Verificar bloqueo
  if (usuario.bloqueadoHasta) {
    const hasta = new Date(usuario.bloqueadoHasta);
    if (new Date() < hasta) {
      const minutosRestantes = Math.ceil((hasta - new Date()) / 60000);
      return {
        error: `Cuenta bloqueada. Intentá nuevamente en ${minutosRestantes} minuto${minutosRestantes !== 1 ? "s" : ""}.`,
      };
    } else {
      await db.execute({
        sql: "UPDATE usuarios SET intentosFallidos = 0, bloqueadoHasta = NULL WHERE id = ?",
        args: [usuario.id],
      });
      usuario.intentosFallidos = 0;
      usuario.bloqueadoHasta = null;
    }
  }

  // Verificar contraseña
  const passwordCorrecta = bcrypt.compareSync(password, usuario.passwordHash);

  if (!passwordCorrecta) {
    const nuevosIntentos = Number(usuario.intentosFallidos) + 1;

    if (nuevosIntentos >= MAX_INTENTOS) {
      const bloqueadoHasta = new Date(
        Date.now() + BLOQUEO_MIN * 60 * 1000,
      ).toISOString();
      await db.execute({
        sql: "UPDATE usuarios SET intentosFallidos = ?, bloqueadoHasta = ? WHERE id = ?",
        args: [nuevosIntentos, bloqueadoHasta, usuario.id],
      });
      return {
        error: `Cuenta bloqueada por ${BLOQUEO_MIN} minutos por demasiados intentos fallidos.`,
      };
    }

    await db.execute({
      sql: "UPDATE usuarios SET intentosFallidos = ? WHERE id = ?",
      args: [nuevosIntentos, usuario.id],
    });

    const intentosRestantes = MAX_INTENTOS - nuevosIntentos;
    return {
      error: `Email o contraseña incorrectos. Te ${intentosRestantes === 1 ? "queda" : "quedan"} ${intentosRestantes} intento${intentosRestantes !== 1 ? "s" : ""}.`,
    };
  }

  // Login exitoso
  await db.execute({
    sql: "UPDATE usuarios SET intentosFallidos = 0, bloqueadoHasta = NULL WHERE id = ?",
    args: [usuario.id],
  });

  const token = uuidv4();
  await db.execute({
    sql: "INSERT INTO sesiones (token, usuarioId, creadaEn) VALUES (?, ?, ?)",
    args: [token, usuario.id, new Date().toISOString()],
  });

  return { token };
}

async function logout(token) {
  await db.execute({
    sql: "DELETE FROM sesiones WHERE token = ?",
    args: [token],
  });
}

async function verificarToken(token) {
  if (!token) return null;

  const resSesion = await db.execute({
    sql: "SELECT * FROM sesiones WHERE token = ?",
    args: [token],
  });

  const sesion = resSesion.rows[0];
  if (!sesion) return null;

  const resUsuario = await db.execute({
    sql: "SELECT id, email, rol, nombre, direccion FROM usuarios WHERE id = ?",
    args: [sesion.usuarioId],
  });

  return resUsuario.rows[0] || null;
}

// ─── ENVÍOS ───────────────────────────────────────────────────

async function crearEnvio(
  remitente,
  destinatario,
  producto,
  direccionRemitente = "",
  contactoRemitente = "",
  contactoDestinatario = "",
  direccionEntrega = "",
) {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const prefijo =
    letras[Math.floor(Math.random() * 26)] +
    letras[Math.floor(Math.random() * 26)];
  const numero = Math.floor(100000 + Math.random() * 900000);
  const trackingId = `${prefijo}-${numero}`;
  const ahora = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO envios (trackingId, remitente, destinatario, producto, estado, fechaCreacion, fechaActualizacion, direccionRemitente, contactoRemitente, contactoDestinatario, direccionEntrega)
          VALUES (?, ?, ?, ?, 'creado', ?, ?, ?, ?, ?, ?)`,
    args: [
      trackingId,
      remitente,
      destinatario,
      producto,
      ahora,
      ahora,
      direccionRemitente,
      contactoRemitente,
      contactoDestinatario,
      direccionEntrega,
    ],
  });

  await db.execute({
    sql: `INSERT INTO historial_estados (trackingId, estado, fechaCambio)
          VALUES (?, 'creado', ?)`,
    args: [trackingId, ahora],
  });

  return trackingId;
}

async function listarEnvios(pagina = 1, porPagina = 10, estado = null, rolUsuario = null, nombreUsuario = null, direccionUsuario = null) {
  const offset = (pagina - 1) * porPagina;

  let whereConditions = [];
  let args = [];

  if (estado) {
    whereConditions.push("estado = ?");
    args.push(estado);
  }

  // Si es Cliente, filtrar solo envíos donde está involucrado como remitente o destinatario
  if (rolUsuario === "Cliente" && nombreUsuario && direccionUsuario) {
    whereConditions.push(
      `(` +
      `(remitente = ? AND direccionRemitente = ?) OR ` +
      `(destinatario = ? AND direccionEntrega = ?)` +
      `)`
    );
    args.push(nombreUsuario, direccionUsuario, nombreUsuario, direccionUsuario);
  }

  const whereClause = whereConditions.length > 0 ? "WHERE " + whereConditions.join(" AND ") : "";

  const resEnvios = await db.execute({
    sql: `SELECT * FROM envios ${whereClause} ORDER BY fechaCreacion DESC LIMIT ? OFFSET ?`,
    args: [...args, porPagina, offset],
  });

  const resTotal = await db.execute({
    sql: `SELECT COUNT(*) as total FROM envios ${whereClause}`,
    args: args,
  });

  const total = Number(resTotal.rows[0].total);

  return {
    envios: resEnvios.rows,
    paginacion: {
      total,
      pagina,
      porPagina,
      totalPaginas: Math.ceil(total / porPagina),
    },
  };
}

async function buscarPorTracking(trackingId, rolUsuario = null, nombreUsuario = null, direccionUsuario = null) {
  let whereConditions = ['trackingId = ?'];
  let args = [trackingId];

  // Si es Cliente, filtrar para asegurar involucración
  if (rolUsuario === 'Cliente' && nombreUsuario && direccionUsuario) {
    whereConditions.push(
      `(` +
      `(remitente = ? AND direccionRemitente = ?) OR ` +
      `(destinatario = ? AND direccionEntrega = ?)` +
      `)`
    );
    args.push(nombreUsuario, direccionUsuario, nombreUsuario, direccionUsuario);
  }

  const whereClause = whereConditions.join(' AND ');

  const res = await db.execute({
    sql: `SELECT * FROM envios WHERE ${whereClause}`,
    args,
  });
  return res.rows[0] || null;
}

async function actualizarEnvio(trackingId, destinatario, direccionEntrega) {
  const envio = await buscarPorTracking(trackingId);
  if (!envio) return null;

  if (envio.estado === "entregado") {
    return { error: "No se puede modificar un envío que ya fue entregado." };
  }

  const destinatarioNormalizado = destinatario?.trim();
  const direccionNormalizada = direccionEntrega?.trim();

  if (!destinatarioNormalizado || !direccionNormalizada) {
    return {
      error:
        "El destinatario y la dirección de entrega no pueden estar vacíos.",
    };
  }

  const ahora = new Date().toISOString();

  await db.execute({
    sql: `UPDATE envios
          SET destinatario = ?, direccionEntrega = ?, fechaActualizacion = ?
          WHERE trackingId = ?`,
    args: [destinatarioNormalizado, direccionNormalizada, ahora, trackingId],
  });

  return buscarPorTracking(trackingId);
}

async function cambiarEstado(trackingId) {
  const res = await db.execute({
    sql: "SELECT * FROM envios WHERE trackingId = ?",
    args: [trackingId],
  });

  const envio = res.rows[0];
  if (!envio) return null;

  const indexActual = ESTADOS.indexOf(envio.estado);
  if (indexActual === ESTADOS.length - 1) {
    return { error: "El envío ya fue entregado, no puede avanzar más." };
  }

   const nuevoEstado = ESTADOS[indexActual + 1];
  const ahora = new Date().toISOString();

  // actualizar envío
  await db.execute({
    sql: 'UPDATE envios SET estado = ?, fechaActualizacion = ? WHERE trackingId = ?',
    args: [nuevoEstado, ahora, trackingId]
  });

  // 👇 HISTORIAL (ESTO ES LO IMPORTANTE)
  await db.execute({
    sql: `INSERT INTO historial_estados (trackingId, estado, fechaCambio)
          VALUES (?, ?, ?)`,
    args: [trackingId, nuevoEstado, ahora]
  });

  return { trackingId, nuevoEstado };
}

// ─── GESTION USUARIOS ───────────────────────────────────────────────────

async function listarUsuarios() {
  const res = await db.execute({
    sql: `SELECT id, email, telefono, nombreUsuario, nombre, direccion, rol, fechaCreacion
          FROM usuarios
          ORDER BY fechaCreacion DESC`,
  });
  return res.rows;
}

async function listarClientesParaSetup() {
  const res = await db.execute({
    sql: `SELECT id, nombreUsuario, nombre, direccion
          FROM usuarios
          WHERE rol = 'Cliente'
          ORDER BY nombreUsuario ASC`
  });
  return res.rows;
}

async function actualizarRolUsuario(id, rol) {
  await db.execute({
    sql: "UPDATE usuarios SET rol = ? WHERE id = ?",
    args: [rol, id],
  });
}

// ─── BUSCAR POR DESTINATARIO ──────────────────────────────────
async function buscarPorDestinatario(nombre, rolUsuario = null, nombreUsuario = null, direccionUsuario = null) {
  let whereConditions = ['LOWER(destinatario) LIKE LOWER(?)'];
  let args = [`%${nombre}%`];

  // Si es Cliente, filtrar para asegurar involucración
  if (rolUsuario === 'Cliente' && nombreUsuario && direccionUsuario) {
    whereConditions.push(
      `(` +
      `(remitente = ? AND direccionRemitente = ?) OR ` +
      `(destinatario = ? AND direccionEntrega = ?)` +
      `)`
    );
    args.push(nombreUsuario, direccionUsuario, nombreUsuario, direccionUsuario);
  }

  const whereClause = whereConditions.join(' AND ');

  const res = await db.execute({
    sql: `SELECT * FROM envios 
          WHERE ${whereClause}
          ORDER BY fechaCreacion DESC`,
    args,
  });
  return res.rows;
}

// ─── HISTORIAL DE ENVÍOS ──────────────────────────────────────
async function registrarHistorial(envio) {
  const ahora = new Date().toISOString();

  const existe = await db.execute({
    sql: "SELECT id FROM historial_envios WHERE trackingId = ?",
    args: [envio.trackingId],
  });

  if (existe.rows.length > 0) return;

  await db.execute({
    sql: `INSERT INTO historial_envios (
            trackingId, remitente, destinatario, producto,
            direccionEntrega, estadoFinal, fechaCreacion, fechaEntrega
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      envio.trackingId,
      envio.remitente,
      envio.destinatario,
      envio.producto,
      envio.direccionEntrega || "",
      envio.estado,
      envio.fechaCreacion,
      ahora,
    ],
  });
}

/* 
async function obtenerHistorial() {
  const res = await db.execute(
    "SELECT * FROM historial_envios ORDER BY fechaEntrega DESC",
  );
  return res.rows;
}
*/

async function obtenerHistorial(trackingId = null) {
  if (!trackingId) {
    const res = await db.execute(
      "SELECT * FROM historial_envios ORDER BY fechaEntrega DESC",
    );
    return res.rows;
  }

  const id = trackingId.toUpperCase();

  const res = await db.execute({
    sql: `
      SELECT trackingId, estado, fechaCambio
      FROM historial_estados
      WHERE trackingId = ?
      ORDER BY fechaCambio DESC
    `,
    args: [id],
  });

  return res.rows;
}


// ─── DATASET DE ENTRENAMIENTO ─────────────────────────────────────
async function estructurarDataset() {
  try {
    // Verificar si ya se estructuró hace menos de 10 días
    const resLog = await db.execute(
      "SELECT * FROM log_estructuracion ORDER BY fechaUltima DESC LIMIT 1",
    );
    if (resLog.rows.length > 0) {
      const ultimaEstructuracion = new Date(resLog.rows[0].fechaUltima);
      const ahora = new Date();
      const diasTranscurridos =
        (ahora - ultimaEstructuracion) / (1000 * 60 * 60 * 24);

      if (diasTranscurridos < 10) {
        return {
          ok: false,
          mensaje: `La última estructuración fue hace ${Math.floor(diasTranscurridos)} días. Espera ${Math.ceil(10 - diasTranscurridos)} días más.`,
        };
      }
    }

    // Obtener datos del historial
    const resHistorial = await db.execute(
      "SELECT * FROM historial_envios ORDER BY fechaCreacion ASC",
    );
    const envios = resHistorial.rows;

    if (envios.length === 0) {
      return {
        ok: false,
        mensaje: "No hay datos disponibles para estructurar.",
      };
    }

    // Procesar datos para ML
    const csvHeaders = [
      "dias_entrega",
      "len_direccion",
      "len_producto",
      "hora_creacion",
      "dia_semana",
    ];
    const csvRows = [];

    envios.forEach((envio) => {
      const fechaCreacion = new Date(envio.fechaCreacion);
      const fechaEntrega = new Date(envio.fechaEntrega);

      // Calcular días de entrega
      const diasEntrega = Math.ceil(
        (fechaEntrega - fechaCreacion) / (1000 * 60 * 60 * 24),
      );

      // Características
      const lenDireccion = envio.direccionEntrega
        ? envio.direccionEntrega.length
        : 0;
      const lenProducto = envio.producto ? envio.producto.length : 0;
      const horaCreacion = fechaCreacion.getHours();
      const diaSemanacreacion = fechaCreacion.getDay();

      csvRows.push(
        [
          diasEntrega,
          lenDireccion,
          lenProducto,
          horaCreacion,
          diaSemanacreacion,
        ].join(","),
      );
    });

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");

    // Registrar en log
    const ahora = new Date().toISOString();
    await db.execute({
      sql: "INSERT INTO log_estructuracion (fechaUltima, registrosProcessados) VALUES (?, ?)",
      args: [ahora, envios.length],
    });

    return {
      ok: true,
      csvContent,
      registrosProcessados: envios.length,
      mensaje: `Dataset estructurado con ${envios.length} registros.`,
    };
  } catch (error) {
    throw new Error(`Error al estructurar dataset: ${error.message}`);
  }
}

// ─── LIMPIAR DATOS DE PRUEBA ───────────────────────────────────────
async function limpiarHistorialYLog() {
  try {
    await db.execute("DELETE FROM historial_envios");
    await db.execute("DELETE FROM log_estructuracion");
  } catch (error) {
    console.error("Error al limpiar datos:", error.message);
  }
}

// ─── ACTUALIZAR DATOS DE USUARIO ──────────────────────────────
async function actualizarDatosUsuario(id, nombre, direccion) {
  await db.execute({
    sql: "UPDATE usuarios SET nombre = ?, direccion = ? WHERE id = ?",
    args: [nombre || null, direccion || null, id],
  });
}

module.exports = {
  inicializar,
  login,
  logout,
  verificarToken,
  crearEnvio,
  listarEnvios,
  buscarPorTracking,
  buscarPorDestinatario,
  actualizarEnvio,
  cambiarEstado,
  obtenerHistorial,
  ESTADOS,
  crearUsuario,
  listarUsuarios,
  listarClientesParaSetup,
  actualizarRolUsuario,
  actualizarDatosUsuario,
  registrarHistorial,
  obtenerHistorial,
  estructurarDataset,
  limpiarHistorialYLog,

};
