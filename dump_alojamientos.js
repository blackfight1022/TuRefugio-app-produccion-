const db = require('./database');

db.all('SELECT id, titulo, zona, cercania, vistas, politicas FROM alojamientos ORDER BY id DESC LIMIT 10', (err, rows) => {
  if (err) return console.error(err);
  console.log(rows);
  process.exit(0);
});