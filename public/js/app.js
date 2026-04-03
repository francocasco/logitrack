// ─── ESTADO DE PAGINACIÓN ─────────────────────────────────────
const paginacion = {
  pagina: 1,
  porPagina: 10,
  total: 0,
  totalPaginas: 0,
};

// ─── NAVEGACIÓN ───────────────────────────────────────────────
function navigate(pageId) {
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

// ─── VALIDACIONES FRONTEND ────────────────────────────────────
const REGEX_SOLO_LETRAS = /^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/;

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

// ─── CREAR ENVÍO ──────────────────────────────────────────────
async function crearEnvio(e) {
  e.preventDefault();
  const btn = document.getElementById("btn-crear");

  const remitente = document.getElementById("remitente").value.trim();
  const destinatario = document.getElementById("destinatario").value.trim();
  const producto = document.getElementById("producto").value.trim();

  const errRemitente = validarCampo(remitente, "remitente");
  const errDestinatario = validarCampo(destinatario, "destinatario");
  const errProducto = validarCampo(producto, "producto", 2, 200);
  const errRemitenteLetras = validarSoloLetras(remitente, "remitente");
  const errDestinatarioLetras = validarSoloLetras(destinatario, "destinatario");

  if (errRemitente || errDestinatario || errProducto || errRemitenteLetras || errDestinatarioLetras) {
    showAlert(
      "alert-crear",
      errRemitente || errDestinatario || errProducto || errRemitenteLetras || errDestinatarioLetras,
      "error",
    );
    return;
  }

  btn.disabled = true;

  try {
    const res = await fetchAuth("/api/envios", {
      method: "POST",
      body: JSON.stringify({ remitente, destinatario, producto }),
    });
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
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

  tbody.innerHTML = `
    <tr>
      <td colspan="6" style="color:var(--text-muted);text-align:center;padding:24px">
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
    if (!res.ok)
      throw new Error(data.error || "No se pudieron cargar los usuarios.");

    const { usuarios } = data;

    if (!usuarios.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6">
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

  if (!/^[A-Z]{2}-\d{6}$/.test(trackingId)) {
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
            <label>Destinatario</label>
            <div class="value">${data.destinatario}</div>
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

  if (!REGEX_SOLO_LETRAS.test(nombre)) {
    resultDiv.innerHTML = `<div class="alert alert-error show">❌ El nombre no es válido. Solo puede contener letras y espacios.</div>`;
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

    const ESTADOS = ["creado", "en tránsito", "en sucursal", "entregado"];
    const ICONOS = ["📋", "🚚", "🏢", "✅"];
    const idx = ESTADOS.indexOf(e.estado);
    const puedeAvanzar = idx < ESTADOS.length - 1;
    const puedeEditar = ["Operador", "Supervisor"].includes(usuarioActual.rol);
    const direccionEntrega = e.direccionEntrega?.trim()
      ? e.direccionEntrega
      : "Sin especificar";

    const stepsHtml = ESTADOS.map((s, i) => {
      const cls = i < idx ? "done" : i === idx ? "current" : "";
      return `<div class="step ${cls}">
        <div class="step-dot">${i <= idx ? ICONOS[i] : ""}</div>
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
          <div class="detail-item">
            <label>Remitente</label>
            <div class="value">${e.remitente}</div>
          </div>
          <div class="detail-item">
            <label>Destinatario</label>
            <div class="value">${e.destinatario}</div>
          </div>
          <div class="detail-item" style="grid-column:1/-1">
            <label>Dirección de entrega</label>
            <div class="value">${direccionEntrega}</div>
          </div>
          <div class="detail-item">
            <label>Producto</label>
            <div class="value">${e.producto}</div>
          </div>
          <div class="detail-item">
            <label>Estado actual</label>
            <div class="value">${badgeEstado(e.estado)}</div>
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
                <input id="editar-destinatario" type="text" value="${escapeHtml(e.destinatario)}" />
              </div>
              <div class="form-group">
                <label for="editar-direccion">Dirección de entrega</label>
                <input id="editar-direccion" type="text" value="${escapeHtml(e.direccionEntrega || "")}" placeholder="Ingresá la dirección de entrega" />
              </div>
            </div>
            <button class="btn btn-primary" onclick="guardarCambiosEnvio('${e.trackingId}')">💾 Guardar cambios</button>
          </div>
        `
            : ""
        }

        <div class="timeline">
          <h3>Progreso del envío</h3>
          <div class="timeline-steps">${stepsHtml}</div>
        </div>

        <div style="margin-top:24px; display:flex; gap:10px; align-items:center; flex-wrap:wrap">
          <div id="alert-detalle" class="alert"></div>
          ${
            puedeAvanzar
              ? `
            <button class="btn btn-primary" onclick="avanzarEstado('${e.trackingId}')">
              ⚡ Avanzar estado
            </button>
          `
              : `
            <span style="color:var(--green);font-size:13px">✅ Entrega completada</span>
          `
          }
          <button class="btn btn-secondary" onclick="navigate('page-lista')">← Volver a lista</button>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error show">❌ ${err.message}</div>`;
  }
}

async function guardarCambiosEnvio(trackingId) {
  const destinatario =
    document.getElementById("editar-destinatario")?.value.trim() || "";
  const direccionEntrega =
    document.getElementById("editar-direccion")?.value.trim() || "";

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

  try {
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

    await verDetalle(trackingId);
    showAlert("alert-detalle", `✅ ${data.mensaje}`, "success");
  } catch (err) {
    showAlert("alert-detalle", `❌ ${err.message}`, "error");
  }
}

// ─── AVANZAR ESTADO ───────────────────────────────────────────
async function avanzarEstado(trackingId) {
  try {
    const res = await fetchAuth(`/api/envios/${trackingId}/estado`, {
      method: "PATCH",
    });
    const data = await res.json();

    if (res.status === 401) {
      window.location.href = "/login.html";
      return;
    }
    if (!res.ok) throw new Error(data.error);

    await verDetalle(trackingId);
  } catch (err) {
    showAlert("alert-detalle", `❌ ${err.message}`, "error");
  }
}

// ─── INIT ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
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

  navigate("page-crear");
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
  // ─── SETUP DE CLIENTE ─────────────────────────────────────────
  async function cargarSetup() {
    const select = document.getElementById("setup-tracking");
    const btnGuardar = document.getElementById("btn-setup-guardar");
    select.innerHTML = '<option value="">Cargando envíos...</option>';

    try {
      const res = await fetchAuth("/api/envios?porPagina=50");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const { envios } = data;
      select.innerHTML = '<option value="">-- Seleccioná un envío --</option>';

      envios
        .filter((e) => e.estado !== "entregado")
        .forEach((e) => {
          const opt = document.createElement("option");
          opt.value = e.trackingId;
          opt.textContent = `${e.trackingId} — ${e.destinatario}`;
          opt.dataset.destinatario = e.destinatario;
          opt.dataset.direccion = e.direccionEntrega || "";
          select.appendChild(opt);
        });

      select.addEventListener("change", () => {
        const opt = select.options[select.selectedIndex];
        const infoDiv = document.getElementById("setup-destinatario-info");
        const nombreInput = document.getElementById("setup-nombre");
        const direccionInput = document.getElementById("setup-direccion");

        if (opt.value) {
          infoDiv.style.display = "block";
          document.getElementById("setup-destinatario-actual").textContent =
            opt.dataset.destinatario;
          nombreInput.value = opt.dataset.destinatario;
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
      select.innerHTML = '<option value="">Error al cargar envíos</option>';
      showAlert("alert-setup", `❌ ${err.message}`, "error");
    }
  }

  async function guardarSetupCliente() {
    const trackingId = document.getElementById("setup-tracking").value;
    const nombre = document.getElementById("setup-nombre").value.trim();
    const direccion = document.getElementById("setup-direccion").value.trim();

    if (!trackingId) {
      showAlert("alert-setup", "❌ Seleccioná un envío.", "error");
      return;
    }

    const errNombre = validarCampo(nombre, "nombre del destinatario");
    const errDireccion = validarCampo(
      direccion,
      "ubicación de entrega/despacho",
    );

    if (errNombre || errDireccion) {
      showAlert("alert-setup", `❌ ${errNombre || errDireccion}`, "error");
      return;
    }

    const btn = document.getElementById("btn-setup-guardar");
    btn.disabled = true;

    try {
      const res = await fetchAuth(`/api/envios/${trackingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          destinatario: nombre,
          direccionEntrega: direccion,
        }),
      });
      const data = await res.json();

      if (res.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      if (!res.ok) throw new Error(data.error);

      showAlert(
        "alert-setup",
        `✅ Datos registrados correctamente para el envío ${trackingId}.`,
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
});
