const express = require('express');
const { verificarToken, soloRoles } = require('../middlewares/auth.middleware');
const db = require('../database');
const { obtenerDestinatariosCampana, encolarCampana, procesarNotificacionesPendientes } = require('../services/notificaciones.service');
const router = express.Router();

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

async function obtenerResumenEntregaCampana(campanaId) {
  const rows = await dbAll(
    `SELECT estado, COUNT(*) AS total
     FROM notificaciones_general
     WHERE referencia_tipo = 'campana_alojamiento'
       AND referencia_id = ?
     GROUP BY estado`,
    [campanaId]
  );

  let enviados = 0;
  let errores = 0;
  let pendientes = 0;
  let omitidos = 0;

  rows.forEach((row) => {
    const estado = String(row.estado || '').toLowerCase();
    const total = Number(row.total || 0);
    if (estado === 'enviado') enviados += total;
    else if (estado === 'error_integracion') errores += total;
    else if (estado === 'omitido_config') omitidos += total;
    else if (estado === 'pendiente_integracion') pendientes += total;
  });

  const detalleRow = await dbGet(
    `SELECT estado, payload_json
     FROM notificaciones_general
     WHERE referencia_tipo = 'campana_alojamiento'
       AND referencia_id = ?
       AND estado IN ('error_integracion', 'omitido_config')
     ORDER BY id DESC
     LIMIT 1`,
    [campanaId]
  );

  let detalleError = null;
  if (detalleRow?.payload_json) {
    try {
      const payload = JSON.parse(detalleRow.payload_json) || {};
      detalleError = String(payload.error || payload.motivo || '').trim() || null;
    } catch (_) {
      detalleError = null;
    }
  }

  return { enviados, errores, pendientes, omitidos, detalleError };
}

function construirUrlAlojamiento(req, idAlojamiento) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/detalles_alojamiento/detalles.html?id=${idAlojamiento}`;
}

function construirMensajeCampana(contenido, urlAlojamiento) {
  const cuerpo = String(contenido || '').trim();
  return `${cuerpo}\n\nConoce esta promoción aquí:\n${urlAlojamiento}`;
}

function humanizarErrorCampana(errorTexto) {
  const texto = String(errorTexto || '').trim();
  if (!texto) {
    return 'No se pudo entregar la campaña. Intenta nuevamente o revisa la configuración del correo.';
  }

  const normalizado = texto.toLowerCase();
  if (normalizado.includes('daily user sending limit exceeded') || normalizado.includes('550-5.4.5')) {
    return 'Gmail alcanzó el límite diario de envíos del correo configurado. Espera unas horas o usa otra cuenta SMTP para continuar enviando campañas.';
  }
  if (normalizado.includes('smtp no configurado')) {
    return 'El correo SMTP no está configurado correctamente. Revisa SMTP_HOST, SMTP_PORT, SMTP_USER y SMTP_PASS.';
  }
  if (normalizado.includes('authentication') || normalizado.includes('invalid login') || normalizado.includes('username and password not accepted')) {
    return 'La autenticación del correo SMTP falló. Verifica usuario, contraseña o clave de aplicación del correo configurado.';
  }
  if (normalizado.includes('no hay turistas con reservas asociadas')) {
    return 'No hay turistas con reservas asociadas a este alojamiento para enviar la campaña.';
  }

  return texto;
}

function normalizarFechaProgramadaLocal(fechaProgramadaRaw) {
  const texto = String(fechaProgramadaRaw || '').trim();
  if (!texto) return null;

  const match = texto.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2})?$/);
  if (!match) return null;

  return `${match[1]} ${match[2]}:00`;
}

router.get('/panel', verificarToken, soloRoles('anfitrion', 'admin'), (req, res) => {
  res.json({ mensaje: `Bienvenido al panel del anfitrión: ${req.user.id}` });
});

// Listar alojamientos del anfitrión logueado
router.get('/alojamientos', verificarToken, soloRoles('anfitrion', 'admin'), (req, res) => {
  const anfitrionId = req.user.id;

  const isAdmin = req.user.rol === 'admin';

  if (!isAdmin) {
    const queryHost = `
      SELECT a.*, u.nombre AS anfitrion
      FROM alojamientos a
      JOIN usuarios u ON a.id_anfitrion = u.id
      WHERE a.id_anfitrion = ?
      ORDER BY a.id DESC
    `;

    db.all(queryHost, [anfitrionId], (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Error obteniendo alojamientos del anfitrión.' });
      }

      res.json(rows);
    });
    return;
  }

  db.get(
    `SELECT COALESCE(es_superadmin, 0) AS es_superadmin FROM usuarios WHERE id = ?`,
    [Number(req.user.id || 0)],
    (flagErr, flagRow) => {
      if (flagErr) {
        console.error(flagErr);
        return res.status(500).json({ error: 'Error validando permisos del administrador.' });
      }

      const esSuperadmin = Number(flagRow?.es_superadmin || 0) === 1;
      const queryAdmin = esSuperadmin
        ? `
          SELECT a.*, u.nombre AS anfitrion
          FROM alojamientos a
          JOIN usuarios u ON a.id_anfitrion = u.id
          ORDER BY a.id DESC
        `
        : `
          SELECT DISTINCT a.*, u.nombre AS anfitrion
          FROM alojamientos a
          JOIN usuarios u ON a.id_anfitrion = u.id
          LEFT JOIN admin_anfitriones aa
            ON aa.anfitrion_id = a.id_anfitrion
           AND aa.admin_id = ?
          LEFT JOIN equipo_alojamiento ea
            ON ea.id_alojamiento = a.id
           AND ea.id_usuario = ?
           AND LOWER(COALESCE(ea.rol, '')) = 'administrador'
           AND COALESCE(ea.estado, '') = 'activo'
          WHERE aa.id IS NOT NULL OR ea.id IS NOT NULL
          ORDER BY a.id DESC
        `;

      const params = esSuperadmin ? [] : [Number(req.user.id || 0), Number(req.user.id || 0)];

      db.all(queryAdmin, params, (err, rows) => {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: 'Error obteniendo alojamientos del administrador.' });
        }

        res.json(rows || []);
      });
    }
  );
});

router.get('/campanas', verificarToken, soloRoles('anfitrion', 'admin'), async (req, res) => {
  try {
    const anfitrionId = Number(req.user.id || 0);
    const alojamientoId = Number(req.query?.alojamiento_id || 0);

    if (!alojamientoId) {
      return res.status(400).json({ error: 'Debes indicar el alojamiento_id.' });
    }

    const alojamiento = await dbGet(
      `SELECT id, id_anfitrion, titulo FROM alojamientos WHERE id = ?`,
      [alojamientoId]
    );

    if (!alojamiento) {
      return res.status(404).json({ error: 'Alojamiento no encontrado.' });
    }

    if (req.user.rol !== 'admin' && Number(alojamiento.id_anfitrion) !== anfitrionId) {
      return res.status(403).json({ error: 'No tienes permiso para este alojamiento.' });
    }

    const campanas = await dbAll(
      `SELECT id, id_alojamiento, asunto, contenido, tipo_envio, fecha_programada, estado,
              destinatarios_total, enviados_total, error_detalle, creado_en, enviado_en
       FROM campanas_alojamiento
       WHERE id_alojamiento = ?
       ORDER BY id DESC
       LIMIT 30`,
      [alojamientoId]
    );

    return res.status(200).json({
      alojamiento: { id: alojamiento.id, titulo: alojamiento.titulo },
      campanas
    });
  } catch (error) {
    console.error('[campanas][listar]', error);
    return res.status(500).json({ error: 'No se pudieron listar las campañas.' });
  }
});

router.post('/campanas', verificarToken, soloRoles('anfitrion', 'admin'), async (req, res) => {
  try {
    const anfitrionId = Number(req.user.id || 0);
    const alojamientoId = Number(req.body?.id_alojamiento || 0);
    const asunto = String(req.body?.asunto || '').trim();
    const contenido = String(req.body?.contenido || '').trim();
    const tipoEnvio = String(req.body?.tipo_envio || 'inmediata').trim().toLowerCase();
    const fechaProgramadaRaw = req.body?.fecha_programada;
    const fechaConfirmada = Number(req.body?.fecha_confirmada || 0) === 1;

    if (!alojamientoId || !asunto || !contenido) {
      return res.status(400).json({ error: 'id_alojamiento, asunto y contenido son obligatorios.' });
    }

    if (!['inmediata', 'programada'].includes(tipoEnvio)) {
      return res.status(400).json({ error: 'tipo_envio debe ser inmediata o programada.' });
    }

    const alojamiento = await dbGet(
      `SELECT id, id_anfitrion, titulo FROM alojamientos WHERE id = ?`,
      [alojamientoId]
    );

    if (!alojamiento) {
      return res.status(404).json({ error: 'Alojamiento no encontrado.' });
    }

    if (req.user.rol !== 'admin' && Number(alojamiento.id_anfitrion) !== anfitrionId) {
      return res.status(403).json({ error: 'No tienes permiso para este alojamiento.' });
    }

    let fechaProgramada = null;
    if (tipoEnvio === 'programada') {
      if (!fechaProgramadaRaw) {
        return res.status(400).json({ error: 'Debes indicar fecha_programada para campañas programadas.' });
      }
      if (!fechaConfirmada) {
        return res.status(400).json({ error: 'Debes establecer la fecha y hora programada con el botón Establecer fecha y hora.' });
      }
      const fecha = new Date(fechaProgramadaRaw);
      if (Number.isNaN(fecha.getTime()) || fecha.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'La fecha programada debe ser futura.' });
      }

      fechaProgramada = normalizarFechaProgramadaLocal(fechaProgramadaRaw);
      if (!fechaProgramada) {
        return res.status(400).json({ error: 'Formato de fecha_programada inválido.' });
      }
    }

    let destinatarios = [];
    if (tipoEnvio === 'programada') {
      destinatarios = await obtenerDestinatariosCampana(alojamientoId);
      if (!destinatarios.length) {
        return res.status(400).json({
          error: 'No hay turistas con reservas asociadas a este alojamiento para enviar la campaña.'
        });
      }
    }

    const urlAlojamiento = construirUrlAlojamiento(req, alojamientoId);
    const mensajeFinal = construirMensajeCampana(contenido, urlAlojamiento);

    const insert = await dbRun(
      `INSERT INTO campanas_alojamiento (
        id_alojamiento, id_anfitrion, asunto, contenido, url_alojamiento, mensaje_final,
        tipo_envio, fecha_programada, estado, destinatarios_total, enviados_total, creado_en
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))` ,
      [
        alojamientoId,
        anfitrionId,
        asunto,
        contenido,
        urlAlojamiento,
        mensajeFinal,
        tipoEnvio,
        fechaProgramada,
        tipoEnvio === 'inmediata' ? 'procesando' : 'programada',
        tipoEnvio === 'inmediata' ? 0 : destinatarios.length,
        0
      ]
    );

    const campana = {
      id: insert.lastID,
      asunto,
      mensaje_final: mensajeFinal
    };

    if (tipoEnvio === 'inmediata') {
      // Procesa la entrega en segundo plano para no retrasar la respuesta al frontend.
      (async () => {
        try {
          const destinatariosInmediata = await obtenerDestinatariosCampana(alojamientoId);
          if (!destinatariosInmediata.length) {
            await dbRun(
              `UPDATE campanas_alojamiento
               SET estado = 'error',
                   destinatarios_total = 0,
                   enviados_total = 0,
                   error_detalle = ?,
                   enviado_en = datetime('now', 'localtime')
               WHERE id = ?`,
              ['No hay turistas con reservas asociadas a este alojamiento para enviar la campaña.', campana.id]
                          [humanizarErrorCampana('No hay turistas con reservas asociadas a este alojamiento para enviar la campaña.'), campana.id]
            );
            return;
          }

          await dbRun(
            `UPDATE campanas_alojamiento
             SET destinatarios_total = ?
             WHERE id = ?`,
            [destinatariosInmediata.length, campana.id]
          );

          await encolarCampana(campana, destinatariosInmediata);
          await procesarNotificacionesPendientes({
            limit: 200,
            scope: 'campanas',
            referenciaId: campana.id
          });
          const resumen = await obtenerResumenEntregaCampana(campana.id);
          await dbRun(
            `UPDATE campanas_alojamiento
             SET estado = ?,
                 enviados_total = ?,
                 error_detalle = ?,
                 enviado_en = datetime('now', 'localtime')
             WHERE id = ?`,
            [
              resumen.enviados > 0 ? 'enviada' : 'error',
              resumen.enviados,
              resumen.enviados === 0 ? (resumen.detalleError || 'La campaña no pudo entregarse correctamente.') : null,
              resumen.enviados === 0 ? humanizarErrorCampana(resumen.detalleError || 'La campaña no pudo entregarse correctamente.') : null,
              campana.id
            ]
          );
        } catch (err) {
          console.error('[campanas][inmediata][background]', err);
          await dbRun(
            `UPDATE campanas_alojamiento
             SET estado = 'error',
                 error_detalle = ?,
                 enviado_en = datetime('now', 'localtime')
             WHERE id = ?`,
            [String(err?.message || err || 'Error en envío inmediato de campaña.'), campana.id]
            [humanizarErrorCampana(String(err?.message || err || 'Error en envío inmediato de campaña.')), campana.id]
          ).catch(() => {});
        }
      })();
    }

    return res.status(201).json({
      mensaje: tipoEnvio === 'inmediata'
        ? 'Campaña enviada y en proceso de entrega por correo.'
        : 'Campaña programada correctamente.',
      campana: {
        id: campana.id,
        id_alojamiento: alojamientoId,
        asunto,
        tipo_envio: tipoEnvio,
        fecha_programada: fechaProgramada,
        url_alojamiento: urlAlojamiento,
        destinatarios_total: tipoEnvio === 'inmediata' ? 0 : destinatarios.length,
        estado: tipoEnvio === 'inmediata' ? 'procesando' : 'programada'
      }
    });
  } catch (error) {
    console.error('[campanas][crear]', error);
    return res.status(500).json({ error: 'No se pudo crear la campaña.' });
  }
});

module.exports = router;
