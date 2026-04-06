const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { createClient } = require("@libsql/client");

const testRootDir = fs.mkdtempSync(path.join(os.tmpdir(), "logitrack-tests-"));
const testDbPath = path.join(testRootDir, "database.test.db");
const testArtifactsDir = path.join(testRootDir, "datasets-test");

process.env.TURSO_URL = `file:${testDbPath}`;
process.env.DATASETS_DIR = testArtifactsDir;
process.env.ADMIN_EMAIL = "admin@logitrack.com";
process.env.ADMIN_PASS = "Admin1234!";
process.env.ADMIN_PHONE = "+54 11 5555-0000";
process.env.ADMIN_USERNAME = "adminsuper";

const app = require("../server");
const db = require("../db/database");

const client = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN || undefined,
});

let sequence = 0;

function nextValue(prefix = "valor") {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

function buildRegisterPayload(prefix = "usuario") {
  const base = nextValue(prefix).toLowerCase();
  return {
    email: `${base}@logitrack.test`,
    telefono: `+54 11 ${String(60000000 + sequence).padStart(8, "0")}`,
    nombreUsuario: `${base}usr`,
    password: "Clave1234!",
  };
}

function buildShipmentPayload(overrides = {}) {
  const suffix = nextValue("envio");
  return {
    remitente: "Remitente Prueba",
    destinatario: "Destino Prueba",
    producto: "Producto Prueba",
    direccionRemitente: `Calle Remitente ${100 + sequence}`,
    contactoRemitente: `${suffix}@remitente.test`,
    contactoDestinatario: `${suffix}@destinatario.test`,
    direccionEntrega: `Calle Entrega ${200 + sequence}`,
    ...overrides,
  };
}

function writeValidDatasetFixture() {
  const rows = [
    "dias_entrega,len_direccion,len_producto,hora_creacion,dia_semana",
    "1,11,5,3,1",
    "3,25,12,14,5",
    "2,17,7,8,2",
    "6,30,19,19,6",
    "4,22,10,11,3",
    "5,14,16,16,4",
    "7,35,9,6,0",
    "8,28,21,20,2",
  ];

  fs.mkdirSync(testArtifactsDir, { recursive: true });
  fs.writeFileSync(
    path.join(testArtifactsDir, "training_data.csv"),
    rows.join("\n"),
    "utf-8",
  );
}

async function resetState() {
  await db.inicializar();

  const tables = [
    "sesiones",
    "historial_estados",
    "historial_envios",
    "log_estructuracion",
    "envios",
    "usuarios",
  ];

  for (const table of tables) {
    await client.execute(`DELETE FROM ${table}`);
  }

  try {
    await client.execute(
      "DELETE FROM sqlite_sequence WHERE name IN ('historial_estados', 'historial_envios', 'log_estructuracion', 'envios', 'usuarios')",
    );
  } catch (error) {
    if (!error.message.includes("no such table")) {
      throw error;
    }
  }

  fs.rmSync(testArtifactsDir, { recursive: true, force: true });
  fs.mkdirSync(testArtifactsDir, { recursive: true });

  await db.inicializar();
}

async function login(email, password) {
  return request(app).post("/api/auth/login").send({ email, password });
}

async function loginAdmin() {
  const response = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASS);
  expect(response.statusCode).toBe(200);
  return response.body.token;
}

async function registerUser(overrides = {}) {
  const payload = { ...buildRegisterPayload(), ...overrides };
  const response = await request(app).post("/api/auth/register").send(payload);
  return { payload, response };
}

async function getUserByEmail(adminToken, email) {
  const response = await request(app)
    .get("/api/usuarios")
    .set("Authorization", `Bearer ${adminToken}`);

  expect(response.statusCode).toBe(200);
  return response.body.usuarios.find((usuario) => usuario.email === email);
}

async function createUserWithRole(role = "Cliente") {
  const adminToken = await loginAdmin();
  const { payload, response } = await registerUser();

  expect(response.statusCode).toBe(201);

  const user = await getUserByEmail(adminToken, payload.email);
  expect(user).toBeDefined();

  if (role !== "Cliente") {
    const roleUpdate = await request(app)
      .patch(`/api/usuarios/${user.id}/rol`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: role });

    expect(roleUpdate.statusCode).toBe(200);
  }

  const loginResponse = await login(payload.email, payload.password);
  expect(loginResponse.statusCode).toBe(200);

  return {
    adminToken,
    credentials: payload,
    user: { ...user, rol: role },
    token: loginResponse.body.token,
  };
}

async function updateUserProfile(token, userId, payload) {
  return request(app)
    .patch(`/api/usuarios/${userId}/perfil`)
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
}

async function createShipment(token, overrides = {}) {
  const payload = buildShipmentPayload(overrides);
  const response = await request(app)
    .post("/api/envios")
    .set("Authorization", `Bearer ${token}`)
    .send(payload);
  return { payload, response };
}

async function advanceShipment(token, trackingId, times = 1) {
  let response = null;

  for (let index = 0; index < times; index += 1) {
    response = await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${token}`);
  }

  return response;
}

async function deliverShipment(token) {
  const { response } = await createShipment(token);
  expect(response.statusCode).toBe(201);

  const trackingId = response.body.trackingId;

  for (const expectedState of ["en tránsito", "en sucursal", "entregado"]) {
    const update = await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${token}`);

    expect(update.statusCode).toBe(200);
    expect(update.body.nuevoEstado).toBe(expectedState);
  }

  return trackingId;
}

async function createDeliveredShipments(token, count = 5) {
  const trackingIds = [];

  for (let index = 0; index < count; index += 1) {
    trackingIds.push(await deliverShipment(token));
  }

  return trackingIds;
}

beforeEach(async () => {
  await resetState();
});

afterAll(() => {
  fs.rmSync(testRootDir, { recursive: true, force: true });
});

describe("CP-01 y CP-02 Autenticación", () => {
  test("CP-01 Inicio de sesión exitoso", async () => {
    const response = await login(process.env.ADMIN_EMAIL, process.env.ADMIN_PASS);

    expect(response.statusCode).toBe(200);
    expect(response.body.mensaje).toContain("Sesión iniciada correctamente");
    expect(response.body.token).toBeDefined();
  });

  test("CP-02 Inicio de sesión fallido con contraseña incorrecta", async () => {
    const response = await login(process.env.ADMIN_EMAIL, "ClaveIncorrecta123!");

    expect(response.statusCode).toBe(401);
    expect(response.body.error).toContain("Email o contraseña incorrectos");
  });
});

describe("CP-03, CP-04 y CP-30 Registro de envíos", () => {
  test("CP-03 El envío se crea con estado inicial creado", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    expect(shipment.response.statusCode).toBe(201);

    const detail = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(detail.statusCode).toBe(200);
    expect(detail.body.estado).toBe("creado");
  });

  test("CP-04 Registro exitoso de envío", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    expect(shipment.response.statusCode).toBe(201);
    expect(shipment.response.body.mensaje).toContain("Envío creado exitosamente");
    expect(shipment.response.body.trackingId).toMatch(/^[A-Z]{2}-\d{6}$/);
  });

  test("CP-30 Tracking ID con formato válido y único", async () => {
    const operator = await createUserWithRole("Operador");
    const first = await createShipment(operator.token);
    const second = await createShipment(operator.token);

    expect(first.response.statusCode).toBe(201);
    expect(second.response.statusCode).toBe(201);
    expect(first.response.body.trackingId).toMatch(/^[A-Z]{2}-\d{6}$/);
    expect(second.response.body.trackingId).toMatch(/^[A-Z]{2}-\d{6}$/);
    expect(first.response.body.trackingId).not.toBe(second.response.body.trackingId);
  });
});

describe("CP-05 Registro fallido de envíos", () => {
  test.each([
    {
      name: "sin remitente",
      payload: () => buildShipmentPayload({ remitente: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "sin destinatario",
      payload: () => buildShipmentPayload({ destinatario: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "sin producto",
      payload: () => buildShipmentPayload({ producto: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "remitente sin nombre y apellido válidos",
      payload: () => buildShipmentPayload({ remitente: "Ana" }),
      error: "dos palabras de 3 letras",
    },
    {
      name: "destinatario sin nombre y apellido válidos",
      payload: () => buildShipmentPayload({ destinatario: "Paz" }),
      error: "dos palabras de 3 letras",
    },
    {
      name: "contacto remitente inválido",
      payload: () => buildShipmentPayload({ contactoRemitente: "sin-formato" }),
      error: "contacto de remitente",
    },
    {
      name: "contacto destinatario inválido",
      payload: () => buildShipmentPayload({ contactoDestinatario: "sin-formato" }),
      error: "contacto de destinatario",
    },
    {
      name: "dirección remitente sin formato requerido",
      payload: () => buildShipmentPayload({ direccionRemitente: "Calle" }),
      error: "dirección de remitente",
    },
    {
      name: "dirección destinatario sin formato requerido",
      payload: () => buildShipmentPayload({ direccionEntrega: "AB" }),
      error: "dirección de destinatario",
    },
    {
      name: "producto demasiado corto",
      payload: () => buildShipmentPayload({ producto: "TV" }),
      error: "producto debe tener al menos 5 letras",
    },
  ])("CP-05 Registro fallido: $name", async ({ payload, error }) => {
    const operator = await createUserWithRole("Operador");
    const response = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${operator.token}`)
      .send(payload());

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain(error);
  });
});

describe("CP-06, CP-07 y CP-08 Búsqueda por tracking", () => {
  test("CP-06 Búsqueda exitosa por tracking ID", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    const response = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.trackingId).toBe(shipment.response.body.trackingId);
  });

  test.each([
    { trackingId: "%20" },
    { trackingId: "FormatoErroneoID" },
  ])("CP-07 Búsqueda fallida con tracking inválido: $trackingId", async ({ trackingId }) => {
    const operator = await createUserWithRole("Operador");
    const response = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain("Tracking ID no es válido");
  });

  test("CP-08 Búsqueda fallida con tracking inexistente", async () => {
    const operator = await createUserWithRole("Operador");
    const response = await request(app)
      .get("/api/envios/FS-606568")
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain("Envío no encontrado");
  });
});

describe("CP-09 Visualización de envío", () => {
  test("CP-09 El detalle devuelve todos los campos relevantes", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token, {
      remitente: "Carlos Perez",
      destinatario: "Maria Gomez",
      producto: "Notebook Gamer",
      direccionRemitente: "Av. Corrientes 1234",
      contactoRemitente: "carlos@test.com",
      contactoDestinatario: "+54 11 5123-4567",
      direccionEntrega: "Casa Central 742",
    });

    const response = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.trackingId).toBe(shipment.response.body.trackingId);
    expect(response.body.remitente).toBe("Carlos Perez");
    expect(response.body.destinatario).toBe("Maria Gomez");
    expect(response.body.contactoRemitente).toBe("carlos@test.com");
    expect(response.body.contactoDestinatario).toBe("+54 11 5123-4567");
    expect(response.body.direccionRemitente).toBe("Av. Corrientes 1234");
    expect(response.body.direccionEntrega).toBe("Casa Central 742");
    expect(response.body.producto).toBe("Notebook Gamer");
    expect(response.body.estado).toBe("creado");
    expect(response.body.fechaCreacion).toBeDefined();
    expect(response.body.fechaActualizacion).toBeDefined();
  });
});

describe("CP-10 Modificación de roles", () => {
  test.each(["Cliente", "Operador", "Supervisor"])("CP-10 Cambio exitoso a %s", async (targetRole) => {
    const adminToken = await loginAdmin();
    const registered = await registerUser();

    expect(registered.response.statusCode).toBe(201);

    const user = await getUserByEmail(adminToken, registered.payload.email);
    const response = await request(app)
      .patch(`/api/usuarios/${user.id}/rol`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ rol: targetRole });

    expect(response.statusCode).toBe(200);
    expect(response.body.mensaje).toContain("Rol actualizado correctamente");
  });
});

describe("CP-11 y CP-12 Registro de usuarios", () => {
  test("CP-11 Creación de cuenta exitosa", async () => {
    const registered = await registerUser();

    expect(registered.response.statusCode).toBe(201);
    expect(registered.response.body.mensaje).toContain("Cuenta creada correctamente");

    const loginResponse = await login(registered.payload.email, registered.payload.password);
    expect(loginResponse.statusCode).toBe(200);
  });

  test.each([
    {
      name: "sin email",
      payload: () => ({ ...buildRegisterPayload(), email: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "sin teléfono",
      payload: () => ({ ...buildRegisterPayload(), telefono: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "sin nombre de usuario",
      payload: () => ({ ...buildRegisterPayload(), nombreUsuario: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "sin contraseña",
      payload: () => ({ ...buildRegisterPayload(), password: "" }),
      error: "Todos los campos son obligatorios",
    },
    {
      name: "email inválido",
      payload: () => ({ ...buildRegisterPayload(), email: "emailInvalido" }),
      error: "formato del email no es válido",
    },
    {
      name: "teléfono inválido",
      payload: () => ({ ...buildRegisterPayload(), telefono: "123" }),
      error: "número de teléfono no es válido",
    },
    {
      name: "nombre de usuario corto",
      payload: () => ({ ...buildRegisterPayload(), nombreUsuario: "abc" }),
      error: "nombre de usuario debe tener al menos 5 caracteres",
    },
    {
      name: "contraseña inválida",
      payload: () => ({ ...buildRegisterPayload(), password: "corta" }),
      error: "contraseña debe tener un mínimo de 8 caracteres",
    },
  ])("CP-12 Registro fallido: $name", async ({ payload, error }) => {
    const response = await request(app).post("/api/auth/register").send(payload());

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain(error);
  });
});

describe("CP-13, CP-14, CP-22 y CP-23 Gestión de envíos", () => {
  test("CP-13 Modificación exitosa de datos del envío", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    const response = await request(app)
      .patch(`/api/envios/${shipment.response.body.trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`)
      .send({
        destinatario: "Juan Perez",
        direccionEntrega: "Av. Siempreviva 742",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.envio.destinatario).toBe("Juan Perez");
    expect(response.body.envio.direccionEntrega).toBe("Av. Siempreviva 742");
  });

  test.each([
    {
      name: "valores vacíos",
      setup: async (token) => {
        const shipment = await createShipment(token);
        return shipment.response.body.trackingId;
      },
      payload: { destinatario: "", direccionEntrega: "" },
      error: "no pueden estar vacíos",
    },
    {
      name: "envío entregado",
      setup: async (token) => deliverShipment(token),
      payload: { destinatario: "Cambio Tardío", direccionEntrega: "Destino 123" },
      error: "ya fue entregado",
    },
  ])("CP-14 Modificación fallida: $name", async ({ setup, payload, error }) => {
    const operator = await createUserWithRole("Operador");
    const trackingId = await setup(operator.token);

    const response = await request(app)
      .patch(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${operator.token}`)
      .send(payload);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain(error);
  });

  test("CP-22 Cancelación exitosa en estado creado", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    const response = await request(app)
      .patch(`/api/envios/${shipment.response.body.trackingId}/cancelar`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.nuevoEstado).toBe("cancelado");
    expect(response.body.mensaje).toContain("Envío cancelado correctamente");
  });

  test("CP-23 Cancelación fallida si el envío no está en creado", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    await advanceShipment(operator.token, shipment.response.body.trackingId, 1);

    const response = await request(app)
      .patch(`/api/envios/${shipment.response.body.trackingId}/cancelar`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('estado "creado"');
  });

});

describe("CP-15 Setup de clientes", () => {
  test("CP-15 Registro exitoso de nombre y dirección", async () => {
    const adminToken = await loginAdmin();
    const operator = await createUserWithRole("Operador");
    const registered = await registerUser();

    expect(registered.response.statusCode).toBe(201);

    const user = await getUserByEmail(adminToken, registered.payload.email);
    const response = await updateUserProfile(operator.token, user.id, {
      nombre: "Cliente Casa Central",
      direccion: "Ubicacion Entrega 100",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.mensaje).toContain("Datos del usuario actualizados correctamente");
  });
});

describe("CP-16, CP-17 y CP-18 Permisos", () => {
  test("CP-16 Usuario no autenticado no accede a recurso protegido", async () => {
    const response = await request(app).get("/api/usuarios");

    expect(response.statusCode).toBe(401);
    expect(response.body.error).toContain("No autorizado");
  });

  test("CP-17 Cliente autenticado no accede a endpoint fuera de permisos", async () => {
    const clientUser = await createUserWithRole("Cliente");
    const response = await request(app)
      .get("/api/clientes/setup")
      .set("Authorization", `Bearer ${clientUser.token}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toContain("No tenés permisos");
  });

  test("CP-18 Operador autenticado no accede a endpoint exclusivo de supervisor", async () => {
    const operator = await createUserWithRole("Operador");
    const response = await request(app)
      .post("/api/dataset/estructurar")
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toContain("No tenés permisos para estructurar el dataset");
  });
});

describe("CP-19, CP-20 y CP-21 Cambio de estado", () => {
  test.each([
    { previousTransitions: 0, expectedState: "en tránsito" },
    { previousTransitions: 1, expectedState: "en sucursal" },
    { previousTransitions: 2, expectedState: "entregado" },
  ])("CP-19 Cambio exitoso hacia $expectedState", async ({ previousTransitions, expectedState }) => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    if (previousTransitions > 0) {
      await advanceShipment(operator.token, shipment.response.body.trackingId, previousTransitions);
    }

    const response = await request(app)
      .patch(`/api/envios/${shipment.response.body.trackingId}/estado`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.nuevoEstado).toBe(expectedState);
  });

  test("CP-20 Cambio fallido si el envío ya está entregado", async () => {
    const operator = await createUserWithRole("Operador");
    const trackingId = await deliverShipment(operator.token);

    const response = await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain("ya fue entregado");
  });

  test("CP-21 El historial registra fecha y hora del cambio", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    const update = await request(app)
      .patch(`/api/envios/${shipment.response.body.trackingId}/estado`)
      .set("Authorization", `Bearer ${operator.token}`);

    const history = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}/historial`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(update.statusCode).toBe(200);
    expect(history.statusCode).toBe(200);
    expect(history.body[0].estado).toBe("en tránsito");
    expect(history.body[0].fechaCambio).toBeDefined();
  });
});

describe("CP-24 y CP-25 Búsqueda por destinatario", () => {
  test("CP-24 Búsqueda exitosa por nombre del destinatario", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token, { destinatario: "Casa Central" });

    const response = await request(app)
      .get("/api/envios/buscar/destinatario")
      .set("Authorization", `Bearer ${operator.token}`)
      .query({ nombre: "Casa Central" });

    expect(response.statusCode).toBe(200);
    expect(response.body.envios.some((envio) => envio.trackingId === shipment.response.body.trackingId)).toBe(true);
  });

  test("CP-25 Búsqueda fallida si el destinatario no existe", async () => {
    const operator = await createUserWithRole("Operador");
    const response = await request(app)
      .get("/api/envios/buscar/destinatario")
      .set("Authorization", `Bearer ${operator.token}`)
      .query({ nombre: "Solo Deportes" });

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain("No se encontraron envíos");
  });
});

describe("CP-26, CP-27, CP-28 y CP-29 Historial global y dataset", () => {
  test("CP-26 Se registra un envío entregado en historial global", async () => {
    const operator = await createUserWithRole("Operador");
    const adminToken = await loginAdmin();
    const trackingId = await deliverShipment(operator.token);

    const response = await request(app)
      .get("/api/historial")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.historial.some((item) => item.trackingId === trackingId)).toBe(true);
  });

  test("CP-27 Estructuración exitosa del dataset", async () => {
    const operator = await createUserWithRole("Operador");
    const adminToken = await loginAdmin();

    await createDeliveredShipments(operator.token, 5);

    const response = await request(app)
      .post("/api/dataset/estructurar")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.mensaje).toContain("Dataset estructurado");
    expect(fs.existsSync(path.join(testArtifactsDir, "training_data.csv"))).toBe(true);
  });

  test("CP-28 No se puede estructurar dos veces en menos de 10 días", async () => {
    const operator = await createUserWithRole("Operador");
    const adminToken = await loginAdmin();

    await createDeliveredShipments(operator.token, 5);

    const first = await request(app)
      .post("/api/dataset/estructurar")
      .set("Authorization", `Bearer ${adminToken}`);

    const second = await request(app)
      .post("/api/dataset/estructurar")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(400);
    expect(second.body.error).toContain("última estructuración");
  });

  test("CP-29 Un cliente no puede estructurar el dataset", async () => {
    const clientUser = await createUserWithRole("Cliente");
    const response = await request(app)
      .post("/api/dataset/estructurar")
      .set("Authorization", `Bearer ${clientUser.token}`);

    expect(response.statusCode).toBe(403);
    expect(response.body.error).toContain("No tenés permisos para estructurar el dataset");
  });
});

describe("CP-31, CP-32, CP-33, CP-34, CP-35 y CP-36 Historial, IA y panel de envíos", () => {
  test("CP-31 Se puede consultar el historial de un envío particular", async () => {
    const operator = await createUserWithRole("Operador");
    const shipment = await createShipment(operator.token);

    await advanceShipment(operator.token, shipment.response.body.trackingId, 2);

    const response = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}/historial`)
      .set("Authorization", `Bearer ${operator.token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.length).toBeGreaterThanOrEqual(3);
    expect(response.body[0].fechaCambio >= response.body[1].fechaCambio).toBe(true);
  });

  test("CP-32 Entrenamiento exitoso del modelo", async () => {
    const adminToken = await loginAdmin();
    writeValidDatasetFixture();

    const train = await request(app)
      .post("/api/modelo/entrenar")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(train.statusCode).toBe(200);
    expect(train.body.modelo).toContain("Regresión Lineal");
    expect(train.body.r2Score).toBeDefined();
    expect(fs.existsSync(path.join(testArtifactsDir, "model.json"))).toBe(true);
  });

  test("CP-33 El supervisor accede al flujo IA sin rechazo por permisos", async () => {
    const adminToken = await loginAdmin();
    const response = await request(app)
      .post("/api/modelo/entrenar")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain("No se encontró el dataset");
  });

  test("CP-34 Predicción exitosa para un envío en estado creado", async () => {
    const operator = await createUserWithRole("Operador");
    const adminToken = await loginAdmin();
    writeValidDatasetFixture();

    const train = await request(app)
      .post("/api/modelo/entrenar")
      .set("Authorization", `Bearer ${adminToken}`);

    const shipment = await createShipment(operator.token);
    const prediction = await request(app)
      .post("/api/modelo/predecir")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ trackingId: shipment.response.body.trackingId });

    expect(train.statusCode).toBe(200);
    expect(prediction.statusCode).toBe(200);
    expect(prediction.body.trackingId).toBe(shipment.response.body.trackingId);
    expect(prediction.body.diasEstimados).toBeGreaterThanOrEqual(1);
  });

  test("CP-35 Predicción fallida con tracking inexistente", async () => {
    const adminToken = await loginAdmin();
    writeValidDatasetFixture();

    await request(app)
      .post("/api/modelo/entrenar")
      .set("Authorization", `Bearer ${adminToken}`);

    const response = await request(app)
      .post("/api/modelo/predecir")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ trackingId: "FS-456372" });

    expect(response.statusCode).toBe(404);
    expect(response.body.error).toContain("Envío no encontrado");
  });

  test("CP-36 El panel general de envíos devuelve lista y paginación", async () => {
    const operator = await createUserWithRole("Operador");
    const first = await createShipment(operator.token);
    const second = await createShipment(operator.token);

    const response = await request(app)
      .get("/api/envios")
      .set("Authorization", `Bearer ${operator.token}`)
      .query({ pagina: 1, porPagina: 10 });

    expect(first.response.statusCode).toBe(201);
    expect(second.response.statusCode).toBe(201);
    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.envios)).toBe(true);
    expect(response.body.envios.length).toBeGreaterThanOrEqual(2);
    expect(response.body.paginacion.total).toBeGreaterThanOrEqual(2);
  });
});

describe("CP-37 Acceso a datos - Visualización lista envíos", () => {
  test("CP-37 Cliente solo visualiza sus propios envíos en la lista", async () => {
    const adminToken = await loginAdmin();
    const operator = await createUserWithRole("Operador");
    
    // Create a Cliente with profile
    const clienteA = await createUserWithRole("Cliente");
    const profileUpdateA = await updateUserProfile(adminToken, clienteA.user.id, {
      nombre: "Cliente Jose",
      direccion: "Calle Principal 123",
    });
    expect(profileUpdateA.statusCode).toBe(200);

    // Create another Cliente (shipments will belong to different users)
    const clienteB = await registerUser();
    expect(clienteB.response.statusCode).toBe(201);

    // Create shipment belonging to Cliente A
    const shipmentA = await createShipment(operator.token, {
      remitente: "Cliente Jose",
      destinatario: "Destinatario Alfa",
      producto: "Producto A",
      direccionRemitente: "Calle Principal 123",
      contactoRemitente: `${clienteA.credentials.email}`,
    });
    expect(shipmentA.response.statusCode).toBe(201);

    // Create shipment NOT belonging to Cliente A (belongs to different person)
    const shipmentB = await createShipment(operator.token, {
      remitente: "Cliente Pedro",
      destinatario: "Destinatario Beta",
      producto: "Producto B",
      direccionRemitente: "Calle Secundaria 456",
      contactoRemitente: `${clienteB.payload.email}`,
    });
    expect(shipmentB.response.statusCode).toBe(201);

    // List shipments as Cliente A
    const response = await request(app)
      .get("/api/envios")
      .set("Authorization", `Bearer ${clienteA.token}`)
      .query({ pagina: 1, porPagina: 10 });

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.envios)).toBe(true);
    
    // Cliente A should only see their own shipment
    const trackingIdsReturned = response.body.envios.map(e => e.trackingId);
    expect(trackingIdsReturned).toContain(shipmentA.response.body.trackingId);
    expect(trackingIdsReturned).not.toContain(shipmentB.response.body.trackingId);
  });
});

describe("CP-38 Acceso a datos - Búsqueda de envíos", () => {
  test("CP-38 Cliente no puede buscar envíos ajenos", async () => {
    const adminToken = await loginAdmin();
    const operator = await createUserWithRole("Operador");
    
    // Create Cliente A with specific profile
    const clienteA = await createUserWithRole("Cliente");
    const profileUpdateA = await updateUserProfile(adminToken, clienteA.user.id, {
      nombre: "Cliente Joseph",
      direccion: "Calle Principal 123",
    });
    expect(profileUpdateA.statusCode).toBe(200);

    // Get the updated user to see their telefono
    const updatedUsers = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${adminToken}`);
    const updatedClienteA = updatedUsers.body.usuarios.find(u => u.id === clienteA.user.id);

    // Create a shipment where names match but direccion/telefono are different
    const shipment = await createShipment(operator.token, {
      remitente: "Joseph Miller",
      destinatario: "Guadalupe Lopez",
      producto: "Paquete Express",
      direccionRemitente: "Calle Otra 999",
      contactoRemitente: "otro@email.com",
      direccionEntrega: "Calle Otra 888",
      contactoDestinatario: "otro2@email.com",
    });
    expect(shipment.response.statusCode).toBe(201);

    // Try to find by tracking ID - should fail because direccion/phone don't match
    const trackingResponse = await request(app)
      .get(`/api/envios/${shipment.response.body.trackingId}`)
      .set("Authorization", `Bearer ${clienteA.token}`);

    expect(trackingResponse.statusCode).toBe(404);
    expect(trackingResponse.body.error).toContain(
      "No se encontró un envío asociado a la dirección y teléfono del cliente autenticado"
    );

    // Try to search by destinatario - should return not found
    const searchResponse = await request(app)
      .get("/api/envios/buscar/destinatario")
      .set("Authorization", `Bearer ${clienteA.token}`)
      .query({ nombre: "Guadalupe Lopez" });

    expect(searchResponse.statusCode).toBe(404);
    expect(searchResponse.body.error).toContain("No se encontraron envíos");
  });
});

describe("CP-39 Acceso a datos - Visualización datos usuario", () => {
  test("CP-39 Cliente solo visualiza sus propios datos en la lista de usuarios", async () => {
    // Create Cliente A
    const clienteA = await createUserWithRole("Cliente");

    // Create Cliente B
    const clienteBResult = await registerUser();
    expect(clienteBResult.response.statusCode).toBe(201);
    const clienteB = await login(clienteBResult.payload.email, clienteBResult.payload.password);
    expect(clienteB.statusCode).toBe(200);

    // List usuarios as Cliente A
    const response = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${clienteA.token}`);

    expect(response.statusCode).toBe(200);
    expect(Array.isArray(response.body.usuarios)).toBe(true);

    // Cliente A should only see themselves
    expect(response.body.usuarios.length).toBe(1);
    expect(response.body.usuarios[0].id).toBe(clienteA.user.id);
    expect(response.body.usuarios[0].email).toBe(clienteA.credentials.email);
  });
});