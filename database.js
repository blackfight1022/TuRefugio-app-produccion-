const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if(err) console.error('❌ Error al conectar con SQLite:', err.message);
  else console.log('✅ Conectado a SQLite correctamente.');
});

// Activar claves foráneas
db.run('PRAGMA foreign_keys = ON');

db.serialize(() => {
  // ROLES
  db.run(`CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  )`);
  db.run(`INSERT OR IGNORE INTO roles (id,nombre) VALUES (1,'admin'),(2,'anfitrion'),(3,'visitante')`);

  // USUARIOS
  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    correo TEXT UNIQUE NOT NULL,
    contraseña TEXT NOT NULL,
    telefono TEXT,
    direccion TEXT,
    tipo_persona TEXT,
    tipo_documento TEXT,
    numero_documento TEXT,
    razon_social TEXT,
    documento_frontal TEXT,
    documento_trasero TEXT,
    certificado_empresa TEXT,
    verificacion_documental_estado TEXT DEFAULT 'pendiente',
    verificacion_documental_observacion TEXT,
    estado_cuenta TEXT DEFAULT 'activo',
    suspension_hasta DATETIME,
    suspension_motivo TEXT,
    rol_id INTEGER NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (rol_id) REFERENCES roles(id)
  )`);

  // ALOJAMIENTOS
  db.run(`CREATE TABLE IF NOT EXISTS alojamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    ubicacion TEXT,
    imagen TEXT,
    precio REAL NOT NULL,
    capacidad_personas INTEGER NOT NULL,
    zona TEXT,
    cercania TEXT,
    vistas TEXT,
    politicas TEXT,
    calificacion_promedio REAL DEFAULT 0,
    id_anfitrion INTEGER NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_anfitrion) REFERENCES usuarios(id)
  )`);

  // Agregar columnas faltantes si no existen
  db.all(`PRAGMA table_info(usuarios)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking usuarios table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);
    if (!columnNames.includes('telefono')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN telefono TEXT`);
    }
    if (!columnNames.includes('direccion')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN direccion TEXT`);
    }
    if (!columnNames.includes('tipo_persona')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN tipo_persona TEXT`);
    }
    if (!columnNames.includes('tipo_documento')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN tipo_documento TEXT`);
    }
    if (!columnNames.includes('numero_documento')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN numero_documento TEXT`);
    }
    if (!columnNames.includes('razon_social')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN razon_social TEXT`);
    }
    if (!columnNames.includes('documento_frontal')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN documento_frontal TEXT`);
    }
    if (!columnNames.includes('documento_trasero')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN documento_trasero TEXT`);
    }
    if (!columnNames.includes('certificado_empresa')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN certificado_empresa TEXT`);
    }
    if (!columnNames.includes('verificacion_documental_estado')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN verificacion_documental_estado TEXT DEFAULT 'pendiente'`);
    }
    if (!columnNames.includes('verificacion_documental_observacion')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN verificacion_documental_observacion TEXT`);
    }
    if (!columnNames.includes('estado_cuenta')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN estado_cuenta TEXT DEFAULT 'activo'`);
    }
    if (!columnNames.includes('suspension_hasta')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN suspension_hasta DATETIME`);
    }
    if (!columnNames.includes('suspension_motivo')) {
      db.run(`ALTER TABLE usuarios ADD COLUMN suspension_motivo TEXT`);
    }
  });

  db.all(`PRAGMA table_info(alojamientos)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);
    if (!columnNames.includes('zona')) {
      db.run(`ALTER TABLE alojamientos ADD COLUMN zona TEXT`);
    }
    if (!columnNames.includes('cercania')) {
      db.run(`ALTER TABLE alojamientos ADD COLUMN cercania TEXT`);
    }
    if (!columnNames.includes('vistas')) {
      db.run(`ALTER TABLE alojamientos ADD COLUMN vistas TEXT`);
    }
    if (!columnNames.includes('politicas')) {
      db.run(`ALTER TABLE alojamientos ADD COLUMN politicas TEXT`);
    }
  });

  // HABITACIONES
  db.run(`CREATE TABLE IF NOT EXISTS habitaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    capacidad INTEGER NOT NULL,
    precio REAL NOT NULL,
    estado_manual TEXT DEFAULT 'disponible',
    id_alojamiento INTEGER NOT NULL,
    FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id) ON DELETE CASCADE
  )`);

  db.all(`PRAGMA table_info(habitaciones)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking habitaciones table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);
    if (!columnNames.includes('estado_manual')) {
      db.run(`ALTER TABLE habitaciones ADD COLUMN estado_manual TEXT DEFAULT 'disponible'`);
    }
  });

  // SERVICIOS
  db.run(`CREATE TABLE IF NOT EXISTS servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL
  )`);
  db.run(`INSERT OR IGNORE INTO servicios (id,nombre) VALUES
    (1,'WiFi'),(2,'Piscina'),(3,'Parqueadero'),(4,'Desayuno'),
    (5,'Aire acondicionado'),(6,'Mascotas permitidas'),(7,'TV'),
    (8,'Cocina'),(9,'Lavadora'),(10,'Jacuzzi')`);

  // HABITACION_SERVICIOS
  db.run(`CREATE TABLE IF NOT EXISTS habitacion_servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_habitacion INTEGER NOT NULL,
    id_servicio INTEGER NOT NULL,
    FOREIGN KEY (id_habitacion) REFERENCES habitaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (id_servicio) REFERENCES servicios(id) ON DELETE CASCADE,
    UNIQUE(id_habitacion,id_servicio)
  )`);

  // 🔥 NUEVO: ALOJAMIENTO_SERVICIOS
  db.run(`CREATE TABLE IF NOT EXISTS alojamiento_servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alojamiento INTEGER NOT NULL,
    id_servicio INTEGER NOT NULL,
    FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_servicio) REFERENCES servicios(id) ON DELETE CASCADE,
    UNIQUE(id_alojamiento,id_servicio)
  )`);

  db.all(`PRAGMA table_info(alojamiento_servicios)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking alojamiento_servicios table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);

    const marcarServiciosAdicionalesExistentes = () => {
      db.run(`
        UPDATE alojamiento_servicios
        SET es_adicional = 1
        WHERE (valor_adicional IS NOT NULL OR categoria IS NOT NULL)
          AND (es_adicional IS NULL OR es_adicional = 0)
      `, (updateErr) => {
        if (updateErr) {
          console.error('Error updating alojamiento_servicios es_adicional:', updateErr);
        }
      });
    };

    if (!columnNames.includes('valor_adicional')) {
      db.run(`ALTER TABLE alojamiento_servicios ADD COLUMN valor_adicional REAL`);
    }
    if (!columnNames.includes('categoria')) {
      db.run(`ALTER TABLE alojamiento_servicios ADD COLUMN categoria TEXT`);
    }
    if (!columnNames.includes('es_adicional')) {
      db.run(`ALTER TABLE alojamiento_servicios ADD COLUMN es_adicional INTEGER DEFAULT 0`, (alterErr) => {
        if (alterErr) {
          console.error('Error adding es_adicional column:', alterErr);
          return;
        }
        marcarServiciosAdicionalesExistentes();
      });
    } else {
      marcarServiciosAdicionalesExistentes();
    }
  });

  // RESERVAS
  db.run(`CREATE TABLE IF NOT EXISTS reservas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_habitacion INTEGER NOT NULL,
    id_usuario INTEGER NOT NULL,
    fecha_entrada TEXT NOT NULL,
    fecha_salida TEXT NOT NULL,
    personas INTEGER DEFAULT 1,
    precio_total REAL NOT NULL,
    estado TEXT CHECK(estado IN ('pendiente','confirmada','cancelada','en_curso','finalizada')) DEFAULT 'pendiente',
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_habitacion) REFERENCES habitaciones(id) ON DELETE CASCADE,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE
  )`);

  db.all(`PRAGMA table_info(reservas)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking reservas table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);
    if (!columnNames.includes('titular_nombre')) {
      db.run(`ALTER TABLE reservas ADD COLUMN titular_nombre TEXT`);
    }
    if (!columnNames.includes('titular_documento_tipo')) {
      db.run(`ALTER TABLE reservas ADD COLUMN titular_documento_tipo TEXT`);
    }
    if (!columnNames.includes('titular_documento_numero')) {
      db.run(`ALTER TABLE reservas ADD COLUMN titular_documento_numero TEXT`);
    }
    if (!columnNames.includes('titular_correo')) {
      db.run(`ALTER TABLE reservas ADD COLUMN titular_correo TEXT`);
    }
    if (!columnNames.includes('titular_telefono')) {
      db.run(`ALTER TABLE reservas ADD COLUMN titular_telefono TEXT`);
    }
    if (!columnNames.includes('detalle_servicios_json')) {
      db.run(`ALTER TABLE reservas ADD COLUMN detalle_servicios_json TEXT`);
    }
    if (!columnNames.includes('subtotal_hospedaje')) {
      db.run(`ALTER TABLE reservas ADD COLUMN subtotal_hospedaje REAL DEFAULT 0`);
    }
    if (!columnNames.includes('subtotal_servicios')) {
      db.run(`ALTER TABLE reservas ADD COLUMN subtotal_servicios REAL DEFAULT 0`);
    }
    if (!columnNames.includes('noches')) {
      db.run(`ALTER TABLE reservas ADD COLUMN noches INTEGER DEFAULT 0`);
    }
    if (!columnNames.includes('referencia_pago')) {
      db.run(`ALTER TABLE reservas ADD COLUMN referencia_pago TEXT`);
    }
    if (!columnNames.includes('cancelacion_motivo')) {
      db.run(`ALTER TABLE reservas ADD COLUMN cancelacion_motivo TEXT`);
    }
    if (!columnNames.includes('cancelacion_porcentaje_reembolso')) {
      db.run(`ALTER TABLE reservas ADD COLUMN cancelacion_porcentaje_reembolso REAL DEFAULT 0`);
    }
    if (!columnNames.includes('cancelada_por')) {
      db.run(`ALTER TABLE reservas ADD COLUMN cancelada_por TEXT`);
    }
    if (!columnNames.includes('puede_resenar')) {
      db.run(`ALTER TABLE reservas ADD COLUMN puede_resenar INTEGER DEFAULT 0`);
    }
    if (!columnNames.includes('resena_realizada')) {
      db.run(`ALTER TABLE reservas ADD COLUMN resena_realizada INTEGER DEFAULT 0`);
    }
  });

  // PAGOS
  db.run(`CREATE TABLE IF NOT EXISTS pagos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_reserva INTEGER NOT NULL,
    monto REAL NOT NULL,
    metodo_pago TEXT CHECK(metodo_pago IN ('tarjeta','nequi','daviplata','pse')) NOT NULL,
    estado TEXT CHECK(estado IN ('pendiente','pagado','rechazado')) DEFAULT 'pendiente',
    referencia_pago TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id) ON DELETE CASCADE
  )`);

  db.all(`PRAGMA table_info(pagos)`, [], function(err, rows) {
    if (err) {
      console.error('Error checking pagos table info:', err);
      return;
    }
    if (!rows) return;
    const columnNames = rows.map(row => row.name);
    if (!columnNames.includes('transaccion_externa')) {
      db.run(`ALTER TABLE pagos ADD COLUMN transaccion_externa TEXT`);
    }
    if (!columnNames.includes('pasarela')) {
      db.run(`ALTER TABLE pagos ADD COLUMN pasarela TEXT DEFAULT 'wompi'`);
    }
  });

  db.run(`CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_reserva INTEGER NOT NULL UNIQUE,
    numero_factura TEXT NOT NULL UNIQUE,
    estado TEXT DEFAULT 'emitida',
    datos_cliente_json TEXT NOT NULL,
    datos_anfitrion_json TEXT NOT NULL,
    detalle_json TEXT NOT NULL,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id) ON DELETE CASCADE
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notificaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_reserva INTEGER NOT NULL,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente_integracion',
    payload_json TEXT,
    creado_en DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_reserva) REFERENCES reservas(id) ON DELETE CASCADE
  )`);

  // RESEÑAS
  db.run(`CREATE TABLE IF NOT EXISTS reseñas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_usuario INTEGER NOT NULL,
    id_alojamiento INTEGER NOT NULL,
    calificacion INTEGER CHECK(calificacion BETWEEN 1 AND 5),
    comentario TEXT,
    fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_usuario) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id) ON DELETE CASCADE
  )`);

  // IMÁGENES
  db.run(`CREATE TABLE IF NOT EXISTS imagenes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    id_alojamiento INTEGER,
    id_habitacion INTEGER,
    ruta TEXT,
    principal INTEGER DEFAULT 0,
    FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id) ON DELETE CASCADE,
    FOREIGN KEY (id_habitacion) REFERENCES habitaciones(id) ON DELETE CASCADE
  )`);

  // CANCELACIONES
  db.run(`CREATE TABLE IF NOT EXISTS cancelaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reserva_id INTEGER NOT NULL,
    email_turista TEXT NOT NULL,
    motivo TEXT NOT NULL,
    codigo TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente_confirmacion_turista',
    porcentaje_devolucion REAL DEFAULT 0,
    motivo_descuento TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_confirmacion DATETIME,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
  )`);

  // MENSAJES
  db.run(`CREATE TABLE IF NOT EXISTS mensajes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    turista_id INTEGER NOT NULL,
    asunto TEXT NOT NULL,
    contenido TEXT NOT NULL,
    tipo TEXT DEFAULT 'general',
    reserva_id INTEGER,
    porcentaje_devolucion REAL,
    motivo_descuento TEXT,
    estado TEXT DEFAULT 'sin_leer',
    leido INTEGER DEFAULT 0,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (turista_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    FOREIGN KEY (reserva_id) REFERENCES reservas(id) ON DELETE CASCADE
  )`);
});

module.exports = db;