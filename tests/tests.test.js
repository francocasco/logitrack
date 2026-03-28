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
// AUTENTICACIÓN
// ─────────────────────────────────────────

describe("Autenticación", () => {
  test("Inicio de sesión exitoso", async () => {
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

describe("Autenticación", () => {
  test("Inicio de sesión fallido con contraseña incorrecta", async () => {
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