let adminLoginEnProceso = false;
let adminAlertTimer = null;

function ocultarAlertaAdmin() {
  const card = document.getElementById('adminAlertCard');
  if (!card) return;
  if (adminAlertTimer) {
    clearTimeout(adminAlertTimer);
    adminAlertTimer = null;
  }
  card.style.display = 'none';
  card.textContent = '';
}

function mostrarAlertaAdmin(mensaje) {
  const card = document.getElementById('adminAlertCard');
  if (!card) return;
  card.textContent = mensaje || 'No tienes permisos para acceder a este panel.';
  card.style.display = 'block';
  if (adminAlertTimer) {
    clearTimeout(adminAlertTimer);
  }
  adminAlertTimer = setTimeout(() => {
    ocultarAlertaAdmin();
  }, 7000);
}

async function loginAdmin(event) {
  event.preventDefault();
  ocultarAlertaAdmin();

  if (adminLoginEnProceso) {
    return false;
  }

  const usuario = event.target.usuario.value.trim();
  const password = event.target.password.value.trim();
  const botonIngresar = event.target.querySelector('button[type="submit"]');

  if (!usuario || !password) {
    await Swal.fire({
      icon: 'warning',
      title: 'Campos obligatorios',
      text: 'Ingresa correo y contraseña.'
    });
    return false;
  }

  adminLoginEnProceso = true;
  if (botonIngresar) {
    botonIngresar.disabled = true;
  }

  try {
    const solicitarCodigo = async () => {
      const response = await fetch('/api/auth/admin/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: usuario, contraseña: password })
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'No se pudo iniciar el proceso de confirmación.');
      }

      return result;
    };

    let segundosReenvio = 60;
    let intervaloReenvio = null;
    let codigoEnviado = false;
    let errorEnvioCodigo = '';
    let errorPermisosAdmin = '';

    const actualizarBotonReenvio = () => {
      const denyBtn = Swal.getDenyButton();
      if (!denyBtn) return;

      if (!codigoEnviado) {
        denyBtn.textContent = errorEnvioCodigo ? 'Reintentar envío' : 'Enviando...';
        denyBtn.disabled = !errorEnvioCodigo;
        denyBtn.classList.toggle('swal2-disabled', !errorEnvioCodigo);
        return;
      }

      if (segundosReenvio > 0) {
        denyBtn.textContent = `Reenviar código (${segundosReenvio}s)`;
        denyBtn.disabled = true;
        denyBtn.classList.add('swal2-disabled');
      } else {
        denyBtn.textContent = 'Reenviar código';
        denyBtn.disabled = false;
        denyBtn.classList.remove('swal2-disabled');
      }
    };

    const promptCode = await Swal.fire({
      title: 'Confirmar acceso',
      text: 'Ingresa el código de 6 dígitos. Si aún no llegó, espera unos segundos y verifica tu correo.',
      input: 'text',
      inputLabel: 'Código de 6 dígitos',
      inputPlaceholder: 'Ej: 123456',
      inputAttributes: { maxlength: '6', autocapitalize: 'off', autocorrect: 'off' },
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: 'Verificar',
      denyButtonText: 'Reenviar código (60s)',
      cancelButtonText: 'Cancelar',
      showLoaderOnConfirm: true,
      allowOutsideClick: () => !Swal.isLoading(),
      didOpen: () => {
        actualizarBotonReenvio();

        (async () => {
          try {
            await solicitarCodigo();
            codigoEnviado = true;
            errorEnvioCodigo = '';
            Swal.resetValidationMessage();
            const htmlContainer = Swal.getHtmlContainer();
            if (htmlContainer) {
              htmlContainer.style.display = 'block';
              htmlContainer.textContent = 'Código enviado. Revisa el correo del administrador e ingrésalo aquí.';
            }

            actualizarBotonReenvio();
            intervaloReenvio = window.setInterval(() => {
              if (segundosReenvio > 0) {
                segundosReenvio -= 1;
                actualizarBotonReenvio();
              }
            }, 1000);
          } catch (error) {
            codigoEnviado = false;
            errorEnvioCodigo = error.message || 'No se pudo enviar el código de confirmación.';
            Swal.showValidationMessage(errorEnvioCodigo);
            actualizarBotonReenvio();
          }
        })();
      },
      preDeny: async () => {
        if (!codigoEnviado && !errorEnvioCodigo) {
          return false;
        }

        if (codigoEnviado && segundosReenvio > 0) {
          return false;
        }

        try {
          const denyBtn = Swal.getDenyButton();
          if (denyBtn) {
            denyBtn.disabled = true;
            denyBtn.classList.add('swal2-disabled');
            denyBtn.textContent = 'Reenviando...';
          }

          await solicitarCodigo();
          codigoEnviado = true;
          errorEnvioCodigo = '';

          Swal.resetValidationMessage();
          const htmlContainer = Swal.getHtmlContainer();
          if (htmlContainer) {
            htmlContainer.style.display = 'block';
            htmlContainer.textContent = 'Código reenviado. Revisa tu correo e ingrésalo aquí.';
          }
        } catch (error) {
          codigoEnviado = false;
          errorEnvioCodigo = error.message || 'No se pudo reenviar el código.';
          Swal.showValidationMessage(errorEnvioCodigo);
        }

        segundosReenvio = 60;
        actualizarBotonReenvio();
        return false;
      },
      willClose: () => {
        if (intervaloReenvio) {
          clearInterval(intervaloReenvio);
          intervaloReenvio = null;
        }
      },
      preConfirm: async (value) => {
        const codigo = String(value || '').trim();
        if (!/^\d{6}$/.test(codigo)) {
          Swal.showValidationMessage('Ingresa un código numérico de 6 dígitos.');
          return false;
        }

        if (!codigoEnviado) {
          Swal.showValidationMessage(errorEnvioCodigo || 'Aún estamos enviando el código. Intenta en unos segundos.');
          return false;
        }

        try {
          const verifyResponse = await fetch('/api/auth/admin/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correo: usuario,
              codigo
            })
          });

          const verifyResult = await verifyResponse.json().catch(() => ({}));
          if (!verifyResponse.ok) {
            const mensajeBackend = String(verifyResult.error || '').trim();
            if (/permisos? de administrador/i.test(mensajeBackend)) {
              return { __noAdmin: true, message: mensajeBackend || 'Esta cuenta no tiene permisos de administrador.' };
            }
            Swal.showValidationMessage(mensajeBackend || 'Código incorrecto. Verifica e intenta nuevamente.');
            return false;
          }

          const rol = String(verifyResult?.usuario?.rol || '').toLowerCase().trim();
          const esSuperadmin = Number(verifyResult?.usuario?.es_superadmin || 0) === 1;
          if (rol !== 'admin' || !esSuperadmin) {
            return { __noAdmin: true, message: 'Solo el administrador de la plataforma puede iniciar sesión aquí.' };
          }

          return verifyResult;
        } catch (error) {
          Swal.showValidationMessage(error.message || 'No se pudo enviar el código de confirmación.');
          return false;
        }
      }
    });

    if (!promptCode.isConfirmed) {
      if (errorPermisosAdmin) mostrarAlertaAdmin(errorPermisosAdmin);
      return false;
    }

    const verifyResult = promptCode.value;

    if (verifyResult && verifyResult.__noAdmin) {
      mostrarAlertaAdmin(verifyResult.message || 'Esta cuenta no tiene permisos de administrador.');
      return false;
    }

    localStorage.setItem('token', verifyResult.token);
    localStorage.setItem('rol', 'admin');
    localStorage.setItem('es_superadmin', Number(verifyResult?.usuario?.es_superadmin || 0) === 1 ? '1' : '0');
    localStorage.removeItem('panel_destino');

    window.location.href = '../bienvenido_admin/b_admin.html';
  } catch (_err) {
    await Swal.fire({
      icon: 'error',
      title: 'Error',
      text: _err?.message || 'No se pudo conectar con el servidor.'
    });
  } finally {
    adminLoginEnProceso = false;
    if (botonIngresar) {
      botonIngresar.disabled = false;
    }
  }

  return false;
}

document.getElementById('formLoginAdmin')?.addEventListener('submit', loginAdmin);