require('dotenv').config();
const { createClient } = require('@libsql/client');
const { inicializar } = require('./database');

const client = createClient({
  url: process.env.TURSO_URL || 'file:./db/database.db',
  authToken: process.env.TURSO_TOKEN || undefined
});

const estadosDisponibles = ['creado', 'en tránsito', 'en sucursal', 'entregado'];

const enviosBase = [
  {
    trackingId: 'LT-100001',
    remitente: 'Juan Pérez',
    destinatario: 'María López',
    producto: 'Notebook Lenovo',
    estado: 'creado'
  },
  {
    trackingId: 'LT-100002',
    remitente: 'Ana Gómez',
    destinatario: 'Carlos Ruiz',
    producto: 'Auriculares Bluetooth',
    estado: 'en tránsito'
  },
  {
    trackingId: 'LT-100003',
    remitente: 'Sofía Martínez',
    destinatario: 'Luciano Díaz',
    producto: 'Teclado mecánico',
    estado: 'en sucursal'
  },
  {
    trackingId: 'LT-100004',
    remitente: 'Pedro Fernández',
    destinatario: 'Valentina Castro',
    producto: 'Smartphone Samsung',
    estado: 'entregado'
  },
  {
    trackingId: 'LT-100005',
    remitente: 'Micaela Torres',
    destinatario: 'Tomás Herrera',
    producto: 'Libro de algoritmos',
    estado: 'creado'
  }
];

const remitentesExtra = [
  'Laura Méndez', 'Diego Suárez', 'Camila Navarro', 'Martín Silva', 'Paula Rojas',
  'Nicolás Vega', 'Florencia Acosta', 'Gabriel Medina', 'Julieta Romero', 'Franco Sosa'
];

const destinatariosExtra = [
  'Agustina Paz', 'Emiliano Benítez', 'Milagros Ibarra', 'Ramiro Luna', 'Brenda Molina',
  'Federico Cabrera', 'Rocío Paredes', 'Iván Quiroga', 'Daniela Peralta', 'Nahuel Campos'
];

const productosExtra = [
  'Mouse inalámbrico', 'Monitor 24 pulgadas', 'Impresora multifunción', 'Mochila ejecutiva',
  'Tablet Samsung', 'Cámara web HD', 'Disco SSD 1TB', 'Parlante portátil',
  'Silla ergonómica', 'Router Wi-Fi'
];

const enviosGenerados = Array.from({ length: 45 }, (_, index) => ({
  trackingId: `LT-${String(100006 + index).padStart(6, '0')}`,
  remitente: remitentesExtra[index % remitentesExtra.length],
  destinatario: destinatariosExtra[(index * 2) % destinatariosExtra.length],
  producto: productosExtra[index % productosExtra.length],
  estado: estadosDisponibles[index % estadosDisponibles.length]
}));

const enviosSemilla = [...enviosBase, ...enviosGenerados];

function fechaHaceDias(dias) {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

async function sembrarEnvios() {
  await inicializar();

  let insertados = 0;

  for (const [index, envio] of enviosSemilla.entries()) {
    const fechaCreacion = fechaHaceDias(enviosSemilla.length - index + 1);
    const fechaActualizacion = fechaHaceDias(Math.max(enviosSemilla.length - index - 1, 0));

    const resultado = await client.execute({
      sql: `INSERT OR IGNORE INTO envios (
        trackingId,
        remitente,
        destinatario,
        producto,
        estado,
        fechaCreacion,
        fechaActualizacion
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        envio.trackingId,
        envio.remitente,
        envio.destinatario,
        envio.producto,
        envio.estado,
        fechaCreacion,
        fechaActualizacion
      ]
    });

    insertados += Number(resultado.rowsAffected || 0);
  }

  const total = await client.execute('SELECT COUNT(*) AS total FROM envios');

  console.log(`🌱 Seed ejecutado. Insertados: ${insertados}. Total actual en envios: ${total.rows[0].total}`);
  console.log(`📦 Registros contemplados por el seed: ${enviosSemilla.length}`);
  console.table(enviosSemilla.slice(0, 10).map(({ trackingId, remitente, destinatario, estado }) => ({
    trackingId,
    remitente,
    destinatario,
    estado
  })));
}

sembrarEnvios()
  .catch((error) => {
    console.error('❌ Error al ejecutar el seed de envíos:', error);
    process.exit(1);
  });
