const form = document.getElementById('registroForm');
const passwordInput = document.getElementById('password');
const passwordStrengthLabel = document.getElementById('passwordStrengthLabel');
const passwordStrengthScore = document.getElementById('passwordStrengthScore');
const passwordStrengthBar = document.getElementById('passwordStrengthBar');
const passwordStrengthRequirements = document.getElementById('passwordStrengthRequirements');
const camposNatural = document.getElementById('camposNatural');
const camposEmpresa = document.getElementById('camposEmpresa');
const estadoDocumentos = document.getElementById('estadoDocumentos');
const documentoFrontalInput = document.getElementById('documentoFrontal');
const documentoTraseroInput = document.getElementById('documentoTrasero');
const certificadoNitInput = document.getElementById('certificadoNit');
const tipoDocumentoInput = document.getElementById('tipo_documento');
const numeroDocumentoInput = document.getElementById('numero_documento');
const nitEmpresaInput = document.getElementById('nit_empresa');
const razonSocialInput = document.getElementById('razon_social');
const aceptaTyCInput = document.getElementById('aceptaTyC');

function obtenerTipoPersona() {
  return document.querySelector('input[name="tipo_persona"]:checked')?.value || 'natural';
}

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

function alternarTipoPersona() {
  const tipoPersona = obtenerTipoPersona();
  const esNatural = tipoPersona === 'natural';

  camposNatural.classList.toggle('oculto', !esNatural);
  camposEmpresa.classList.toggle('oculto', esNatural);

  tipoDocumentoInput.required = esNatural;
  numeroDocumentoInput.required = esNatural;
  documentoFrontalInput.required = esNatural;
  documentoTraseroInput.required = esNatural;

  razonSocialInput.required = !esNatural;
  nitEmpresaInput.required = !esNatural;
  certificadoNitInput.required = !esNatural;

  if (!esNatural) {
    tipoDocumentoInput.value = 'NIT';
  }

  estadoDocumentos.textContent = esNatural
    ? 'Debes cargar ambos lados del documento de identidad y que sean claramente legibles.'
    : 'Debes cargar un certificado vigente y legible del NIT o cámara de comercio.';
}

async function validarArchivoLegible(file, descripcion) {
  if (!file) {
    return `${descripcion}: archivo obligatorio.`;
  }

  if (file.size < 40000) {
    return `${descripcion}: el archivo parece demasiado liviano y podría no ser legible.`;
  }

  if (file.type === 'application/pdf') {
    return null;
  }

  if (!file.type.startsWith('image/')) {
    return `${descripcion}: el formato no es válido.`;
  }

  const dimensiones = await new Promise((resolve, reject) => {
    const imagen = new Image();
    const objectUrl = URL.createObjectURL(file);
    imagen.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: imagen.naturalWidth, height: imagen.naturalHeight });
    };
    imagen.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo leer la imagen.'));
    };
    imagen.src = objectUrl;
  });

  if (dimensiones.width < 900 || dimensiones.height < 600) {
    return `${descripcion}: la resolución es baja. Vuelve a cargar una foto más nítida.`;
  }

  return null;
}

async function validarDocumentosFormulario() {
  const tipoPersona = obtenerTipoPersona();
  const errores = [];

  if (tipoPersona === 'natural') {
    const errorFrontal = await validarArchivoLegible(documentoFrontalInput.files[0], 'Documento frontal');
    const errorTrasero = await validarArchivoLegible(documentoTraseroInput.files[0], 'Documento posterior');
    if (errorFrontal) errores.push(errorFrontal);
    if (errorTrasero) errores.push(errorTrasero);
  } else {
    const errorCertificado = await validarArchivoLegible(certificadoNitInput.files[0], 'Certificado del NIT');
    if (errorCertificado) errores.push(errorCertificado);
  }

  return errores;
}

document.querySelectorAll('input[name="tipo_persona"]').forEach((radio) => {
  radio.addEventListener('change', alternarTipoPersona);
});

passwordInput.addEventListener('input', actualizarIndicadorContrasena);
actualizarIndicadorContrasena();
alternarTipoPersona();

form.addEventListener('submit', async function(e) {
  e.preventDefault();

  const seguridadPassword = actualizarIndicadorContrasena();
  if (!seguridadPassword.cumpleMinimo) {
    await Swal.fire({
      icon: 'warning',
      title: 'Contraseña insegura',
      text: 'La contraseña debe llegar al nivel Fuerte. Incluye mínimo 8 caracteres, mayúscula, minúscula, número y símbolo.'
    });
    return;
  }

  const correoIngresado = document.getElementById('email').value.trim();
  const validacion = validarCorreoReal(correoIngresado);
  if (!validacion.valido) {
    await Swal.fire({
      icon: 'warning',
      title: 'Correo no válido',
      text: validacion.mensaje
    });
    return;
  }

  const telefonoIngresado = document.getElementById('telefono').value.trim();
  const validacionTel = validarTelefono(telefonoIngresado);
  if (!validacionTel.valido) {
    await Swal.fire({
      icon: 'warning',
      title: 'Teléfono no válido',
      text: validacionTel.mensaje
    });
    return;
  }

  if (!aceptaTyCInput.checked) {
    await Swal.fire({
      icon: 'warning',
      title: 'Aceptación requerida',
      text: 'Debes aceptar los términos y condiciones para completar el registro de anfitrión.'
    });
    return;
  }

  const tipoPersona = obtenerTipoPersona();
  const erroresDocumentales = await validarDocumentosFormulario();
  if (erroresDocumentales.length) {
    estadoDocumentos.textContent = erroresDocumentales.join(' ');
    await Swal.fire({
      icon: 'warning',
      title: 'Debes volver a cargar tus documentos',
      text: erroresDocumentales.join(' ')
    });
    return;
  }

  estadoDocumentos.textContent = 'Documentos validados localmente. Enviaremos tu registro para revisión.';

  const formData = new FormData(form);
  formData.set('rol', 'anfitrion');
  if (tipoPersona === 'empresa') {
    formData.set('tipo_documento', 'NIT');
    formData.set('numero_documento', nitEmpresaInput.value.trim());
  }

  const response = await fetch('/api/auth/register', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();

  if (response.ok) {
    Swal.fire({
      icon: 'success',
      title: 'Registro exitoso',
      text: 'Tu registro fue recibido. Ahora puedes iniciar sesión y tu documentación quedará en revisión.',
    }).then(() => {
      window.location.href = '../login/login.html';
    });
  } else {
    Swal.fire({
      icon: 'error',
      title: 'Error',
      text: result.error || 'No se pudo completar el registro del anfitrión.'
    });
  }
});