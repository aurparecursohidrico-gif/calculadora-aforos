/**
 * Calculadora de Aforos · AURPA
 * Recibe los aforos que envía la calculadora y los guarda en Google Drive:
 *
 *   Aforos AURPA/
 *     <Método>/                              (Molinete, Volumétrico, Flotador, Vertedero, Parshall)
 *       Resumen de aforos – <Método>         (todos los sitios de ese método; no se mezclan métodos)
 *       <Sitio>/
 *         Resumen de aforos – <Sitio>        (una fila por aforo, con enlace)
 *         <Sitio> – 2026-10-26/
 *           Aforo 08h15 · Molinete · 180,51 L/s
 *         <Sitio> – 2026-11-03/
 *           Aforo 09h40 · Molinete · 172,30 L/s
 *
 *     Usuarios de la app (no compartir)      (cuentas: usuario, nombre, rol; las contraseñas se guardan como huella)
 *     Ubicaciones de sitios (app)            (latitud y longitud de cada punto de aforo para el mapa)
 *
 * La app pide iniciar sesión: todas las acciones (guardar, consultar datos, ubicar, usuarios) exigen un token.
 * La primera persona que entra, mientras no hay usuarios, crea la cuenta de administrador.
 *
 * Roles:
 *   admin    → todo: guardar aforos, subir lluvias, ubicar sitios, crear usuarios y actualizar resoluciones CVC.
 *   usuario  → guarda aforos y consulta todas las herramientas, incluidas las resoluciones CVC (no edita lo demás).
 *   otros    → solo consulta las herramientas; NO ve las resoluciones CVC (temas legales).
 *   zonaalta → «Usuario zona alta»: solo la calculadora y la tabla de caudales con SUS PROPIOS aforos.
 *              Sus aforos se guardan aparte, en la carpeta «Aforos usuarios zona alta» (Método › Sitio › Sitio – fecha).
 *
 * Se instala UNA vez desde la cuenta aurparecursohidrico@gmail.com
 * (Implementar → Nueva implementación → Aplicación web).
 */

var CARPETA_RAIZ = 'Aforos AURPA';
var MAX_BYTES = 200000;     // tamaño máximo de un aforo recibido
var MAX_MAPA = 4000000;     // tamaño máximo de un mapa de lluvias (imagen en base64)

function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : '';
    if (!raw || raw.length > MAX_MAPA) return responder({ ok: false, error: 'Datos vacíos o demasiado grandes.' });
    var a = JSON.parse(raw);
    var accion = String(a.accion || 'guardar');
    if (accion !== 'subirMapa' && accion !== 'subirPaginaResolucion' && raw.length > MAX_BYTES) return responder({ ok: false, error: 'Datos demasiado grandes.' });

    // Sin sesión: solo iniciar sesión, consultar si falta el primer administrador o crearlo.
    if (accion === 'login') return responder(login(a));
    if (accion === 'estado') return responder({ ok: true, necesitaAdmin: !hayUsuarios() });
    if (accion === 'primerAdmin') return responder(primerAdmin(a));

    var ses = sesion(a.token);
    if (!ses) return responder({ ok: false, sesion: false, error: 'Tu sesión venció. Vuelve a iniciar sesión.' });
    var za = ses.rol === 'zonaalta';
    if (accion === 'cambiarClave') return responder(cambiarClave(ses, a));
    // Usuario zona alta: solo sus propios aforos (y los sitios de su carpeta); nada más de la app.
    if (za && accion === 'datos') return responder({ ok: true, aforos: {}, zonaAlta: aforosZonaAlta(ses.usuario), sitios: sitiosZonaAlta(), ubicaciones: {} });
    if (za && accion === 'sitios') return responder({ ok: true, sitios: sitiosZonaAlta() });
    if (za && accion !== 'guardar') return responder({ ok: false, error: 'Tu usuario solo tiene acceso a la calculadora y a la tabla de tus aforos.' });
    if (accion === 'datos') return responder({ ok: true, aforos: aforosPorMetodo(), zonaAlta: aforosZonaAlta(null), sitios: listarSitios(), ubicaciones: leerUbicaciones() });
    if (accion === 'sitios') return responder({ ok: true, sitios: listarSitios() });
    if (accion === 'lluvias') return responder({ ok: true, dias: leerLluvias(), areas: leerAreas(), mapas: listarMapas() });
    if (accion === 'mapaLluvia') return responder(leerMapa(a.mes));
    if (accion === 'resoluciones' || accion === 'resolucionPagina') {
      if (ses.rol === 'otros') return responder({ ok: false, error: 'Tu usuario no tiene acceso a las resoluciones CVC.' });
      if (accion === 'resoluciones') return responder(leerResoluciones());
      return responder(paginaResolucion(a));
    }
    if (accion === 'guardar' && ses.rol === 'otros') return responder({ ok: false, error: 'Tu usuario no puede guardar aforos en el Drive.' });
    var SOLO_ADMIN = ['ubicar', 'usuarios', 'crearUsuario', 'estadoUsuario', 'subirLluvias', 'subirMapa',
      'guardarResolucion', 'subirPaginaResolucion', 'recortarResolucion', 'eliminarResolucion'];
    if (SOLO_ADMIN.indexOf(accion) >= 0) {
      if (ses.rol !== 'admin') return responder({ ok: false, error: 'Solo un administrador puede hacer esto.' });
      if (accion === 'guardarResolucion') return responder(guardarResolucion(ses, a));
      if (accion === 'subirPaginaResolucion') return responder(subirPaginaResolucion(a));
      if (accion === 'recortarResolucion') return responder(recortarResolucion(a));
      if (accion === 'eliminarResolucion') return responder(eliminarResolucion(a));
      if (accion === 'subirLluvias') return responder(subirLluvias(ses, a));
      if (accion === 'subirMapa') return responder(subirMapa(ses, a));
      if (accion === 'ubicar') return responder(guardarUbicacion(ses, a));
      if (accion === 'usuarios') return responder({ ok: true, usuarios: listarUsuarios() });
      if (accion === 'crearUsuario') return responder(crearUsuario(a));
      if (accion === 'estadoUsuario') return responder(estadoUsuario(ses, a));
    }
    if (accion !== 'guardar') return responder({ ok: false, error: 'Acción desconocida.' });
    if (!a.responsable || za) a.responsable = ses.nombre;   // en zona alta el responsable es siempre quien guarda

    var predio = limpiarNombre(a.predio, 80);
    if (!predio) return responder({ ok: false, error: 'Falta el nombre del predio.' });

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var carpetaDelMetodo = za ? buscarOCrear(carpetaZonaAlta(), nombreMetodo(a.metodo)) : carpetaMetodo(nombreMetodo(a.metodo));
      var carpeta = carpetaPredio(predio, carpetaDelMetodo);
      var resumen = conUsuario(hojaResumen(carpeta, predio));

      // Si este aforo ya se había guardado (reintento sin señal), no se duplica.
      var id = limpiar(a.id, 60);
      var previo = buscarPorId(resumen, id);
      if (previo) return responder({ ok: true, repetido: true, carpeta: carpeta.getUrl(), archivo: previo });

      var dia = carpetaFecha(carpeta, a.fecha);
      var archivo = crearHojaAforo(dia, a, predio);
      var valores = {
        'Sitio': carpeta.getName(), 'Fecha': limpiar(a.fecha, 20), 'Hora': limpiar(a.hora, 10), 'Método': limpiar(a.metodo, 40),
        'Caudal (L/s)': numero(a.q_ls), 'Caudal (m³/s)': numero(a.q_m3s),
        'Mira inicial (cm)': numero(a.mira_ini != null ? a.mira_ini : dato(a, /mira inicial/i)),
        'Mira final (cm)': numero(a.mira_fin != null ? a.mira_fin : dato(a, /mira final/i)),
        'Sitio de medición': limpiar(a.sitio, 80), 'Responsable': limpiar(a.responsable, 80),
        'Archivo': archivo.getUrl(), 'ID': id, 'Guardado': new Date(), 'Carpeta': dia.getUrl(), 'Usuario': ses.usuario
      };
      agregarFila(resumen, valores);
      numerar(resumen);
      var delMetodo = conUsuario(hojaResumenMetodo(carpetaDelMetodo));
      agregarFila(delMetodo, valores);
      numerar(delMetodo);
      return responder({ ok: true, carpeta: dia.getUrl(), nombre: dia.getName(), archivo: archivo.getUrl() });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return responder({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  // Los datos ya no se entregan sin iniciar sesión: solo se informa que el servicio está activo.
  return responder({ ok: true, servicio: 'App de Aforos AURPA', necesitaAdmin: !hayUsuarios() });
}

// =====================================================================
// USUARIOS Y SESIONES
// Hoja "Usuarios de la app (no compartir)" en la carpeta principal.
// Las contraseñas no se guardan: solo una huella (SHA-256 con sal, repetida).
// =====================================================================
var HOJA_USUARIOS = 'Usuarios de la app (no compartir)';
var DIAS_SESION = 30;

function hojaUsuarios() {
  var raiz = carpetaRaiz();
  var it = raiz.getFilesByName(HOJA_USUARIOS);
  if (it.hasNext()) return SpreadsheetApp.open(it.next()).getSheets()[0];
  var ss = SpreadsheetApp.create(HOJA_USUARIOS);
  DriveApp.getFileById(ss.getId()).moveTo(raiz);
  var sh = ss.getSheets()[0];
  sh.setName('Usuarios');
  sh.appendRow(['Usuario', 'Nombre', 'Rol', 'Activo', 'Sal', 'Huella', 'Creado', 'Último ingreso']);
  sh.getRange(1, 1, 1, 8).setFontWeight('bold').setBackground('#e6f3e2');
  sh.setFrozenRows(1);
  sh.hideColumns(5, 2);
  return sh;
}
function filasUsuarios() {
  var sh = hojaUsuarios(), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 9).getValues().map(function (r, i) {
    return { fila: i + 2, usuario: String(r[0]), nombre: String(r[1]), rol: String(r[2]), activo: r[3] === true || String(r[3]).toUpperCase() === 'SI', sal: String(r[4]), huella: String(r[5]),
      grafica: r[8] === true || String(r[8]).toUpperCase() === 'SI' };
  });
}
function hayUsuarios() { return filasUsuarios().length > 0; }
function usuarioValido(u) { return /^[a-z0-9._-]{3,30}$/.test(u); }
function huella(sal, clave) {
  var h = sal + '|' + clave;
  for (var i = 0; i < 300; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + '|' + sal, Utilities.Charset.UTF_8)
      .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
  }
  return h;
}
function nuevaSal() { return Utilities.getUuid().replace(/-/g, ''); }

function login(a) {
  var u = String(a.usuario || '').trim().toLowerCase(), clave = String(a.clave || '');
  var cache = CacheService.getScriptCache(), kFallos = 'fallos_' + u;
  var fallos = Number(cache.get(kFallos) || 0);
  if (fallos >= 5) return { ok: false, error: 'Demasiados intentos. Espera 10 minutos e inténtalo de nuevo.' };
  var usr = filasUsuarios().filter(function (x) { return x.usuario === u; })[0];
  if (!usr || !usr.activo || huella(usr.sal, clave) !== usr.huella) {
    cache.put(kFallos, String(fallos + 1), 600);
    return { ok: false, error: 'Usuario o contraseña incorrectos.' };
  }
  cache.remove(kFallos);
  hojaUsuarios().getRange(usr.fila, 8).setValue(new Date());
  return abrirSesion(usr);
}
function abrirSesion(usr) {
  var props = PropertiesService.getScriptProperties();
  limpiarSesiones(props);
  var token = Utilities.getUuid() + Utilities.getUuid().slice(0, 8);
  var exp = Date.now() + DIAS_SESION * 864e5;
  props.setProperty('S_' + token, JSON.stringify({ u: usr.usuario, n: usr.nombre, r: usr.rol, exp: exp }));
  return { ok: true, token: token, usuario: usr.usuario, nombre: usr.nombre, rol: usr.rol, exp: exp };
}
function sesion(token) {
  if (!token || !/^[A-Za-z0-9-]{20,80}$/.test(String(token))) return null;
  var s = PropertiesService.getScriptProperties().getProperty('S_' + token);
  if (!s) return null;
  s = JSON.parse(s);
  if (s.exp < Date.now()) return null;
  // Si el usuario fue desactivado, la sesión deja de valer.
  var usr = filasUsuarios().filter(function (x) { return x.usuario === s.u; })[0];
  if (!usr || !usr.activo) return null;
  return { usuario: usr.usuario, nombre: usr.nombre, rol: usr.rol };
}
function limpiarSesiones(props) {
  var all = props.getProperties(), ahora = Date.now();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('S_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < ahora) props.deleteProperty(k); } catch (e) { props.deleteProperty(k); }
  });
}
// Solo funciona mientras no exista ningún usuario: así la primera persona en entrar crea su cuenta de administrador.
function primerAdmin(a) {
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (hayUsuarios()) return { ok: false, error: 'Ya hay un administrador. Inicia sesión.' };
    var r = crearUsuario({ usuario: a.usuario, nombre: a.nombre, clave: a.clave, rol: 'admin' });
    if (!r.ok) return r;
    return abrirSesion(filasUsuarios()[0]);
  } finally { lock.releaseLock(); }
}
function crearUsuario(a) {
  var u = String(a.usuario || '').trim().toLowerCase(), nombre = limpiar(a.nombre, 60), clave = String(a.clave || '');
  var rol = rolValido(a.rol);
  if (!usuarioValido(u)) return { ok: false, error: 'El usuario debe tener de 3 a 30 letras minúsculas, números, punto o guion (sin espacios ni tildes).' };
  if (!nombre) return { ok: false, error: 'Escribe el nombre de la persona.' };
  if (clave.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
  if (filasUsuarios().some(function (x) { return x.usuario === u; })) return { ok: false, error: 'Ya existe un usuario con ese nombre.' };
  var sal = nuevaSal();
  hojaUsuarios().appendRow([u, nombre, rol, true, sal, huella(sal, clave), new Date(), '']);
  return { ok: true };
}
function listarUsuarios() {
  return filasUsuarios().map(function (x) { return { usuario: x.usuario, nombre: x.nombre, rol: x.rol, activo: x.activo, grafica: x.grafica }; });
}
function estadoUsuario(ses, a) {
  var u = String(a.usuario || '').toLowerCase();
  if (u === ses.usuario) return { ok: false, error: 'No puedes desactivar tu propio usuario.' };
  var usr = filasUsuarios().filter(function (x) { return x.usuario === u; })[0];
  if (!usr) return { ok: false, error: 'No existe ese usuario.' };
  var sh = hojaUsuarios();
  if (a.clave) {   // restablecer contraseña
    if (String(a.clave).length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    var sal = nuevaSal();
    sh.getRange(usr.fila, 5, 1, 2).setValues([[sal, huella(sal, String(a.clave))]]);
  }
  if (typeof a.activo === 'boolean') sh.getRange(usr.fila, 4).setValue(a.activo);
  if (a.rol) sh.getRange(usr.fila, 3).setValue(rolValido(a.rol));   // cambiar el rol (no el propio: se revisa arriba)
  if (typeof a.grafica === 'boolean') {   // ¿sus aforos van en «Lluvias vs caudales»?
    if (!sh.getRange(1, 9).getValue()) sh.getRange(1, 9).setValue('Aforos en gráfica').setFontWeight('bold');
    sh.getRange(usr.fila, 9).setValue(a.grafica ? 'SI' : 'NO');
  }
  return { ok: true };
}
function rolValido(r) { return r === 'admin' || r === 'otros' || r === 'zonaalta' ? r : 'usuario'; }
function cambiarClave(ses, a) {
  var usr = filasUsuarios().filter(function (x) { return x.usuario === ses.usuario; })[0];
  if (!usr || huella(usr.sal, String(a.actual || '')) !== usr.huella) return { ok: false, error: 'La contraseña actual no es correcta.' };
  if (String(a.nueva || '').length < 6) return { ok: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
  var sal = nuevaSal();
  hojaUsuarios().getRange(usr.fila, 5, 1, 2).setValues([[sal, huella(sal, String(a.nueva))]]);
  return { ok: true };
}

// =====================================================================
// DATOS PARA LA APP: caudales por método (fecha y Q) y ubicación de los sitios
// =====================================================================
function aforosPorMetodo() {
  var cuentan = {};
  filasUsuarios().forEach(function (x) { if (x.rol === 'admin' || x.grafica) cuentan[x.usuario] = true; });
  var out = aforosDeCarpeta(carpetaRaiz(), null);
  Object.keys(out).forEach(function (m) { out[m].forEach(function (x) { x.g = !x.u || !!cuentan[x.u]; }); });
  return out;
}
// Aforos de los usuarios zona alta (de uno solo si se da su usuario), con el nombre de quien lo hizo.
function aforosZonaAlta(usuario) {
  var c = carpetaZonaAlta(false);
  return c ? aforosDeCarpeta(c, usuario) : {};
}
function aforosDeCarpeta(base, soloUsuario) {
  var out = {}, metodos = METODOS.map(normalizar);
  var it = base.getFolders();
  while (it.hasNext()) {
    var carpeta = it.next(); if (carpeta.isTrashed()) continue;   // lo que está en la papelera no cuenta
    var k = metodos.indexOf(normalizar(carpeta.getName()));
    if (k < 0) continue;
    var f = carpeta.getFilesByName('Resumen de aforos – ' + carpeta.getName());
    if (!f.hasNext()) continue;
    var ss = SpreadsheetApp.open(f.next()), sh = ss.getSheets()[0], tz = ss.getSpreadsheetTimeZone();
    var n = sh.getLastRow() - 1; if (n < 1) continue;
    var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var c = function (t) { return enc.indexOf(t); };
    var valores = sh.getRange(2, 1, n, enc.length).getValues();
    completarFechasFaltantes(sh, valores, enc);
    out[METODOS[k]] = valores.map(function (r) {
      var fe = r[c('Fecha')], ho = r[c('Hora')];
      return {
        s: String(r[c('Sitio')] || ''),
        f: fe instanceof Date ? Utilities.formatDate(fe, tz, 'yyyy-MM-dd') : String(fe || ''),
        h: ho instanceof Date ? Utilities.formatDate(ho, tz, 'HH:mm') : String(ho || ''),
        q: numero(r[c('Caudal (L/s)')]),
        mi: c('Mira inicial (cm)') >= 0 ? numero(r[c('Mira inicial (cm)')]) : '',
        r: c('Responsable') >= 0 ? String(r[c('Responsable')] || '') : '',
        u: c('Usuario') >= 0 ? String(r[c('Usuario')] || '') : ''
      };
    }).filter(function (x) { return x.s && x.f && x.q !== '' && (!soloUsuario || x.u === soloUsuario); });
  }
  return out;
}

// Filas de un resumen que quedaron sin Fecha (u Hora): se recuperan del nombre de la carpeta del aforo
// («<Sitio> – 2026-08-24») y del nombre del archivo («Aforo 08h15 · …»), y se escriben en la hoja.
function completarFechasFaltantes(sh, valores, enc) {
  var cF = enc.indexOf('Fecha'), cH = enc.indexOf('Hora'), cA = enc.indexOf('Archivo'), cC = enc.indexOf('Carpeta'), cQ = enc.indexOf('Caudal (L/s)');
  if (cF < 0) return 0;
  var arreglos = 0;
  valores.forEach(function (r, i) {
    if (r[cF] !== '' && r[cF] !== null) return;
    if (cQ >= 0 && r[cQ] === '') return;
    var carpeta = null, archivo = null, m;
    try {
      if (cC >= 0 && (m = String(r[cC] || '').match(/folders\/([A-Za-z0-9_-]+)/))) carpeta = DriveApp.getFolderById(m[1]);
      if (cA >= 0 && (m = String(r[cA] || '').match(/\/d\/([A-Za-z0-9_-]+)/))) {
        archivo = DriveApp.getFileById(m[1]);
        if (!carpeta) { var p = archivo.getParents(); if (p.hasNext()) carpeta = p.next(); }
      }
    } catch (e) {}
    var f = carpeta && carpeta.getName().match(/(\d{4})-(\d{2})-(\d{2})\s*$/);
    if (!f) return;
    var fecha = new Date(Number(f[1]), Number(f[2]) - 1, Number(f[3]));
    sh.getRange(i + 2, cF + 1).setValue(fecha).setNumberFormat('dd/MM/yyyy');
    r[cF] = fecha;
    var h = archivo && archivo.getName().match(/(\d{1,2})h(\d{2})/);
    if (h && cH >= 0 && (r[cH] === '' || r[cH] === null)) {
      var hora = ('0' + h[1]).slice(-2) + ':' + h[2];
      sh.getRange(i + 2, cH + 1).setNumberFormat('@').setValue(hora);
      r[cH] = hora;
    }
    arreglos++;
  });
  return arreglos;
}
// Ejecutar a mano (opcional): completa las fechas que falten también en el resumen de cada sitio.
function completarFechas() {
  var metodos = METODOS.map(normalizar), it = carpetaRaiz().getFolders();
  while (it.hasNext()) {
    var metodo = it.next(); if (metodo.isTrashed() || metodos.indexOf(normalizar(metodo.getName())) < 0) continue;
    var hojas = [hojaResumenMetodo(metodo)], sitios = metodo.getFolders();
    while (sitios.hasNext()) {
      var s = sitios.next(); if (s.isTrashed()) continue;
      var f = s.getFilesByName('Resumen de aforos – ' + s.getName());
      if (f.hasNext()) hojas.push(SpreadsheetApp.open(f.next()).getSheets()[0]);
    }
    hojas.forEach(function (sh) {
      var n = sh.getLastRow() - 1; if (n < 1) return;
      var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      var k = completarFechasFaltantes(sh, sh.getRange(2, 1, n, enc.length).getValues(), enc);
      if (k) Logger.log(sh.getParent().getName() + ': ' + k + ' fecha(s) recuperada(s)');
    });
  }
}

// =====================================================================
// LLUVIAS: serie diaria de la cuenca por mes y mapas mensuales.
// La app lee el Excel "INFO PLUVIOMETROS DIARIO" y envía la lluvia diaria ya calculada
// (promedio ponderado por área de influencia). Aquí se guarda, reemplazando ese mes.
// =====================================================================
var HOJA_LLUVIAS = 'Lluvias diarias (app)';
var CARPETA_MAPAS = 'Mapas de lluvias (app)';

function libroLluvias() {
  var raiz = carpetaRaiz();
  var it = raiz.getFilesByName(HOJA_LLUVIAS);
  if (it.hasNext()) return SpreadsheetApp.open(it.next());
  var ss = SpreadsheetApp.create(HOJA_LLUVIAS);
  DriveApp.getFileById(ss.getId()).moveTo(raiz);
  var sh = ss.getSheets()[0];
  sh.setName('Lluvia diaria');
  sh.appendRow(['Fecha', 'Lluvia cuenca (mm)', 'Pluviómetros', 'Mes', 'Subido por', 'Subido']);
  sh.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#e6f3e2');
  sh.setFrozenRows(1);
  var ar = ss.insertSheet('Áreas');
  ar.appendRow(['PLUV No', 'Área de influencia']);
  ar.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#e6f3e2');
  return ss;
}
function leerLluvias() {
  var sh = libroLluvias().getSheetByName('Lluvia diaria'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, 3).getValues().map(function (r) {
    return { f: String(r[0]), mm: numero(r[1]), n: numero(r[2]) };
  }).filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d.f) && d.mm !== ''; });
}
function leerAreas() {
  var sh = libroLluvias().getSheetByName('Áreas'), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  sh.getRange(2, 1, n, 2).getValues().forEach(function (r) { var a = numero(r[1]); if (r[0] !== '' && a !== '') out[String(r[0])] = a; });
  return out;
}
function subirLluvias(ses, a) {
  var mes = String(a.mes || '');
  if (!/^\d{4}-\d{2}$/.test(mes)) return { ok: false, error: 'Mes no válido.' };
  var dias = (a.dias || []).filter(function (d) { return d && String(d.f).indexOf(mes) === 0 && numero(d.mm) !== ''; });
  if (!dias.length) return { ok: false, error: 'El archivo no trae lluvias para ese mes.' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var ss = libroLluvias(), sh = ss.getSheetByName('Lluvia diaria');
    // Quitar las filas que ya había de ese mes
    var n = sh.getLastRow() - 1;
    if (n > 0) {
      var meses = sh.getRange(2, 4, n, 1).getValues();
      for (var i = n - 1; i >= 0; i--) if (String(meses[i][0]) === mes) sh.deleteRow(i + 2);
    }
    var ahora = new Date();
    var filas = dias.map(function (d) { return [String(d.f), numero(d.mm), numero(d.n), mes, ses.nombre, ahora]; });
    var inicio = sh.getLastRow() + 1;
    sh.getRange(inicio, 1, filas.length, 1).setNumberFormat('@');   // fecha como texto (aaaa-mm-dd)
    sh.getRange(inicio, 4, filas.length, 1).setNumberFormat('@');
    sh.getRange(inicio, 1, filas.length, 6).setValues(filas);
    sh.getRange(2, 1, sh.getLastRow() - 1, 6).sort({ column: 1, ascending: true });
    // Áreas de influencia: se actualizan las que vengan en el archivo
    var areas = a.areas || {}, ar = ss.getSheetByName('Áreas');
    var actuales = leerAreas();
    Object.keys(areas).forEach(function (k) { if (numero(areas[k]) !== '') actuales[k] = numero(areas[k]); });
    if (ar.getLastRow() > 1) ar.getRange(2, 1, ar.getLastRow() - 1, 2).clearContent();
    var lista = Object.keys(actuales).map(function (k) { return [k, actuales[k]]; });
    if (lista.length) { ar.getRange(2, 1, lista.length, 1).setNumberFormat('@'); ar.getRange(2, 1, lista.length, 2).setValues(lista); }
    return { ok: true, dias: filas.length };
  } finally { lock.releaseLock(); }
}

function carpetaMapas() { return buscarOCrear(carpetaRaiz(), CARPETA_MAPAS); }
function nombreMapa(mes) { return 'Mapa lluvias ' + mes + '.jpg'; }
function mesMapaValido(mes) { return /^\d{4}-\d{2}$/.test(mes) || mes === 'comparativo'; }
function subirMapa(ses, a) {
  var mes = String(a.mes || '');
  if (!mesMapaValido(mes)) return { ok: false, error: 'Mes no válido.' };
  var datos = String(a.imagen || '').replace(/^data:image\/\w+;base64,/, '');
  if (!datos) return { ok: false, error: 'Falta la imagen.' };
  var carpeta = carpetaMapas(), it = carpeta.getFilesByName(nombreMapa(mes));
  while (it.hasNext()) it.next().setTrashed(true);   // reemplaza el mapa anterior de ese mes
  var blob = Utilities.newBlob(Utilities.base64Decode(datos), 'image/jpeg', nombreMapa(mes));
  carpeta.createFile(blob).setDescription('Subido por ' + ses.nombre);
  return { ok: true };
}
function listarMapas() {
  var out = [], it = carpetaMapas().getFiles();
  while (it.hasNext()) { var m = it.next().getName().match(/^Mapa lluvias (\d{4}-\d{2}|comparativo)\.jpg$/); if (m) out.push(m[1]); }
  return out;
}
function leerMapa(mes) {
  mes = String(mes || '');
  if (!mesMapaValido(mes)) return { ok: false, error: 'Mes no válido.' };
  var it = carpetaMapas().getFilesByName(nombreMapa(mes));
  if (!it.hasNext()) return { ok: false, error: 'No hay mapa para ese mes.' };
  return { ok: true, mes: mes, imagen: 'data:image/jpeg;base64,' + Utilities.base64Encode(it.next().getBlob().getBytes()) };
}

var HOJA_UBICACIONES = 'Ubicaciones de sitios (app)';
function hojaUbicaciones() {
  var raiz = carpetaRaiz();
  var it = raiz.getFilesByName(HOJA_UBICACIONES);
  if (it.hasNext()) return SpreadsheetApp.open(it.next()).getSheets()[0];
  var ss = SpreadsheetApp.create(HOJA_UBICACIONES);
  DriveApp.getFileById(ss.getId()).moveTo(raiz);
  var sh = ss.getSheets()[0];
  sh.setName('Ubicaciones');
  sh.appendRow(['Sitio', 'Latitud', 'Longitud', 'Actualizado', 'Por']);
  sh.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#e6f3e2');
  sh.setFrozenRows(1);
  return sh;
}
function leerUbicaciones() {
  var sh = hojaUbicaciones(), n = sh.getLastRow() - 1, out = {};
  if (n < 1) return out;
  sh.getRange(2, 1, n, 3).getValues().forEach(function (r) {
    var lat = numero(r[1]), lon = numero(r[2]);
    if (r[0] && lat !== '' && lon !== '') out[String(r[0])] = [lat, lon];
  });
  return out;
}
function guardarUbicacion(ses, a) {
  var sitio = limpiarNombre(a.sitio, 80), lat = numero(a.lat), lon = numero(a.lon);
  if (!sitio || lat === '' || lon === '' || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: 'Ubicación no válida.' };
  var sh = hojaUbicaciones(), n = sh.getLastRow() - 1, fila = 0;
  if (n > 0) sh.getRange(2, 1, n, 1).getValues().forEach(function (r, i) { if (normalizar(r[0]) === normalizar(sitio)) fila = i + 2; });
  var valores = [[sitio, lat, lon, new Date(), ses.nombre]];
  if (fila) sh.getRange(fila, 1, 1, 5).setValues(valores); else sh.appendRow(valores[0]);
  return { ok: true };
}

// Nombres de las carpetas de sitio (dentro de cada método, o sueltas si aún no se organizaron).
function listarSitios() {
  var raiz = carpetaRaiz();
  var metodos = METODOS.map(normalizar);
  var vistos = {}, lista = [];
  var agregar = function (nombre) { var k = normalizar(nombre); if (!vistos[k]) { vistos[k] = 1; lista.push(nombre); } };
  var it = raiz.getFolders();
  while (it.hasNext()) {
    var f = it.next(); if (f.isTrashed()) continue;
    if (metodos.indexOf(normalizar(f.getName())) >= 0) {
      var it2 = f.getFolders();
      while (it2.hasNext()) { var g = it2.next(); if (!g.isTrashed()) agregar(g.getName()); }
    } else if (!esCarpetaInterna(f.getName())) {   // carpetas internas de la app (p. ej. "Mapas de lluvias (app)") no son sitios
      agregar(f.getName());
    }
  }
  return lista.sort(function (a, b) { return a.localeCompare(b, 'es'); });
}

// ---------- resoluciones CVC (solo con sesión) ----------
// Carpeta "Resoluciones (app)" dentro de la carpeta raíz: resoluciones.json + una subcarpeta por resolución
// con sus páginas (p001.jpg, p002.jpg, …). Nada de esto queda en GitHub: solo se entrega con sesión iniciada.
var CARPETA_RES = 'Resoluciones (app)';
function carpetaResoluciones() {
  var it = carpetaRaiz().getFoldersByName(CARPETA_RES);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}
// Si hay varios resoluciones.json (p. ej. se subió dos veces), vale el más reciente.
function archivoResoluciones(c) {
  var it = c.getFilesByName('resoluciones.json'), mejor = null;
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed()) continue;
    if (!mejor || f.getLastUpdated() > mejor.getLastUpdated()) mejor = f;
  }
  return mejor;
}
function leerResoluciones() {
  var c = carpetaResoluciones();
  if (!c) return { ok: true, resoluciones: [], falta: true };
  var f = archivoResoluciones(c);
  if (!f) return { ok: true, resoluciones: [], falta: true };
  var j = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
  return { ok: true, resoluciones: j.resoluciones || [] };
}

// ----- Actualizar resoluciones desde la app (solo administrador) -----
function idResValido(id) { return /^[a-z0-9-]{1,60}$/.test(String(id || '')); }
function subcarpetaRes(id, crear) {
  var c = carpetaResoluciones() || (crear ? carpetaRaiz().createFolder(CARPETA_RES) : null);
  if (!c) return null;
  var it = c.getFoldersByName(id);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return crear ? c.createFolder(id) : null;
}
function subirPaginaResolucion(a) {
  var id = String(a.id || ''), p = Math.floor(Number(a.p));
  if (!idResValido(id) || !(p >= 1 && p <= 999)) return { ok: false, error: 'Página no válida.' };
  var datos = String(a.imagen || '').replace(/^data:image\/\w+;base64,/, '');
  if (!datos) return { ok: false, error: 'Falta la imagen.' };
  var sub = subcarpetaRes(id, true), nombre = 'p' + ('00' + p).slice(-3) + '.jpg';
  var it = sub.getFilesByName(nombre);
  while (it.hasNext()) it.next().setTrashed(true);   // reemplaza la página anterior
  sub.createFile(Utilities.newBlob(Utilities.base64Decode(datos), 'image/jpeg', nombre));
  return { ok: true };
}
// Quita las páginas que sobran cuando el documento nuevo tiene menos páginas que el anterior.
function recortarResolucion(a) {
  var id = String(a.id || ''), n = Math.floor(Number(a.paginas));
  if (!idResValido(id) || !(n >= 1)) return { ok: false, error: 'Datos no válidos.' };
  var sub = subcarpetaRes(id, false);
  if (!sub) return { ok: true };
  var it = sub.getFiles();
  while (it.hasNext()) {
    var f = it.next(), m = f.getName().match(/^p(\d{3})\.jpg$/);
    if (m && Number(m[1]) > n && !f.isTrashed()) f.setTrashed(true);
  }
  return { ok: true };
}
function escribirResoluciones(lista) {
  var c = carpetaResoluciones() || carpetaRaiz().createFolder(CARPETA_RES);
  var f = archivoResoluciones(c), txt = JSON.stringify({ version: 1, resoluciones: lista }, null, 1);
  if (f) {
    f.setContent(txt);
    var it = c.getFilesByName('resoluciones.json');   // deja uno solo
    while (it.hasNext()) { var g = it.next(); if (g.getId() !== f.getId() && !g.isTrashed()) g.setTrashed(true); }
  } else c.createFile('resoluciones.json', txt, 'application/json');
}
function guardarResolucion(ses, a) {
  var r = a.res || {}, txt = function (v, n) { return limpiar(v, n || 200); };
  var out = {
    id: String(r.id || ''), predio: txt(r.predio, 120), titular: txt(r.titular, 160), numero: txt(r.numero, 80),
    fecha: String(r.fecha || ''), tipo: txt(r.tipo, 80), uso: txt(r.uso, 120), fuente: txt(r.fuente, 120),
    caudal: Number(r.caudal), resuelve: Math.floor(Number(r.resuelve)), paginas: Math.floor(Number(r.paginas)),
    toma: r.toma === 'directa' ? 'directa' : 'derivacion', coordTxt: txt(r.coordTxt, 400), nota: txt(r.nota, 600),
    captacion: (r.captacion || []).map(function (c) { return txt(c, 80); }).filter(String).slice(0, 10),
    prop: (r.prop || []).map(Number).filter(function (x) { return x > 0.2 && x < 5; }).slice(0, 999)
  };
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(r.vigenciaDesde || ''))) out.vigenciaDesde = String(r.vigenciaDesde);
  if (r.puntos && r.puntos.length) out.puntos = r.puntos.slice(0, 10).map(function (p) {
    return { lat: Number(p.lat), lon: Number(p.lon), txt: txt(p.txt, 300), q: p.q === undefined ? undefined : Number(p.q), nombre: p.nombre ? txt(p.nombre, 60) : undefined };
  });
  if (!idResValido(out.id)) return { ok: false, error: 'Identificador no válido.' };
  if (!out.predio || !out.numero) return { ok: false, error: 'Faltan el predio o el número de la resolución.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.fecha)) return { ok: false, error: 'Fecha no válida.' };
  if (!(out.caudal >= 0)) return { ok: false, error: 'Caudal no válido.' };
  if (!(out.paginas >= 1) || !(out.resuelve >= 1 && out.resuelve <= out.paginas)) return { ok: false, error: 'La página del Resuelve debe estar entre 1 y ' + out.paginas + '.' };
  Object.keys(out).forEach(function (k) { if (out[k] === '' ) delete out[k]; });
  out.actualizado = new Date().toISOString().slice(0, 10) + ' · ' + ses.nombre;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var lista = leerResoluciones().resoluciones, i = -1;
    lista.forEach(function (x, k) { if (x.id === out.id) i = k; });
    if (i >= 0) lista[i] = out; else lista.push(out);
    escribirResoluciones(lista);
    return { ok: true, id: out.id };
  } finally { lock.releaseLock(); }
}
function eliminarResolucion(a) {
  var id = String(a.id || '');
  if (!idResValido(id)) return { ok: false, error: 'Identificador no válido.' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var lista = leerResoluciones().resoluciones.filter(function (x) { return x.id !== id; });
    escribirResoluciones(lista);
    var sub = subcarpetaRes(id, false);
    if (sub) sub.setTrashed(true);   // queda en la papelera del Drive (se puede recuperar)
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function paginaResolucion(a) {
  var id = String(a.id || ''), p = Math.floor(Number(a.p));
  if (!/^[a-z0-9-]{1,60}$/.test(id) || !(p >= 1 && p <= 999)) return { ok: false, error: 'Página no válida.' };
  var c = carpetaResoluciones();
  if (!c) return { ok: false, error: 'Falta la carpeta "' + CARPETA_RES + '" en el Drive.' };
  var nombre = 'p' + ('00' + p).slice(-3) + '.jpg', its = c.getFoldersByName(id);
  while (its.hasNext()) {
    var sub = its.next();
    if (sub.isTrashed()) continue;
    var itf = sub.getFilesByName(nombre);
    while (itf.hasNext()) {
      var f = itf.next();
      if (!f.isTrashed()) return { ok: true, id: id, p: p, imagen: 'data:image/jpeg;base64,' + Utilities.base64Encode(f.getBlob().getBytes()) };
    }
  }
  return { ok: false, error: 'No se encontró la página ' + p + '.' };
}

// ---------- aforos de usuarios zona alta ----------
var CARPETA_ZA = 'Aforos usuarios zona alta';
function carpetaZonaAlta(crear) {
  var raiz = carpetaRaiz(), it = raiz.getFoldersByName(CARPETA_ZA);
  while (it.hasNext()) { var f = it.next(); if (!f.isTrashed()) return f; }
  return crear === false ? null : raiz.createFolder(CARPETA_ZA);
}
function sitiosZonaAlta() {
  var c = carpetaZonaAlta(false), vistos = {}, lista = [];
  if (!c) return lista;
  var it = c.getFolders();
  while (it.hasNext()) {
    var m = it.next(); if (m.isTrashed()) continue;
    var it2 = m.getFolders();
    while (it2.hasNext()) { var s = it2.next(); var k = normalizar(s.getName()); if (!s.isTrashed() && !vistos[k]) { vistos[k] = 1; lista.push(s.getName()); } }
  }
  return lista.sort(function (a, b) { return a.localeCompare(b, 'es'); });
}
// Columna «Usuario» (inicio de sesión de quien guardó) en los resúmenes de zona alta.
function conUsuario(sh) {
  if (columna(sh, 'Usuario')) return sh;
  var c = columna(sh, 'Responsable') || sh.getLastColumn();
  sh.insertColumnAfter(c);
  sh.getRange(1, c + 1).setValue('Usuario').setFontWeight('bold').setBackground('#e6f3e2');
  return sh;
}
// Carpetas de la raíz que no son sitios de medición ni se deben mover.
function esCarpetaInterna(nombre) { return /\(app\)\s*$/i.test(nombre) || nombre === CARPETA_ZA; }

// ---------- carpetas ----------
function carpetaRaiz() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('RAIZ_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  var it = DriveApp.getRootFolder().getFoldersByName(CARPETA_RAIZ);
  var raiz = it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(CARPETA_RAIZ);
  props.setProperty('RAIZ_ID', raiz.getId());
  return raiz;
}

// Una carpeta por método de aforo dentro de "Aforos AURPA".
var METODOS = ['Molinete', 'Volumétrico', 'Flotador', 'Vertedero', 'Parshall'];
function nombreMetodo(m) {
  var t = normalizar(m || '');
  for (var i = 0; i < METODOS.length; i++) if (t.indexOf(normalizar(METODOS[i])) === 0) return METODOS[i];
  return 'Molinete';
}
function buscarOCrear(padre, nombre) {
  var clave = normalizar(nombre);
  var it = padre.getFolders();
  while (it.hasNext()) {
    var f = it.next(); if (f.isTrashed()) continue;
    if (normalizar(f.getName()) === clave) return f;   // "La Esperanza" = "la esperanza "
  }
  return padre.createFolder(nombre);
}
function carpetaMetodo(metodo) { return buscarOCrear(carpetaRaiz(), metodo); }
function carpetaPredio(predio, carpetaDelMetodo) { return buscarOCrear(carpetaDelMetodo, predio); }

// Ejecutar UNA vez desde el editor (▷ Ejecutar → organizarPorMetodo):
// mueve las carpetas de sitio que están sueltas en "Aforos AURPA" a la carpeta de su método.
function organizarPorMetodo() {
  var raiz = carpetaRaiz();
  var metodos = METODOS.map(normalizar);
  var sueltas = [];
  var it = raiz.getFolders();
  while (it.hasNext()) {
    var f = it.next();
    if (f.isTrashed() || esCarpetaInterna(f.getName())) continue;   // papelera y carpetas internas de la app no se mueven
    if (metodos.indexOf(normalizar(f.getName())) < 0) sueltas.push(f);
  }
  sueltas.forEach(function (sitio) {
    var metodo = 'Molinete';
    var res = sitio.getFilesByName('Resumen de aforos – ' + sitio.getName());
    if (res.hasNext()) {
      var sh = SpreadsheetApp.open(res.next()).getSheets()[0];
      var cm = columna(sh, 'Método');
      if (cm && sh.getLastRow() > 1) metodo = nombreMetodo(sh.getRange(2, cm).getValue());
    }
    var destino = carpetaMetodo(metodo);
    var existente = null, it2 = destino.getFolders();
    while (it2.hasNext()) { var g = it2.next(); if (normalizar(g.getName()) === normalizar(sitio.getName())) existente = g; }
    if (!existente) sitio.moveTo(destino);
    else Logger.log('Ya existe ' + metodo + '/' + sitio.getName() + ': revisar a mano.');
  });
  Logger.log('Carpetas movidas: ' + sueltas.length);
}

// Subcarpeta "<Sitio> – <fecha>" dentro de la carpeta del sitio.
function carpetaFecha(carpetaSitio, fecha) {
  var f = limpiarNombre(fecha, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) f = Utilities.formatDate(new Date(), 'America/Bogota', 'yyyy-MM-dd');
  var nombre = carpetaSitio.getName() + ' – ' + f;
  var it = carpetaSitio.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : carpetaSitio.createFolder(nombre);
}

// ---------- resumen por predio ----------
function hojaResumen(carpeta, predio) {
  var nombre = 'Resumen de aforos – ' + carpeta.getName();
  var it = carpeta.getFilesByName(nombre);
  if (it.hasNext()) return conMira(conNumero(SpreadsheetApp.open(it.next()).getSheets()[0]));
  var ss = SpreadsheetApp.create(nombre);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  var sh = ss.getSheets()[0];
  sh.setName('Aforos');
  var enc = ['No.', 'Fecha', 'Hora', 'Método', 'Caudal (L/s)', 'Caudal (m³/s)', 'Mira inicial (cm)', 'Mira final (cm)', 'Sitio de medición', 'Responsable', 'Archivo', 'ID', 'Guardado'];
  sh.appendRow(enc);
  sh.getRange(1, 1, 1, enc.length).setFontWeight('bold').setBackground('#e6f3e2');
  sh.setFrozenRows(1);
  sh.hideColumns(columna(sh, 'ID'));  // ID interno
  return sh;
}

// Resumen de cada método, dentro de su carpeta: todos los sitios de ESE método, sin mezclar métodos.
function hojaResumenMetodo(carpetaDelMetodo) {
  var nombre = 'Resumen de aforos – ' + carpetaDelMetodo.getName();
  var it = carpetaDelMetodo.getFilesByName(nombre);
  if (it.hasNext()) return conMira(conNumero(SpreadsheetApp.open(it.next()).getSheets()[0]));
  var ss = SpreadsheetApp.create(nombre);
  DriveApp.getFileById(ss.getId()).moveTo(carpetaDelMetodo);
  var sh = ss.getSheets()[0];
  sh.setName('Aforos');
  var enc = ['No.', 'Sitio', 'Fecha', 'Hora', 'Método', 'Caudal (L/s)', 'Caudal (m³/s)', 'Mira inicial (cm)', 'Mira final (cm)', 'Sitio de medición', 'Responsable', 'Archivo', 'ID', 'Guardado', 'Carpeta'];
  sh.appendRow(enc);
  sh.getRange(1, 1, 1, enc.length).setFontWeight('bold').setBackground('#e6f3e2');
  sh.setFrozenRows(1);
  sh.hideColumns(columna(sh, 'Sitio de medición'));  // repite el sitio
  sh.hideColumns(columna(sh, 'ID'));                 // ID interno
  return sh;
}

// ---------- columnas de mira ----------
// Resúmenes creados antes: se agregan "Mira inicial (cm)" y "Mira final (cm)" junto al caudal.
function conMira(sh) {
  if (columna(sh, 'Mira inicial (cm)')) return sh;
  var c = columna(sh, 'Caudal (m³/s)') || columna(sh, 'Caudal (L/s)') || sh.getLastColumn();
  sh.insertColumnsAfter(c, 2);
  sh.getRange(1, c + 1, 1, 2).setValues([['Mira inicial (cm)', 'Mira final (cm)']]).setFontWeight('bold').setBackground('#e6f3e2');
  return sh;
}

// Agrega una fila poniendo cada valor bajo la columna de su mismo nombre.
function agregarFila(sh, valores) {
  var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  sh.appendRow(enc.map(function (h) { h = String(h).trim(); return Object.prototype.hasOwnProperty.call(valores, h) ? valores[h] : ''; }));
}

// Busca un dato en la lista "info" del aforo (p. ej. "Lectura de mira inicial (cm)").
function dato(a, patron) {
  var info = a.info || [];
  for (var i = 0; i < info.length; i++) if (info[i] && patron.test(String(info[i][0]))) return info[i][1];
  return '';
}

// Ejecutar UNA vez desde el editor (▷ Ejecutar → completarMiras):
// llena las columnas de mira de los resúmenes leyendo la hoja de cada aforo ya guardado.
function completarMiras() {
  var metodos = METODOS.map(normalizar), cache = {}, llenos = 0;
  var leerMiras = function (url) {
    if (cache[url]) return cache[url];
    var r = { ini: '', fin: '' };
    try {
      var vals = SpreadsheetApp.openByUrl(url).getSheets()[0].getRange('A1:B40').getValues();
      vals.forEach(function (f) {
        var k = String(f[0]);
        if (/mira inicial/i.test(k)) r.ini = numero(f[1]);
        if (/mira final/i.test(k)) r.fin = numero(f[1]);
      });
    } catch (e) {}
    return (cache[url] = r);
  };
  var completar = function (sh) {
    conMira(sh);
    var n = sh.getLastRow() - 1; if (n < 1) return;
    var ca = columna(sh, 'Archivo'), ci = columna(sh, 'Mira inicial (cm)'), cf = columna(sh, 'Mira final (cm)');
    var arch = sh.getRange(2, ca, n, 1).getValues(), mi = sh.getRange(2, ci, n, 1).getValues(), mf = sh.getRange(2, cf, n, 1).getValues();
    for (var i = 0; i < n; i++) {
      if (mi[i][0] !== '' || mf[i][0] !== '' || !arch[i][0]) continue;
      var m = leerMiras(String(arch[i][0]));
      mi[i][0] = m.ini; mf[i][0] = m.fin;
      if (m.ini !== '' || m.fin !== '') llenos++;
    }
    sh.getRange(2, ci, n, 1).setValues(mi); sh.getRange(2, cf, n, 1).setValues(mf);
  };
  var it = carpetaRaiz().getFolders();
  while (it.hasNext()) {
    var metodo = it.next(); if (metodo.isTrashed()) continue;
    if (metodos.indexOf(normalizar(metodo.getName())) < 0) continue;
    completar(hojaResumenMetodo(metodo));
    var sitios = metodo.getFolders();
    while (sitios.hasNext()) {
      var s = sitios.next(); if (s.isTrashed()) continue;
      var f = s.getFilesByName('Resumen de aforos – ' + s.getName());
      if (f.hasNext()) completar(conMira(conNumero(SpreadsheetApp.open(f.next()).getSheets()[0])));
    }
  }
  Logger.log('Filas con mira completada: ' + llenos);
}

// Ejecutar desde el editor (▷ Ejecutar → reconstruirResumenMetodo) si el resumen de un método
// quedó con filas corridas o repetidas: lo vuelve a armar a partir de los resúmenes de cada sitio.
function reconstruirResumenMetodo() {
  var metodos = METODOS.map(normalizar);
  var it = carpetaRaiz().getFolders();
  while (it.hasNext()) {
    var metodo = it.next(); if (metodo.isTrashed()) continue;
    if (metodos.indexOf(normalizar(metodo.getName())) < 0) continue;
    var destino = hojaResumenMetodo(metodo);
    var encD = destino.getRange(1, 1, 1, destino.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var filas = [], vistos = {};
    var sitios = metodo.getFolders();
    while (sitios.hasNext()) {
      var s = sitios.next(); if (s.isTrashed()) continue;
      var f = s.getFilesByName('Resumen de aforos – ' + s.getName());
      if (!f.hasNext()) continue;
      var sh = conMira(conNumero(SpreadsheetApp.open(f.next()).getSheets()[0]));
      var n = sh.getLastRow() - 1; if (n < 1) continue;
      var encS = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      var borrar = [];   // filas del resumen del sitio cuyo aforo se mandó a la papelera
      sh.getRange(2, 1, n, encS.length).getValues().forEach(function (r, i) {
        var id = r[encS.indexOf('ID')];
        var carpeta = '';
        var url = String(r[encS.indexOf('Archivo')] || '');
        var m = url.match(/\/d\/([A-Za-z0-9_-]+)/);
        if (m) {
          try {
            var file = DriveApp.getFileById(m[1]);
            if (file.isTrashed()) { borrar.push(i + 2); return; }
            var p = file.getParents(); if (p.hasNext()) carpeta = p.next().getUrl();
          } catch (e) { /* si no se puede abrir el archivo, el aforo se conserva (solo se quitan los que están en la papelera) */ }
        }
        if (id && vistos[id]) return;
        if (id) vistos[id] = 1;
        filas.push(encD.map(function (h) {
          if (h === 'Sitio') return s.getName();
          if (h === 'Carpeta') return carpeta;
          var k = encS.indexOf(h); return k >= 0 ? r[k] : '';
        }));
      });
      borrar.reverse().forEach(function (fila) { sh.deleteRow(fila); });
      if (borrar.length) { numerar(sh); Logger.log(s.getName() + ': se quitaron ' + borrar.length + ' aforo(s) borrados'); }
    }
    if (destino.getLastRow() > 1) destino.getRange(2, 1, destino.getLastRow() - 1, destino.getLastColumn()).clearContent();
    if (filas.length) destino.getRange(2, 1, filas.length, encD.length).setValues(filas);
    numerar(destino);
    if (filas.length) completarFechasFaltantes(destino, destino.getRange(2, 1, filas.length, encD.length).getValues(), encD);
    Logger.log(metodo.getName() + ': ' + filas.length + ' aforos');
  }
}

// ---------- columna "No." ----------
// Resúmenes creados antes de existir la columna: se le agrega al inicio.
function conNumero(sh) {
  if (String(sh.getRange(1, 1).getValue()).trim() !== 'No.') {
    sh.insertColumnBefore(1);
    sh.getRange(1, 1).setValue('No.').setFontWeight('bold').setBackground('#e6f3e2');
    sh.setColumnWidth(1, 50);
  }
  return sh;
}

function columna(sh, titulo) {
  var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var i = 0; i < enc.length; i++) if (String(enc[i]).trim() === titulo) return i + 1;
  return 0;
}

// Ordena por fecha y hora (del más antiguo al más reciente) y numera 1, 2, 3…
function numerar(sh) {
  var n = sh.getLastRow() - 1;
  if (n < 1) return;
  var cf = columna(sh, 'Fecha'), ch = columna(sh, 'Hora');
  var orden = [];
  if (cf) orden.push({ column: cf, ascending: true });
  if (ch) orden.push({ column: ch, ascending: true });
  if (orden.length) sh.getRange(2, 1, n, sh.getLastColumn()).sort(orden);
  var nums = [];
  for (var i = 1; i <= n; i++) nums.push([i]);
  sh.getRange(2, 1, n, 1).setValues(nums).setHorizontalAlignment('center');
  // Formato fijo por columna (evita que un número o una hora se vean como fecha).
  var formatos = { 'No.': '0', 'Fecha': 'dd/MM/yyyy', 'Hora': 'HH:mm', 'Caudal (L/s)': '#,##0.0', 'Caudal (m³/s)': '0.0000',
    'Mira inicial (cm)': '0.0', 'Mira final (cm)': '0.0', 'Guardado': 'dd/MM/yyyy HH:mm' };
  Object.keys(formatos).forEach(function (t) { var c = columna(sh, t); if (c) sh.getRange(2, c, n, 1).setNumberFormat(formatos[t]); });
}

// Ejecutar UNA vez desde el editor (▷ Ejecutar → numerarTodo) para numerar los resúmenes que ya existen.
function numerarTodo() {
  var metodos = METODOS.map(normalizar);
  var recorrer = function (padre) {
    var it = padre.getFolders();
    while (it.hasNext()) {
      var carpeta = it.next(); if (carpeta.isTrashed()) continue;
      var f = carpeta.getFilesByName('Resumen de aforos – ' + carpeta.getName());
      if (f.hasNext()) numerar(conNumero(SpreadsheetApp.open(f.next()).getSheets()[0]));
      if (metodos.indexOf(normalizar(carpeta.getName())) >= 0) recorrer(carpeta);
    }
  };
  recorrer(carpetaRaiz());
}

// Ejecutar UNA vez desde el editor (▷ Ejecutar → separarResumenPorMetodo):
// reparte el antiguo "Resumen general de aforos – AURPA" en un resumen por método
// y lo saca de la carpeta principal. Las filas se copian; el archivo viejo se deja
// renombrado como "(antiguo)" para que lo borres tú cuando confirmes que todo está bien.
function separarResumenPorMetodo() {
  var raiz = carpetaRaiz();
  var it = raiz.getFilesByName('Resumen general de aforos – AURPA');
  if (!it.hasNext()) { Logger.log('No hay resumen general.'); return; }
  var archivo = it.next();
  var sh = conNumero(SpreadsheetApp.open(archivo).getSheets()[0]);
  var n = sh.getLastRow() - 1;
  if (n > 0) {
    var datos = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
    var cm = columna(sh, 'Método');
    var porMetodo = {};
    datos.forEach(function (fila) {
      var m = nombreMetodo(cm ? fila[cm - 1] : '');
      (porMetodo[m] = porMetodo[m] || []).push(fila);
    });
    var encOrigen = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var idCol = columna(sh, 'ID');
    Object.keys(porMetodo).forEach(function (m) {
      var destino = hojaResumenMetodo(carpetaMetodo(m));
      var ya = {}, ci = columna(destino, 'ID');
      if (ci && destino.getLastRow() > 1) destino.getRange(2, ci, destino.getLastRow() - 1, 1).getValues().forEach(function (r) { ya[r[0]] = 1; });
      var nuevas = porMetodo[m].filter(function (f) { return !idCol || !ya[f[idCol - 1]]; });
      // Copia columna por nombre (el destino puede tener columnas nuevas, como la mira).
      var encDestino = destino.getRange(1, 1, 1, destino.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
      var filas = nuevas.map(function (f) {
        return encDestino.map(function (h) { var k = encOrigen.indexOf(h); return k >= 0 ? f[k] : ''; });
      });
      if (filas.length) destino.getRange(destino.getLastRow() + 1, 1, filas.length, encDestino.length).setValues(filas);
      numerar(destino);
      Logger.log(m + ': ' + filas.length + ' filas');
    });
  }
  archivo.setName('Resumen general de aforos – AURPA (antiguo)');
  Logger.log('Listo. El resumen general quedó como "(antiguo)".');
}

function buscarPorId(sh, id) {
  if (!id || sh.getLastRow() < 2) return null;
  var ca = columna(sh, 'Archivo'), ci = columna(sh, 'ID');
  if (!ca || !ci) return null;
  var n = sh.getLastRow() - 1;
  var archivos = sh.getRange(2, ca, n, 1).getValues(), ids = sh.getRange(2, ci, n, 1).getValues();
  for (var i = 0; i < n; i++) if (ids[i][0] === id) return archivos[i][0];
  return null;
}

// ---------- hoja de cada aforo ----------
function crearHojaAforo(carpeta, a, predio) {
  var q = numero(a.q_ls);
  var titulo = 'Aforo ' + limpiarNombre(a.hora, 10).replace('-', 'h') +
    ' · ' + limpiarNombre(a.metodo, 40) + ' · ' + (isFinite(q) ? String(Math.round(q * 100) / 100).replace('.', ',') : '—') + ' L/s';
  var ss = SpreadsheetApp.create(titulo);
  DriveApp.getFileById(ss.getId()).moveTo(carpeta);
  var sh = ss.getSheets()[0];
  sh.setName('Aforo');

  var filas = [['Predio', predio]];
  (a.info || []).forEach(function (p) { if (p && p.length >= 2) filas.push([limpiar(p[0], 80), valor(p[1])]); });
  filas.push(['Caudal Q (L/s)', numero(a.q_ls)]);
  filas.push(['Caudal Q (m³/s)', numero(a.q_m3s)]);
  sh.getRange(1, 1, filas.length, 2).setValues(filas);
  sh.getRange(1, 1, filas.length, 1).setFontWeight('bold');
  var fila = filas.length + 2;

  if (a.tabla && a.tabla.encabezados && a.tabla.filas && a.tabla.filas.length) {
    var enc = a.tabla.encabezados.map(function (h) { return limpiar(h, 60); });
    var cuerpo = a.tabla.filas.map(function (r) {
      var out = [];
      for (var i = 0; i < enc.length; i++) out.push(valor(r[i]));
      return out;
    });
    sh.getRange(fila, 1, 1, enc.length).setValues([enc]).setFontWeight('bold').setBackground('#e6f3e2').setWrap(true);
    sh.getRange(fila + 1, 1, cuerpo.length, enc.length).setValues(cuerpo);
    fila += cuerpo.length + 2;
  }

  if (a.pasos && a.pasos.length) {
    sh.getRange(fila, 1).setValue('Cálculo paso a paso').setFontWeight('bold');
    sh.getRange(fila + 1, 1, a.pasos.length, 1).setValues(a.pasos.map(function (p) { return [limpiar(p, 300)]; }));
  }
  sh.autoResizeColumns(1, 2);
  return DriveApp.getFileById(ss.getId());
}

// ---------- utilidades ----------
function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function limpiar(s, max) {
  return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200);
}
function limpiarNombre(s, max) { // para nombres de carpeta
  return limpiar(s, max).replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
}
function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}
function numero(v) {
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isFinite(n) ? n : '';
}
function valor(v) {
  if (typeof v === 'number') return isFinite(v) ? v : '';
  var s = limpiar(v, 200);
  if (/^[-+]?\d+([.,]\d+)?$/.test(s)) return parseFloat(s.replace(',', '.'));
  return s.charAt(0) === '=' ? "'" + s : s; // evita que un texto se tome como fórmula
}
