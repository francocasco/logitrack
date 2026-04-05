const request = require("supertest");
const app = require("../server");
const db = require("../db/database");

let token; // lo vamos a usar en todos los tests protegidos

beforeAll(async () => {
  await db.inicializar();

  // Login para obtener token válido
  const res = await request(app).post("/api/auth/login").send({
    email: "admin@logitrack.com",
    password: "Admin1234!",
  });

  token = res.body.token;
});

// ─────────────────────────────────────────
// AUTENTICACIÓN DE USUARIOS
// ─────────────────────────────────────────

describe("TEST1 Autenticación de usuarios", () => {
  test("ESCN1 Inicio de sesión exitoso", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "admin@logitrack.com",
      password: "Admin1234!",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body.token).toBeDefined();
  });
});

describe("TEST1 Autenticación de usuarios", () => {
  test("ESCN2 Inicio de sesión fallido con contraseña incorrecta", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "admin@logitrack.com",
      password: "contraseña_incorrecta",
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
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "Zapatillas",
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
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "Zapatillas",
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
        producto: "",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("ESCN3 – Registro fallido por contacto inválido", async () => {
    const res = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "Zapatillas",
        contactoRemitente: "contacto-no-valido",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("contacto de remitente");
  });

  test("ESCN4 – Registro fallido por direccion de remitente con menos de 3 letras", async () => {
    const res = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "Zapatillas",
        direccionRemitente: "12",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("dirección de remitente");
  });

  test("ESCN5 – Registro fallido por producto con menos de 3 letras", async () => {
    const res = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "A1",
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toContain("producto");
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
        remitente: "Juana",
        destinatario: "Pedro",
        producto: "Zapatillas",
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

    expect(buscar.statusCode).toBe(400);
  });

  test("ESCN3 – Búsqueda fallida por tracking ID inexistente", async () => {
    const buscar = await request(app)
      .get("/api/envios/AB-000000") // formato válido, pero no existe
      .set("Authorization", `Bearer ${token}`);

    expect(buscar.statusCode).toBe(404);
  });

  test("ESCN4 – Cliente no puede ver un envío si no coincide dirección y teléfono", async () => {
    const marcaTiempo = Date.now();
    const emailCliente = `cliente.tracking.${marcaTiempo}@logitrack.com`;

    const registro = await request(app).post("/api/auth/register").send({
      email: emailCliente,
      telefono: "+54 11 6000-0001",
      nombreUsuario: `clientetracking${marcaTiempo}`,
      password: "Cliente123!",
    });

    expect(registro.statusCode).toBe(201);

    const listaUsuarios = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${token}`);

    const cliente = listaUsuarios.body.usuarios.find(
      (usuario) => usuario.email === emailCliente,
    );

    expect(cliente).toBeDefined();

    const actualizarPerfil = await request(app)
      .patch(`/api/usuarios/${cliente.id}/perfil`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        nombre: "Cliente Tracking",
        direccion: "Calle Cliente 123",
      });

    expect(actualizarPerfil.statusCode).toBe(200);

    const loginCliente = await request(app).post("/api/auth/login").send({
      email: emailCliente,
      password: "Cliente123!",
    });

    expect(loginCliente.statusCode).toBe(200);

    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${token}`)
      .send({
        remitente: "Otro remitente",
        destinatario: "Otra persona",
        producto: "Auriculares",
        direccionRemitente: "Calle Remitente 456",
        contactoRemitente: "+54 11 6000-0002",
        contactoDestinatario: "+54 11 6000-0003",
        direccionEntrega: "Calle Destino 789",
      });

    expect(crear.statusCode).toBe(201);

    const buscar = await request(app)
      .get(`/api/envios/${crear.body.trackingId}`)
      .set("Authorization", `Bearer ${loginCliente.body.token}`);

    expect(buscar.statusCode).toBe(404);
    expect(buscar.body.error).toBe(
      "No se encontró un envío asociado a la dirección y teléfono del cliente autenticado.",
    );
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
        destinatario: "Juana",
        producto: "Sopa",
      });

    const trackingId = crear.body.trackingId;

    // Consultar envío
    const consultar = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${token}`);

    expect(consultar.statusCode).toBe(200);

    // Validar visualización (equivalente a validar datos)
    expect(consultar.body.remitente).toBe("Alguien");
    expect(consultar.body.destinatario).toBe("Juana");
    expect(consultar.body.producto).toBe("Sopa");

    // Validar que existan los demás campos necesarios para la pantalla
    expect(consultar.body.estado).toBeDefined();
    expect(consultar.body.fechaCreacion).toBeDefined();
    expect(consultar.body.fechaActualizacion).toBeDefined();
  });
});

// ─────────────────────────────────────────
// CREAR CUENTA DE USUARIO
// ─────────────────────────────────────────

describe("TEST6 Crear cuenta de usuario", () => {
  test("ESCN1 Creación de cuenta exitosa", async () => {
    const marcaTiempo = Date.now();
    const response = await request(app)
      .post("/api/auth/register")
      .send({
        email: `usuario.nuevo.${marcaTiempo}@logitrack.com`,
        telefono: "+54 11 1234-5678",
        nombreUsuario: `usuariounico${marcaTiempo}`,
        password: "Password123!",
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.mensaje).toBeDefined();
    expect(response.body.mensaje).toContain("Cuenta creada");
  });

  test("ESCN2.1 Creación fallida - sin email", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "",
      telefono: "+54 11 1234-5678",
      nombreUsuario: "usuario123",
      password: "Password123!",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBeDefined();
    expect(response.body.error).toContain("obligatorios");
  });

  test("ESCN2.2 Creación fallida - sin teléfono", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "test@logitrack.com",
      telefono: "",
      nombreUsuario: "usuario123",
      password: "Password123!",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test("ESCN2.3 Creación fallida - sin nombreUsuario", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "test@logitrack.com",
      telefono: "+54 11 1234-5678",
      nombreUsuario: "",
      password: "Password123!",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBeDefined();
  });

  test("ESCN2.4 Creación fallida - sin password", async () => {
    const response = await request(app).post("/api/auth/register").send({
      email: "test@logitrack.com",
      telefono: "+54 11 1234-5678",
      nombreUsuario: "usuario123",
      password: "",
    });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});

// ─────────────────────────────────────────
// MODIFICACIÓN DE ROLES DE USUARIOS
// ─────────────────────────────────────────

describe("TEST7 Modificación de roles de usuarios", () => {
  let supervisorToken;

  beforeAll(() => {
    supervisorToken = token;
  });

  test.each(["Cliente", "Operador", "Supervisor"])(
    "ESCN1 Modificación exitosa - cambiar rol a %s",
    async (nuevoRol) => {
      const marcaTiempo = Date.now();
      const email = `roles.${nuevoRol.toLowerCase()}.${marcaTiempo}@logitrack.com`;
      const nombreUsuario = `roles_${nuevoRol.toLowerCase()}_${marcaTiempo}`;

      const registro = await request(app).post("/api/auth/register").send({
        email,
        telefono: "+54 11 5555-5555",
        nombreUsuario,
        password: "ClientePass123!",
      });

      expect(registro.statusCode).toBe(201);

      const listaUsuarios = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${supervisorToken}`);

      expect(listaUsuarios.statusCode).toBe(200);

      const usuarioCreado = listaUsuarios.body.usuarios.find(
        (usuario) => usuario.email === email,
      );

      expect(usuarioCreado).toBeDefined();

      const cambioRol = await request(app)
        .patch(`/api/usuarios/${usuarioCreado.id}/rol`)
        .set("Authorization", `Bearer ${supervisorToken}`)
        .send({ rol: nuevoRol });

      expect(cambioRol.statusCode).toBe(200);
      expect(cambioRol.body.mensaje).toContain("Rol actualizado");

      const verificacion = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${supervisorToken}`);

      expect(verificacion.statusCode).toBe(200);

      const usuarioActualizado = verificacion.body.usuarios.find(
        (usuario) => usuario.id === usuarioCreado.id,
      );

      expect(usuarioActualizado).toBeDefined();
      expect(usuarioActualizado.rol).toBe(nuevoRol);
    },
  );

  test("ESCN2 Operador puede ver usuarios pero no modificar roles", async () => {
    const marcaTiempo = Date.now();
    const emailOperador = `operador.usuarios.${marcaTiempo}@logitrack.com`;

    const registro = await request(app).post("/api/auth/register").send({
      email: emailOperador,
      telefono: "+54 11 6666-6666",
      nombreUsuario: `operadorusuarios${marcaTiempo}`,
      password: "Operador123!",
    });

    expect(registro.statusCode).toBe(201);

    const listaComoSupervisor = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${token}`);

    const operadorCreado = listaComoSupervisor.body.usuarios.find(
      (usuario) => usuario.email === emailOperador,
    );

    expect(operadorCreado).toBeDefined();

    const cambioRolOperador = await request(app)
      .patch(`/api/usuarios/${operadorCreado.id}/rol`)
      .set("Authorization", `Bearer ${token}`)
      .send({ rol: "Operador" });

    expect(cambioRolOperador.statusCode).toBe(200);

    const loginOperador = await request(app).post("/api/auth/login").send({
      email: emailOperador,
      password: "Operador123!",
    });

    expect(loginOperador.statusCode).toBe(200);

    const listaComoOperador = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${loginOperador.body.token}`);

    expect(listaComoOperador.statusCode).toBe(200);
    expect(Array.isArray(listaComoOperador.body.usuarios)).toBe(true);

    const usuarioObjetivo = listaComoOperador.body.usuarios.find(
      (usuario) => usuario.id !== operadorCreado.id,
    );

    expect(usuarioObjetivo).toBeDefined();

    const intentoModificar = await request(app)
      .patch(`/api/usuarios/${usuarioObjetivo.id}/rol`)
      .set("Authorization", `Bearer ${loginOperador.body.token}`)
      .send({ rol: "Cliente" });

    expect(intentoModificar.statusCode).toBe(403);
    expect(intentoModificar.body.error).toContain("modificar roles");
  });
});

// ─────────────────────────────────────────
// MODIFICAR DATOS DEL ENVÍO
// ─────────────────────────────────────────

describe("TEST8 Modificar datos del envío", () => {
  let supervisorToken;
  let operadorToken;

  beforeAll(async () => {
    supervisorToken = token;

    const marcaTiempo = Date.now();
    const email = `operador.envios.${marcaTiempo}@logitrack.com`;

    const registro = await request(app)
      .post("/api/auth/register")
      .send({
        email,
        telefono: "+54 11 7777-7777",
        nombreUsuario: `operadorenvios${marcaTiempo}`,
        password: "Operador123!",
      });

    expect(registro.statusCode).toBe(201);

    const listaUsuarios = await request(app)
      .get("/api/usuarios")
      .set("Authorization", `Bearer ${supervisorToken}`);

    const usuarioCreado = listaUsuarios.body.usuarios.find(
      (usuario) => usuario.email === email,
    );

    expect(usuarioCreado).toBeDefined();

    const cambioRol = await request(app)
      .patch(`/api/usuarios/${usuarioCreado.id}/rol`)
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({ rol: "Operador" });

    expect(cambioRol.statusCode).toBe(200);

    const loginOperador = await request(app).post("/api/auth/login").send({
      email,
      password: "Operador123!",
    });

    expect(loginOperador.statusCode).toBe(200);
    operadorToken = loginOperador.body.token;
  });

  test("ESCN1 Modificación exitosa", async () => {
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        remitente: "Depósito Central",
        destinatario: "Juana",
        producto: "Notebook",
      });

    expect(crear.statusCode).toBe(201);

    const trackingId = crear.body.trackingId;

    const editar = await request(app)
      .patch(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({
        destinatario: "Juan Pérez",
        direccionEntrega: "Av. Siempre Viva 742",
      });

    expect(editar.statusCode).toBe(200);
    expect(editar.body.mensaje).toContain("actualizados correctamente");

    const detalle = await request(app)
      .get(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${operadorToken}`);

    expect(detalle.statusCode).toBe(200);
    expect(detalle.body.destinatario).toBe("Juan Pérez");
    expect(detalle.body.direccionEntrega).toBe("Av. Siempre Viva 742");
  });

  test("ESCN2.1 Modificación fallida - valores vacíos", async () => {
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        remitente: "Sucursal Norte",
        destinatario: "María",
        producto: "Documentación",
      });

    expect(crear.statusCode).toBe(201);

    const editar = await request(app)
      .patch(`/api/envios/${crear.body.trackingId}`)
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({
        destinatario: "",
        direccionEntrega: "",
      });

    expect(editar.statusCode).toBe(400);
    expect(editar.body.error).toBeDefined();
  });

  test("ESCN2.2 Modificación fallida - envío entregado", async () => {
    const crear = await request(app)
      .post("/api/envios")
      .set("Authorization", `Bearer ${supervisorToken}`)
      .send({
        remitente: "Centro Logístico",
        destinatario: "Pedro",
        producto: "Monitor",
      });

    expect(crear.statusCode).toBe(201);

    const trackingId = crear.body.trackingId;

    await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${supervisorToken}`);
    await request(app)
      .patch(`/api/envios/${trackingId}/estado`)
      .set("Authorization", `Bearer ${supervisorToken}`);

    const editar = await request(app)
      .patch(`/api/envios/${trackingId}`)
      .set("Authorization", `Bearer ${operadorToken}`)
      .send({
        destinatario: "Pedro Gómez",
        direccionEntrega: "Calle 123",
      });

    expect(editar.statusCode).toBe(400);
    expect(editar.body.error).toContain("entregado");
  });

  // ─────────────────────────────────────────
  // BUSCAR ENVÍO POR NOMBRE DE DESTINATARIO
  // ─────────────────────────────────────────

  describe("TEST10 Buscar envío por nombre de destinatario", () => {
    beforeAll(async () => {
      // Precondición: crear envío con destinatario "Casa Central"
      await request(app)
        .post("/api/envios")
        .set("Authorization", `Bearer ${token}`)
        .send({
          remitente: "Depósito Central",
          destinatario: "Casa Central",
          producto: "Caja de insumos",
        });
    });

    test("ESCN1 Búsqueda exitosa - destinatario existente: Casa Central", async () => {
      const res = await request(app)
        .get("/api/envios/buscar/destinatario?nombre=Casa Central")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.envios).toBeDefined();
      expect(res.body.envios.length).toBeGreaterThan(0);
      expect(
        res.body.envios.some((e) =>
          e.destinatario.toLowerCase().includes("casa central"),
        ),
      ).toBe(true);
    });

    test("ESCN2 Búsqueda fallida - destinatario inexistente: Solo Deportes", async () => {
      const res = await request(app)
        .get("/api/envios/buscar/destinatario?nombre=Solo Deportes")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(404);
      expect(res.body.error).toBeDefined();
    });

    test("ESCN2.1 Búsqueda con números permitida si hay un nombre de 5 letras", async () => {
      const res = await request(app)
        .get("/api/envios/buscar/destinatario?nombre=Central 123")
        .set("Authorization", `Bearer ${token}`);

      expect([200, 404]).toContain(res.statusCode);
      expect(res.statusCode).not.toBe(400);
    });

    test("ESCN2.2 Búsqueda inválida si no hay al menos 5 letras seguidas", async () => {
      const res = await request(app)
        .get("/api/envios/buscar/destinatario?nombre=Ana 12")
        .set("Authorization", `Bearer ${token}`);

      expect(res.statusCode).toBe(400);
      expect(res.body.error).toBe(
        "La búsqueda debe incluir al menos un nombre de 5 letras.",
      );
    });

    test("ESCN3 Cliente solo ve resultados que coinciden con su dirección y teléfono", async () => {
      const marcaTiempo = Date.now();
      const emailCliente = `cliente.destinatario.${marcaTiempo}@logitrack.com`;
      const sufijoUnico = Math.random()
        .toString(36)
        .replace(/[^a-z]+/g, "")
        .slice(0, 6);
      const destinatarioUnico = `Cliente Final ${sufijoUnico}`;

      const registro = await request(app).post("/api/auth/register").send({
        email: emailCliente,
        telefono: "+54 11 6100-0001",
        nombreUsuario: `clientedest${marcaTiempo}`,
        password: "Cliente123!",
      });

      expect(registro.statusCode).toBe(201);

      const listaUsuarios = await request(app)
        .get("/api/usuarios")
        .set("Authorization", `Bearer ${token}`);

      const cliente = listaUsuarios.body.usuarios.find(
        (usuario) => usuario.email === emailCliente,
      );

      expect(cliente).toBeDefined();

      const actualizarPerfil = await request(app)
        .patch(`/api/usuarios/${cliente.id}/perfil`)
        .set("Authorization", `Bearer ${token}`)
        .send({
          nombre: "Cliente Destinatario",
          direccion: "Calle Cliente 456",
        });

      expect(actualizarPerfil.statusCode).toBe(200);

      const loginCliente = await request(app).post("/api/auth/login").send({
        email: emailCliente,
        password: "Cliente123!",
      });

      expect(loginCliente.statusCode).toBe(200);

      const envioVisible = await request(app)
        .post("/api/envios")
        .set("Authorization", `Bearer ${token}`)
        .send({
          remitente: "Proveedor Uno",
          destinatario: destinatarioUnico,
          producto: "Teclado",
          direccionRemitente: "Depósito A",
          contactoRemitente: "+54 11 6100-9999",
          contactoDestinatario: "+54 11 6100-0001",
          direccionEntrega: "Calle Cliente 456",
        });

      expect(envioVisible.statusCode).toBe(201);

      const envioOculto = await request(app)
        .post("/api/envios")
        .set("Authorization", `Bearer ${token}`)
        .send({
          remitente: "Proveedor Dos",
          destinatario: destinatarioUnico,
          producto: "Mouse",
          direccionRemitente: "Depósito B",
          contactoRemitente: "+54 11 6200-9999",
          contactoDestinatario: "+54 11 6200-0002",
          direccionEntrega: "Otra Calle 789",
        });

      expect(envioOculto.statusCode).toBe(201);

      const res = await request(app)
        .get(`/api/envios/buscar/destinatario?nombre=${encodeURIComponent(destinatarioUnico)}`)
        .set("Authorization", `Bearer ${loginCliente.body.token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.envios).toHaveLength(1);
      expect(res.body.envios[0].trackingId).toBe(envioVisible.body.trackingId);
    });
  });

  // ─────────────────────────────────────────
  // TEST12 Registrar fecha y hora del cambio
  // ─────────────────────────────────────────

  describe("TEST12 Registrar fecha y hora del cambio", () => {
    test("ESCN1 Registro exitoso", async () => {
      // 1. Crear envío
      const crear = await request(app)
        .post("/api/envios")
        .set("Authorization", `Bearer ${token}`)
        .send({
            remitente: "Juana",
          destinatario: "Pedro",
          producto: "Celular",
        });

      expect(crear.statusCode).toBe(201);
      const trackingId = crear.body.trackingId;

      // 2. Cambiar estado
      const cambio = await request(app)
        .patch(`/api/envios/${trackingId}/estado`)
        .set("Authorization", `Bearer ${token}`);

      expect(cambio.statusCode).toBe(200);

      // 3. Obtener historial
      const historial = await request(app)
        .get(`/api/envios/${trackingId}/historial`)
        .set("Authorization", `Bearer ${token}`);

        console.log("HISTORIAL:", historial.body);

      expect(historial.statusCode).toBe(200);
      expect(historial.body.length).toBeGreaterThan(0);

      // 👇 FIX
      const registro = historial.body.find((h) => h.trackingId === trackingId);

      expect(registro).toBeDefined();

      // 4. Validar datos
      expect(registro.trackingId).toBe(trackingId);
      expect(registro.estado).toBeDefined();
      expect(registro.fechaCambio).toBeDefined();

      // 5. Validar formato de fecha (ISO válido)
      const fecha = new Date(registro.fechaCambio);
      expect(fecha.toString()).not.toBe("Invalid Date");


      
    });
  });
});
