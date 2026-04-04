require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db/database");

//Swagger
const swaggerUi = require("swagger-ui-express");
const swaggerJsDoc = require("swagger-jsdoc");

const app = express();

const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "LogiTrack API",
      version: "1.0.0",
      description: "API para gestión de envíos",
    },
    servers: [
      {
        url: "http://localhost:3000",
      },
    ],
  },
  apis: ["./server.js"],
};

const swaggerSpec = swaggerJsDoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─────────────────────────────────────────
//  MIDDLEWARE DE AUTENTICACIÓN
// ─────────────────────────────────────────
async function requireAuth(req, res, next) {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  const usuario = await db.verificarToken(token);

  if (!usuario) {
    return res
      .status(401)
      .json({ error: "No autorizado. Iniciá sesión para continuar." });
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
// Expresiones regulares para validación global
const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REGEX_TELEFONO = /^\+?[\d\s\-\(\)]{6,}$/;
const REGEX_PASSWORD = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
const REGEX_SOLO_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

app.post("/api/auth/register", async (req, res) => {
  const { email, telefono, nombreUsuario, password } = req.body;

  if (!email || !telefono || !nombreUsuario || !password) {
    return res
      .status(400)
      .json({ error: "Todos los campos son obligatorios." });
  }

  if (!REGEX_EMAIL.test(email.trim())) {
    return res
      .status(400)
      .json({ error: "El formato del email no es válido." });
  }

  if (!REGEX_TELEFONO.test(telefono.trim())) {
    return res
      .status(400)
      .json({
        error:
          "El formato del número de teléfono no es válido. Debe tener al menos 6 dígitos.",
      });
  }

  if (nombreUsuario.trim().length < 5) {
    return res
      .status(400)
      .json({
        error: "El nombre de usuario debe tener al menos 5 caracteres.",
      });
  }

  if (!REGEX_PASSWORD.test(password)) {
    return res
      .status(400)
      .json({
        error:
          "La contraseña debe tener un mínimo de 8 caracteres, al menos una mayúscula y al menos un número.",
      });
  }

  try {
    const resultado = await db.crearUsuario(
      email.trim().toLowerCase(),
      telefono.trim(),
      nombreUsuario.trim(),
      password,
    );

    if (resultado.error) {
      return res.status(409).json({ error: resultado.error });
    }

    res
      .status(201)
      .json({
        mensaje: "Cuenta creada correctamente. Ya podés iniciar sesión.",
      });
  } catch (err) {
    console.error("Error al registrar usuario:", err.message);
    res
      .status(500)
      .json({ error: "No se pudo crear la cuenta. Intente nuevamente." });
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
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "El email y la contraseña son obligatorios." });
  }

  try {
    const resultado = await db.login(email.trim().toLowerCase(), password);
    if (resultado.error) {
      return res.status(401).json({ error: resultado.error });
    }
    res.json({
      mensaje: "Sesión iniciada correctamente.",
      token: resultado.token,
    });
  } catch (err) {
    console.error("Error en login:", err.message);
    res
      .status(500)
      .json({ error: "Error al iniciar sesión. Intente nuevamente." });
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
app.post("/api/auth/logout", async (req, res) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  if (token) await db.logout(token);
  res.json({ mensaje: "Sesión cerrada correctamente." });
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
app.get("/api/auth/verificar", async (req, res) => {
  const token = req.headers["authorization"]?.replace("Bearer ", "");
  const usuario = await db.verificarToken(token);

  if (!usuario) {
    return res.status(401).json({ error: "Token inválido o expirado." });
  }

  res.json({ email: usuario.email, rol: usuario.rol });
});

// ─────────────────────────────────────────
//  RUTAS DE GESTION USUARIOS
// ─────────────────────────────────────────

/**
 * @swagger
 * /api/usuarios:
 *   get:
 *     summary: Listar usuarios
 *     description: Devuelve la lista de usuarios (solo Supervisor)
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *       403:
 *         description: Sin permisos
 */
app.get("/api/usuarios", requireAuth, async (req, res) => {
  if (req.usuario.rol !== "Supervisor") {
    return res
      .status(403)
      .json({ error: "No tenés permisos para ver usuarios." });
  }

  try {
    const usuarios = await db.listarUsuarios();
    res.json({ usuarios });
  } catch (err) {
    console.error("Error al listar usuarios:", err.message);
    res.status(500).json({ error: "No se pudieron obtener los usuarios." });
  }
});

/**
 * @swagger
 * /api/usuarios/{id}/rol:
 *   patch:
 *     summary: Modificar rol de usuario
 *     description: Cambia el rol de un usuario (solo Supervisor)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             rol: Operador
 *     responses:
 *       200:
 *         description: Rol actualizado
 *       400:
 *         description: Rol inválido
 *       403:
 *         description: Sin permisos
 */
app.patch("/api/usuarios/:id/rol", requireAuth, async (req, res) => {
  if (req.usuario.rol !== "Supervisor") {
    return res
      .status(403)
      .json({ error: "No tenés permisos para modificar roles." });
  }

  const { rol } = req.body;
  const rolesValidos = ["Cliente", "Operador", "Supervisor"];

  if (!rolesValidos.includes(rol)) {
    return res.status(400).json({ error: "Rol inválido." });
  }

  try {
    await db.actualizarRolUsuario(req.params.id, rol);
    res.json({ mensaje: "Rol actualizado correctamente." });
  } catch (err) {
    console.error("Error al actualizar rol:", err.message);
    res.status(500).json({ error: "No se pudo actualizar el rol." });
  }
});

/**
 * @swagger
 * /api/usuarios/{id}/perfil:
 *   patch:
 *     summary: Actualizar datos de perfil del usuario
 *     description: Actualiza nombre/negocio y dirección del usuario
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             nombre: "Juan Perez SRL"
 *             direccion: "Av. Corrientes 1234, Buenos Aires"
 *     responses:
 *       200:
 *         description: Datos actualizados correctamente
 *       400:
 *         description: Datos inválidos
 *       500:
 *         description: Error al actualizar
 */
app.patch("/api/usuarios/:id/perfil", requireAuth, async (req, res) => {
  const { nombre, direccion } = req.body;

  if (!nombre?.trim() || !direccion?.trim()) {
    return res
      .status(400)
      .json({
        error: "El nombre/negocio y la dirección no pueden estar vacíos.",
      });
  }

  if (nombre.trim().length > 50 || direccion.trim().length > 50) {
    return res
      .status(400)
      .json({
        error: "El nombre y dirección no pueden superar 50 caracteres.",
      });
  }

  try {
    await db.actualizarDatosUsuario(
      req.params.id,
      nombre.trim(),
      direccion.trim(),
    );
    res.json({ mensaje: "Datos del usuario actualizados correctamente." });
  } catch (err) {
    console.error("Error al actualizar datos de usuario:", err.message);
    res
      .status(500)
      .json({ error: "No se pudo actualizar los datos del usuario." });
  }
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
 *             direccionRemitente: "Av. Corrientes 1234, Buenos Aires"
 *             contactoRemitente: "+54 11 1234-5678"
 *             contactoDestinatario: "maria@email.com"
 *     responses:
 *       201:
 *         description: Envío creado correctamente
 *       400:
 *         description: Datos inválidos
 */
app.post("/api/envios", requireAuth, async (req, res) => {
  const {
    remitente,
    destinatario,
    producto,
    direccionRemitente,
    contactoRemitente,
    contactoDestinatario,
    direccionEntrega,
  } = req.body;

  if (!remitente || !destinatario || !producto) {
    return res
      .status(400)
      .json({
        error:
          "Todos los campos son obligatorios: remitente, destinatario y producto.",
      });
  }
  if (remitente.trim().length < 2 || destinatario.trim().length < 2) {
    return res
      .status(400)
      .json({
        error: "El remitente y destinatario deben tener al menos 2 caracteres.",
      });
  }
  if (!REGEX_SOLO_LETRAS.test(remitente.trim())) {
    return res
      .status(400)
      .json({ error: "El remitente solo puede contener letras y espacios." });
  }
  if (!REGEX_SOLO_LETRAS.test(destinatario.trim())) {
    return res
      .status(400)
      .json({
        error: "El destinatario solo puede contener letras y espacios.",
      });
  }
  if (
    remitente.length > 100 ||
    destinatario.length > 100 ||
    producto.length > 200
  ) {
    return res
      .status(400)
      .json({
        error: "Uno o más campos superan la longitud máxima permitida.",
      });
  }

  try {
    const trackingId = await db.crearEnvio(
      remitente.trim(),
      destinatario.trim(),
      producto.trim(),
      (direccionRemitente || "").trim(),
      (contactoRemitente || "").trim(),
      (contactoDestinatario || "").trim(),
      (direccionEntrega || "").trim(),
    );
    res.status(201).json({ mensaje: "Envío creado exitosamente.", trackingId });
  } catch (err) {
    console.error("Error al crear envío:", err.message);
    res
      .status(500)
      .json({ error: "No se pudo crear el envío. Intente nuevamente." });
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
app.get("/api/envios", requireAuth, async (req, res) => {
  const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
  const porPagina = Math.min(
    50,
    Math.max(1, parseInt(req.query.porPagina) || 10),
  );
  const estado = req.query.estado || null;

  try {
    const resultado = await db.listarEnvios(pagina, porPagina, estado);
    res.json(resultado);
  } catch (err) {
    console.error("Error al listar envíos:", err.message);
    res.status(500).json({ error: "No se pudieron obtener los envíos." });
  }
});

// GET /api/envios/:trackingId

// GET /api/envios/buscar/destinatario
/**
 * @swagger
 * /api/envios/buscar/destinatario:
 *   get:
 *     summary: Buscar envíos por nombre de destinatario
 *     description: Devuelve todos los envíos que coincidan con el nombre del destinatario
 *     parameters:
 *       - in: query
 *         name: nombre
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Envíos encontrados
 *       400:
 *         description: Nombre no proporcionado
 *       404:
 *         description: No se encontraron envíos
 */
app.get("/api/envios/buscar/destinatario", requireAuth, async (req, res) => {
  const { nombre } = req.query;

  if (!nombre || nombre.trim().length === 0) {
    return res.status(400).json({ error: "Ingresá un nombre para buscar." });
  }

  if (!REGEX_SOLO_LETRAS.test(nombre.trim())) {
    return res
      .status(400)
      .json({
        error: "El nombre no es válido. Solo puede contener letras y espacios.",
      });
  }

  try {
    const envios = await db.buscarPorDestinatario(nombre.trim());

    if (!envios.length) {
      return res
        .status(404)
        .json({
          error: `No se encontraron envíos para el destinatario "${nombre}".`,
        });
    }

    res.json({ envios });
  } catch (err) {
    console.error("Error al buscar por destinatario:", err.message);
    res.status(500).json({ error: "No se pudo realizar la búsqueda." });
  }
});

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
app.get("/api/envios/:trackingId", requireAuth, async (req, res) => {
  const trackingId = req.params.trackingId.toUpperCase();

  if (!/^[A-Z]{2}-\d{6}$/.test(trackingId)) {
    return res
      .status(400)
      .json({
        error: "El Tracking ID no es válido. Debe tener el formato: XX-XXXXXX.",
      });
  }

  try {
    const envio = await db.buscarPorTracking(trackingId);
    if (!envio) {
      return res.status(404).json({ error: "Envío no encontrado." });
    }
    res.json(envio);
  } catch (err) {
    console.error("Error al buscar envío:", err.message);
    res.status(500).json({ error: "No se pudo consultar el envío." });
  }
});

// PATCH /api/envios/:trackingId
app.patch("/api/envios/:trackingId", requireAuth, async (req, res) => {
  if (!["Operador", "Supervisor"].includes(req.usuario.rol)) {
    return res
      .status(403)
      .json({ error: "No tenés permisos para modificar los datos del envío." });
  }

  const { destinatario, direccionEntrega } = req.body;

  if (!destinatario?.trim() || !direccionEntrega?.trim()) {
    return res
      .status(400)
      .json({
        error:
          "El destinatario y la dirección de entrega no pueden estar vacíos.",
      });
  }

  try {
    const envioActualizado = await db.actualizarEnvio(
      req.params.trackingId.toUpperCase(),
      destinatario,
      direccionEntrega,
    );

    if (!envioActualizado) {
      return res.status(404).json({ error: "Envío no encontrado." });
    }

    if (envioActualizado.error) {
      return res.status(400).json({ error: envioActualizado.error });
    }

    res.json({
      mensaje: "Datos del envío actualizados correctamente.",
      envio: envioActualizado,
    });
  } catch (err) {
    console.error("Error al modificar envío:", err.message);
    res
      .status(500)
      .json({ error: "No se pudieron guardar los cambios del envío." });
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
app.patch("/api/envios/:trackingId/estado", requireAuth, async (req, res) => {
  try {
    const resultado = await db.cambiarEstado(
      req.params.trackingId.toUpperCase(),
    );
    if (!resultado) {
      return res.status(404).json({ error: "Envío no encontrado." });
    }
    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    // Si el nuevo estado es "entregado", registrar en historial
    if (resultado.nuevoEstado === "entregado") {
      const envio = await db.buscarPorTracking(
        req.params.trackingId.toUpperCase(),
      );
      await db.registrarHistorial(envio);
    }

    res.json({
      mensaje: `Estado actualizado a "${resultado.nuevoEstado}".`,
      ...resultado,
    });
  } catch (err) {
    console.error("Error al cambiar estado:", err.message);
    res
      .status(500)
      .json({ error: "No se pudo actualizar el estado del envío." });
  }
});

// GET /api/envios/:trackingId/historial
app.get("/api/envios/:trackingId/historial", requireAuth, async (req, res) => {
  try {
    const historial = await db.obtenerHistorial(
      req.params.trackingId.toUpperCase(),
    );
    res.json(historial);
  } catch (err) {
    console.error("Error al obtener historial:", err.message);
    res.status(500).json({ error: "No se pudo obtener el historial." });
  }
});

// GET /api/historial
app.get("/api/historial", requireAuth, async (req, res) => {
  if (!["Operador", "Supervisor"].includes(req.usuario.rol)) {
    return res
      .status(403)
      .json({ error: "No tenés permisos para ver el historial." });
  }
  try {
    const historial = await db.obtenerHistorial();
    res.json({ historial });
  } catch (err) {
    console.error("Error al obtener historial:", err.message);
    res.status(500).json({ error: "No se pudo obtener el historial." });
  }
});

// POST /api/dataset/estructurar
/**
 * @swagger
 * /api/dataset/estructurar:
 *   post:
 *     summary: Estructurar dataset de entrenamiento
 *     description: Genera un archivo CSV con datos históricos formateados para ML (solo Supervisor)
 *     responses:
 *       200:
 *         description: Dataset estructurado correctamente
 *       400:
 *         description: No es posible estructurar aún o sin datos
 *       403:
 *         description: Sin permisos
 *       500:
 *         description: Error al procesar
 */
app.post("/api/dataset/estructurar", requireAuth, async (req, res) => {
  if (req.usuario.rol !== "Supervisor") {
    return res
      .status(403)
      .json({ error: "No tenés permisos para estructurar el dataset." });
  }

  try {
    const resultado = await db.estructurarDataset();

    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.mensaje });
    }

    // Crear carpeta datasets si no existe
    const datasetsDir = path.join(__dirname, "datasets");
    if (!fs.existsSync(datasetsDir)) {
      fs.mkdirSync(datasetsDir, { recursive: true });
    }

    // Guardar CSV
    const csvPath = path.join(datasetsDir, "training_data.csv");
    fs.writeFileSync(csvPath, resultado.csvContent, "utf-8");

    res.json({
      mensaje: resultado.mensaje,
      registrosProcessados: resultado.registrosProcessados,
      rutaArchivo: csvPath,
    });
  } catch (err) {
    console.error("Error al estructurar dataset:", err.message);
    res.status(500).json({ error: "No se pudo estructurar el dataset." });
  }
});

// ─────────────────────────────────────────
//  MANEJO DE ERRORES GLOBAL
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Error inesperado:", err.message);
  res
    .status(500)
    .json({ error: "Ocurrió un error inesperado en el servidor." });
});

// ─────────────────────────────────────────
//  RUTAS FRONTEND
// ─────────────────────────────────────────
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
    .catch((err) => {
      console.error("❌ Error al inicializar la base de datos:", err.message);
      process.exit(1);
    });
}

// Exportar app para Jest + Supertest
module.exports = app;
