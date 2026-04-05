require("dotenv").config();
const express = require("express");
const path = require("path");
const fs = require("fs");
const db = require("./db/database");
const {
  REGEX_EMAIL,
  REGEX_TELEFONO,
  REGEX_PASSWORD,
  REGEX_SOLO_LETRAS,
  REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS,
} = require("./validation/regex");

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
//  ML EN JAVASCRIPT PURO (sin Python)
// ─────────────────────────────────────────

function entrenarModeloJS(csvPath) {
  try {
    const lineas = fs.readFileSync(csvPath, "utf-8").trim().split("\n");
    if (lineas.length < 6) {
      return { ok: false, error: `Datos insuficientes: ${lineas.length - 1} registros (mínimo 5)` };
    }

    // Parsear CSV: dias_entrega, len_direccion, len_producto, hora_creacion, dia_semana
    const datos = lineas.slice(1).map(l => {
      const [dias, lenDir, lenProd, hora, dia] = l.split(",").map(Number);
      return { dias, lenDir, lenProd, hora, dia };
    }).filter(d => !isNaN(d.dias));

    if (datos.length < 5) {
      return { ok: false, error: `Datos insuficientes: ${datos.length} registros válidos (mínimo 5)` };
    }

    // Regresión lineal múltiple por mínimos cuadrados
    // Features: [1, len_direccion, len_producto, hora_creacion, dia_semana]
    const n = datos.length;
    const X = datos.map(d => [1, d.lenDir, d.lenProd, d.hora, d.dia]);
    const y = datos.map(d => d.dias);

    // Calcular X^T * X y X^T * y
    const k = 5;
    const XtX = Array.from({ length: k }, () => Array(k).fill(0));
    const Xty = Array(k).fill(0);

    for (let i = 0; i < n; i++) {
      for (let r = 0; r < k; r++) {
        Xty[r] += X[i][r] * y[i];
        for (let c = 0; c < k; c++) {
          XtX[r][c] += X[i][r] * X[i][c];
        }
      }
    }

    // Resolver sistema lineal con eliminación gaussiana
    const coef = resolverSistema(XtX, Xty);
    if (!coef) {
      return { ok: false, error: "No se pudo resolver el sistema de ecuaciones." };
    }

    // Calcular métricas
    const yPred = X.map(xi => xi.reduce((s, v, j) => s + v * coef[j], 0));
    const yMedia = y.reduce((a, b) => a + b, 0) / n;
    const ssTot = y.reduce((s, yi) => s + (yi - yMedia) ** 2, 0);
    const ssRes = y.reduce((s, yi, i) => s + (yi - yPred[i]) ** 2, 0);
    const r2   = ssTot > 0 ? 1 - ssRes / ssTot : 0;
    const mae  = yPred.reduce((s, yp, i) => s + Math.abs(y[i] - yp), 0) / n;
    const rmse = Math.sqrt(yPred.reduce((s, yp, i) => s + (y[i] - yp) ** 2, 0) / n);

    // Guardar modelo como JSON
    const modelData = { coef, n, r2, mae, rmse };
    const modelPath = path.join(path.dirname(csvPath), "model.json");
    fs.writeFileSync(modelPath, JSON.stringify(modelData), "utf-8");

    return {
      ok: true,
      r2Score: parseFloat(r2.toFixed(4)),
      mae: parseFloat(mae.toFixed(4)),
      rmse: parseFloat(rmse.toFixed(4)),
      cvScore: "N/A (regresión lineal JS)",
      registrosUsados: n,
      modelo: "Regresión Lineal Múltiple",
      mensaje: `Modelo entrenado con ${n} registros`
    };
  } catch (e) {
    return { ok: false, error: `Error al entrenar: ${e.message}` };
  }
}

function resolverSistema(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxFila = col;
    for (let fila = col + 1; fila < n; fila++) {
      if (Math.abs(M[fila][col]) > Math.abs(M[maxFila][col])) maxFila = fila;
    }
    [M[col], M[maxFila]] = [M[maxFila], M[col]];
    if (Math.abs(M[col][col]) < 1e-12) return null;
    for (let fila = col + 1; fila < n; fila++) {
      const factor = M[fila][col] / M[col][col];
      for (let j = col; j <= n; j++) M[fila][j] -= factor * M[col][j];
    }
  }

  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

function predecirJS(modelPath, features) {
  try {
    if (!fs.existsSync(modelPath)) {
      return { ok: false, error: "Modelo no entrenado. Primero entrenà el modelo desde el Panel IA." };
    }
    const { coef } = JSON.parse(fs.readFileSync(modelPath, "utf-8"));
    const X = [1, features.len_direccion, features.len_producto, features.hora_creacion, features.dia_semana];
    const dias = X.reduce((s, v, i) => s + v * coef[i], 0);
    const diasRedondeado = Math.max(1, Math.round(dias));
    return {
      ok: true,
      diasEstimados: diasRedondeado,
      diasExacto: parseFloat(dias.toFixed(2)),
      mensaje: `Entrega estimada en ${diasRedondeado} día${diasRedondeado !== 1 ? "s" : ""}`
    };
  } catch (e) {
    return { ok: false, error: `Error al predecir: ${e.message}` };
  }
}

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

function requireRoles(...rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para acceder a este recurso.' });
    }
    next();
  };
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
function tieneMinimoLetras(valor, minimo = 5) {
  const coincidencias = String(valor || "").match(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g) || [];
  return coincidencias.length >= minimo;
}

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
  if (!["Supervisor", "Operador", "Cliente"].includes(req.usuario.rol)) {
    return res
      .status(403)
      .json({ error: "No tenés permisos para ver usuarios." });
  }

  try {
    const usuarios = await db.listarUsuarios();
    const usuariosFiltrados =
      req.usuario.rol === "Cliente"
        ? usuarios.filter((usuario) => Number(usuario.id) === Number(req.usuario.id))
        : usuarios;
    res.json({ usuarios: usuariosFiltrados });
  } catch (err) {
    console.error("Error al listar usuarios:", err.message);
    res.status(500).json({ error: "No se pudieron obtener los usuarios." });
  }
});

app.get('/api/clientes/setup', requireAuth, requireRoles('Operador', 'Supervisor'), async (req, res) => {
  try {
    const clientes = await db.listarClientesParaSetup();
    res.json({ clientes });
  } catch (err) {
    console.error('Error al listar clientes para setup:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los clientes para setup.' });
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
app.patch("/api/usuarios/:id/perfil", requireAuth, requireRoles("Operador", "Supervisor"), async (req, res) => {
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

  if (
    !REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(nombre.trim()) ||
    !REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(direccion.trim())
  ) {
    return res
      .status(400)
      .json({
        error: "El nombre/negocio y la dirección deben tener al menos 5 letras.",
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
app.post("/api/envios", requireAuth, requireRoles("Operador", "Supervisor"), async (req, res) => {
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
  if (!tieneMinimoLetras(remitente, 5) || !tieneMinimoLetras(destinatario, 5)) {
    return res
      .status(400)
      .json({
        error: "El remitente y destinatario deben tener al menos 5 letras.",
      });
  }
  if (!tieneMinimoLetras(producto, 3)) {
    return res
      .status(400)
      .json({
        error: "El producto debe tener al menos 3 letras.",
      });
  }
  if (direccionRemitente?.trim() && !tieneMinimoLetras(direccionRemitente, 3)) {
    return res
      .status(400)
      .json({
        error: "La dirección de remitente debe tener al menos 3 letras.",
      });
  }
  if (direccionEntrega?.trim() && !tieneMinimoLetras(direccionEntrega, 3)) {
    return res
      .status(400)
      .json({
        error: "La dirección de destinatario debe tener al menos 3 letras.",
      });
  }
  if (contactoRemitente?.trim()) {
    const contacto = contactoRemitente.trim();
    if (!REGEX_EMAIL.test(contacto) && !REGEX_TELEFONO.test(contacto)) {
      return res
        .status(400)
        .json({
          error:
            "El contacto de remitente debe ser un email o un teléfono válido.",
        });
    }
  }
  if (contactoDestinatario?.trim()) {
    const contacto = contactoDestinatario.trim();
    if (!REGEX_EMAIL.test(contacto) && !REGEX_TELEFONO.test(contacto)) {
      return res
        .status(400)
        .json({
          error:
            "El contacto de destinatario debe ser un email o un teléfono válido.",
        });
    }
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
    const resultado = await db.listarEnvios(
      pagina,
      porPagina,
      estado,
      req.usuario.rol,
      req.usuario.nombre,
      req.usuario.direccion
    );
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

  if (!REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(nombre.trim())) {
    return res
      .status(400)
      .json({
        error: "La búsqueda debe incluir al menos un nombre de 5 letras.",
      });
  }

  try {
    const envios = await db.buscarPorDestinatario(
      nombre.trim(),
      req.usuario.rol,
      req.usuario.direccion,
      req.usuario.telefono
    );

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
    const envio = await db.buscarPorTracking(
      trackingId,
      req.usuario.rol,
      req.usuario.direccion,
      req.usuario.telefono
    );
    if (!envio) {
      if (req.usuario.rol === "Cliente") {
        const envioExistente = await db.buscarPorTracking(trackingId);
        if (envioExistente) {
          return res.status(404).json({
            error:
              "No se encontró un envío asociado a la dirección y teléfono del cliente autenticado.",
          });
        }
      }
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
  if (!["Operador", "Supervisor"].includes(req.usuario.rol)) {
    return res.status(403).json({ error: "No tenés permisos para cambiar el estado del envío." });
  }

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

app.patch("/api/envios/:trackingId/cancelar", requireAuth, async (req, res) => {
  if (!["Operador", "Supervisor"].includes(req.usuario.rol)) {
    return res
      .status(403)
      .json({ error: "No tenés permisos para cancelar el envío." });
  }

  try {
    const resultado = await db.cancelarEnvio(
      req.params.trackingId.toUpperCase(),
    );

    if (!resultado) {
      return res.status(404).json({ error: "Envío no encontrado." });
    }

    if (resultado.error) {
      return res.status(400).json({ error: resultado.error });
    }

    res.json({
      mensaje: 'Envío cancelado correctamente.',
      ...resultado,
    });
  } catch (err) {
    console.error("Error al cancelar envío:", err.message);
    res.status(500).json({ error: "No se pudo cancelar el envío." });
  }
});

// GET /api/envios/:trackingId/historial
app.get(
  "/api/envios/:trackingId/historial",
  requireAuth,
  requireRoles("Operador", "Supervisor"),
  async (req, res) => {
    const trackingId = req.params.trackingId.toUpperCase();

    if (!/^[A-Z]{2}-\d{6}$/.test(trackingId)) {
      return res
        .status(400)
        .json({ error: "El Tracking ID no es válido. Debe tener el formato: XX-XXXXXX." });
    }

    try {
      const envio = await db.buscarPorTracking(trackingId);
      if (!envio) {
        return res.status(404).json({ error: "Envío no encontrado." });
      }

      const historial = await db.obtenerHistorial(trackingId);
      res.json(historial);
    } catch (err) {
      console.error("Error al obtener historial:", err.message);
      res.status(500).json({ error: "No se pudo obtener el historial." });
    }
  },
);

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

// POST /api/modelo/entrenar
/**
 * @swagger
 * /api/modelo/entrenar:
 *   post:
 *     summary: Entrenar modelo ML
 *     description: Ejecuta el script Python de entrenamiento sobre el dataset generado (solo Supervisor)
 *     responses:
 *       200:
 *         description: Modelo entrenado correctamente con métricas
 *       400:
 *         description: Dataset no encontrado o datos insuficientes
 *       403:
 *         description: Sin permisos
 *       500:
 *         description: Error al ejecutar el script
 */
app.post("/api/modelo/entrenar", requireAuth, requireRoles("Supervisor"), async (req, res) => {
  const csvPath = path.join(__dirname, "datasets", "training_data.csv");

  if (!fs.existsSync(csvPath)) {
    return res.status(400).json({ error: "No se encontró el dataset. Primero estructurá el dataset." });
  }

  try {
    const resultado = entrenarModeloJS(csvPath);

    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }

    res.json(resultado);
  } catch (err) {
    console.error("Error al entrenar modelo:", err.message);
    res.status(500).json({ error: `No se pudo entrenar el modelo: ${err.message}` });
  }
});

// POST /api/modelo/predecir
/**
 * @swagger
 * /api/modelo/predecir:
 *   post:
 *     summary: Predecir tiempo de entrega
 *     description: Usa el modelo entrenado para predecir días de entrega de un envío (solo Supervisor)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             trackingId: AB-123456
 *     responses:
 *       200:
 *         description: Predicción exitosa
 *       400:
 *         description: Modelo no entrenado o envío no encontrado
 *       403:
 *         description: Sin permisos
 */
app.post("/api/modelo/predecir", requireAuth, requireRoles("Supervisor"), async (req, res) => {
  const { trackingId } = req.body;

  if (!trackingId) {
    return res.status(400).json({ error: "Ingresá un Tracking ID para predecir." });
  }

  const modelPath = path.join(__dirname, "datasets", "model.json");
  if (!fs.existsSync(modelPath)) {
    return res.status(400).json({ error: "El modelo no está entrenado. Completá los pasos 1 y 2 primero." });
  }

  try {
    const envio = await db.buscarPorTracking(trackingId.toUpperCase());
    if (!envio) {
      return res.status(404).json({ error: "Envío no encontrado." });
    }

    if (envio.estado !== "creado") {
      return res.status(400).json({ error: `Solo se pueden predecir envíos en estado "creado". Este envío está en estado "${envio.estado}".` });
    }

    const fechaCreacion = new Date(envio.fechaCreacion);
    const features = {
      len_direccion: (envio.direccionEntrega || "").length,
      len_producto:  (envio.producto || "").length,
      hora_creacion: fechaCreacion.getHours(),
      dia_semana:    fechaCreacion.getDay()
    };

    const resultado = predecirJS(modelPath, features);

    if (!resultado.ok) {
      return res.status(400).json({ error: resultado.error });
    }

    res.json({
      ...resultado,
      trackingId: envio.trackingId,
      producto:   envio.producto,
      destinatario: envio.destinatario,
      estado:     envio.estado
    });

  } catch (err) {
    console.error("Error al predecir:", err.message);
    res.status(500).json({ error: `No se pudo realizar la predicción: ${err.message}` });
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