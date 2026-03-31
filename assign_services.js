const db = require('./database.js');

const servicios = [1, 2, 3]; // WiFi, Piscina, Parqueadero

servicios.forEach(id_servicio => {
  db.run(`INSERT OR IGNORE INTO alojamiento_servicios (id_alojamiento, id_servicio) VALUES (1, ?)`, [id_servicio], (err) => {
    if (err) {
      console.error('Error insertando servicio:', err);
    }
  });
});

setTimeout(() => {
  console.log('Servicios asignados al alojamiento id=1.');
  process.exit(0);
}, 1000);