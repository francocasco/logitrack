// ─── ESTADO DE PAGINACIÓN ─────────────────────────────────────
const paginacion = {
  pagina: 1,
  porPagina: 10,
  total: 0,
  totalPaginas: 0,
};

const PAGINAS_RESTRINGIDAS_CLIENTE = new Set([
  "page-crear",
  "page-setup",
  "page-ia",
]);

const PAGINAS_RESTRINGIDAS_OPERADOR = new Set(["page-ia"]);
const ESTADOS_ENVIO = ["creado", "en tránsito", "en sucursal", "entregado"];
const ICONOS_ESTADO_ENVIO = ["📋", "🚚", "🏢", "✅"];

let detalleEnvioDraft = null;

function mostrarPantallaError({ code = "403", title, message }) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav a").forEach((a) => a.classList.remove("active"));

  const page = document.getElementById("page-error");
  if (page) page.classList.add("active");

  const codeEl = document.getElementById("error-code");
  const titleEl = document.getElementById("error-title");
  const msgEl = document.getElementById("error-message");

  if (codeEl) codeEl.textContent = code;
  if (titleEl) titleEl.textContent = title || "Acceso denegado";
  if (msgEl) {
    msgEl.textContent =
      message || "No tenés permisos para acceder a esta sección.";
  }
}

function mensajePermisoPorPagina(pageId) {
  const mensajes = {
    "page-crear": "No tenés permisos para acceder a Nuevo envío.",
    "page-usuarios": "No tenés permisos para acceder a Usuarios.",
    "page-setup": "No tenés permisos para acceder a Setup de cliente.",
    "page-ia": "El Panel IA es exclusivo para Supervisores.",
  };

  return mensajes[pageId] || "No tenés permisos para acceder a esta sección.";
}

// ─── NAVEGACIÓN ───────────────────────────────────────────────
function navigate(pageId) {
  const usuario = window.usuarioActual;
  if (
    usuario?.rol === "Cliente" &&
    PAGINAS_RESTRINGIDAS_CLIENTE.has(pageId)
  ) {
    mostrarPantallaError({
      code: "403",
      title: "Acceso denegado",
      message: mensajePermisoPorPagina(pageId),
    });
    return;
  }

  if (
    usuario?.rol === "Operador" &&
    PAGINAS_RESTRINGIDAS_OPERADOR.has(pageId)
  ) {
    mostrarPantallaError({
      code: "403",
      title: "Acceso denegado",
      message: mensajePermisoPorPagina(pageId),
    });
    return;
  }

  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  document
    .querySelectorAll(".nav a")
    .forEach((a) => a.classList.remove("active"));

  const page = document.getElementById(pageId);
  if (page) page.classList.add("active");

  const link = document.querySelector(`.nav a[data-page="${pageId}"]`);
  if (link) link.classList.add("active");

  if (pageId === "page-lista") {
    paginacion.pagina = 1;
    cargarLista();
  }
  if (pageId === "page-usuarios") {
    cargarUsuarios();
  }
  if (pageId === "page-setup") {
    cargarSetup();
  }
}

// ─── UTILIDADES ───────────────────────────────────────────────
function formatFecha(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  );
}

function badgeEstado(estado) {
  const clases = {
    creado: "badge-creado",
    "en tránsito": "badge-transito",
    "en sucursal": "badge-sucursal",
    entregado: "badge-entregado",
  };
  return `<span class="badge ${clases[estado] || ""}">${estado}</span>`;
}

function showAlert(id, msg, tipo = "success") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${tipo} show`;
  el.textContent = msg;
  setTimeout(() => el.classList.remove("show"), 4000);
}

function escapeHtml(texto = "") {
  return String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function obtenerUsuarioActual() {
  if (window.usuarioActual) return window.usuarioActual;

  const res = await fetchAuth("/api/auth/verificar");
  if (!res.ok) throw new Error("No se pudo verificar la sesión actual.");

  const data = await res.json();
  window.usuarioActual = data;
  return data;
}

async function actualizarTextosSeccionUsuarios() {
  try {
    const usuarioActual = await obtenerUsuarioActual();
    const esCliente = usuarioActual?.rol === "Cliente";

    const navUsuariosText = document.getElementById("nav-usuarios-text");
    const usuariosPageTitle = document.getElementById("usuarios-page-title");
    const usuariosPageDescription = document.getElementById("usuarios-page-description");

    if (navUsuariosText) {
      navUsuariosText.textContent = esCliente ? "Usuario" : "Usuarios";
    }
    if (usuariosPageTitle) {
      usuariosPageTitle.textContent = esCliente ? "Usuario" : "Usuarios";
    }
    if (usuariosPageDescription) {
      usuariosPageDescription.textContent = esCliente
        ? "Visualizá los datos de tu cuenta."
        : "Administración de cuentas y roles.";
    }
  } catch (_) {
    // Si no se puede verificar sesión en este momento, mantenemos los textos por defecto.
  }
}

// ─── VALIDACIONES FRONTEND ────────────────────────────────────
const {
  REGEX_SOLO_LETRAS,
  REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS,
  REGEX_EMAIL,
  REGEX_TELEFONO,
  REGEX_TRACKING_ID,
} = window.LogiTrackValidation;

function validarCampo(valor, nombre, minLen = 2, maxLen = 100) {
  if (!valor || valor.trim().length === 0)
    return `El campo ${nombre} es obligatorio.`;
  if (valor.trim().length < minLen)
    return `El campo ${nombre} debe tener al menos ${minLen} caracteres.`;
  if (valor.length > maxLen)
    return `El campo ${nombre} no puede superar los ${maxLen} caracteres.`;
  return null;
}

function validarSoloLetras(valor, nombre) {
  if (!REGEX_SOLO_LETRAS.test(valor)) {
    return `El campo ${nombre} solo puede contener letras y espacios.`;
  }
  return null;
}

function validarMinimoLetras(valor, nombre, minimo = 5) {
  const letras = (valor.match(/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/g) || []).length;
  if (letras < minimo) {
    return `El campo ${nombre} debe tener al menos ${minimo} letras.`;
  }
  return null;
}

function validarMinimoLetrasOpcional(valor, nombre, minimo = 3) {
  if (!valor) return null;
  return validarMinimoLetras(valor, nombre, minimo);
}

function validarEmailOTelefono(valor, nombre) {
  if (!valor) return null;
  if (REGEX_EMAIL.test(valor) || REGEX_TELEFONO.test(valor)) return null;
  return `El campo ${nombre} debe ser un email o un telefono valido.`;
}

// ─── CREAR ENVÍO ──────────────────────────────────────────────
async function crearEnvio(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-crear");

  const remitente = document.getElementById("remitente").value.trim();
  const destinatario = document.getElementById("destinatario").value.trim();
  const producto = document.getElementById("producto").value.trim();
  const direccionRemitente = document.getElementById("direccionRemitente").value.trim();
  const contactoRemitente = document.getElementById("contactoRemitente").value.trim();
  const contactoDestinatario = document.getElementById("contactoDestinatario").value.trim();
  const direccionEntrega = document.getElementById("direccionEntrega").value.trim();

  const errRemitente = validarCampo(remitente, "remitente");
  const errDestinatario = validarCampo(destinatario, "destinatario");
  const errProducto = validarCampo(producto, "producto", 2, 200);
  const errProductoLetras = validarMinimoLetras(producto, "producto", 3);
  const errRemitenteLetras = validarMinimoLetras(remitente, "remitente", 5);
  const errDestinatarioLetras = validarMinimoLetras(destinatario, "destinatario", 5);
  const errDireccionRemitente = validarMinimoLetrasOpcional(direccionRemitente, "direccion de remitente", 3);
  const errDireccionDestinatario = validarMinimoLetrasOpcional(direccionEntrega, "direccion de destinatario", 3);
  const errContactoRemitente = validarEmailOTelefono(contactoRemitente, "contacto remitente");
  const errContactoDestinatario = validarEmailOTelefono(contactoDestinatario, "contacto destinatario");

  if (errRemitente || errDestinatario || errProducto || errProductoLetras || errRemitenteLetras || errDestinatarioLetras || errDireccionRemitente || errDireccionDestinatario || errContactoRemitente || errContactoDestinatario) {
    showAlert(
      "alert-crear",
      errRemitente || errDestinatario || errProducto || errProductoLetras || errRemitenteLetras || errDestinatarioLetras || errDireccionRemitente || errDireccionDestinatario || errContactoRemitente || errContactoDestinatario,
      "error",
    );
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetchAuth("/api/envios", {
      method: "POST",
      body: JSON.stringify({
        remitente,
        destinatario,
        producto,
        direccionRemitente,
        contactoRemitente,
        contactoDestinatario,
        direccionEntrega
      }),
    });
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (res.status === 403) {
      throw new Error("No tenés permisos para crear envíos.");
    }
    if (!res.ok) throw new Error(data.error);

    showAlert(
      "alert-crear",
      `✅ Envío creado. Tracking ID: ${data.trackingId}`,
      "success",
    );
    document.getElementById("form-crear").reset();
  } catch (err) {
    showAlert("alert-crear", `❌ ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

// ─── LISTAR ENVÍOS ────────────────────────────────────────────
async function cargarLista() {
  const tbody = document.getElementById("tbody-lista");
  tbody.innerHTML = `<tr><td colspan="5" style="color:var(--text-muted);text-align:center;padding:24px">Cargando...</td></tr>`;

  try {
    const params = new URLSearchParams({
      pagina: paginacion.pagina,
      porPagina: paginacion.porPagina,
    });

    const res = await fetchAuth(`/api/envios?${params}`);
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(data.error);

    const { envios, paginacion: info } = data;

    paginacion.total = info.total;
    paginacion.totalPaginas = info.totalPaginas;

    if (!envios.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty"><div class="empty-icon">📦</div><p>No hay envíos todavía.</p></div></td></tr>`;
      renderPaginacion();
      return;
    }

    tbody.innerHTML = envios
      .map(
        (e) => `
      <tr>
        <td class="tracking-cell">${e.trackingId}</td>
        <td>${e.remitente}</td>
        <td>${e.destinatario}</td>
        <td>${badgeEstado(e.estado)}</td>
        <td>
          <button class="btn btn-secondary btn-sm" onclick="verDetalle('${e.trackingId}')">Ver</button>
        </td>
      </tr>
    `,
      )
      .join("");

    renderPaginacion();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">❌ ${err.message}</td></tr>`;
  }
}

async function cargarUsuarios() {
  const tbody = document.getElementById("usuarios-tbody");
  if (!tbody) return;
  const usuarioActual = await obtenerUsuarioActual();
  const esSoloLectura = ["Cliente", "Operador"].includes(usuarioActual?.rol);
  const accionHeader = document.getElementById("usuarios-col-accion");
  if (accionHeader) accionHeader.style.display = esSoloLectura ? "none" : "";
  const columnasVisibles = esSoloLectura ? 7 : 8;

  tbody.innerHTML = `
    <tr>
      <td colspan="${columnasVisibles}" style="color:var(--text-muted);text-align:center;padding:24px">
        Cargando usuarios...
      </td>
    </tr>
  `;
  try {
    const res = await fetchAuth("/api/usuarios");
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (res.status === 403) {
      throw new Error("No tenés permisos para acceder a usuarios.");
    }
    if (!res.ok)
      throw new Error(data.error || "No se pudieron cargar los usuarios.");

    const { usuarios } = data;

    if (!usuarios.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="${columnasVisibles}">
            <div class="empty">
              <div class="empty-icon">👥</div>
              <p>No hay usuarios registrados.</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = usuarios
      .map(
        (u) => `
      <tr>
        <td>${u.id}</td>
        <td>${u.email}</td>
        <td>${u.telefono}</td>
        <td>${u.nombreUsuario}</td>
        <td>${u.nombre || ""}</td>
        <td>${u.direccion || ""}</td>
        ${
          esSoloLectura
            ? `
          <td>${u.rol}</td>
        `
            : `
          <td>
            <select data-user-id="${u.id}">
              <option value="Cliente" ${u.rol === "Cliente" ? "selected" : ""}>Cliente</option>
              <option value="Operador" ${u.rol === "Operador" ? "selected" : ""}>Operador</option>
              <option value="Supervisor" ${u.rol === "Supervisor" ? "selected" : ""}>Supervisor</option>
            </select>
          </td>
          <td>
            <button class="btn btn-secondary btn-sm" data-action="guardar-rol" data-user-id="${u.id}">
              Aceptar
            </button>
          </td>
        `
        }
      </tr>
    `,
      )
      .join("");
  } catch (err) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="color:var(--red)">❌ ${err.message}</td>
      </tr>
    `;
  }
}

// ─── PAGINACIÓN ───────────────────────────────────────────────
function renderPaginacion() {
  const container = document.getElementById("paginacion");
  if (!container) return;

  const { pagina, totalPaginas, total, porPagina } = paginacion;
  const desde = Math.min((pagina - 1) * porPagina + 1, total);
  const hasta = Math.min(pagina * porPagina, total);

  if (totalPaginas <= 1) {
    container.innerHTML =
      total > 0
        ? `<span class="pag-info">${total} envío${total !== 1 ? "s" : ""}</span>`
        : "";
    return;
  }

  container.innerHTML = `
    <span class="pag-info">${desde}–${hasta} de ${total}</span>
    <div class="pag-controls">
      <button class="btn btn-secondary btn-sm" onclick="irPagina(1)" ${pagina === 1 ? "disabled" : ""}>«</button>
      <button class="btn btn-secondary btn-sm" onclick="irPagina(${pagina - 1})" ${pagina === 1 ? "disabled" : ""}>‹</button>
      <span class="pag-current">${pagina} / ${totalPaginas}</span>
      <button class="btn btn-secondary btn-sm" onclick="irPagina(${pagina + 1})" ${pagina === totalPaginas ? "disabled" : ""}>›</button>
      <button class="btn btn-secondary btn-sm" onclick="irPagina(${totalPaginas})" ${pagina === totalPaginas ? "disabled" : ""}>»</button>
    </div>
  `;
}

function irPagina(n) {
  paginacion.pagina = n;
  cargarLista();
}

// ─── BUSCAR ENVÍO ─────────────────────────────────────────────
async function buscarEnvio() {
  const trackingId = document
    .getElementById("input-buscar")
    .value.trim()
    .toUpperCase();

  if (!trackingId) {
    document.getElementById("resultado-busqueda").innerHTML =
      `<div class="alert alert-error show">❌ Ingresá un Tracking ID para buscar.</div>`;
    return;
  }

  if (!REGEX_TRACKING_ID.test(trackingId)) {
    document.getElementById("resultado-busqueda").innerHTML =
      `<div class="alert alert-error show">❌ El Tracking ID no es válido. Debe tener el formato: XX-XXXXXX (ej: AB-123456).</div>`;
    return;
  }

  const resultDiv = document.getElementById("resultado-busqueda");
  resultDiv.innerHTML = '<p style="color:var(--text-muted)">Buscando...</p>';

  try {
    const res = await fetchAuth(`/api/envios/${trackingId}`);
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(data.error);

    const direccionEntrega = data.direccionEntrega?.trim()
      ? data.direccionEntrega
      : "Sin especificar";
    const direccionRemitente = data.direccionRemitente?.trim()
      ? data.direccionRemitente
      : "Sin especificar";
    const contactoRemitente = data.contactoRemitente?.trim()
      ? data.contactoRemitente
      : "Sin especificar";
    const contactoDestinatario = data.contactoDestinatario?.trim()
      ? data.contactoDestinatario
      : "Sin especificar";

    resultDiv.innerHTML = `
      <div class="card" style="margin-top:20px">
        <div class="detail-grid">
          <div class="detail-item">
            <label>Tracking ID</label>
            <div class="value mono">${data.trackingId}</div>
          </div>
          <div class="detail-item">
            <label>Estado</label>
            <div class="value">${badgeEstado(data.estado)}</div>
          </div>
          <div class="detail-item">
            <label>Remitente</label>
            <div class="value">${data.remitente}</div>
          </div>
          <div class="detail-item">
            <label>Dirección remitente</label>
            <div class="value">${direccionRemitente}</div>
          </div>
          <div class="detail-item">
            <label>Contacto remitente</label>
            <div class="value">${contactoRemitente}</div>
          </div>
          <div class="detail-item">
            <label>Destinatario</label>
            <div class="value">${data.destinatario}</div>
          </div>
          <div class="detail-item">
            <label>Contacto destinatario</label>
            <div class="value">${contactoDestinatario}</div>
          </div>
          <div class="detail-item">
            <label>Dirección entrega</label>
            <div class="value">${direccionEntrega}</div>
          </div>
          <div class="detail-item">
            <label>Producto</label>
            <div class="value">${data.producto}</div>
          </div>
          <div class="detail-item">
            <label>Última actualización</label>
            <div class="value">${formatFecha(data.fechaActualizacion)}</div>
          </div>
        </div>
        <div style="margin-top:16px">
          <button class="btn btn-secondary btn-sm" onclick="verDetalle('${data.trackingId}')">
            Ver detalle completo →
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<div class="alert alert-error show">❌ ${err.message}</div>`;
  }
}

// ─── BUSCAR POR DESTINATARIO ──────────────────────────────────
async function buscarPorDestinatario() {
  const nombre = document
    .getElementById("input-buscar-destinatario")
    .value.trim();
  const resultDiv = document.getElementById("resultado-busqueda-destinatario");

  if (!nombre) {
    resultDiv.innerHTML = `<div class="alert alert-error show">❌ Ingresá un nombre para buscar.</div>`;
    return;
  }

  if (!REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(nombre)) {
    resultDiv.innerHTML = `<div class="alert alert-error show">❌ La búsqueda debe incluir al menos un nombre de 5 letras.</div>`;
    return;
  }

  resultDiv.innerHTML = '<p style="color:var(--text-muted)">Buscando...</p>';

  try {
    const res = await fetchAuth(
      `/api/envios/buscar/destinatario?nombre=${encodeURIComponent(nombre)}`,
    );
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }

    if (!res.ok) {
      resultDiv.innerHTML = `<div class="alert alert-error show">❌ ${data.error}</div>`;
      return;
    }

    const { envios } = data;

    resultDiv.innerHTML = `
      <div style="margin-top:20px">
        <p style="color:var(--text-muted); margin-bottom:12px">${envios.length} resultado${envios.length !== 1 ? "s" : ""} para "<strong>${escapeHtml(nombre)}</strong>"</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tracking ID</th>
                <th>Destinatario</th>
                <th>Producto</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${envios
                .map(
                  (e) => `
                <tr>
                  <td class="tracking-cell">${e.trackingId}</td>
                  <td>${escapeHtml(e.destinatario)}</td>
                  <td>${escapeHtml(e.producto)}</td>
                  <td>${badgeEstado(e.estado)}</td>
                  <td>
                    <button class="btn btn-secondary btn-sm" onclick="verDetalle('${e.trackingId}')">Ver</button>
                  </td>
                </tr>
              `,
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<div class="alert alert-error show">❌ ${err.message}</div>`;
  }
}

// ─── VER DETALLE ──────────────────────────────────────────────
async function verDetalle(trackingId) {
  navigate("page-detalle");

  const container = document.getElementById("detalle-container");
  container.innerHTML = '<p style="color:var(--text-muted)">Cargando...</p>';

  try {
    const usuarioActual = await obtenerUsuarioActual();
    const res = await fetchAuth(`/api/envios/${trackingId}`);
    const e = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(e.error);

    detalleEnvioDraft = {
      trackingId: e.trackingId,
      usuarioActual,
      envioBase: e,
      destinatarioDraft: e.destinatario,
      direccionEntregaDraft: e.direccionEntrega || "",
      estadoActualDraft: e.estado,
      avancesPendientes: 0,
    };

    renderDetalleEnvio(detalleEnvioDraft);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error show">❌ ${err.message}</div>`;
  }
}

function sincronizarDetalleEnvioDraft() {
  if (!detalleEnvioDraft) return;

  const destinatarioInput = document.getElementById("editar-destinatario");
  const direccionInput = document.getElementById("editar-direccion");

  if (destinatarioInput) {
    detalleEnvioDraft.destinatarioDraft = destinatarioInput.value;
  }
  if (direccionInput) {
    detalleEnvioDraft.direccionEntregaDraft = direccionInput.value;
  }
}

function renderDetalleEnvio(draft) {
  const container = document.getElementById("detalle-container");
  if (!container || !draft) return;

  const { envioBase: e, usuarioActual } = draft;
  const idx = ESTADOS_ENVIO.indexOf(draft.estadoActualDraft);
  const puedeGestionarEnvio = ["Operador", "Supervisor"].includes(
    usuarioActual.rol,
  );
  const puedeConsultarHistorial = ["Operador", "Supervisor"].includes(
    usuarioActual.rol,
  );
  const puedeAvanzar = puedeGestionarEnvio && idx < ESTADOS_ENVIO.length - 1;
  const puedeEditar = puedeGestionarEnvio;
  const direccionEntrega = draft.direccionEntregaDraft?.trim()
    ? draft.direccionEntregaDraft
    : "Sin especificar";
  const direccionRemitente = e.direccionRemitente?.trim()
    ? e.direccionRemitente
    : "Sin especificar";
  const contactoRemitente = e.contactoRemitente?.trim()
    ? e.contactoRemitente
    : "Sin especificar";
  const contactoDestinatario = e.contactoDestinatario?.trim()
    ? e.contactoDestinatario
    : "Sin especificar";

  const stepsHtml = ESTADOS_ENVIO.map((s, i) => {
    const cls = i < idx ? "done" : i === idx ? "current" : "";
    return `<div class="step ${cls}">
      <div class="step-dot">${i <= idx ? ICONOS_ESTADO_ENVIO[i] : ""}</div>
      <span class="step-label">${s}</span>
    </div>`;
  }).join("");

  container.innerHTML = `
      <div class="card">
        <div class="detail-grid">
          <div class="detail-item" style="grid-column:1/-1">
            <label>Tracking ID</label>
            <div class="value mono">${e.trackingId}</div>
          </div>

          <!-- Primera fila: remitente y destinatario -->
          <div class="detail-item">
            <label>Remitente</label>
            <div class="value">${e.remitente}</div>
          </div>
          <div class="detail-item">
            <label>Destinatario</label>
            <div class="value">${escapeHtml(draft.destinatarioDraft)}</div>
          </div>

          <!-- Segunda fila: contactos -->
          <div class="detail-item">
            <label>Contacto remitente</label>
            <div class="value">${contactoRemitente}</div>
          </div>
          <div class="detail-item">
            <label>Contacto destinatario</label>
            <div class="value">${contactoDestinatario}</div>
          </div>

          <!-- Tercera fila: direcciones -->
          <div class="detail-item">
            <label>Dirección de remitente</label>
            <div class="value">${direccionRemitente}</div>
          </div>
          <div class="detail-item">
            <label>Dirección de entrega</label>
            <div class="value">${direccionEntrega}</div>
          </div>

          <!-- Información adicional -->
          <div class="detail-item" style="grid-column:1/-1">
            <label>Producto</label>
            <div class="value">${e.producto}</div>
          </div>
          <div class="detail-item">
            <label>Estado actual</label>
            <div class="value">${badgeEstado(draft.estadoActualDraft)}</div>
            ${
              draft.avancesPendientes > 0
                ? `<div class="detail-draft-note">Hay ${draft.avancesPendientes} cambio${draft.avancesPendientes !== 1 ? "s" : ""} de estado pendiente${draft.avancesPendientes !== 1 ? "s" : ""} de guardar.</div>`
                : ""
            }
          </div>
          <div class="detail-item">
            <label>Fecha de creación</label>
            <div class="value">${formatFecha(e.fechaCreacion)}</div>
          </div>
          <div class="detail-item">
            <label>Última actualización</label>
            <div class="value">${formatFecha(e.fechaActualizacion)}</div>
          </div>
        </div>

        ${
          puedeEditar
            ? `
          <div class="timeline">
            <h3>Editar datos del envío</h3>
            <div class="form-row">
              <div class="form-group">
                <label for="editar-destinatario">Destinatario</label>
                <input id="editar-destinatario" type="text" value="${escapeHtml(draft.destinatarioDraft)}" />
              </div>
              <div class="form-group">
                <label for="editar-direccion">Dirección de entrega</label>
                <input id="editar-direccion" type="text" value="${escapeHtml(draft.direccionEntregaDraft || "")}" placeholder="Ingresá la dirección de entrega" />
              </div>
            </div>
            <button id="btn-guardar-detalle" class="btn btn-primary" onclick="guardarCambiosEnvio('${e.trackingId}')">💾 Guardar cambios</button>
          </div>
        `
            : ""
        }

        <div class="timeline">
          <h3>Progreso del envío</h3>
          <div class="timeline-steps">${stepsHtml}</div>
          ${
            puedeGestionarEnvio
              ? `
            <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap">
              <button
                id="btn-guardar-estado"
                class="btn btn-primary"
                onclick="guardarCambiosEstado('${e.trackingId}')"
                ${draft.avancesPendientes === 0 ? "disabled" : ""}
              >
                💾 Guardar cambios de estado
              </button>
            </div>
          `
              : ""
          }
        </div>

        <div style="margin-top:24px; display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          ${
            puedeConsultarHistorial
              ? `
            <button class="btn btn-secondary" onclick="toggleHistorialEnvio('${e.trackingId}')">
              🕘 Historial
            </button>
          `
              : ""
          }
          ${
            puedeAvanzar
              ? `
            <button class="btn btn-primary" onclick="avanzarEstado('${e.trackingId}')">
              ⚡ Avanzar estado
            </button>
          `
              : idx === ESTADOS_ENVIO.length - 1
                ? `
            <span style="color:var(--green);font-size:13px">✅ Entrega completada</span>
          `
                : ""
          }
          <button class="btn btn-secondary" onclick="navigate('page-lista')">← Volver a lista</button>
        </div>

        <div id="alert-detalle" class="alert" style="margin-top:12px"></div>

        ${
          puedeConsultarHistorial
            ? `
          <div id="historial-detalle" class="timeline historial-panel" style="display:none"></div>
        `
            : ""
        }
      </div>
    `;
}

async function toggleHistorialEnvio(trackingId) {
  const panel = document.getElementById("historial-detalle");
  if (!panel) return;

  if (panel.dataset.loaded === "true") {
    panel.style.display = panel.style.display === "none" ? "block" : "none";
    return;
  }

  panel.style.display = "block";
  panel.innerHTML = `
    <h3>Historial del envío</h3>
    <p style="color:var(--text-muted)">Cargando historial...</p>
  `;

  try {
    const res = await fetchAuth(`/api/envios/${trackingId}/historial`);
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(data.error);

    const historial = Array.isArray(data) ? data : data.historial || [];
    panel.dataset.loaded = "true";

    if (!historial.length) {
      panel.innerHTML = `
        <h3>Historial del envío</h3>
        <div class="history-empty">
          Todavía no hay cambios de estado registrados para este envío.
        </div>
      `;
      return;
    }

    panel.innerHTML = `
      <h3>Historial del envío</h3>
      <div class="history-list">
        ${historial
          .map(
            (item) => `
          <div class="history-item">
            <div class="history-state">${escapeHtml(item.estado)}</div>
            <div class="history-date">${formatFecha(item.fechaCambio)}</div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;
  } catch (err) {
    panel.innerHTML = `
      <h3>Historial del envío</h3>
      <div class="history-empty" style="color:var(--red)">❌ ${err.message}</div>
    `;
  }
}

async function guardarCambiosEnvio(trackingId) {
  sincronizarDetalleEnvioDraft();

  const destinatario = detalleEnvioDraft?.destinatarioDraft?.trim() || "";
  const direccionEntrega = detalleEnvioDraft?.direccionEntregaDraft?.trim() || "";
  const btn = document.getElementById("btn-guardar-detalle");

  if (!detalleEnvioDraft || detalleEnvioDraft.trackingId !== trackingId) {
    showAlert("alert-detalle", "❌ No se pudo recuperar el borrador del envío.", "error");
    return;
  }

  const errDestinatario = validarCampo(destinatario, "destinatario");
  const errDireccion = validarCampo(direccionEntrega, "dirección de entrega");

  if (errDestinatario || errDireccion) {
    showAlert(
      "alert-detalle",
      `❌ ${errDestinatario || errDireccion}`,
      "error",
    );
    return;
  }

  const huboCambiosDatos =
    destinatario !== detalleEnvioDraft.envioBase.destinatario ||
    direccionEntrega !== (detalleEnvioDraft.envioBase.direccionEntrega || "");

  if (!huboCambiosDatos) {
    showAlert("alert-detalle", "ℹ️ No hay cambios de datos para guardar.", "info");
    return;
  }

  try {
    if (btn) btn.disabled = true;

    if (huboCambiosDatos) {
      const res = await fetchAuth(`/api/envios/${trackingId}`, {
        method: "PATCH",
        body: JSON.stringify({ destinatario, direccionEntrega }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) throw new Error(data.error);
    }

    await verDetalle(trackingId);
    showAlert("alert-detalle", "✅ Datos del envío actualizados correctamente.", "success");
  } catch (err) {
    showAlert("alert-detalle", `❌ ${err.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function guardarCambiosEstado(trackingId) {
  if (!detalleEnvioDraft || detalleEnvioDraft.trackingId !== trackingId) {
    showAlert("alert-detalle", "❌ No se pudo recuperar el borrador del envío.", "error");
    return;
  }

  const avancesPendientes = detalleEnvioDraft.avancesPendientes;
  const btn = document.getElementById("btn-guardar-estado");

  if (avancesPendientes === 0) {
    showAlert("alert-detalle", "ℹ️ No hay cambios de estado para guardar.", "info");
    return;
  }

  try {
    if (btn) btn.disabled = true;

    for (let i = 0; i < avancesPendientes; i += 1) {
      const resEstado = await fetchAuth(`/api/envios/${trackingId}/estado`, {
        method: "PATCH",
      });
      const dataEstado = await resEstado.json();

      if (resEstado.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!resEstado.ok) throw new Error(dataEstado.error);
    }

    await verDetalle(trackingId);
    showAlert(
      "alert-detalle",
      `✅ ${avancesPendientes} avance${avancesPendientes !== 1 ? "s" : ""} de estado guardado${avancesPendientes !== 1 ? "s" : ""} correctamente.`,
      "success",
    );
  } catch (err) {
    showAlert("alert-detalle", `❌ ${err.message}`, "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

// ─── AVANZAR ESTADO ───────────────────────────────────────────
async function avanzarEstado(trackingId) {
  if (!detalleEnvioDraft || detalleEnvioDraft.trackingId !== trackingId) {
    showAlert("alert-detalle", "❌ No se pudo preparar el avance de estado.", "error");
    return;
  }

  sincronizarDetalleEnvioDraft();

  const idxActual = ESTADOS_ENVIO.indexOf(detalleEnvioDraft.estadoActualDraft);
  if (idxActual === ESTADOS_ENVIO.length - 1) {
    showAlert("alert-detalle", "❌ El envío ya fue entregado, no puede avanzar más.", "error");
    return;
  }

  detalleEnvioDraft.estadoActualDraft = ESTADOS_ENVIO[idxActual + 1];
  detalleEnvioDraft.avancesPendientes += 1;

  renderDetalleEnvio(detalleEnvioDraft);
  showAlert(
    "alert-detalle",
    `ℹ️ Cambio de estado preparado. Guardalo con "Guardar cambios de estado".`,
    "info",
  );
}

// ─── SETUP DE CLIENTE ─────────────────────────────────────────
async function cargarSetup() {
  const select = document.getElementById("setup-tracking");
  const btnGuardar = document.getElementById("btn-setup-guardar");
  select.innerHTML = '<option value="">Cargando usuarios...</option>';

  try {
    const res = await fetchAuth("/api/clientes/setup");
    const data = await res.json();
    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (res.status === 403) {
      throw new Error("No tenés permisos para acceder al setup de cliente.");
    }
    if (!res.ok) throw new Error(data.error);

    const { clientes } = data;
    select.innerHTML = '<option value="">-- Seleccioná un cliente --</option>';

    clientes.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = u.nombreUsuario;
      opt.dataset.nombre = u.nombre || "";
      opt.dataset.direccion = u.direccion || "";
      select.appendChild(opt);
    });

    select.addEventListener("change", () => {
      const opt = select.options[select.selectedIndex];
      const infoDiv = document.getElementById("setup-destinatario-info");
      const nombreInput = document.getElementById("setup-nombre");
      const direccionInput = document.getElementById("setup-direccion");

      if (opt.value) {
        infoDiv.style.display = "block";
        document.getElementById("setup-destinatario-actual").textContent = opt.textContent;
        nombreInput.value = opt.dataset.nombre;
        direccionInput.value = opt.dataset.direccion;
        btnGuardar.disabled = false;
      } else {
        infoDiv.style.display = "none";
        nombreInput.value = "";
        direccionInput.value = "";
        btnGuardar.disabled = true;
      }
    });
  } catch (err) {
    select.innerHTML = '<option value="">Error al cargar usuarios</option>';
    showAlert("alert-setup", `❌ ${err.message}`, "error");
  }
}

async function guardarSetupCliente() {
  const userId = document.getElementById("setup-tracking").value;
  const nombre = document.getElementById("setup-nombre").value.trim();
  const direccion = document.getElementById("setup-direccion").value.trim();

  if (!userId) {
    showAlert("alert-setup", "❌ Seleccioná un cliente.", "error");
    return;
  }

  const errNombre = validarCampo(nombre, "nombre/negocio");
  const errDireccion = validarCampo(direccion, "dirección");
  const errNombreLetras = !REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(nombre)
    ? "El nombre/negocio debe tener al menos 5 letras."
    : null;
  const errDireccionLetras = !REGEX_BUSQUEDA_DESTINATARIO_MIN_5_LETRAS.test(direccion)
    ? "La dirección debe tener al menos 5 letras."
    : null;

  if (errNombre || errDireccion || errNombreLetras || errDireccionLetras) {
    showAlert(
      "alert-setup",
      `❌ ${errNombre || errDireccion || errNombreLetras || errDireccionLetras}`,
      "error",
    );
    return;
  }

  const btn = document.getElementById("btn-setup-guardar");
  btn.disabled = true;

  try {
    const res = await fetchAuth(`/api/usuarios/${userId}/perfil`, {
      method: "PATCH",
      body: JSON.stringify({
        nombre: nombre,
        direccion: direccion,
      }),
    });
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (res.status === 403) {
      throw new Error("No tenés permisos para actualizar perfiles de cliente.");
    }
    if (!res.ok) throw new Error(data.error);

    showAlert(
      "alert-setup",
      `✅ Perfil del cliente actualizado correctamente.`,
      "success",
    );

    // Refrescar el select para mostrar datos actualizados
    await cargarSetup();
    document.getElementById("setup-tracking").value = "";
    document.getElementById("setup-nombre").value = "";
    document.getElementById("setup-direccion").value = "";
    document.getElementById("setup-destinatario-info").style.display = "none";
  } catch (err) {
    showAlert("alert-setup", `❌ ${err.message}`, "error");
  } finally {
    btn.disabled = false;
  }
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  actualizarTextosSeccionUsuarios();

  document.querySelectorAll(".nav a").forEach((a) => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      navigate(a.dataset.page);
    });
  });

  document.getElementById("form-crear").addEventListener("submit", crearEnvio);

  document.getElementById("input-buscar").addEventListener("keydown", (e) => {
    if (e.key === "Enter") buscarEnvio();
  });

  document
    .getElementById("input-buscar-destinatario")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") buscarPorDestinatario();
    });

  navigate("page-buscar");
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest('[data-action="guardar-rol"]');
  if (!btn) return;

  const id = btn.getAttribute("data-user-id");
  const select = document.querySelector(`select[data-user-id="${id}"]`);
  if (!select) return;

  const rol = select.value;

  try {
    const res = await fetchAuth(`/api/usuarios/${id}/rol`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rol }),
    });

    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(data.error || "No se pudo actualizar el rol.");

    showAlert(
      "alert-usuarios",
      data.mensaje || "Rol actualizado correctamente.",
      "success",
    );
  } catch (err) {
    showAlert("alert-usuarios", `❌ ${err.message}`, "error");
  }
});

// ─────────────────────────────────────────
//  PANEL IA
// ─────────────────────────────────────────

async function estructurarDataset() {
  const btn = document.getElementById("btn-estructurar");
  const btnText = document.getElementById("btn-estructurar-text");
  const statusBox = document.getElementById("dataset-status");
  const badge = document.getElementById("dataset-result-badge");

  btn.disabled = true;
  btnText.textContent = "⏳ Procesando...";
  badge.style.display = "none";
  statusBox.style.display = "block";
  statusBox.className = "ia-status-box loading";
  statusBox.textContent = "Leyendo historial de envíos entregados...";

  try {
    const res = await fetchAuth("/api/dataset/estructurar", { method: "POST" });
    const data = await res.json();

    if (res.status === 401) { window.location.href = "/login.html"; return; }

    if (!res.ok) {
      statusBox.className = "ia-status-box error";
      statusBox.textContent = `✗ ${data.error}`;
      badge.textContent = "Error";
      badge.className = "ia-result-badge error";
      badge.style.display = "inline-flex";
    } else {
      statusBox.className = "ia-status-box ok";
      statusBox.textContent = `✓ ${data.mensaje} — ${data.registrosProcessados} registros procesados.`;
      badge.textContent = "✓ Listo";
      badge.className = "ia-result-badge ok";
      badge.style.display = "inline-flex";
    }
  } catch (err) {
    statusBox.className = "ia-status-box error";
    statusBox.textContent = `✗ Error de conexión: ${err.message}`;
    badge.textContent = "Error";
    badge.className = "ia-result-badge error";
    badge.style.display = "inline-flex";
  } finally {
    btn.disabled = false;
    btnText.textContent = "⚙️ Estructurar dataset";
  }
}

async function entrenarModelo() {
  const btn = document.getElementById("btn-entrenar");
  const btnText = document.getElementById("btn-entrenar-text");
  const statusBox = document.getElementById("modelo-status");
  const badge = document.getElementById("modelo-result-badge");
  const metricas = document.getElementById("metricas-container");

  btn.disabled = true;
  btnText.textContent = "⏳ Entrenando...";
  badge.style.display = "none";
  metricas.style.display = "none";
  statusBox.style.display = "block";
  statusBox.className = "ia-status-box loading";
  statusBox.textContent = "Ejecutando RandomForestRegressor...";

  try {
    const res = await fetchAuth("/api/modelo/entrenar", { method: "POST" });
    const data = await res.json();

    if (res.status === 401) { window.location.href = "/login.html"; return; }

    if (!res.ok) {
      statusBox.className = "ia-status-box error";
      statusBox.textContent = `✗ ${data.error}`;
      badge.textContent = "Error";
      badge.className = "ia-result-badge error";
      badge.style.display = "inline-flex";
    } else {
      statusBox.className = "ia-status-box ok";
      statusBox.textContent = `✓ ${data.mensaje}`;
      badge.textContent = "✓ Modelo entrenado";
      badge.className = "ia-result-badge ok";
      badge.style.display = "inline-flex";

      document.getElementById("metric-r2").textContent = data.r2Score?.toFixed(4) ?? "—";
      document.getElementById("metric-mae").textContent = data.mae?.toFixed(4) ?? "—";
      document.getElementById("metric-rmse").textContent = data.rmse?.toFixed(4) ?? "—";
      document.getElementById("metric-cv").textContent = data.cvScore ?? "—";
      document.getElementById("metric-registros").textContent = data.registrosUsados ?? "—";
      document.getElementById("metric-modelo").textContent = data.modelo ?? "—";
      metricas.style.display = "block";
    }
  } catch (err) {
    statusBox.className = "ia-status-box error";
    statusBox.textContent = `✗ Error de conexión: ${err.message}`;
    badge.textContent = "Error";
    badge.className = "ia-result-badge error";
    badge.style.display = "inline-flex";
  } finally {
    btn.disabled = false;
    btnText.textContent = "🧠 Entrenar modelo";
  }
}

async function predecirEnvio() {
  const input = document.getElementById("input-predecir");
  const btn = document.querySelector("#page-ia .ia-card:nth-child(3) .btn-primary");
  const btnText = document.getElementById("btn-predecir-text");
  const statusBox = document.getElementById("predecir-status");
  const resultado = document.getElementById("prediccion-resultado");

  const trackingId = input.value.trim().toUpperCase();

  // Limpiar estado anterior antes de cada predicción
  resultado.style.display = "none";
  statusBox.style.display = "none";
  statusBox.className = "ia-status-box";

  if (!trackingId) {
    statusBox.style.display = "block";
    statusBox.className = "ia-status-box error";
    statusBox.textContent = "✗ Ingresá un Tracking ID.";
    return;
  }

  if (!REGEX_TRACKING_ID.test(trackingId)) {
    statusBox.style.display = "block";
    statusBox.className = "ia-status-box error";
    statusBox.textContent = "✗ El Tracking ID no es válido. Debe tener el formato: XX-XXXXXX (ej: AB-123456).";
    return;
  }

  if (btn) btn.disabled = true;
  btnText.textContent = "⏳ Calculando...";
  statusBox.style.display = "block";
  statusBox.className = "ia-status-box loading";
  statusBox.textContent = "Consultando modelo...";

  try {
    const res = await fetchAuth("/api/modelo/predecir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackingId })
    });

    const data = await res.json();

    if (res.status === 401) { window.location.href = "/login.html"; return; }

    if (!res.ok) {
      statusBox.className = "ia-status-box error";
      statusBox.textContent = `✗ ${data.error}`;
    } else {
      statusBox.style.display = "none";
      document.getElementById("pred-dias").textContent = data.diasEstimados;
      document.getElementById("pred-tracking").textContent = data.trackingId;
      document.getElementById("pred-producto").textContent = data.producto;
      document.getElementById("pred-destinatario").textContent = data.destinatario;
      document.getElementById("pred-estado").textContent = data.estado;
      resultado.style.display = "block";
    }
  } catch (err) {
    statusBox.className = "ia-status-box error";
    statusBox.textContent = `✗ Error de conexión: ${err.message}`;
  } finally {
    if (btn) btn.disabled = false;
    btnText.textContent = "🔮 Predecir";
  }
}