const db = require('./database.js');

db.run(`UPDATE alojamientos SET zona = 'Rural', cercania = 'Cerca de ríos y bosques', vistas = 'Vistas a montañas', politicas = 'Cancelación gratuita hasta 24 horas antes. No se permiten mascotas.' WHERE id = 1`, (err) => {
  if (err) {
    console.error('Error actualizando:', err);
  } else {
    console.log('Alojamiento actualizado con datos de ejemplo.');
  }
  process.exit(0);
});