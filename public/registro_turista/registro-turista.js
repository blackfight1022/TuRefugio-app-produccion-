const passwordInput = document.getElementById('password');
const passwordStrengthLabel = document.getElementById('passwordStrengthLabel');
const passwordStrengthScore = document.getElementById('passwordStrengthScore');
const passwordStrengthBar = document.getElementById('passwordStrengthBar');
const passwordStrengthRequirements = document.getElementById('passwordStrengthRequirements');

function actualizarIndicadorContrasena() {
  const evaluacion = evaluarSeguridadContrasena(passwordInput.value);
  const porcentaje = Math.round((evaluacion.puntaje / 6) * 100);

  passwordStrengthLabel.textContent = `Nivel: ${evaluacion.nivel}`;
  passwordStrengthScore.textContent = `${evaluacion.puntaje}/6`;
  passwordStrengthBar.style.width = `${porcentaje}%`;

  const requisitosTexto = evaluacion.requisitos
    .map((req) => `${req.ok ? '✔' : '✖'} ${req.label}`)
    .join(' | ');
  passwordStrengthRequirements.textContent = requisitosTexto;

  passwordStrengthBar.className = '';
  if (evaluacion.puntaje >= 5) passwordStrengthBar.classList.add('strength-fuerte');
  else if (evaluacion.puntaje >= 4) passwordStrengthBar.classList.add('strength-media');
  else passwordStrengthBar.classList.add('strength-debil');

  return evaluacion;
}

passwordInput.addEventListener('input', actualizarIndicadorContrasena);
actualizarIndicadorContrasena();

document.getElementById('registroForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  const form = e.target;

  const seguridadPassword = actualizarIndicadorContrasena();
  if (!seguridadPassword.cumpleMinimo) {
    Swal.fire({
      icon: 'warning',
      title: 'Contraseña insegura',
      text: 'La contraseña debe llegar al nivel Fuerte. Incluye mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.'
    });
    return;
  }

  const correoIngresado = form.correo.value.trim();
  const validacion = validarCorreoReal(correoIngresado);
  if (!validacion.valido) {
    Swal.fire({
      icon: 'warning',
      title: 'Correo no válido',
      text: validacion.mensaje
    });
    return;
  }

  const telefonoIngresado = form.telefono.value.trim();
  const validacionTel = validarTelefono(telefonoIngresado);
  if (!validacionTel.valido) {
    Swal.fire({
      icon: 'warning',
      title: 'Teléfono no válido',
      text: validacionTel.mensaje
    });
    return;
  }

  const data = {
    nombre: form.nombre.value,
    correo: form.correo.value,
    contraseña: form.contraseña.value,
    telefono: form.telefono.value,
    rol: 'visitante'
  };

  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (response.ok) {
    Swal.fire({
      icon: 'success',
      title: 'Registro exitoso',
      text: 'Ya puedes iniciar sesión',
    }).then(() => {
      window.location.href = '../login/login.html';
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: result.error || 'Ya existe un usuario con ese correo.'
    });
  }
});