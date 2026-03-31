const db = require('./database.js');

db.all('SELECT * FROM alojamientos WHERE id=1', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Datos del alojamiento id=1:', rows[0]);
  }
  process.exit(0);
});