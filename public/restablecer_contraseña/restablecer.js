// ============================================
// LÓGICA DE RESTABLECIMIENTO DE CONTRASEÑA
// ============================================

let estadoReset = {
  email: null,
  codigo: null,
  codigoIngresado: null,
  codigoExpira: null,
  intentosFallidos: 0,
  maxIntentos: 3,
  tiempoVencimiento: 600000 // 10 minutos en ms
};

document.getElementById('btnVolverLoginReset')?.addEventListener('click', volverAlLogin);
document.getElementById('btnVolverPaso1')?.addEventListener('click', volverAlPaso1);
document.getElementById('btnIrLoginReset')?.addEventListener('click', irAlLogin);

// ============================================
// PASO 1: SOLICITAR EMAIL
// ============================================

document.getElementById('formPaso1').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = document.getElementById('email').value.trim();
  const boton = e.target.querySelector('button[type="submit"]');
  
  if (!validarEmail(email)) {
    await Swal.fire({
      icon: 'warning',
      title: 'Email inválido',
      text: 'Por favor ingresa un correo válido.'
    });
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Enviando...';

  try {
    const response = await fetch('/api/auth/solicitar-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al solicitar el código');
    }

    // Guardar estado
    estadoReset.email = email;
    estadoReset.codigo = data.codigo || null; // En producción puede venir null si se envía por correo.
    estadoReset.codigoExpira = Date.now() + estadoReset.tiempoVencimiento;

    // Mostrar el código en consola para testing (si el backend lo expone).
    if (data.codigo) {
      console.log('🔐 Código de verificación (testing):', data.codigo);
    }

    await Swal.fire({
      icon: 'success',
      title: 'Código enviado',
      text: 'Revisa tu correo. El código expira en 10 minutos.',
      confirmButtonText: 'Continuar'
    });

    irAlPaso2();
    iniciarContador();

  } catch (error) {
    console.error('Error:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message || 'No se pudo procesar tu solicitud. Verifica el correo e intenta nuevamente.'
    });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Enviar Código';
  }
});

// ============================================
// PASO 2: VERIFICAR CÓDIGO
// ============================================

document.getElementById('formPaso2').addEventListener('submit', async (e) => {
  e.preventDefault();

  const codigo = document.getElementById('codigo').value.trim();
  const boton = e.target.querySelector('button[type="submit"]');

  // Verificar si el código ha expirado
  if (Date.now() > estadoReset.codigoExpira) {
    await Swal.fire({
      icon: 'error',
      title: 'Código expirado',
      text: 'El código de verificación ha expirado. Solicita uno nuevo.'
    });
    volverAlPaso1();
    return;
  }

  if (codigo.length !== 6 || isNaN(codigo)) {
    await Swal.fire({
      icon: 'warning',
      title: 'Código inválido',
      text: 'El código debe tener 6 dígitos.'
    });
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Verificando...';

  try {
    const response = await fetch('/api/auth/verificar-codigo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: estadoReset.email, codigo })
    });

    const data = await response.json();

    if (!response.ok) {
      estadoReset.intentosFallidos++;

      if (estadoReset.intentosFallidos >= estadoReset.maxIntentos) {
        await Swal.fire({
          icon: 'error',
          title: 'Excediste los intentos',
          text: 'Demasiados intentos fallidos. Solicita un código nuevo.'
        });
        volverAlPaso1();
        estadoReset.intentosFallidos = 0;
        return;
      }

      throw new Error(data.error || 'Código incorrecto');
    }

    estadoReset.intentosFallidos = 0;
    estadoReset.codigoIngresado = codigo;
    irAlPaso3();

  } catch (error) {
    console.error('Error:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Error de verificación',
      text: error.message
    });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Verificar Código';
  }
});

// ============================================
// PASO 3: NUEVA CONTRASEÑA
// ============================================

document.getElementById('nuevaPassword').addEventListener('input', validarRequisitosContraseña);
document.getElementById('confirmarPassword').addEventListener('input', validarRequisitosContraseña);

document.getElementById('formPaso3').addEventListener('submit', async (e) => {
  e.preventDefault();

  const nuevaPassword = document.getElementById('nuevaPassword').value;
  const confirmarPassword = document.getElementById('confirmarPassword').value;
  const boton = e.target.querySelector('button[type="submit"]');

  // Validar requisitos
  if (!validarRequisitosCompletos(nuevaPassword)) {
    await Swal.fire({
      icon: 'warning',
      title: 'Contraseña débil',
      text: 'La contraseña no cumple todos los requisitos.'
    });
    return;
  }

  if (nuevaPassword !== confirmarPassword) {
    await Swal.fire({
      icon: 'warning',
      title: 'Contraseñas no coinciden',
      text: 'Las contraseñas no son iguales.'
    });
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Procesando...';

  try {
    const response = await fetch('/api/auth/restablecer-contrasena', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: estadoReset.email,
        codigo: estadoReset.codigoIngresado,
        nuevaContrasena: nuevaPassword
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Error al restablecer la contraseña');
    }

    // Mostrar página de éxito
    irAlPaso4();

  } catch (error) {
    console.error('Error:', error);
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: error.message
    });
  } finally {
    boton.disabled = false;
    boton.textContent = 'Restablecer Contraseña';
  }
});

// ============================================
// VALIDACIONES
// ============================================

function validarEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

function validarRequisitosContraseña() {
  const password = document.getElementById('nuevaPassword').value;
  const confirmar = document.getElementById('confirmarPassword').value;

  // Validar longitud
  const reqLongitud = document.getElementById('reqLongitud');
  if (password.length >= 8) {
    reqLongitud.classList.add('met');
  } else {
    reqLongitud.classList.remove('met');
  }

  // Validar mayúscula
  const reqMayuscula = document.getElementById('reqMayuscula');
  if (/[A-Z]/.test(password)) {
    reqMayuscula.classList.add('met');
  } else {
    reqMayuscula.classList.remove('met');
  }

  // Validar número
  const reqNumero = document.getElementById('reqNumero');
  if (/[0-9]/.test(password)) {
    reqNumero.classList.add('met');
  } else {
    reqNumero.classList.remove('met');
  }

  // Validar carácter especial
  const reqEspecial = document.getElementById('reqEspecial');
  if (/[!@#$%^&*]/.test(password)) {
    reqEspecial.classList.add('met');
  } else {
    reqEspecial.classList.remove('met');
  }
}

function validarRequisitosCompletos(password) {
  return (
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[!@#$%^&*]/.test(password)
  );
}

// ============================================
// NAVEGACIÓN ENTRE PASOS
// ============================================

function irAlPaso2() {
  ocultarTodosPasos();
  document.getElementById('paso2').classList.add('active');
}

function irAlPaso3() {
  ocultarTodosPasos();
  document.getElementById('paso3').classList.add('active');
}

function irAlPaso4() {
  ocultarTodosPasos();
  document.getElementById('paso4').classList.add('active');
}

function volverAlPaso1() {
  ocultarTodosPasos();
  document.getElementById('paso1').classList.add('active');
  document.getElementById('email').value = '';
  document.getElementById('codigo').value = '';
  estadoReset.intentosFallidos = 0;
  estadoReset.codigoIngresado = null;
  clearTimeout(estadoReset.tiempoRecuento);
}

function ocultarTodosPasos() {
  document.querySelectorAll('.paso-container').forEach(paso => {
    paso.classList.remove('active');
  });
}

function irAlLogin() {
  // Detectar de dónde venía el usuario
  const referrer = document.referrer;
  
  if (referrer.includes('admin.html')) {
    window.location.href = '/admin/admin.html';
  } else {
    window.location.href = '/login/login.html';
  }
}

function volverAlLogin(event) {
  event.preventDefault();
  irAlLogin();
}

// ============================================
// CONTADOR DE TIEMPO DE EXPIRACIÓN
// ============================================

let tiempoRecuento;

function iniciarContador() {
  const elementoTiempo = document.getElementById('tiempoExpiracion');
  
  function actualizarTiempo() {
    const ahora = Date.now();
    const tiempoRestante = estadoReset.codigoExpira - ahora;

    if (tiempoRestante <= 0) {
      elementoTiempo.textContent = 'El código ha expirado. Solicita uno nuevo.';
      elementoTiempo.classList.add('warning');
      clearInterval(tiempoRecuento);
      return;
    }

    const minutos = Math.floor(tiempoRestante / 60000);
    const segundos = Math.floor((tiempoRestante % 60000) / 1000);

    elementoTiempo.textContent = `Código expira en: ${minutos}:${segundos.toString().padStart(2, '0')}`;

    if (tiempoRestante < 60000) { // Menos de 1 minuto
      elementoTiempo.classList.add('warning');
    }
  }

  actualizarTiempo(); // Llamada inicial
  tiempoRecuento = setInterval(actualizarTiempo, 1000);
}

// Mostrar el Paso 1 por defecto
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('paso1').classList.add('active');
});
