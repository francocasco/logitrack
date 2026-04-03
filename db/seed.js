require('dotenv').config();
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { inicializar } = require('./database');

const client = createClient({
  url: process.env.TURSO_URL || 'file:./db/database.db',
  authToken: process.env.TURSO_TOKEN || undefined
});

const PASSWORD_SEMILLA = 'SeedPass123';
const HASH_ROUNDS = 10;

function telefonoUnico(index) {
  return `+54 11 ${String(70000000 + index).padStart(8, '0')}`;
}

function construirUsuarios(cantidad, rol, prefijo) {
  return Array.from({ length: cantidad }, (_, i) => {
    const numero = i + 1;
    const sufijo = String(numero).padStart(2, '0');
    const base = `${prefijo}${sufijo}`;

    return {
      email: `${base}@logitrack.seed`,
      telefono: telefonoUnico(i + (rol === 'Supervisor' ? 1 : rol === 'Operador' ? 100 : 1000)),
      nombreUsuario: base,
      rol
    };
  });
}

const CLIENTES_PERFILES = [
  { nombre: 'Farmacia San Martin', direccion: 'Av. San Martin 2450, CABA' },
  { nombre: 'Libreria El Atril', direccion: 'Av. Rivadavia 11876, CABA' },
  { nombre: 'Carlos Benitez', direccion: 'Jeronimo Salguero 1432, CABA' },
  { nombre: 'Pastas La Nonna', direccion: 'Av. Cabildo 2190, CABA' },
  { nombre: 'Lucia Fernandez', direccion: 'Lavalleja 991, CABA' },
  { nombre: 'Ferreteria El Tornillo', direccion: 'Nazca 1520, CABA' },
  { nombre: 'Distribuidora Los Andes', direccion: 'Av. Directorio 3210, CABA' },
  { nombre: 'Mariana Quiroga', direccion: 'Paraguay 3950, CABA' },
  { nombre: 'Optica Vision Norte', direccion: 'Av. Triunvirato 4375, CABA' },
  { nombre: 'Diego Alvarez', direccion: 'Terrada 1684, CABA' },
  { nombre: 'Pet Shop Huellitas', direccion: 'Av. Segurola 980, CABA' },
  { nombre: 'Panaderia Del Parque', direccion: 'Cuenca 2780, CABA' },
  { nombre: 'Rocio Acosta', direccion: 'Bonorino 2240, CABA' },
  { nombre: 'Heladeria Frio Sur', direccion: 'Av. Mosconi 2897, CABA' },
  { nombre: 'Muebleria Roble', direccion: 'Av. Warnes 2145, CABA' },
  { nombre: 'Tienda Urbana 24', direccion: 'Thames 1711, CABA' },
  { nombre: 'Agustin Sosa', direccion: 'Conde 3055, CABA' },
  { nombre: 'Electronica Delta', direccion: 'Av. Cordoba 5221, CABA' },
  { nombre: 'Florencia Mendez', direccion: 'Sarmiento 4076, CABA' },
  { nombre: 'Kiosco Las Flores', direccion: 'Av. Avellaneda 1985, CABA' },
  { nombre: 'Repuestos El Puente', direccion: 'Av. Saenz 924, CABA' },
  { nombre: 'Gimnasio Activa', direccion: 'Lope de Vega 1320, CABA' },
  { nombre: 'Sabrina Lopez', direccion: 'Monroe 2247, CABA' },
  { nombre: 'Almacen Don Bosco', direccion: 'Estados Unidos 3321, CABA' },
  { nombre: 'Clinica Dental Norte', direccion: 'Av. Libertador 6702, CABA' },
  { nombre: 'Javier Pereyra', direccion: 'Moldes 1744, CABA' },
  { nombre: 'Textil Plaza Once', direccion: 'Pueyrredon 442, CABA' },
  { nombre: 'Bicicleteria Rueda Libre', direccion: 'Honorio Pueyrredon 2103, CABA' },
  { nombre: 'Noelia Rivas', direccion: 'Gavilan 1365, CABA' },
  { nombre: 'Veterinaria Central', direccion: 'Av. Juan B. Justo 5580, CABA' },
  { nombre: 'Merceria El Boton', direccion: 'Yerbal 2639, CABA' },
  { nombre: 'Santiago Dominguez', direccion: 'Lascano 3142, CABA' },
  { nombre: 'Corralon del Oeste', direccion: 'Av. Nazca 4122, CABA' },
  { nombre: 'Cafe Barrio Sur', direccion: 'Bolivar 1268, CABA' },
  { nombre: 'Ines Cabrera', direccion: 'Av. Entre Rios 1855, CABA' }
];

function construirClientes(cantidad) {
  if (cantidad > CLIENTES_PERFILES.length) {
    throw new Error(`No hay suficientes perfiles unicos para ${cantidad} clientes.`);
  }

  return Array.from({ length: cantidad }, (_, i) => {
    const sufijo = String(i + 1).padStart(2, '0');
    const base = `cliente${sufijo}`;
    const perfil = CLIENTES_PERFILES[i];

    return {
      email: `${base}@logitrack.seed`,
      telefono: telefonoUnico(2000 + i),
      nombreUsuario: base,
      rol: 'Cliente',
      nombre: perfil.nombre,
      direccion: perfil.direccion
    };
  });
}

const PRODUCTOS = [
  'Medicamentos', 'Libros', 'Alimentos', 'Repuestos', 'Electrodomésticos',
  'Textiles', 'Hardware', 'Accesorios', 'Productos de Limpieza', 'Material de Construcción',
  'Piezas de Vehículos', 'Cosméticos', 'Instrumentos', 'Herramientas', 'Paquete Variado'
];

const ESTADOS = ['creado', 'en tránsito', 'en sucursal', 'entregado'];

function generarTrackingId(index) {
  const letras = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const primeras = letras[Math.floor(Math.random() * letras.length)] + 
                   letras[Math.floor(Math.random() * letras.length)];
  const numeros = String(index).padStart(6, '0');
  return `${primeras}-${numeros}`;
}

function construirEnvios(cantidad, usuarios) {
  return Array.from({ length: cantidad }, (_, i) => {
    // Seleccionar remitente y destinatario (pueden ser los mismos usuarios, pero de forma realista)
    const remitenteIdx = Math.floor(Math.random() * usuarios.length);
    let destinatarioIdx = Math.floor(Math.random() * usuarios.length);
    
    // Si es el mismo índice, cambiar destinatario
    if (destinatarioIdx === remitenteIdx) {
      destinatarioIdx = (remitenteIdx + 1) % usuarios.length;
    }

    const remitente = usuarios[remitenteIdx];
    const destinatario = usuarios[destinatarioIdx];
    
    // Generar fechas realistas (últimos 30 días)
    const ahora = new Date();
    const dias = Math.floor(Math.random() * 30);
    const horas = Math.floor(Math.random() * 24);
    const fechaCreacion = new Date(ahora.getTime() - dias * 24 * 60 * 60 * 1000 - horas * 60 * 60 * 1000);
    
    const fechaActualizacion = new Date(fechaCreacion.getTime() + Math.random() * 10 * 24 * 60 * 60 * 1000);
    
    const producto = PRODUCTOS[Math.floor(Math.random() * PRODUCTOS.length)];
    const estado = ESTADOS[Math.floor(Math.random() * ESTADOS.length)];

    return {
      trackingId: generarTrackingId(i + 1),
      remitente: remitente.nombre || remitente.nombreUsuario,
      destinatario: destinatario.nombre || destinatario.nombreUsuario,
      producto,
      estado,
      fechaCreacion: fechaCreacion.toISOString(),
      fechaActualizacion: fechaActualizacion.toISOString(),
      direccionRemitente: remitente.direccion || 'Dirección no especificada',
      contactoRemitente: remitente.telefono,
      direccionEntrega: destinatario.direccion || 'Dirección no especificada',
      contactoDestinatario: destinatario.telefono
    };
  });
}

async function sembrarUsuarios() {
  await inicializar();

  const ahora = new Date().toISOString();
  const passwordHash = bcrypt.hashSync(PASSWORD_SEMILLA, HASH_ROUNDS);

  const supervisores = construirUsuarios(5, 'Supervisor', 'admin');
  const operadores = construirUsuarios(10, 'Operador', 'operador');
  const clientes = construirClientes(35);

  const usuariosSemilla = [...supervisores, ...operadores, ...clientes];

  await client.execute('DELETE FROM sesiones');
  await client.execute('DELETE FROM usuarios');
  await client.execute('DELETE FROM envios');

  let usuariosInsertados = 0;

  for (const usuario of usuariosSemilla) {
    const resultado = await client.execute({
      sql: `INSERT INTO usuarios (
        email,
        telefono,
        nombreUsuario,
        passwordHash,
        fechaCreacion,
        rol,
        nombre,
        direccion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        usuario.email,
        usuario.telefono,
        usuario.nombreUsuario,
        passwordHash,
        ahora,
        usuario.rol,
        usuario.nombre || null,
        usuario.direccion || null
      ]
    });

    usuariosInsertados += Number(resultado.rowsAffected || 0);
  }

  // Construir y sembrar envíos (solo usando clientes)
  const enviolsSemilla = construirEnvios(100, clientes);
  let enviosInsertados = 0;

  for (const envio of enviolsSemilla) {
    const resultado = await client.execute({
      sql: `INSERT INTO envios (
        trackingId,
        remitente,
        destinatario,
        producto,
        estado,
        fechaCreacion,
        fechaActualizacion,
        direccionRemitente,
        contactoRemitente,
        direccionEntrega,
        contactoDestinatario
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        envio.trackingId,
        envio.remitente,
        envio.destinatario,
        envio.producto,
        envio.estado,
        envio.fechaCreacion,
        envio.fechaActualizacion,
        envio.direccionRemitente,
        envio.contactoRemitente,
        envio.direccionEntrega,
        envio.contactoDestinatario
      ]
    });

    enviosInsertados += Number(resultado.rowsAffected || 0);
  }

  const resumenRoles = await client.execute(`
    SELECT rol, COUNT(*) AS total
    FROM usuarios
    GROUP BY rol
    ORDER BY rol
  `);

  const resumenEstados = await client.execute(`
    SELECT estado, COUNT(*) AS total
    FROM envios
    GROUP BY estado
    ORDER BY estado
  `);

  console.log(`\n🌱 SEED EJECUTADO\n`);
  console.log(`👥 Usuarios insertados: ${usuariosInsertados}`);
  console.log(`📦 Envios insertados: ${enviosInsertados}`);
  console.log(`🔐 Password de semilla para todos los usuarios: ${PASSWORD_SEMILLA}`);
  
  console.log(`\n📊 Distribución de usuarios por rol:`);
  console.table(resumenRoles.rows);
  
  console.log(`\n📊 Distribución de envios por estado:`);
  console.table(resumenEstados.rows);
}

sembrarUsuarios()
  .catch((error) => {
    console.error('❌ Error al ejecutar el seed:', error);
    process.exit(1);
  });
