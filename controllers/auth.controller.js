const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');


// =============================
// REGISTRO DE USUARIO
// =============================
exports.register = (req, res) => {

    const { nombre, email, password, rol } = req.body;

    if (!nombre || !email || !password) {
        return res.status(400).json({
            error: 'Todos los campos son obligatorios'
        });
    }

    db.get(
        'SELECT * FROM usuarios WHERE email = ?',
        [email],
        async (err, user) => {

            if (err) return res.status(500).json({ error: 'Error en servidor' });

            if (user) {
                return res.status(409).json({
                    error: 'El usuario ya existe'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 10);

            db.run(
                `INSERT INTO usuarios (nombre,email,password,rol)
                 VALUES (?,?,?,?)`,
                [nombre, email, hashedPassword, rol || 'visitante'],
                function (err) {

                    if (err) {
                        return res.status(500).json({
                            error: 'Error creando usuario'
                        });
                    }

                    res.status(201).json({
                        mensaje: 'Usuario creado correctamente',
                        id: this.lastID
                    });
                }
            );

        }
    );
};


// =============================
// LOGIN
// =============================
exports.login = (req, res) => {

    const { email, password } = req.body;

    db.get(
        'SELECT * FROM usuarios WHERE email = ?',
        [email],
        async (err, user) => {

            if (err) return res.status(500).json({ error: 'Error en servidor' });

            if (!user) {
                return res.status(401).json({
                    error: 'Credenciales incorrectas'
                });
            }

            const validPassword = await bcrypt.compare(password, user.password);

            if (!validPassword) {
                return res.status(401).json({
                    error: 'Credenciales incorrectas'
                });
            }

            const SECRET = process.env.JWT_SECRET || 'clave_super_segura';

const token = jwt.sign(
{
    id: user.id,
    rol: user.rol
},
SECRET,
{
    expiresIn: '24h'
);

            res.json({
                mensaje: 'Login exitoso',
                token,
                usuario: {
                    id: user.id,
                    nombre: user.nombre,
                    rol: user.rol
                }
            });

        }
    );
};