const db = require('../database');
const bcrypt = require('bcrypt');


// ======================================================
// BUSCAR USUARIO POR EMAIL
// ======================================================
const findUserByEmail = (email) => {

  return new Promise((resolve, reject) => {

    db.get(
      'SELECT * FROM usuarios WHERE email = ?',
      [email],
      (err, user) => {

        if (err) return reject(err);

        resolve(user);
      }
    );

  });

};



// ======================================================
// CREAR USUARIO
// ======================================================
const createUser = async (nombre, email, password, rol = 'visitante') => {

  const hashedPassword = await bcrypt.hash(password, 10);

  return new Promise((resolve, reject) => {

    db.run(
      `INSERT INTO usuarios (nombre, email, password, rol)
       VALUES (?, ?, ?, ?)`,
      [nombre, email, hashedPassword, rol],
      function (err) {

        if (err) return reject(err);

        resolve({
          id: this.lastID,
          nombre,
          email,
          rol
        });

      }
    );

  });

};



// ======================================================
// VALIDAR PASSWORD
// ======================================================
const comparePassword = async (password, hashedPassword) => {

  return await bcrypt.compare(password, hashedPassword);

};



// ======================================================
// BUSCAR USUARIO POR ID
// ======================================================
const findUserById = (id) => {

  return new Promise((resolve, reject) => {

    db.get(
      `SELECT id, nombre, email, rol
       FROM usuarios
       WHERE id = ?`,
      [id],
      (err, user) => {

        if (err) return reject(err);

        resolve(user);
      }
    );

  });

};



module.exports = {

  findUserByEmail,
  createUser,
  comparePassword,
  findUserById

};