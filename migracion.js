const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database.sqlite');

db.serialize(async () => {
  console.log('⏳ Migrando base de datos...');

  db.run(`DROP TABLE IF EXISTS reseñas`);
  db.run(`DROP TABLE IF EXISTS reservas`);
  db.run(`DROP TABLE IF EXISTS alojamientos`);
  db.run(`DROP TABLE IF EXISTS usuarios`);

  db.run(`
    CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      correo TEXT UNIQUE NOT NULL,
      contraseña TEXT NOT NULL,
      telefono TEXT,
      rol TEXT CHECK(rol IN ('admin', 'anfitrion', 'visitante')) NOT NULL,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE alojamientos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      descripcion TEXT,
      ubicacion TEXT,
      precio_por_noche REAL,
      imagen TEXT,
      id_anfitrion INTEGER NOT NULL,
      fecha_publicacion TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_anfitrion) REFERENCES usuarios(id)
    )
  `);

  db.run(`
    CREATE TABLE reservas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_alojamiento INTEGER NOT NULL,
      fecha_entrada TEXT NOT NULL,
      fecha_salida TEXT NOT NULL,
      estado TEXT CHECK(estado IN ('pendiente', 'confirmada', 'cancelada')) DEFAULT 'pendiente',
      fecha_reserva TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
      FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id)
    )
  `);

  db.run(`
    CREATE TABLE reseñas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_usuario INTEGER NOT NULL,
      id_alojamiento INTEGER NOT NULL,
      calificacion INTEGER CHECK(calificacion BETWEEN 1 AND 5),
      comentario TEXT,
      fecha TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (id_usuario) REFERENCES usuarios(id),
      FOREIGN KEY (id_alojamiento) REFERENCES alojamientos(id)
    )
  `);

  // Insertar admin por defecto
  const hash = await bcrypt.hash('admin123', 10);
  db.run(
    `INSERT INTO usuarios (nombre, correo, contraseña, rol) VALUES (?, ?, ?, ?)`,
    ['Administrador', 'admin@refugio.com', hash, 'admin'],
    (err) => {
      if (err) console.error('❌ Error creando admin:', err.message);
      else console.log('✅ Usuario admin creado');
    }
  );
});
