/**
 * Validador de correo real para Tu Refugio.
 * Bloquea dominios desechables / temporales conocidos.
 */
(function(global) {
  const DOMINIOS_BLOQUEADOS = new Set([
    // ── Servicios temporales de 10/20/60 minutos ──
    '10minutemail.com','10minutemail.net','10minutemail.org',
    '10minutemail.co.uk','10minutemail.de','10minutemail.us',
    '10minutemail.info','20minutemail.com','60minutemail.com',
    'tempmail.com','tempmail.net','tempmail.org','tempmail.io',
    'temp-mail.org','temp-mail.io','temp-mail.de',
    'temporaryemail.net','temporaryemail.us','temporaryinbox.com',
    'temporaryforwarding.com','temporarymailaddress.com',
    'tempr.email','tmpmail.net','tmpmail.org',

    // ── Mailinator y familia ──
    'mailinator.com','mailinator.net','mailinator.org',
    'mailinater.com','suremail.info','chammy.info',
    'tradermail.info','streetwisemail.com','veryrealemail.com',
    'bearsarefuzzy.com','spamornot.com','binkmail.com',
    'bob.emailto.de','bodhi.lawlita.com',

    // ── Guerrilla Mail ──
    'guerrillamail.com','guerrillamail.info','guerrillamail.biz',
    'guerrillamail.de','guerrillamail.net','guerrillamail.org',
    'guerrillamailblock.com','grr.la','spam4.me',

    // ── YopMail ──
    'yopmail.com','yopmail.fr','yopmail.net','yopmail.pp.ua',
    'cool.fr.nf','jetable.fr.nf','nospam.ze.tc','nomail.xl.cx',
    'mega.zik.dj','speed.1s.fr','courriel.fr.nf',
    'moncourrier.fr.nf','monemail.fr.nf','monmail.fr.nf',

    // ── Trash Mail / Trashmail ──
    'trashmail.com','trashmail.me','trashmail.net','trashmail.org',
    'trashmail.io','trashmail.at','trashmail.de','trashmail.xyz',
    'trashmailer.com','trashmails.com','trashdevil.com','trashdevil.de',
    'trashemail.de','trash-mail.at','trash-mail.io','trash-mail.net',
    'mail4trash.com','mytrashmail.com','opentrash.com',

    // ── Discard / Dispostable ──
    'discard.email','dispostable.com','discardmail.com','discardmail.de',

    // ── Throwaway / Throwmail ──
    'throwam.com','throwaway.email','throwmail.net',

    // ── Maildrop / Mailnull / Mailnesia ──
    'maildrop.cc','mailnull.com','mailnesia.com',

    // ── Spam* family ──
    'spamgourmet.com','spamgourmet.net','spamgourmet.org',
    'spam.la','spaml.com','spaml.de','spamspot.com',
    'spamthisplease.com','spambob.com','spambob.net','spambob.org',
    'spamcero.com','spamex.com','spamfree.eu','spamfree24.org',
    'spamfree24.de','spamfree24.net','spamfree24.eu',
    'spamfree24.info','spamfree24.com','spamkill.info',
    'spamnot.com','spamoff.de','spamstack.net','spamavert.com',
    'spamtroll.net','spamcannon.com','spamcannon.net','spamhereplease.com',
    'spamgob.com','spaminmotion.com','spamhole.com',
    'nospamfor.us','saynotospams.com',

    // ── Fake / Junk / Crap ──
    'fakeinbox.com','fakemail.net','fakemail.fr',
    'crap.2fh.co','objectmail.com',

    // ── Otros servicios comunes ──
    'sharkasers.com','sharklasers.com','mailforspam.com',
    'emailondeck.com','inboxalias.com','inboxproxy.com',
    'm21.cc','mailbucket.org','mailcat.biz','mailfa.tk',
    'mailbidon.com','mailchop.com','mailimate.com','mailin8r.com',
    'mailismagic.com', 'mailme24.com','mailmetrash.com',
    'mailmoat.com','mailnew.com','mailquack.com',
    'mailseal.de','mailsiphon.com','mailtemp.info',
    'mailtome.de','mailtrash.net','mailtv.net','mailtv.tv',
    'mailzilla.com','mailzilla.org','mailblocks.com',
    'mailandftp.com','mailexpire.com','mailhazard.com',
    'clrmail.com','meltmail.com','meinspamschutz.de',
    'messagebeamer.de','mezimages.net','mmmmail.com',
    'mt2009.com','mt2014.com','mt2015.com',
    'nomail.pw','nomail.top','nobulk.com','noclickemail.com',
    'nnot.net','nogmailspam.info','nowmymail.com',
    'one-time.email','oneoffmail.com','onewaymail.com',
    'pookmail.com','postpro.net','privacy.net','proxymail.eu',
    'rcpt.at','rcode.me','rppkn.com',
    'safe-mail.net','safetypost.de','sandelf.de',
    'schrott-email.de','secretemail.de','secure-mail.biz',
    'shieldedmail.com','shiftmail.com','shitmail.me',
    'shitmail.de','shortmail.net','sneakemail.com',
    'snkmail.com','sofort-mail.de','sofortmail.de',
    'spam.su','spam.care','spam.lol','spam.eu','spam.ac',
    'spamcowboy.com','spamday.com','spamdecoy.net',
    'spamevasion.com','spamherelots.com','spamify.com',
    'spaminator.de','spamslicer.com',
    'spoofmail.de','stuffmail.de',
    'tempe-mail.com','temporalemail.com',
    'thanksnospam.info','thismail.net',
    'tilien.com','tmail.com','tmdrive.com','tmailinator.com',
    'toiea.com','toomail.biz','topranklist.de',
    'turual.com','twinmail.de',
    'umail.net','upliftnow.com','valemail.de',
    'viditag.com','vip-mail.top',
    'w3internet.co.uk','webm4il.info',
    'wegwerfmail.de','wegwerfmail.net','wegwerfmail.org',
    'whyspam.me','wh4f.org',
    'xagloo.com','xemaps.com','xents.com','xmaily.com',
    'xoxy.net','xyzfree.net','yapped.net',
    'zehnminuten.de','zehnminutenmail.de','zetmail.de',
    'zippymail.info','zoemail.com','zoemail.net','zoemail.org',
    'zomg.info',

    // ── Alemanes/Europeos de un solo uso ──
    'einrot.com','trbvm.com','klzlk.com','kurzepost.de',
    'devilspmql.net','wegwerfadresse.de','kasmail.com',
    'klassmaster.com','klassmaster.net','dayrep.com',
    'filzmail.com','frapmail.com','gustr.com',
    'iheartspam.org','inoutmail.de','inoutmail.eu',
    'inoutmail.info','inoutmail.net','internet-e-mail.de',
    'internet-email.de','jnxjn.com','jourrapide.com',
    'letthemeatspam.com','lortemail.dk','lukemail.ovh',
    'meinspamschutz.de','penguincubed.de',
    'plexolan.de','primabananen.net',
    'sachsenpost.de','schafmail.de',

    // ── Rusos / CIS ──
    'pfui.ru','odnorazovoe.ru','vkcode.ru','spam.su',
    'vip.vip',

    // ── Otros notables ──
    'mailinator.co.uk','urhen.com','put2.net',
    'disign-concept.eu','disign-revelation.com',
    'discardmail.com','discardmail.de',
    'disposal.cf','disposal.ga','disposal.ml',
    'disposemail.com','disposable-email.ml',
    'disposableaddress.com','disposableemailaddresses.com',
    'disposableemailaddresses.emailmiser.com',
    'disposableinbox.com','disposablemail.ga',
    'disposablemails.com',
    'emailtemporal.org','emailto.de',
    'emailondeck.com','emailsensei.com',
    'fastacura.com','fastchevy.com','fastchrysler.com',
    'fastkia.com','fastlexus.com','fastmazda.com',
    'fastmitsubishi.com','fastnissan.com','fastsubaru.com',
    'fasttoyota.com','fastyamaha.com',
    'getonemail.com','getonemail.net',
    'incognitomail.com','incognitomail.net','incognitomail.org',
    'instant-mail.de','instantemailaddress.com',
    'jetable.com','jetable.fr.nf','jetable.net','jetable.org',
    'jnxjn.com','kasmail.com',
    'link2mail.net','litedrop.com','lol.ovpn.to',
    'lookugly.com','ox.ax',
    'pancakemail.com','pay4email.de',
    'pepbot.com','pimpedupmyspace.com',
    'podzone.net','podzone.org','politikerclub.de',
    'poofy.org','postalmail.cf','postinbox.com',
    'powered.name','prtnx.com','pseudoname.io',
    'punkass.com','pushmail.fun','quickinbox.com',
    'rklips.com','rmqkr.net','royal.net',
    'rtrtr.com','rubens.nl','ruffrey.com','rumgel.com',
    'rxan.de','s0ny.net','saynotospams.com',
    'sent.as','services391.com','sibmail.com',
    'socozy.net','solvemail.info','soodonims.com',
    'stop-my-spam.com','stopspam.org',
    'svip.club','teleworm.com','teleworm.us',
    'teln.us','temblar.com','temp-inbox.com',
    'temp-mail.pp.ua','tempail.com','tempalias.com',
    'tempcloud.in','tempe-mail.com','tempemailco.com',
    'tempinbox.co.uk','tempinbox.com','tempmail.eu',
    'tempmail.us','tempmaila.com','tempr.email',
    'tempsky.com','tempthe.net','thankyou2010.com',
    'throwem.com','tilien.com','tmails.net',
    'tradermail.info','trash-me.com','uggsrock.com',
    'vomoto.com','vpn.st','vulpita.com',
    'vztc.com','weam.de','wi11ow.com',
    'willhackforfood.biz','winemaven.info','wralxalp.com',
    'wronghead.com','wuzup.net','wuzupmail.net',
    'xagloo.co','xagloo.com','xlns.de',
    'yeah.net','yoe.ro','yomail.info',
    'yuurok.com','z1p.biz','za.com',
    'zehnminuten.de',

    // ── TLD-based one-use burners ──
    'mailnull.net','maildevelopment.net',
  ]);

  /**
   * Valida que el correo tenga un dominio real, conocido, y no temporal.
   * @param {string} email
   * @returns {{ valido: boolean, mensaje: string }}
   */
  function validarCorreoReal(email) {
    const valor = (email || '').trim().toLowerCase();

    // 1. Formato básico
    const regexFormato = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!regexFormato.test(valor)) {
      return { valido: false, mensaje: 'El formato del correo electrónico no es válido.' };
    }

    const partes = valor.split('@');
    const dominio = partes[1];

    // 2. Dominio no puede ser solo una IP
    const regexIP = /^\d{1,3}(\.\d{1,3}){3}$/;
    if (regexIP.test(dominio)) {
      return { valido: false, mensaje: 'No se aceptan correos con dirección IP como dominio.' };
    }

    // 3. TLD debe tener al menos 2 caracteres
    const segmentosDominio = dominio.split('.');
    const tld = segmentosDominio[segmentosDominio.length - 1];
    if (tld.length < 2) {
      return { valido: false, mensaje: 'El dominio del correo no parece válido.' };
    }

    // 4. Bloquear dominios temporales conocidos
    if (DOMINIOS_BLOQUEADOS.has(dominio)) {
      return {
        valido: false,
        mensaje: 'Este dominio de correo no está permitido. Por favor usa una dirección de correo real (Gmail, Hotmail, Yahoo u otro proveedor permanente).'
      };
    }

    // 5. Bloquear subdominios de servicios bloqueados (p.ej. user@sub.mailinator.com)
    for (let i = 1; i < segmentosDominio.length - 1; i++) {
      const subdominio = segmentosDominio.slice(i).join('.');
      if (DOMINIOS_BLOQUEADOS.has(subdominio)) {
        return {
          valido: false,
          mensaje: 'Este dominio de correo no está permitido. Por favor usa una dirección de correo real (Gmail, Hotmail, Yahoo u otro proveedor permanente).'
        };
      }
    }

    return { valido: true, mensaje: '' };
  }

  /**
   * Valida que un número de teléfono sea plausiblemente real.
   * Acepta formatos: +573001234567 | 3001234567 | (601) 234-5678 | 601 234 5678
   * @param {string} telefono
   * @returns {{ valido: boolean, mensaje: string }}
   */
  function validarTelefono(telefono) {
    const raw = (telefono || '').trim();

    if (!raw) {
      return { valido: false, mensaje: 'El número de teléfono es obligatorio.' };
    }

    // Permitir solo: dígitos, +, espacios, guiones y paréntesis
    if (/[^0-9+\s\-()]/.test(raw)) {
      return { valido: false, mensaje: 'El teléfono solo puede contener dígitos, +, espacios, guiones y paréntesis.' };
    }

    // Extraer solo dígitos (sin el + del prefijo internacional)
    const soloDigitos = raw.replace(/\D/g, '');

    // Longitud: mínimo 7, máximo 15 (estándar E.164)
    if (soloDigitos.length < 7) {
      return { valido: false, mensaje: 'El teléfono debe tener al menos 7 dígitos.' };
    }
    if (soloDigitos.length > 15) {
      return { valido: false, mensaje: 'El teléfono no puede superar los 15 dígitos.' };
    }

    // Rechazar números con todos los dígitos iguales (ej: 0000000, 1111111)
    if (/^(\d)\1+$/.test(soloDigitos)) {
      return { valido: false, mensaje: 'El número de teléfono no parece real. Verifica que sea correcto.' };
    }

    // Rechazar secuencias obvias (1234567, 12345678, 123456789, 1234567890)
    const secuencias = ['1234567', '12345678', '123456789', '1234567890', '0123456789'];
    if (secuencias.includes(soloDigitos)) {
      return { valido: false, mensaje: 'El número de teléfono no parece real. Verifica que sea correcto.' };
    }

    // Número colombiano local sin prefijo: debe tener 10 dígitos y empezar por 3 (móvil) o 1-8 (fijo con indicativo)
    if (soloDigitos.length === 10 && !/^[1-9]/.test(soloDigitos)) {
      return { valido: false, mensaje: 'El número de teléfono no parece válido para Colombia. Los celulares deben empezar por 3.' };
    }

    return { valido: true, mensaje: '' };
  }

  /**
   * Evalúa la seguridad de la contraseña y reporta requisitos cumplidos.
   * Nivel requerido para registro: "fuerte" o superior.
   * @param {string} password
   * @returns {{ puntaje: number, nivel: string, cumpleMinimo: boolean, requisitos: Array<{label:string, ok:boolean}> }}
   */
  function evaluarSeguridadContrasena(password) {
    const valor = String(password || '');
    const requisitos = [
      { label: 'Mínimo 8 caracteres', ok: valor.length >= 8 },
      { label: 'Al menos una letra mayúscula', ok: /[A-Z]/.test(valor) },
      { label: 'Al menos una letra minúscula', ok: /[a-z]/.test(valor) },
      { label: 'Al menos un número', ok: /\d/.test(valor) },
      { label: 'Al menos un símbolo (!@#$...)', ok: /[^A-Za-z0-9]/.test(valor) },
      { label: 'Sin espacios', ok: !/\s/.test(valor) }
    ];

    const puntaje = requisitos.reduce((acc, req) => acc + (req.ok ? 1 : 0), 0);

    let nivel = 'Muy débil';
    if (puntaje >= 6) nivel = 'Muy fuerte';
    else if (puntaje === 5) nivel = 'Fuerte';
    else if (puntaje === 4) nivel = 'Media';
    else if (puntaje === 3) nivel = 'Básica';

    return {
      puntaje,
      nivel,
      cumpleMinimo: puntaje >= 5,
      requisitos
    };
  }

  // Exponer como global para uso en scripts inline
  global.validarCorreoReal = validarCorreoReal;
  global.validarTelefono = validarTelefono;
  global.evaluarSeguridadContrasena = evaluarSeguridadContrasena;

})(window);
