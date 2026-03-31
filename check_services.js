const db = require('./database.js');

db.all('SELECT * FROM servicios', (err, rows) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('Servicios disponibles:', rows);
  }
  process.exit(0);
});