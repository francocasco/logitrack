const request = require("supertest");
const app = require("../server");
const db = require("../db/database");

let token; // lo vamos a usar en todos los tests protegidos

beforeAll(async () => {
  await db.inicializar();

  // Login para obtener token válido
  const res = await request(app)
    .post("/api/auth/login")
    .send({
      email: "admin@logitrack.com",
      password: "Admin1234!"
    });

  token = res.body.token;
});

// ─────────────────────────────────────────
// AUTENTICACIÓN DE USUARIOS
// ─────────────────────────────────────────

describe("TEST1 Autenticación de usuarios", () => {
  test("ESCN1 Inicio de sesión exitoso", async () => {
    const response = await request(app)
      .post("/api/auth/login")
      .send({
        email: "admin@logitrack.com",
        password: "Admin1234!"
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeDefined();
  });
});

describe("TEST1 Autenticación de usuarios", () => {
  test("ESCN2 Inicio de sesión fallido con contraseña incorrecta", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: "admin@logitrack.com",
        password: "contraseña_incorrecta"
      });

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────
// Registrar estado inicial del envío
// ─────────────────────────────────────────

describe("TEST2 - Registrar estado inicial del envío", () => {

  test("ESCN1 El envío se crea con estado inicial 'creado'", async () => {
    // 1. Crear envío
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juan",
        destinatario: "Pedro",
        producto: "Zapatillas"
      });

    expect(crear.statusCode).toBe(201);
    expect(crear.body.trackingId).toBeDefined();

    const trackingId = crear.body.trackingId;

    // 2. Consultar envío recién creado
    const consultar = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(consultar.statusCode).toBe(200);
    expect(consultar.body.estado).toBe("creado");
  });

});

// ─────────────────────────────────────────
// Crear envío
// ─────────────────────────────────────────

describe("TEST3 Crear envío", () => {

  test("ESCN1 – Registro exitoso", async () => {
    const res = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juan",
        destinatario: "Pedro",
        producto: "Zapatillas"
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.trackingId).toBeDefined();
  });

  test("ESCN2 – Registro fallido", async () => {
    const res = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "",
        destinatario: "",
        producto: ""
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

});

// ─────────────────────────────────────────
// Búsqueda de envío por Tracking ID
// ─────────────────────────────────────────

describe("Búsqueda de envío por Tracking ID", () => {

  test("ESCN1 – Búsqueda exitosa", async () => {
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juan",
        destinatario: "Pedro",
        producto: "Zapatillas"
      });

    const trackingId = crear.body.trackingId;

    const buscar = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(buscar.statusCode).toBe(200);
    expect(buscar.body.trackingId).toMatch(/^[A-Z]{2}-\d{6}$/);
  });

  test("ESCN2 – Búsqueda fallida por tracking ID inválido", async () => {
    const buscar = await request(app)
      .get("/api/envios/INVALIDO123") // formato incorrecto
      .set("Authorization", `Bearer ${token}`);

    expect(buscar.statusCode).toBe(404);
  });

  test("ESCN3 – Búsqueda fallida por tracking ID inexistente", async () => {
    const buscar = await request(app)
      .get("/api/envios/AB-000000") // formato válido, pero no existe
      .set("Authorization", `Bearer ${token}`);

    expect(buscar.statusCode).toBe(404);
  });

});

// ─────────────────────────────────────────
// Visualizar información del envío
// ─────────────────────────────────────────

describe("TEST5 Visualizar información del envío", () => {

  test("ESCN1 – Visualización correcta de los datos del envío", async () => {
    // Crear envío con datos específicos
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Alguien",
        destinatario: "Juan",
        producto: "Sopa"
      });

    const trackingId = crear.body.trackingId;

    // Consultar envío
    const consultar = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(consultar.statusCode).toBe(200);

    // Validar visualización (equivalente a validar datos)
    expect(consultar.body.remitente).toBe("Alguien");
    expect(consultar.body.destinatario).toBe("Juan");
    expect(consultar.body.producto).toBe("Sopa");

    // Validar que existan los demás campos necesarios para la pantalla
    expect(consultar.body.estado).toBeDefined();
    expect(consultar.body.fechaCreacion).toBeDefined();
    expect(consultar.body.fechaActualizacion).toBeDefined();
  });

});

