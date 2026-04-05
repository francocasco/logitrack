console.log('DB URL:', process.env.TURSO_URL ? 'Turso conectado' : 'Usando archivo local');

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
  await db.execute(`
    CREATE TABLE IF NOT EXISTS historial_estados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trackingId TEXT NOT NULL,
      estado TEXT NOT NULL,
      fechaCambio TEXT NOT NULL
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

  const columnasEnvios = [
    "direccionEntrega TEXT NOT NULL DEFAULT ''",
    "direccionRemitente TEXT NOT NULL DEFAULT ''",
    "contactoRemitente TEXT NOT NULL DEFAULT ''",
    "contactoDestinatario TEXT NOT NULL DEFAULT ''",
  ];
  for (const col of columnasEnvios) {
    try {
      await db.execute(`ALTER TABLE envios ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message.toLowerCase().includes("duplicate column name")) throw e;
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

  const columnasUsuarios = ["nombre VARCHAR(50) NULL", "direccion VARCHAR(50) NULL"];
  for (const col of columnasUsuarios) {
    try {
      await db.execute(`ALTER TABLE usuarios ADD COLUMN ${col}`);
    } catch (e) {
      if (!e.message.toLowerCase().includes("duplicate column name")) throw e;
    }
  }

  await db.execute(`
    CREATE TABLE IF NOT EXISTS sesiones (
      token TEXT PRIMARY KEY,
      usuarioId INTEGER NOT NULL,
      creadaEn TEXT NOT NULL,
      FOREIGN KEY (usuarioId) REFERENCES usuarios(id)
    )
  `);

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

// ─── REGISTRO DE USUARIO ──────────────────────────────────────
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

  const passwordCorrecta = bcrypt.compareSync(password, usuario.passwordHash);

  if (!passwordCorrecta) {
    const nuevosIntentos = Number(usuario.intentosFallidos) + 1;

    if (nuevosIntentos >= MAX_INTENTOS) {
      const bloqueadoHasta = new Date(Date.now() + BLOQUEO_MIN * 60 * 1000).toISOString();
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
    sql: "SELECT id, email, rol, nombre, direccion, telefono FROM usuarios WHERE id = ?",
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
  direccionEntrega = ""
) {
  const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const prefijo =
    letras[Math.floor(Math.random() * 26)] +
    letras[Math.floor(Math.random() * 26)];
  const numero = Math.floor(100000 + Math.random() * 900000);
  const trackingId = `${prefijo}-${numero}`;
  const ahora = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO envios (trackingId, remitente, destinatario, producto, estado,
          fechaCreacion, fechaActualizacion, direccionRemitente, contactoRemitente,
          contactoDestinatario, direccionEntrega)
          VALUES (?, ?, ?, ?, 'creado', ?, ?, ?, ?, ?, ?)`,
    args: [
      trackingId, remitente, destinatario, producto,
      ahora, ahora, direccionRemitente, contactoRemitente,
      contactoDestinatario, direccionEntrega,
    ],
  });

  await db.execute({
    sql: `INSERT INTO historial_estados (trackingId, estado, fechaCambio)
          VALUES (?, 'creado', ?)`,
    args: [trackingId, ahora],
  });

  return trackingId;
}

async function listarEnvios(pagina = 1, porPagina = 10, estado = null, rol = null, nombre = null, direccion = null) {
  const offset = (pagina - 1) * porPagina;

  // Si es Cliente, filtrar solo sus envíos (remitente o destinatario)
  let whereClause = "";
  let args = [];
  let argsCount = [];

  if (rol === "Cliente" && nombre) {
    if (estado) {
      whereClause = "WHERE estado = ? AND (remitente LIKE ? OR destinatario LIKE ?)";
      args = [estado, `%${nombre}%`, `%${nombre}%`, porPagina, offset];
      argsCount = [estado, `%${nombre}%`, `%${nombre}%`];
    } else {
      whereClause = "WHERE (remitente LIKE ? OR destinatario LIKE ?)";
      args = [`%${nombre}%`, `%${nombre}%`, porPagina, offset];
      argsCount = [`%${nombre}%`, `%${nombre}%`];
    }
  } else {
    whereClause = estado ? "WHERE estado = ?" : "";
    args = estado ? [estado, porPagina, offset] : [porPagina, offset];
    argsCount = estado ? [estado] : [];
  }

  const resEnvios = await db.execute({
    sql: `SELECT * FROM envios ${whereClause} ORDER BY fechaCreacion DESC LIMIT ? OFFSET ?`,
    args,
  });

  const resTotal = await db.execute({
    sql: `SELECT COUNT(*) as total FROM envios ${whereClause}`,
    args: argsCount,
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

function normalizarCampo(valor) {
  return String(valor || "").trim().toLowerCase();
}

async function buscarPorTracking(trackingId, rol = null, direccion = null, telefono = null) {
  const res = await db.execute({
    sql: "SELECT * FROM envios WHERE trackingId = ?",
    args: [trackingId],
  });

  const envio = res.rows[0] || null;
  if (!envio || rol !== "Cliente") {
    return envio;
  }

  const direccionCliente = normalizarCampo(direccion);
  const telefonoCliente = normalizarCampo(telefono);

  if (!direccionCliente || !telefonoCliente) {
    return null;
  }

  const coincideComoRemitente =
    normalizarCampo(envio.direccionRemitente) === direccionCliente &&
    normalizarCampo(envio.contactoRemitente) === telefonoCliente;

  const coincideComoDestinatario =
    normalizarCampo(envio.direccionEntrega) === direccionCliente &&
    normalizarCampo(envio.contactoDestinatario) === telefonoCliente;

  return coincideComoRemitente || coincideComoDestinatario ? envio : null;
}

async function buscarPorDestinatario(nombre, rol = null, direccion = null, telefono = null) {
  const res = await db.execute({
    sql: "SELECT * FROM envios WHERE destinatario LIKE ? ORDER BY fechaCreacion DESC",
    args: [`%${nombre}%`],
  });

  if (rol !== "Cliente") {
    return res.rows;
  }

  const direccionCliente = normalizarCampo(direccion);
  const telefonoCliente = normalizarCampo(telefono);

  if (!direccionCliente || !telefonoCliente) {
    return [];
  }

  return res.rows.filter((envio) => {
    const coincideComoRemitente =
      normalizarCampo(envio.direccionRemitente) === direccionCliente &&
      normalizarCampo(envio.contactoRemitente) === telefonoCliente;

    const coincideComoDestinatario =
      normalizarCampo(envio.direccionEntrega) === direccionCliente &&
      normalizarCampo(envio.contactoDestinatario) === telefonoCliente;

    return coincideComoRemitente || coincideComoDestinatario;
  });
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
    return { error: "El destinatario y la dirección de entrega no pueden estar vacíos." };
  }

  const ahora = new Date().toISOString();

  await db.execute({
    sql: `UPDATE envios SET destinatario = ?, direccionEntrega = ?, fechaActualizacion = ?
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

  await db.execute({
    sql: "UPDATE envios SET estado = ?, fechaActualizacion = ? WHERE trackingId = ?",
    args: [nuevoEstado, ahora, trackingId],
  });

  await db.execute({
    sql: `INSERT INTO historial_estados (trackingId, estado, fechaCambio)
          VALUES (?, ?, ?)`,
    args: [trackingId, nuevoEstado, ahora],
  });

  return { trackingId, nuevoEstado };
}

// ─── GESTIÓN USUARIOS ─────────────────────────────────────────
async function listarUsuarios() {
  try {
    const res = await db.execute({
      sql: `SELECT id, email, telefono, nombreUsuario, rol, fechaCreacion, nombre, direccion
            FROM usuarios ORDER BY id DESC`,
    });

    return res.rows.map((row) => {
      const obj = {};
      res.columns.forEach((col, i) => {
        obj[col] = row[i] ?? "";
      });
      return obj;
    });
  } catch (err) {
    const resFallback = await db.execute("SELECT id, email, rol FROM usuarios");
    return resFallback.rows.map((row) => ({
      id: row.id || 0,
      email: row.email || "",
      telefono: "",
      nombreUsuario: "",
      rol: row.rol || "Cliente",
      fechaCreacion: "",
      nombre: "",
      direccion: "",
    }));
  }
}

async function actualizarRolUsuario(id, rol) {
  await db.execute({
    sql: "UPDATE usuarios SET rol = ? WHERE id = ?",
    args: [rol, id],
  });
}

async function actualizarDatosUsuario(id, nombre, direccion) {
  await db.execute({
    sql: "UPDATE usuarios SET nombre = ?, direccion = ? WHERE id = ?",
    args: [nombre, direccion, id],
  });
}

async function listarClientesParaSetup() {
  try {
    const res = await db.execute("SELECT id, email, nombreUsuario FROM usuarios WHERE rol = 'Cliente'");
    console.log('RAW CLIENTES:', JSON.stringify(res));
    return res.rows.map(row => ({
      id: row.id || 0,
      email: row.email || '',
      nombreUsuario: row.nombreUsuario || '',
      nombre: '',
      direccion: ''
    }));
  } catch (err) {
    console.error('ERROR EN listarClientesParaSetup:', err.message, err.stack);
    throw err;
  }
}

// ─── HISTORIAL ────────────────────────────────────────────────
async function registrarHistorial(envio) {
  const existe = await db.execute({
    sql: "SELECT id FROM historial_envios WHERE trackingId = ?",
    args: [envio.trackingId],
  });
  if (existe.rows.length > 0) return;

  await db.execute({
    sql: `INSERT INTO historial_envios
          (trackingId, remitente, destinatario, producto, direccionEntrega, estadoFinal, fechaCreacion, fechaEntrega)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      envio.trackingId,
      envio.remitente,
      envio.destinatario,
      envio.producto,
      envio.direccionEntrega || "",
      "entregado",
      envio.fechaCreacion,
      new Date().toISOString(),
    ],
  });
}

async function obtenerHistorial(trackingId = null) {
  if (trackingId) {
    const res = await db.execute({
      sql: `SELECT trackingId, estado, fechaCambio
            FROM historial_estados
            WHERE trackingId = ?
            ORDER BY fechaCambio DESC`,
      args: [trackingId],
    });
    return res.rows;
  }
  const res = await db.execute(
    "SELECT * FROM historial_envios ORDER BY fechaEntrega DESC"
  );
  return res.rows;
}

// ─── DATASET / ML ─────────────────────────────────────────────
async function estructurarDataset() {
  try {
    const resLog = await db.execute(
      "SELECT * FROM log_estructuracion ORDER BY fechaUltima DESC LIMIT 1"
    );
    if (resLog.rows.length > 0) {
      const ultimaEstructuracion = new Date(resLog.rows[0].fechaUltima);
      const diasTranscurridos = (new Date() - ultimaEstructuracion) / (1000 * 60 * 60 * 24);
      if (diasTranscurridos < 10) {
        return {
          ok: false,
          mensaje: `La última estructuración fue hace ${Math.floor(diasTranscurridos)} días. Espera ${Math.ceil(10 - diasTranscurridos)} días más.`,
        };
      }
    }

    const resHistorial = await db.execute(
      "SELECT * FROM historial_envios ORDER BY fechaCreacion ASC"
    );
    const envios = resHistorial.rows;

    if (envios.length === 0) {
      return { ok: false, mensaje: "No hay datos disponibles para estructurar." };
    }

    const csvHeaders = ["dias_entrega", "len_direccion", "len_producto", "hora_creacion", "dia_semana"];
    const csvRows = [];

    envios.forEach((envio) => {
      const fechaCreacion = new Date(envio.fechaCreacion);
      const fechaEntrega = new Date(envio.fechaEntrega);
      const diasEntrega = Math.ceil((fechaEntrega - fechaCreacion) / (1000 * 60 * 60 * 24));
      const lenDireccion = envio.direccionEntrega ? envio.direccionEntrega.length : 0;
      const lenProducto = envio.producto ? envio.producto.length : 0;
      const horaCreacion = fechaCreacion.getHours();
      const diaSemanacreacion = fechaCreacion.getDay();
      csvRows.push([diasEntrega, lenDireccion, lenProducto, horaCreacion, diaSemanacreacion].join(","));
    });

    const csvContent = [csvHeaders.join(","), ...csvRows].join("\n");

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

async function limpiarHistorialYLog() {
  try {
    await db.execute("DELETE FROM historial_envios");
    await db.execute("DELETE FROM log_estructuracion");
  } catch (error) {
    console.error("Error al limpiar datos:", error.message);
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────
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
  ESTADOS,
  crearUsuario,
  listarUsuarios,
  actualizarRolUsuario,
  actualizarDatosUsuario,
  listarClientesParaSetup,
  registrarHistorial,
  obtenerHistorial,
  estructurarDataset,
  limpiarHistorialYLog,
};