# 🏡 Tu Refugio API

Backend de una plataforma reserva de alojamientos turisticos , desarrollado con **Node.js, Express y SQLite**.
Permite gestionar usuarios, alojamientos, habitaciones, servicios, reservas, pagos electrónicos simulados y reseñas.

---

# 📌 Descripción del Proyecto

**Tu Refugio** es una API REST que permite:

* Registro y autenticación de usuarios
* Gestión de roles (admin, anfitrión, visitante)
* Creación de alojamientos
* Administración de habitaciones
* Asociación de servicios a alojamientos
* Reservas de hospedaje
* Registro de pagos electrónicos simulados
* Sistema de reseñas y calificaciones

---

# 🚀 Tecnologías Utilizadas

* **Node.js**
* **Express.js**
* **SQLite**
* **JavaScript**
* **dotenv**
* **cors**
* **Postman** (para pruebas)

---

# 📂 Estructura del Proyecto

```
tu_refugio/
│
├── routes/
│   ├── auth.routes.js
│   ├── admin.js
│   ├── anfitrion.js
│   ├── visitante.js
│   ├── alojamientos.js
│   ├── habitaciones.js
│   ├── reservas.js
│   ├── resenas.js
│   ├── services.routes.js
│   └── payments.routes.js
│
├── public/
│
├── database.js
├── server.js
├── package.json
└── README.md
```

---

# ⚙️ Instalación del Proyecto

### 1️⃣ Clonar repositorio

```bash
git clone https://github.com/tu_usuario/tu_refugio_api.git
```

### 2️⃣ Entrar al proyecto

```bash
cd tu_refugio_api
```

### 3️⃣ Instalar dependencias

```bash
npm install
```

### 4️⃣ Crear archivo `.env`

```
PORT=3000
```

### 5️⃣ Ejecutar servidor

```bash
npm start
```

Servidor disponible en:

```
http://localhost:3000
```

API base:

```
http://localhost:3000/api
```

---

# 🔐 Autenticación

## Registrar Usuario

POST

```
/api/auth/register
```

Body:

```json
{
 "nombre": "Juan Perez",
 "email": "juan@email.com",
 "password": "123456",
 "rol": "visitante"
}
```

### Roles disponibles

```
admin
anfitrion
visitante
```

---

## Iniciar Sesión

POST

```
/api/auth/login
```

Body:

```json
{
 "email": "juan@email.com",
 "password": "123456"
}
```

---

# 🏠 Alojamientos

## Listar alojamientos

GET

```
/api/alojamientos
```

---

## Crear alojamiento

POST

```
/api/alojamientos
```

Body:

```json
{
 "nombre": "Cabaña Montaña",
 "descripcion": "Hermosa cabaña en la montaña",
 "ubicacion": "Zipaquirá",
 "precio_noche": 150000,
 "id_anfitrion": 2
}
```

---

## Actualizar alojamiento

PUT

```
/api/alojamientos/:id
```

Ejemplo:

```
/api/alojamientos/1
```

Body:

```json
{
 "nombre": "Cabaña Premium",
 "precio_noche": 180000
}
```

---

## Eliminar alojamiento

DELETE

```
/api/alojamientos/:id
```

---

# 🛏 Habitaciones

## Listar habitaciones

GET

```
/api/habitaciones
```

---

## Crear habitación

POST

```
/api/habitaciones
```

Body:

```json
{
 "id_alojamiento": 1,
 "nombre": "Habitación Familiar",
 "capacidad": 4,
 "precio": 200000
}
```

---

# 🧩 Servicios

## Listar servicios

GET

```
/api/services
```

---

## Crear servicio

POST

```
/api/services
```

Body:

```json
{
 "nombre": "WiFi"
}
```

Servicios sugeridos:

```
WiFi
Piscina
Jacuzzi
Parqueadero
Desayuno
TV
Aire acondicionado
Cocina
Lavadora
```

---

## Actualizar servicio

PUT

```
/api/services/:id
```

---

## Eliminar servicio

DELETE

```
/api/services/:id
```

---

# 📅 Reservas

## Listar reservas

GET

```
/api/reservas
```

---

## Crear reserva

POST

```
/api/reservas
```

Body:

```json
{
 "id_usuario": 1,
 "id_habitacion": 1,
 "fecha_inicio": "2026-05-01",
 "fecha_fin": "2026-05-05",
 "numero_personas": 2
}
```

---

# 💳 Pagos Electrónicos

Pagos simulados asociados a una reserva.

## Ver pagos

GET

```
/api/payments
```

---

## Registrar pago

POST

```
/api/payments
```

Body:

```json
{
 "id_reserva": 1,
 "monto": 200000,
 "metodo_pago": "nequi",
 "referencia_pago": "NEQ123456"
}
```

### Métodos de pago soportados

```
tarjeta
nequi
daviplata
pse
```

---

# ⭐ Reseñas

## Listar reseñas

GET

```
/api/resenas/alojamiento/1
```

---

## Crear reseña

POST

```
/api/resenas
```

Body:

```json
{
 "id_usuario": 1,
 "id_alojamiento": 1,
 "calificacion": 5,
 "comentario": "Excelente experiencia"
}
```

---

# 🧪 Validación del Proyecto en Postman

Para validar completamente la API ejecutar en este orden:

```
1 Registrar usuario visitante
2 Registrar usuario anfitrión
3 Iniciar sesión
4 Crear alojamiento
5 Crear habitación
6 Crear servicio
7 Crear reserva
8 Registrar pago
9 Crear reseña
```

---

# 📊 Características del Sistema

✔ API REST estructurada
✔ Arquitectura modular con Express
✔ Manejo de roles
✔ Gestión de alojamientos y habitaciones
✔ Sistema de reservas
✔ Servicios asociados al alojamiento
✔ Pagos electrónicos simulados
✔ Sistema de reseñas

---

# 👨‍💻 Autor:

Jesús Andres Cabrejo Cuervo_2977363

Proyecto académico desarrollado para práctica de **Backend con Node.js y Express**, para una plataforma reserva de alojamientos turísticos 

---

# 📄 Licencia

Este proyecto se distribuye bajo una licencia de uso con derechos reservados del autor.

Consulta el texto completo en:

**[LICENCIA.txt](LICENCIA.txt)**
