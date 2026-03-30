// ─── GESTIÓN DE SESIÓN ────────────────────────────────────────
// Este archivo se carga en index.html y protege todas las páginas del sistema.

const TOKEN_KEY = 'logitrack_token';

// Obtener el token guardado
function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Agregar el token de autorización a todas las llamadas fetch
const fetchAuth = (url, options = {}) => {
  const token = getToken();
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
      'Authorization': `Bearer ${token}`
    }
  });
};

// Cerrar sesión
async function cerrarSesion() {
  try {
    await fetchAuth('/api/auth/logout', { method: 'POST' });
  } catch {
    // Si falla el servidor igual limpiamos el token local
  } finally {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login.html';
  }
}

// Verificar sesión al cargar la página
(async function verificarSesion() {
  const token = getToken();

  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  try {
    const res = await fetch('/api/auth/verificar', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = '/login.html';
      return;
    }

    const data = await res.json();
    window.usuarioActual = data;

    // Mostrar email del usuario en el sidebar
    const userEl = document.getElementById('usuario-email');
    if (userEl) userEl.textContent = data.email;

  } catch {
    window.location.href = '/login.html';
  }
})();
