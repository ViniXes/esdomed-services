const APP_NAME = 'FIEH_SIMMOW_HNES';

const SHEETS = {
  RAW: 'FIEH_RAW',
  DATOS: 'DATOS_EXTRAIDOS',
  HISTORIAL: 'HISTORIAL'
};

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function inicializarSistemaFIEH() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  crearHoja_(ss, SHEETS.RAW, [
    'ID_PROCESO',
    'FECHA_CARGA',
    'NOMBRE_ARCHIVO',
    'TEXTO_EXTRAIDO',
    'ESTADO'
  ]);

  crearHoja_(ss, SHEETS.DATOS, [
    'ID_PROCESO',
    'FECHA_EXTRACCION',
    'ESTADO',
    'NEC',
    'TIPO_DOCUMENTO',
    'TIPO_DOCUMENTO_VALOR',
    'NUM_DOCUMENTO',
    'TIPO_AFILIACION',
    'TIPO_AFILIACION_VALOR',
    'NUM_AFILIACION',
    'APELLIDOS',
    'NOMBRES',
    'PRIMER_APELLIDO',
    'SEGUNDO_APELLIDO',
    'TERCER_APELLIDO',
    'PRIMER_NOMBRE',
    'SEGUNDO_NOMBRE',
    'TERCER_NOMBRE',
    'FECHA_NACIMIENTO',
    'EDAD_ANIOS',
    'EDAD_MESES',
    'EDAD_DIAS',
    'SEXO',
    'DIRECCION',
    'DEPARTAMENTO',
    'DISTRITO',
    'CANTON',
    'AREA',
    'FECHA_INGRESO',
    'HORA_INGRESO',
    'DIAG_INGRESO_TEXTO',
    'DIAG_INGRESO_CODIGO',
    'ACCIDENTE_TRANSITO',
    'ACCIDENTE_LABORAL',
    'TIPO_ACCIDENTE_VALOR',
    'DIAG_PRINCIPAL_TEXTO',
    'DIAG_PRINCIPAL_CODIGO',
    'DIAG_A_TEXTO',
    'DIAG_A_CODIGO',
    'DIAG_B_TEXTO',
    'DIAG_B_CODIGO',
'DIAG_C_TEXTO',
'DIAG_C_CODIGO',
'DIAG_II1_TEXTO',
'DIAG_II1_CODIGO',
'DIAG_II2_TEXTO',
'DIAG_II2_CODIGO',
'CONDICION_EGRESO',
    'FECHA_EGRESO',
    'HORA_EGRESO',
    'MINUTO_EGRESO',
    'MOTIVO_ALTA_VALOR',
    'RECOMENDACIONES',
    'MEDICO_RESPONSABLE_ALTA',
    'JVPM_MEDICO',
    'JVPM_MEDICO_NUMERO',
    'ESDOMED_DIGITA',
    'FECHA_DIGITACION',
    'ADVERTENCIAS'
  ]);

  crearHoja_(ss, SHEETS.HISTORIAL, [
    'FECHA_HORA',
    'USUARIO',
    'ACCION',
    'NEC',
    'CONDICION',
    'DETALLE'
  ]);

  return 'Sistema inicializado correctamente.';
}

function apiProcesarPDF(archivo) {
  try {
    inicializarSistemaFIEH();

    if (!archivo || !archivo.base64) {
      return respuestaCliente_({
        ok: false,
        mensaje: 'No se recibió ningún PDF.'
      });
    }

    const nombre = archivo.nombre || 'FIEH.pdf';
    const mime = archivo.mimeType || MimeType.PDF;

    const bytes = Utilities.base64Decode(archivo.base64);
    const blob = Utilities.newBlob(bytes, mime, nombre);

    const texto = extraerTextoPDF_(blob, nombre);

    if (!texto || !texto.trim()) {
      return respuestaCliente_({
        ok: false,
        mensaje: 'El PDF fue recibido, pero no se pudo extraer texto.'
      });
    }

    const datos = extraerDatosFIEH_(texto);

    guardarRaw_(datos.ID_PROCESO, nombre, texto);
    guardarDatos_(datos);

    registrarHistorial_(
      'EXTRACCION_PDF',
      datos.NEC,
      datos.CONDICION_EGRESO,
      'PDF procesado: ' + nombre
    );

    return respuestaCliente_({
      ok: true,
      mensaje: 'PDF procesado correctamente.',
      datos: datos,
      codigo: '',
      advertencias: datos.ADVERTENCIAS || [],
      debug: {
        archivo: nombre,
        caracteresExtraidos: texto.length,
        necDetectado: datos.NEC || '',
        condicionDetectada: datos.CONDICION_EGRESO || ''
      }
    });

  } catch (err) {
    Logger.log('ERROR apiProcesarPDF: ' + err.stack);

    return respuestaCliente_({
      ok: false,
      mensaje: 'Error procesando PDF: ' + err.message
    });
  }
}
function apiProcesarDocumentos(paquete) {
  try {
    inicializarSistemaFIEH();

    if (!paquete || !paquete.fieh || !paquete.fieh.base64) {
      return respuestaCliente_({
        ok: false,
        mensaje: 'Debe cargar el PDF FIEH.'
      });
    }

    const condicionManual = paquete.condicionManual || 'VIVO';

    const fiehBlob = archivoBase64ABlob_(paquete.fieh);
    const textoFieh = extraerTextoPDF_(fiehBlob, paquete.fieh.nombre || 'FIEH.pdf');

    const datos = extraerDatosFIEH_(textoFieh);
    datos.CONDICION_EGRESO = condicionManual;

    if (condicionManual === 'MUERTO') {
      if (!paquete.certificado || !paquete.certificado.base64) {
        return respuestaCliente_({
          ok: false,
          mensaje: 'Debe cargar el certificado de defunción para paciente fallecido.'
        });
      }

      const certBlob = archivoBase64ABlob_(paquete.certificado);
      const textoCert = extraerTextoPDF_(certBlob, paquete.certificado.nombre || 'CERTIFICADO_DEFUNCION.pdf');

      const datosCert = extraerDatosCertificadoDefuncion_(textoCert);

      Object.keys(datosCert).forEach(k => {
        datos[k] = datosCert[k];
      });

      guardarRaw_(datos.ID_PROCESO + '_CERT', paquete.certificado.nombre || 'CERTIFICADO_DEFUNCION.pdf', textoCert);
    } else {
      limpiarCamposCertificado_(datos);
    }

    aplicarReglasCondicionEgreso_(datos);

    guardarRaw_(datos.ID_PROCESO, paquete.fieh.nombre || 'FIEH.pdf', textoFieh);
    
    guardarDatos_(datos);

    registrarHistorial_(
      'EXTRACCION_DOCUMENTOS',
      datos.NEC,
      datos.CONDICION_EGRESO,
      condicionManual === 'MUERTO'
        ? 'FIEH + Certificado de Defunción procesados.'
        : 'FIEH procesado para paciente vivo.'
    );

    return respuestaCliente_({
      ok: true,
      mensaje: 'Documentos procesados correctamente.',
      datos: datos,
      codigo: '',
      advertencias: datos.ADVERTENCIAS || []
    });

  } catch (err) {
    Logger.log('ERROR apiProcesarDocumentos: ' + err.stack);

    return respuestaCliente_({
      ok: false,
      mensaje: 'Error procesando documentos: ' + err.message
    });
  }
}

function archivoBase64ABlob_(archivo) {
  const bytes = Utilities.base64Decode(archivo.base64);
  return Utilities.newBlob(
    bytes,
    archivo.mimeType || MimeType.PDF,
    archivo.nombre || 'archivo.pdf'
  );
}

function aplicarReglasCondicionEgreso_(datos) {
  if (!datos) return datos;

  const condicion = String(datos.CONDICION_EGRESO || '')
    .trim()
    .toUpperCase();

  if (condicion === 'VIVO') {
    // Para paciente vivo, siempre debe ir CONTROL.
    datos.RECOMENDACIONES = 'CONTROL';

    // La circunstancia NO se fuerza.
    // Se conserva la que venga del FIEH o la que el usuario seleccione.
    datos.MOTIVO_ALTA_VALOR = String(datos.MOTIVO_ALTA_VALOR || '').trim();

    return datos;
  }

  if (condicion === 'MUERTO') {
    // Fallecidos no llevan circunstancia ni observación CONTROL.
    datos.MOTIVO_ALTA_VALOR = '';
    datos.RECOMENDACIONES = '';

    return datos;
  }

  return datos;
}

function apiProcesarTexto(texto) {
  inicializarSistemaFIEH();

  if (!texto || !String(texto).trim()) {
    return {
      ok: false,
      mensaje: 'Debe pegar texto válido.'
    };
  }

  const datos = extraerDatosFIEH_(texto);
  const codigo = generarCodigoConsola_(datos);

  guardarRaw_(datos.ID_PROCESO, 'TEXTO_PEGADO', texto);
  guardarDatos_(datos);
  registrarHistorial_('EXTRACCION_TEXTO', datos.NEC, datos.CONDICION_EGRESO, 'Texto pegado manualmente.');

  return {
    ok: true,
    texto,
    datos,
    codigo,
    advertencias: datos.ADVERTENCIAS || []
  };
}

function apiGenerarCodigo(datos) {
  try {
    if (!datos || typeof datos !== 'object') {
      return respuestaCliente_({
        ok: false,
        mensaje: 'No se recibieron datos válidos para generar el código.'
      });
    }

    // Blindaje de edad:
    // La edad debe llegar como EDAD_ANIOS o como alias edad desde el Index.
    const edadServidor = soloNumeros_(
      datos.EDAD_ANIOS ||
      datos.edad ||
      datos.EDAD ||
      ''
    );

    if (!edadServidor) {
      return respuestaCliente_({
        ok: false,
        mensaje: 'No se recibió EDAD_ANIOS para generar el código. Revise que el campo EDAD_ANIOS tenga valor antes de presionar Generar código actualizado.'
      });
    }

    // Forzar edad limpia antes de generar el payload.
    datos.EDAD_ANIOS = edadServidor;
    datos.edad = edadServidor;

    // Por ahora SIMMOW solo recibirá años.
    datos.EDAD_MESES = '';
    datos.EDAD_DIAS = '';

    aplicarReglasCondicionEgreso_(datos);

    const codigo = generarCodigoConsola_(datos);

    registrarHistorial_(
      'GENERAR_CODIGO',
      datos.NEC || '',
      datos.CONDICION_EGRESO || '',
      'Código de consola generado con edad: ' + edadServidor
    );

    return respuestaCliente_({
      ok: true,
      mensaje: 'Código generado correctamente con edad: ' + edadServidor,
      codigo: codigo
    });

  } catch (err) {
    return respuestaCliente_({
      ok: false,
      mensaje: 'Error generando código: ' + err.message
    });
  }
}

function extraerTextoPDF_(blob, nombre) {
  const nombreDoc = 'OCR_FIEH_' + new Date().getTime() + '_' + nombre;

  let archivoConvertido;

  if (Drive.Files.create) {
    const recurso = {
      name: nombreDoc,
      mimeType: MimeType.GOOGLE_DOCS
    };

    archivoConvertido = Drive.Files.create(recurso, blob, {
      fields: 'id,name,mimeType'
    });
  } else {
    const recursoV2 = {
      title: nombreDoc,
      mimeType: MimeType.GOOGLE_DOCS
    };

    archivoConvertido = Drive.Files.insert(recursoV2, blob, {
      convert: true,
      ocr: true,
      ocrLanguage: 'es'
    });
  }

  const idDoc = archivoConvertido.id;

  let texto = '';
  let ultimoError = '';

  for (let i = 0; i < 6; i++) {
    try {
      Utilities.sleep(1500);
      const doc = DocumentApp.openById(idDoc);
      texto = doc.getBody().getText();
      if (texto && texto.trim()) break;
    } catch (err) {
      ultimoError = err.message;
    }
  }

  try {
    DriveApp.getFileById(idDoc).setTrashed(true);
  } catch (err) {}

  if (!texto || !texto.trim()) {
    throw new Error('No se pudo extraer texto del PDF. Detalle: ' + ultimoError);
  }

  return texto;
}

function extraerReferidoDelEstablecimientoFIEH_(texto) {
  const raw = normalizarTexto_(texto);
  const plano = raw.replace(/\s+/g, ' ').trim();

  const m = plano.match(
    /Nombre\s+del\s+establecimiento\s*\(?\s*referido\s+de\s*:?\)?\s*([\s\S]*?)(?:\s+C[oó]digo\s+UCSF\s*:|\s+Motivo\s+de\s+la\s+referencia\s*:|\s+B\.?\s*DATOS\s+DEL\s+INGRESO|$)/i
  );

  if (!m) return '';

  let valor = limpiarDato_(m[1]);

  // Quitar arrastres comunes del OCR.
  valor = valor
    .replace(/\bC[oó]digo\s+UCSF\b[\s\S]*$/i, '')
    .replace(/\bMotivo\s+de\s+la\s+referencia\b[\s\S]*$/i, '')
    .replace(/\bB\.?\s*DATOS\s+DEL\s+INGRESO\b[\s\S]*$/i, '');

  valor = limpiarDato_(valor);

  // Si viene vacío, N/A, NA, guiones o líneas, se deja vacío.
  if (!valor) return '';

  const normal = sinAcentos_(valor)
    .toUpperCase()
    .replace(/\s+/g, '')
    .trim();

  if (
    normal === 'N/A' ||
    normal === 'NA' ||
    normal === 'N' ||
    normal === 'NOAPLICA' ||
    normal === 'SINREFERENCIA' ||
    normal === 'NINGUNO' ||
    /^_+$/.test(normal) ||
    /^-+$/.test(normal)
  ) {
    return '';
  }

  return valor;
}

function extraerDatosFIEH_(texto) {
  const original = String(texto || '');
  const t = normalizarTexto_(original);
  const plano = t.replace(/\s+/g, ' ').trim();

  const advertencias = [];

  const datos = {
    ID_PROCESO: Utilities.getUuid().slice(0, 8).toUpperCase(),
FECHA_EXTRACCION: fechaHoraAhora_(),
    ESTADO: 'EXTRAIDO',
    ADVERTENCIAS: advertencias
  };

  datos.NEC = buscar_(plano, /NEC\s*:\s*([A-Z0-9\-]+)/i);

  datos.TIPO_DOCUMENTO = buscar_(plano, /Tipo\s+documento:\s*(.*?)\s*\d{7,10}\-?\d?/i);
  datos.NUM_DOCUMENTO = limpiarNumeroIdentificacionSIMMOW_(
  buscar_(plano, /Tipo\s+documento:\s*.*?(\d{7,10}\-?\d?)/i)
);
  datos.TIPO_DOCUMENTO_VALOR = tipoDocumentoValor_(datos.TIPO_DOCUMENTO);

  datos.TIPO_AFILIACION = buscar_(plano, /Tipo\s+de\s+afiliaci[oó]n:\s*(.*?)\s*No\.?\s*Afiliaci[oó]n:/i);
  datos.NUM_AFILIACION = limpiarNumeroIdentificacionSIMMOW_(
  buscar_(plano, /No\.?\s*Afiliaci[oó]n:\s*([A-Z0-9\-\/]+)/i)
);
  datos.TIPO_AFILIACION_VALOR = tipoAfiliacionValor_(datos.TIPO_AFILIACION);

  datos.APELLIDOS = limpiarDato_(buscar_(plano, /Apellidos:\s*(.*?)\s*Nombres:/i));
  datos.NOMBRES = limpiarDato_(buscar_(plano, /Nombres:\s*(.*?)\s*Fecha\s+Nacimiento:/i));

  const apellidos = dividirNombre_(datos.APELLIDOS);
  datos.PRIMER_APELLIDO = apellidos[0] || '';
  datos.SEGUNDO_APELLIDO = apellidos[1] || '';
  datos.TERCER_APELLIDO = apellidos.slice(2).join(' ');

  const nombres = dividirNombre_(datos.NOMBRES);
  datos.PRIMER_NOMBRE = nombres[0] || '';
  datos.SEGUNDO_NOMBRE = nombres[1] || '';
  datos.TERCER_NOMBRE = nombres.slice(2).join(' ');

  datos.FECHA_NACIMIENTO = buscar_(plano, /Fecha\s+Nacimiento:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

const edadFIEH = extraerEdadFIEH_(plano);
datos.EDAD_ANIOS = edadFIEH.anios;
datos.EDAD_MESES = edadFIEH.meses;
datos.EDAD_DIAS = edadFIEH.dias;

  datos.SEXO = buscar_(plano, /Sexo:\s*(Masculino|Femenino|Intersexual)/i);

datos.DIRECCION = limpiarDireccionFIEH_(
  buscar_(plano, /Direcci[oó]n\s+residencia:\s*(.*?)\s*Departamento:/i)
);

  const depMun = plano.match(/Departamento:\s*(.*?)\s*Municipio:\s*(.*?)\s*Cant[oó]n:\s*(.*?)\s*[ÁA]rea\s+geogr[aá]fica:/i);
datos.DEPARTAMENTO = depMun ? limpiarDato_(depMun[1]) : '';
datos.DISTRITO = depMun ? corregirDistritoFIEH_(depMun[2], datos.DEPARTAMENTO) : '';
datos.CANTON = depMun ? limpiarNA_(depMun[3]) : '';

  datos.AREA = buscar_(plano, /[ÁA]rea\s+geogr[aá]fica:\s*(Urbana|Urbano|Rural)/i);

  datos.REFERIDO_A_ESTABLECIMIENTO = '';
  datos.REFERIDO_DEL_ESTABLECIMIENTO = extraerReferidoDelEstablecimientoFIEH_(t);
  datos.RETORNO_HACIA = '';

  datos.FECHA_INGRESO = buscar_(plano, /Fecha\s+de\s+ingreso:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  datos.HORA_INGRESO = buscar_(plano, /Hora\s+de\s+ingreso:\s*([0-9]{1,2}:[0-9]{2}\s*(?:AM|PM)?)/i);

  const dxIngreso = plano.match(/Diagn[oó]stico\s+de\s+ingreso:\s*"?(.+?)"?\s*C[oó]digo\s+CIE-10:\s*([A-Z]\d{2}(?:\.\d{1,2})?)/i);
  datos.DIAG_INGRESO_TEXTO = dxIngreso ? limpiarDato_(dxIngreso[1]) : '';
  datos.DIAG_INGRESO_CODIGO = dxIngreso ? dxIngreso[2] : '';

  datos.ACCIDENTE_TRANSITO = buscar_(plano, /Accidente\s+de\s+tr[aá]nsito:\s*(SI|NO)/i);
  datos.ACCIDENTE_LABORAL = buscar_(plano, /Accidente\s+laboral:\s*(SI|NO)/i);
  datos.TIPO_ACCIDENTE_VALOR = tipoAccidenteValor_(datos.ACCIDENTE_TRANSITO, datos.ACCIDENTE_LABORAL);

  const servicioHosp = extraerServicioHospitalarioFIEH_(t);

datos.SERVICIO_HOSPITALARIO_ORIGEN = servicioHosp.origen || '';
datos.SERVICIO_HOSPITALARIO_VALOR = servicioHosp.valor || '';
datos.SERVICIO_HOSPITALARIO_FUENTE = servicioHosp.fuente || '';
datos.SERVICIO_HOSPITALARIO_DETALLE = servicioHosp.detalle || '';

if (!datos.SERVICIO_HOSPITALARIO_ORIGEN) {
  advertencias.push('No se detectó Servicio Hospitalario en el FIEH. Revise manualmente.');
} else if (!datos.SERVICIO_HOSPITALARIO_VALOR) {
  advertencias.push(
    'Servicio Hospitalario sin mapeo para SIMMOW: ' +
    datos.SERVICIO_HOSPITALARIO_ORIGEN
  );
}

const patronCodigoCIE10 = 'C[oó]digo\\s*CIE\\s*[-\\s\\uFFFE\\uFFFD]*10\\s*:?';

const dxPrincipal = plano.match(
  new RegExp(
    'Diagn[oó]stico\\s+principal\\s*(?:\\(d\\))?\\s*:\\s*' +
    '([\\s\\S]*?)\\s*' +
    patronCodigoCIE10 +
    '\\s*([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)',
    'i'
  )
);

datos.DIAG_PRINCIPAL_TEXTO = dxPrincipal
  ? limpiarDato_(dxPrincipal[1])
  : '';

datos.DIAG_PRINCIPAL_CODIGO = dxPrincipal
  ? normalizarCodigoCIE_(dxPrincipal[2])
  : '';
  
const comp = extraerComplementariosFIEH_(t);

datos.DIAG_C_TEXTO = comp.c.texto || '';
datos.DIAG_C_CODIGO = comp.c.codigo || '';

datos.DIAG_B_TEXTO = comp.b.texto || '';
datos.DIAG_B_CODIGO = comp.b.codigo || '';

datos.DIAG_A_TEXTO = comp.a.texto || '';
datos.DIAG_A_CODIGO = comp.a.codigo || '';

datos.DIAG_II1_TEXTO = comp.ii1.texto || '';
datos.DIAG_II1_CODIGO = comp.ii1.codigo || '';

datos.DIAG_II2_TEXTO = comp.ii2.texto || '';
datos.DIAG_II2_CODIGO = comp.ii2.codigo || '';

const causaProc = extraerCausaExternaYCirugiasFIEH_(t);

datos.CAUSA_EXTERNA_TEXTO = causaProc.causaExterna.texto || '';
datos.CAUSA_EXTERNA_CODIGO = causaProc.causaExterna.codigo || '';
datos.DISCAPACIDAD_PRINCIPAL_TEXTO = causaProc.discapacidad.texto || '';
datos.DISCAPACIDAD_PRINCIPAL_CODIGO = causaProc.discapacidad.codigo || '';

for (let i = 1; i <= 4; i++) {
  const cirugia = causaProc.cirugias[i - 1] || {};

  datos['CIRUGIA_' + i + '_TEXTO'] = cirugia.texto || '';
  datos['CIRUGIA_' + i + '_CODIGO'] = cirugia.codigo || '';
  datos['CIRUGIA_' + i + '_FECHA'] = cirugia.fecha || '';
  datos['CIRUGIA_' + i + '_CIRUJANO'] = cirugia.cirujano || '';
  datos['CIRUGIA_' + i + '_TIPO'] = cirugia.tipo || '';
}

// Checkbox manual en revisión.
// No se extrae automáticamente porque depende de una marca visual del FIEH.
datos.CIRUGIA_SUSPENDIDA_VALOR = '';

  datos.CONDICION_EGRESO = detectarCondicion_(datos, advertencias);

  datos.FECHA_EGRESO = buscar_(plano, /Fecha\s+de\s+egreso:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

  const horaEgreso = plano.match(/Hora\s+de\s+egreso:\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (horaEgreso) {
    datos.HORA_EGRESO = convertirHora24_(horaEgreso[1], horaEgreso[3]);
    datos.MINUTO_EGRESO = pad2_(horaEgreso[2]);
  } else {
    datos.HORA_EGRESO = '';
    datos.MINUTO_EGRESO = '';
  }

datos.MOTIVO_ALTA_VALOR = extraerCircunstanciaAltaFIEH_(t);
datos.RECOMENDACIONES = buscar_(plano, /Recomendaciones:\s*(.*?)\s*Nombre\s+del\s+m[eé]dico\s+responsable\s+del\s+alta/i);

  const medicoAlta = plano.match(/Nombre\s+del\s+m[eé]dico\s+responsable\s+del\s+alta\s+(.+?)\s+No\.?\s*JVPM:\s*([A-Z0-9\-]+)/i);
  datos.MEDICO_RESPONSABLE_ALTA = medicoAlta ? limpiarDato_(medicoAlta[1]) : '';
  datos.JVPM_MEDICO = medicoAlta ? limpiarDato_(medicoAlta[2]) : '';
  datos.JVPM_MEDICO_NUMERO = soloNumeros_(datos.JVPM_MEDICO);

  datos.ESDOMED_DIGITA = buscar_(plano, /Nombre\s+de\s+ESDOMED\s+de\s+digitar\s+informaci[oó]n\s*(.*?)\s*Fecha\s+de\s+digitaci[oó]n/i);
  datos.FECHA_DIGITACION = buscar_(plano, /Fecha\s+de\s+digitaci[oó]n\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

  validarDatos_(datos, advertencias);

  return datos;
}

function extraerCausaExternaYCirugiasFIEH_(texto) {
const res = {
  causaExterna: {
    texto: '',
    codigo: ''
  },
  discapacidad: {
    texto: '',
    codigo: ''
  },
  cirugias: []
};

  const raw = String(texto || '');

  const plano = sinAcentos_(raw)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cie10 = '([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)';
  const patronCodigoCIE10 = 'Codigo\\s*CIE\\s*[-\\s\\uFFFE\\uFFFD]*10\\s*:?';

  function limpiarTextoLocal(txt) {
    return limpiarDato_(
      String(txt || '')
        .replace(/\bCodigo\s*CIE\s*[- ]?10\b/gi, '')
        .replace(/\bCodigo\b/gi, '')
        .replace(/\s+/g, ' ')
    );
  }

  function normalizarCodigoLocal(cod) {
    return String(cod || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toUpperCase()
      .trim();
  }

  // CAUSA EXTERNA
  const mCausaExterna = plano.match(
    new RegExp(
      'Diagnostico\\s+de\\s+causa\\s+externa\\s*:?\\s*' +
      '([\\s\\S]*?)\\s*' +
      patronCodigoCIE10 +
      '\\s*' +
      cie10 +
      '\\s*(?=Discapacidad\\s+principal|Procedimientos|Condicion\\s+de\\s+egreso|$)',
      'i'
    )
  );

// DISCAPACIDAD PRINCIPAL
const mDiscapacidad = plano.match(
  /Discapacidad\s+principal\s*:?\s*([\s\S]*?)(?=Procedimientos?\s+o\s+intervenciones?|Condicion\s+de\s+egreso|$)/i
);

if (mDiscapacidad) {
  const bloqueDiscapacidad = limpiarDato_(mDiscapacidad[1] || '');

  const mCodigoDiscapacidad = bloqueDiscapacidad.match(
    /Codigo\s+CIF\s*[-\s\uFFFE\uFFFD]*9\s*:?\s*([A-Z0-9][A-Z0-9\.\-]{0,12})/i
  );

  let textoDiscapacidad = bloqueDiscapacidad
    .replace(/Codigo\s+CIF\s*[-\s\uFFFE\uFFFD]*9\s*:?\s*[A-Z0-9\.\-]*/i, '');

  res.discapacidad.texto = limpiarTextoLocal(textoDiscapacidad);
  res.discapacidad.codigo = mCodigoDiscapacidad
    ? normalizarCodigoLocal(mCodigoDiscapacidad[1])
    : '';

  if (/^(N\/A|NA|N|NOAPLICA|NINGUNO|SIN)$/i.test(res.discapacidad.codigo)) {
    res.discapacidad.codigo = '';
  }
}

  // CIRUGÍAS / INTERVENCIONES QUIRÚRGICAS
  const bloqueCirugiaMatch = plano.match(
    /Procedimientos?\s+o\s+intervenciones?\s+quirurgicas[\s\S]*?Tipo\s+de\s+cirugia\s+([\s\S]*?)(?:\(a\)\s*Tipo\s+de\s+Cirugia|Se\s+suspendio|Procedimientos\s+medicos|Procedimientos\s+y\s+terapeuticos|Presento\s+reaccion|Condicion\s+de\s+egreso|$)/i
  );

  const bloqueCirugia = bloqueCirugiaMatch ? bloqueCirugiaMatch[1] : '';

  const patronCirugia = new RegExp(
    '(.+?)\\s+' +
    '(\\d{1,2}(?:\\.\\d{1,2})?)\\s+' +
    '(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+' +
    '([A-Za-zÁÉÍÓÚÑáéíóúñüÜ\\.\\s]+?)\\s+' +
    '([135])' +
    '(?=\\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñüÜ,\\s]+\\s+\\d{1,2}(?:\\.\\d{1,2})?\\s+\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\s*$)',
    'gi'
  );

  let mCirugia;

  while ((mCirugia = patronCirugia.exec(bloqueCirugia)) !== null) {
    res.cirugias.push({
      texto: limpiarTextoLocal(mCirugia[1]),
      codigo: normalizarCodigoLocal(mCirugia[2]),
      fecha: limpiarDato_(mCirugia[3]),
      cirujano: limpiarDato_(mCirugia[4]),
      tipo: limpiarDato_(mCirugia[5])
    });

    if (res.cirugias.length >= 4) break;
  }

  return res;
}

function paresServicioHospitalarioSIMMOW_() {
  return [
    // CAMAS CENSABLES
    ['Medicina Interna Hombres 1', 'MED.INTER.HOM.1'],
    ['Medicina Interna Hombres 2', 'MED.INTER.HOM.2'],
    ['Medicina Interna Hombres 3', 'MED.INTER.HOM.3'],

    ['Medicina Interna Mujeres 1', 'MED.INTER.MUJ.1'],
    ['Medicina Interna Mujeres 2', 'MED.INTER.MUJ.2'],
    ['Medicina Interna Mujeres 3', 'MED.INTER.MUJ.3'],

    // Alias cortos por si el OCR solo lee parte del nombre.
    ['Hombres 1', 'MED.INTER.HOM.1'],
    ['Hombres 2', 'MED.INTER.HOM.2'],
    ['Hombres 3', 'MED.INTER.HOM.3'],
    ['Mujeres 1', 'MED.INTER.MUJ.1'],
    ['Mujeres 2', 'MED.INTER.MUJ.2'],
    ['Mujeres 3', 'MED.INTER.MUJ.3'],

    ['Servicio de Cardiologia', 'CARDIOLOGIA'],
    ['Servicio de Cardiología', 'CARDIOLOGIA'],
    ['Cardiologia', 'CARDIOLOGIA'],
    ['Cardiología', 'CARDIOLOGIA'],

    ['Servicio de Hematologia', 'HEMATOLOGIA'],
    ['Servicio de Hematología', 'HEMATOLOGIA'],
    ['Hematologia', 'HEMATOLOGIA'],
    ['Hematología', 'HEMATOLOGIA'],

    ['Servicio de Aislados', 'AISLAMIENTO'],
    ['Aislados', 'AISLAMIENTO'],

    ['Servicio de Oncologia', 'ONCOLOGIA'],
    ['Servicio de Oncología', 'ONCOLOGIA'],
    ['Oncologia', 'ONCOLOGIA'],
    ['Oncología', 'ONCOLOGIA'],

    ['Dialisis Peritoneal', 'DIALISIS PERITONEAL'],
    ['Diálisis Peritoneal', 'DIALISIS PERITONEAL'],

    ['Dolor y cuidados Paliativos', 'DOLOR Y CUIDADOS PALIATIVOS'],
    ['Dolor y Cuidados Paliativos', 'DOLOR Y CUIDADOS PALIATIVOS'],
    ['Dolor y cuidados paliativos', 'DOLOR Y CUIDADOS PALIATIVOS'],
    ['Dolor y cui dados Paliativos', 'DOLOR Y CUIDADOS PALIATIVOS'],

    ['Cirugía hombres 1', 'CIRUG.HOMBRES 1'],
    ['Cirugia hombres 1', 'CIRUG.HOMBRES 1'],

    ['Cirugía mujeres 1', 'CIRUG.MUJERES 1'],
    ['Cirugia mujeres 1', 'CIRUG.MUJERES 1'],

    ['Cirugia cardiovascular', 'CIRUGIA CARDIOVASCULAR'],
    ['Cirugía cardiovascular', 'CIRUGIA CARDIOVASCULAR'],

    ['Neurocirugia', 'NEUROCIRUGIA'],
    ['Neurocirugía', 'NEUROCIRUGIA'],

    ['Bienestar Magisterial', 'HOSPITALIZACION CONVENIO'],

    // ÁREAS DE TRANSFERENCIA
    ['Unidad de cuidados intensivos aislados Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Aislados Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Aislados', 'MEDICINA INTERNA D'],

    ['Unidad de Cuidados Intensivos Quirúrgicos Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Quirurgicos Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Quirúrgicos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Quirurgicos', 'MEDICINA INTERNA D'],
    ['Cuidados Intensivos Quirúrgicos Adultos', 'MEDICINA INTERNA D'],
    ['Cuidados Intensivos Quirurgicos Adultos', 'MEDICINA INTERNA D'],

    ['Unidad de cuidados intensivos General 1 Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos General 1 Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos General 1', 'MEDICINA INTERNA D'],

    ['Unidad de Cuidados Coronarios y Posquirúrgicos Cardiovasculares', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Coronarios y Posquirurgicos Cardiovasculares', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Coronarios y Postquirúrgicos Cardiovasculares', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Coronarios y Postquirurgicos Cardiovasculares', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Coronarios y Postquirúrgicos Cardiovasculares UCCP', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Coronarios y Postquirurgicos Cardiovasculares UCCP', 'MEDICINA INTERNA D'],

    ['Unidad de Cuidados Intensivos Extracorpórea Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Extracorporea Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Extracorpórea', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Extracorporea', 'MEDICINA INTERNA D'],

    ['Unidad de Cuidados Neurointensivos Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Neurointensivos', 'MEDICINA INTERNA D'],

    ['Unidad de cuidados intensivos cardiovascular Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Cardiovascular Adultos', 'MEDICINA INTERNA D'],
    ['Unidad de Cuidados Intensivos Cardiovascular', 'MEDICINA INTERNA D'],

    ['Unidad de Cuidados Intermedios Adultos MINSAL', 'MEDICINA INTERNA E'],
    ['Unidad de Cuidados Intermedios Adultos', 'MEDICINA INTERNA E'],

    ['Unidad de Cuidados Intermedios Crónicos Adultos', 'MEDICINA INTERNA E'],
    ['Unidad de Cuidados Intermedios Cronicos Adultos', 'MEDICINA INTERNA E'],
    ['Unidad de Cuidados Intermedios Crónicos', 'MEDICINA INTERNA E'],
    ['Unidad de Cuidados Intermedios Cronicos', 'MEDICINA INTERNA E'],

    ['Unidad de Cuidados Intermedios Aislados Adultos', 'MEDICINA INTERNA E'],
    ['Unidad de Cuidados Intermedios Aislados', 'MEDICINA INTERNA E'],

    // Sin mapeo definido por el momento.
    ['Centro quirúrgico (quirófanos 3, endoscopia 2 y recuperación 12)', ''],
    ['Centro quirurgico quirofanos 3 endoscopia 2 y recuperacion 12', ''],

    ['Unidad de Cuidados Intensivos Convenios (ISBM)', 'HOSPITALIZACION CONVENIO'],
    ['Unidad de Cuidados Intensivos Convenios ISBM', 'HOSPITALIZACION CONVENIO'],

    ['Unidad de Cuidados Intermedios Convenios (ISBM)', 'HOSPITALIZACION CONVENIO'],
    ['Unidad de Cuidados Intermedios Convenios ISBM', 'HOSPITALIZACION CONVENIO'],

    // Sin mapeo definido por el momento.
    ['Terapias sanguíneas extracorpórea', ''],
    ['Terapias sanguineas extracorporea', ''],
    ['Unidad de evaluacion y observacion medica', ''],
    ['Unidad de evaluación y observación médica', ''],
    ['Quimioterapia ambulatoria', ''],

    ['Unidad de Terapia Intervencionista Endovascular', 'Terapia Intervencionista Endovascular']
  ];
}

function mapearServicioHospitalarioSIMMOW_(servicioFieh) {
  const servicioNorm = normServicioHospitalario_(servicioFieh);
  if (!servicioNorm) return '';

  const pares = paresServicioHospitalarioSIMMOW_();
  const mapa = {};

  pares.forEach(([origen, destino]) => {
    mapa[normServicioHospitalario_(origen)] = destino;
  });

  // 1. Coincidencia exacta.
  if (Object.prototype.hasOwnProperty.call(mapa, servicioNorm)) {
    return mapa[servicioNorm];
  }

  // 2. Coincidencia flexible contra el mapeo.
  const claves = Object.keys(mapa)
    .filter(k => k.length >= 8)
    .sort((a, b) => b.length - a.length);

  for (const clave of claves) {
    if (servicioNorm.includes(clave) || clave.includes(servicioNorm)) {
      return mapa[clave];
    }
  }

  // 3. Respaldo por familia de servicio.
  // Esto corrige casos donde el OCR cambia un poco el texto,
  // pero conserva "cuidados intensivos", "intermedios", "convenios", etc.
  const inferido = inferirServicioHospitalarioPorPatron_(servicioFieh);

  if (inferido) return inferido;

  return '';
}

function buscarServiciosConocidosEnTexto_(texto) {
  const base = normServicioHospitalario_(texto);
  const pares = paresServicioHospitalarioSIMMOW_();

  const hallazgos = [];

  pares.forEach(([origen, destino]) => {
    const clave = normServicioHospitalario_(origen);
    if (!clave || clave.length < 6) return;

    const idx = base.indexOf(clave);

    if (idx >= 0) {
      hallazgos.push({
        idx,
        fin: idx + clave.length,
        origen,
        valor: destino,
        clave
      });
    }
  });

  hallazgos.sort((a, b) => {
    if (a.idx !== b.idx) return a.idx - b.idx;
    return b.clave.length - a.clave.length;
  });

  const limpios = [];

  hallazgos.forEach(h => {
    const seCruza = limpios.some(x => !(h.fin <= x.idx || h.idx >= x.fin));
    if (!seCruza) limpios.push(h);
  });

  if (limpios.length) {
    return limpios;
  }

  // Respaldo por patrón cuando el OCR no coincide exactamente
  // con ningún nombre del mapeo.
  const valorInferido = inferirServicioHospitalarioPorPatron_(texto);

  if (valorInferido) {
    return [{
      idx: 0,
      fin: base.length,
      origen: limpiarServicioHospitalarioFIEH_(texto),
      valor: valorInferido,
      clave: 'PATRON_' + valorInferido
    }];
  }

  return [];
}

function normServicioHospitalario_(txt) {
  return sinAcentos_(String(txt || ''))
    .toLowerCase()
    .replace(/&quot;/g, ' ')
    .replace(/\bcui\s+dados\b/g, 'cuidados')
    .replace(/\bcu\s+idados\b/g, 'cuidados')
    .replace(/\bcuid\s+ados\b/g, 'cuidados')
    .replace(/\bmed\s*\.?\s*inter\b/g, 'medicina interna')
    .replace(/\bhom\s*\.?\b/g, 'hombres')
    .replace(/\bmuj\s*\.?\b/g, 'mujeres')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferirServicioHospitalarioPorPatron_(txt) {
  const s = normServicioHospitalario_(txt);

  if (!s) return '';

  if (s.includes('dialisis peritoneal')) return 'DIALISIS PERITONEAL';

  if (
    s.includes('centro quirurgico') ||
    s.includes('quirofanos') ||
    s.includes('endoscopia') ||
    s.includes('recuperacion')
  ) {
    return '';
  }

  if (s.includes('terapias sanguineas extracorporea')) return '';

  if (
    s.includes('evaluacion') &&
    s.includes('observacion') &&
    s.includes('medica')
  ) {
    return '';
  }

  if (s.includes('quimioterapia ambulatoria')) return '';

  // Mapeos por familia.
  if (s.includes('terapia intervencionista endovascular')) {
    return 'Terapia Intervencionista Endovascular';
  }

  if (
    s.includes('convenio') ||
    s.includes('convenios') ||
    s.includes('isbm') ||
    s.includes('bienestar magisterial')
  ) {
    return 'HOSPITALIZACION CONVENIO';
  }

  if (
    s.includes('dolor') &&
    s.includes('cuidados') &&
    s.includes('paliativos')
  ) {
    return 'DOLOR Y CUIDADOS PALIATIVOS';
  }

  if (s.includes('cuidados intermedios')) {
    return 'MEDICINA INTERNA E';
  }

  if (
    s.includes('cuidados intensivos') ||
    s.includes('neurointensivos') ||
    s.includes('cuidados coronarios') ||
    s.includes('extracorporea') ||
    (
      s.includes('cuidados') &&
      s.includes('cardiovascular')
    )
  ) {
    return 'MEDICINA INTERNA D';
  }

  return '';
}

function extraerServicioIngresoParteB_(texto) {
  const raw = normalizarTexto_(texto);
  const plano = raw.replace(/\s+/g, ' ').trim();

  // Método 1:
  // Buscar directamente después de "Servicio en la que ingresa".
  const etiqueta = plano.match(
    /Servicio\s+(?:en\s+la\s+que|al\s+que)\s+ingresa\s*:?\s*/i
  );

  if (etiqueta) {
    const desde = etiqueta.index + etiqueta[0].length;

    let ventana = plano.slice(desde, desde + 320);

    const corte = ventana.search(
      /Fecha\s+probable\s+parto|Embarazada|Semanas\s+de\s+amenorrea|Diagn[oó]stico\s+de\s+ingreso|C[oó]digo\s+CIE|Accidente\s+de\s+tr[aá]nsito|Accidente\s+laboral|Nombre\s+del\s+m[eé]dico|C\.?\s*RUTA/i
    );

    if (corte >= 0) {
      ventana = ventana.slice(0, corte);
    }

    const servicios = buscarServiciosConocidosEnTexto_(ventana);

    if (servicios.length) {
      return servicios[0].origen;
    }

    const limpio = limpiarServicioHospitalarioFIEH_(ventana);

    if (limpio) {
      return limpio;
    }
  }

  // Método 2:
  // Si el OCR rompió la etiqueta, buscar dentro del bloque B completo.
  const base = sinAcentos_(raw);

  const bloqueBMatch = base.match(
    /B\.?\s*DATOS\s+DEL\s+INGRESO([\s\S]*?)(?:C\.?\s*RUTA\s+DE\s+MOVIMIENTOS?|D\.?\s*DATOS\s+DEL\s+EGRESO|$)/i
  );

  if (bloqueBMatch) {
    const bloqueB = bloqueBMatch[1] || '';
    const servicios = buscarServiciosConocidosEnTexto_(bloqueB);

    if (servicios.length) {
      return servicios[servicios.length - 1].origen;
    }

    const valorInferido = inferirServicioHospitalarioPorPatron_(bloqueB);

    if (valorInferido) {
      const b = normServicioHospitalario_(bloqueB);

      if (b.includes('cuidados intermedios')) {
        return 'Unidad de Cuidados Intermedios detectada en FIEH';
      }

      if (
        b.includes('cuidados intensivos') ||
        b.includes('neurointensivos') ||
        b.includes('cuidados coronarios') ||
        b.includes('extracorporea')
      ) {
        return 'Unidad de Cuidados Intensivos detectada en FIEH';
      }

      if (b.includes('convenio') || b.includes('isbm')) {
        return 'Servicio de Convenio detectado en FIEH';
      }

      if (b.includes('terapia intervencionista endovascular')) {
        return 'Unidad de Terapia Intervencionista Endovascular';
      }

      return 'Servicio hospitalario detectado por patrón en FIEH';
    }
  }

  return '';
}

function serialFechaHoraMovimiento_(fecha, hora) {
  const f = String(fecha || '').trim().replace(/-/g, '/');
  const h = String(hora || '').trim();

  const mf = f.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  const mh = h.match(/^(\d{1,2}):(\d{2})/);

  if (!mf) return 0;

  const dia = parseInt(mf[1], 10);
  const mes = parseInt(mf[2], 10) - 1;

  let anio = parseInt(mf[3], 10);

  // Si el OCR deja año de 2 dígitos: 26 => 2026.
  if (anio < 100) {
    anio += 2000;
  }

  const horaNum = mh ? parseInt(mh[1], 10) : 0;
  const minNum = mh ? parseInt(mh[2], 10) : 0;

  return new Date(anio, mes, dia, horaNum, minNum, 0).getTime();
}

function extraerUltimoServicioRutaMovimientoFIEH_(texto) {
  const raw = normalizarTexto_(texto);
  const base = sinAcentos_(raw);

  const bloqueMatch = base.match(
    /C\.?\s*RUTA\s+DE\s+MOVIMIENTOS?\s+DE\s+PACIENTE\s+DURANTE\s+SU\s+HOSPITALIZACION([\s\S]*?)(?:D\.?\s*DATOS\s+DEL\s+EGRESO|D\.?\s*DATOS\s+DEL\s+EGRESO\s+O\s+DEFUNCION|Diagnostico\s+principal|$)/i
  );

  if (!bloqueMatch) return null;

  const bloque = bloqueMatch[1] || '';

  const plano = String(bloque || '')
    .replace(/\r/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const movimientos = [];

  // Acepta fecha con / o -, y año de 2 o 4 dígitos.
  const patronFila = /(\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4}))\s+(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)\s+([\s\S]*?)(?=\s+\d{1,2}[\/-]\d{1,2}[\/-](?:\d{2}|\d{4})\s+\d{1,2}:\d{2}|$)/gi;

  let m;
  let idx = 0;

  while ((m = patronFila.exec(plano)) !== null) {
    const fecha = limpiarDato_(m[1]);
    const hora = limpiarDato_(m[2]);
    const segmento = limpiarDato_(m[3]);

    const servicios = buscarServiciosConocidosEnTexto_(segmento);

    if (!servicios.length) {
      idx++;
      continue;
    }

    // En cada fila normalmente aparecen:
    // traslado de + traslado a + médico.
    // Por eso se toma el último servicio detectado en la fila como "Traslado a".
    const destino = servicios[servicios.length - 1];

    movimientos.push({
      fecha,
      hora,
      origen: destino.origen,
      valor: destino.valor,
      fuente: 'RUTA_MOVIMIENTO',
      indice: idx,
      serial: serialFechaHoraMovimiento_(fecha, hora),
      segmento
    });

    idx++;
  }

  if (movimientos.length) {
    movimientos.sort((a, b) => {
      if (b.serial !== a.serial) return b.serial - a.serial;
      return b.indice - a.indice;
    });

    return movimientos[0];
  }

  // Respaldo: si el OCR no permitió armar filas por fecha/hora,
  // pero sí hay servicios dentro del bloque C, se toma el último servicio detectado.
  const serviciosBloque = buscarServiciosConocidosEnTexto_(plano);

  if (serviciosBloque.length) {
    const ultimo = serviciosBloque[serviciosBloque.length - 1];

    return {
      fecha: '',
      hora: '',
      origen: ultimo.origen,
      valor: ultimo.valor,
      fuente: 'RUTA_MOVIMIENTO_SIN_FECHA',
      indice: 0,
      serial: 0,
      segmento: plano
    };
  }

  return null;
}

function limpiarServicioHospitalarioFIEH_(txt) {
  return limpiarDato_(
    String(txt || '')
      .replace(/\bFecha\s+probable\s+parto\b[\s\S]*$/i, '')
      .replace(/\bEmbarazada\b[\s\S]*$/i, '')
      .replace(/\bSemanas\s+de\s+amenorrea\b[\s\S]*$/i, '')
      .replace(/\bDiagn[oó]stico\s+de\s+ingreso\b[\s\S]*$/i, '')
      .replace(/\bAccidente\s+de\s+tr[aá]nsito\b[\s\S]*$/i, '')
      .replace(/\bNombre\s+del\s+m[eé]dico\b[\s\S]*$/i, '')
      .replace(/\s+/g, ' ')
  );
}

function extraerServicioHospitalarioFIEH_(texto) {
  // PRIORIDAD 1: último traslado del literal C.
  const ruta = extraerUltimoServicioRutaMovimientoFIEH_(texto);

  if (ruta && ruta.origen) {
    return {
      origen: ruta.origen,
      valor: mapearServicioHospitalarioSIMMOW_(ruta.origen),
      fuente: ruta.fuente,
      detalle: ruta.fecha + ' ' + ruta.hora
    };
  }

  // PRIORIDAD 2: Servicio en la que ingresa, parte B.
  const ingreso = extraerServicioIngresoParteB_(texto);

  return {
    origen: ingreso || '',
    valor: ingreso ? mapearServicioHospitalarioSIMMOW_(ingreso) : '',
    fuente: ingreso ? 'INGRESO' : '',
    detalle: ''
  };
}

function extraerCircunstanciaAltaFIEH_(texto) {
  const raw = String(texto || '');

  const bloqueMatch = raw.match(
    /Circunstancia\s+de\s+alta\s*:?\s*([\s\S]*?)(?:Recomendaciones|Nombre\s+del\s+m[eé]dico|No\.?\s*JVPM|Fecha\s+de\s+digitaci[oó]n|$)/i
  );

  if (!bloqueMatch) return '';

  const bloqueOriginal = bloqueMatch[1] || '';

  const lineas = bloqueOriginal
    .split(/\n/)
    .map(limpiarDato_)
    .filter(Boolean);

  const opciones = [
    {
      valor: '1',
      palabras: [
        'destino a domicilio',
        'a domicilio'
      ]
    },
    {
      valor: '2',
      palabras: [
        'referido a otro hospital',
        'a otro hospital',
        'otro hospital'
      ]
    },
    {
      valor: '3',
      palabras: [
        'residencia social',
        'a residencia social'
      ]
    },
    {
      valor: '4',
      palabras: [
        'alta voluntaria',
        'voluntaria'
      ]
    },
    {
      valor: '5',
      palabras: [
        'inextremis',
        'in extremis',
        'morir en casa'
      ]
    },
    {
      valor: '6',
      palabras: [
        'fuga'
      ]
    }
  ];

  function normalizarLocal(txt) {
    return sinAcentos_(String(txt || ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function tieneMarca(txt) {
    const s = String(txt || '');

    // Marcas comunes de OCR para casilla seleccionada.
    if (/[☒✓✔■●]/.test(s)) return true;

    // X aislada, no una x dentro de una palabra.
    if (/(^|[\s\[\(\{])x($|[\s\]\)\}])/i.test(s)) return true;

    // Casillas tipo [x], (x), X.
    if (/\[\s*x\s*\]|\(\s*x\s*\)/i.test(s)) return true;

    return false;
  }

  // Primero: buscar una línea donde aparezca opción + marca.
  for (const linea of lineas) {
    const l = normalizarLocal(linea);

    for (const op of opciones) {
      const coincide = op.palabras.some(p => l.includes(p));

      if (coincide && tieneMarca(linea)) {
        return op.valor;
      }
    }
  }

  // Segundo: revisar el bloque completo, pero solo si hay marca cerca de la opción.
  const bloque = normalizarLocal(bloqueOriginal);

  for (const op of opciones) {
    for (const palabra of op.palabras) {
      const p = normalizarLocal(palabra);
      const idx = bloque.indexOf(p);

      if (idx < 0) continue;

      const antes = bloqueOriginal.slice(Math.max(0, idx - 15), idx);
      const despues = bloqueOriginal.slice(idx, idx + palabra.length + 15);

      if (tieneMarca(antes) || tieneMarca(despues)) {
        return op.valor;
      }
    }
  }

  // Si no hay marca clara, no se inventa circunstancia.
  return '';
}

function corregirDistritoFIEH_(distrito, departamento) {
  let d = limpiarDato_(distrito);
  const dep = sinAcentos_(departamento).toLowerCase();

  // Corrección por OCR: Santa Tecla Ll / LL / Li / II debe quedar Santa Tecla LI
  if (dep.includes('la libertad')) {
    d = d.replace(/\s+Ll$/i, ' LI');
    d = d.replace(/\s+LL$/i, ' LI');
    d = d.replace(/\s+Li$/i, ' LI');
    d = d.replace(/\s+II$/i, ' LI');
  }

  return limpiarDato_(d);
}

function generarCodigoConsola_(datos) {
  const data = prepararPayloadSIMMOW_(datos);

  return `
// Código generado por FIEH_SIMMOW_HNES
// Pegue este bloque en la consola de Chrome dentro de SIMMOW.
// Este código NO presiona Grabar. Revise antes de guardar.

;(async () => {
  const DATA = ${JSON.stringify(data, null, 2)};
  const errores = [];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const norm = (txt) => String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
    .trim()
    .toLowerCase();

  const fire = (el) => {
    if (!el) return;
    ['input', 'change', 'blur', 'keyup'].forEach(evt => {
      try { el.dispatchEvent(new Event(evt, { bubbles: true })); } catch(e) {}
    });
  };

  const byName = (name) => document.querySelector('[name="' + CSS.escape(name) + '"]');

  const setText = (name, value) => {
    if (value === undefined || value === null || value === '') return;
    const el = byName(name);
    if (!el) {
      errores.push('No se encontró campo: ' + name);
      return;
    }
    el.value = value;
    fire(el);
  };

  const setNativeValue = (el, value) => {
    const proto = el.tagName === 'TEXTAREA'
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;

    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
  };

  const setNumeroDigitado = async (name, value) => {
    if (value === undefined || value === null || value === '') return;

    const candidatos = [...document.querySelectorAll('input[name="' + CSS.escape(name) + '"]')]
      .filter(el => {
        if (!el) return false;
        if (String(el.type || '').toLowerCase() === 'hidden') return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      });

    const el = candidatos[0];

    if (!el) {
      errores.push('No se encontró campo numérico visible: ' + name);
      return;
    }

    const numero = String(value).trim();

    try { el.removeAttribute('readonly'); } catch (e) {}
    try { el.removeAttribute('disabled'); } catch (e) {}

    el.focus();
    setNativeValue(el, '');
    el.value = '';
    fire(el);
    await sleep(120);

    for (const ch of numero) {
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', {
          key: ch,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}

      setNativeValue(el, el.value + ch);
      el.value = el.value;

      try {
        el.dispatchEvent(new InputEvent('input', {
          data: ch,
          inputType: 'insertText',
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      try {
        el.dispatchEvent(new KeyboardEvent('keyup', {
          key: ch,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}

      await sleep(90);
    }

    try {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}

    el.blur();
    fire(el);
    await sleep(250);
  };

const setEdadPaciente = async (anios) => {
  let edadLimpia = String(anios || '')
.replace(/[^\\d]/g, '')
    .trim();

  console.log('Edad recibida desde DATA:', anios);
  console.log('Edad a digitar en años:', edadLimpia);

  if (!edadLimpia) {
    const edadManual = window.prompt(
      'DATA.edad viene vacío. Digite la EDAD EN AÑOS para SIMMOW:',
      ''
    );

edadLimpia = String(edadManual || '')
  .replace(/[^\\d]/g, '')
  .trim();

    if (!edadLimpia) {
      errores.push('No se digitó edad porque no se ingresó ningún valor.');
      return;
    }
  }

  const el = document.querySelector('input[name="edad"]');

  if (!el) {
    errores.push('No se encontró el campo input[name="edad"].');
    return;
  }

  try { el.removeAttribute('readonly'); } catch (e) {}
  try { el.removeAttribute('disabled'); } catch (e) {}

  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(300);

  // Clic real sobre el campo edad.
  try {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  } catch (e) {
    try { el.click(); } catch (e2) {}
  }

  el.focus();
  await sleep(200);

  // Limpiar campo.
  try {
    el.select();
    el.setSelectionRange(0, String(el.value || '').length);
  } catch (e) {}

  setNativeValue(el, '');
  el.value = '';
  await sleep(150);

  // Digitar carácter por carácter, como si fuera manual.
  for (const ch of edadLimpia) {
    try {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: ch,
        code: 'Digit' + ch,
        keyCode: ch.charCodeAt(0),
        which: ch.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {}

    try {
      document.execCommand('insertText', false, ch);
    } catch (e) {
      setNativeValue(el, String(el.value || '') + ch);
      el.value = String(el.value || '');
    }

    if (!String(el.value || '').endsWith(ch)) {
      setNativeValue(el, String(el.value || '') + ch);
      el.value = String(el.value || '');
    }

    try {
      el.dispatchEvent(new InputEvent('input', {
        data: ch,
        inputType: 'insertText',
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {
      try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
    }

    try {
      el.dispatchEvent(new KeyboardEvent('keyup', {
        key: ch,
        code: 'Digit' + ch,
        keyCode: ch.charCodeAt(0),
        which: ch.charCodeAt(0),
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {}

    await sleep(160);
  }

  await sleep(250);

  // Ejecutar la validación propia de SIMMOW.
  // Esta función deja meses, días, horas y minutos en 0.
  if (typeof window.edad === 'function') {
    try {
      window.edad();
      await sleep(300);
    } catch (e) {
      errores.push('Se digitó edad, pero falló la función edad() de SIMMOW: ' + e.message);
    }
  } else {
    try {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}
  }

  if (String(el.value || '').trim() !== edadLimpia) {
    errores.push(
      'La edad no quedó igual al valor esperado. Esperado: ' +
      edadLimpia +
      ', campo: ' +
      el.value
    );
  } else {
    console.log('Edad digitada y validada correctamente en SIMMOW:', el.value);
  }
};

  const setTextoCausaCercano = (codigoName, texto) => {
    if (!texto) return;

    const codigoEl = byName(codigoName);

    if (!codigoEl) {
      errores.push('No se encontró campo de código para ubicar texto: ' + codigoName);
      return;
    }

    let textarea = null;

    const fila = codigoEl.closest('tr');

    if (fila) {
      textarea = fila.querySelector('textarea');
    }

    if (!textarea) {
      const controles = [...document.querySelectorAll('input, textarea, select')];
      const pos = controles.indexOf(codigoEl);

      for (let i = pos + 1; i < Math.min(pos + 10, controles.length); i++) {
        if (controles[i] && controles[i].tagName === 'TEXTAREA') {
          textarea = controles[i];
          break;
        }
      }
    }

    if (!textarea) {
      errores.push('No se encontró textarea cercano para: ' + codigoName);
      return;
    }

    // Si SIMMOW no cargó la descripción automáticamente, se coloca el texto del certificado.
    if (!textarea.value || !textarea.value.trim()) {
      setNativeValue(textarea, texto);
      fire(textarea);
    }
  };

  const setCodigoCIE = async (name, value) => {
    if (value === undefined || value === null || value === '') return;

    const el = byName(name);

    if (!el) {
      errores.push('No se encontró campo CIE: ' + name);
      return;
    }

    const codigo = String(value).trim().toUpperCase();

    el.focus();
    setNativeValue(el, '');
    fire(el);
    await sleep(100);

    for (const ch of codigo) {
      try {
        el.dispatchEvent(new KeyboardEvent('keydown', {
          key: ch,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}

      setNativeValue(el, el.value + ch);

      try {
        el.dispatchEvent(new InputEvent('input', {
          data: ch,
          inputType: 'insertText',
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }

      try {
        el.dispatchEvent(new KeyboardEvent('keyup', {
          key: ch,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}

      await sleep(60);
    }

    fire(el);

    try {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));

      el.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    } catch (e) {}

    try {
      if (window.jQuery) {
        window.jQuery(el).trigger('keyup').trigger('change').trigger('blur');
      }
    } catch (e) {}

    await sleep(1200);
    el.blur();
    fire(el);
  };

  const setCausaDefuncion = async (codigoName, codigo, texto, intervaloName, intervalo, tiempoName, tiempo) => {
    await setCodigoCIE(codigoName, codigo);
    await sleep(1000);

    setTextoCausaCercano(codigoName, texto);

    setText(intervaloName, intervalo);
    setSelect(tiempoName, tiempo);

    await sleep(400);
  };
  
    const setCausaExterna = async () => {
    await setCodigoCIE('diag_cdc', DATA.causa_externa_codigo);
    await sleep(700);

    // Si SIMMOW no carga el texto automáticamente, se deja el texto extraído del FIEH.
    setTextoCausaCercano('diag_cdc', DATA.causa_externa_texto);

    await sleep(300);
  };

  const setCodigoTextoFilaPorTexto = async (textoFilaBuscar, codigo, texto) => {
    if (!codigo && !texto) return;

    const buscado = norm(textoFilaBuscar);

    const fila = [...document.querySelectorAll('tr')].find(tr => {
      const textoFila = norm(tr.innerText || '');
      return textoFila.includes(buscado);
    });

    if (!fila) {
      errores.push('No se encontró fila para: ' + textoFilaBuscar);
      return;
    }

    const inputCodigo = [...fila.querySelectorAll('input')]
      .find(el => {
        const tipo = String(el.type || '').toLowerCase();
        if (tipo === 'hidden' || tipo === 'checkbox' || tipo === 'radio') return false;
        return true;
      });

    const textarea = fila.querySelector('textarea');

    if (codigo && inputCodigo) {
      inputCodigo.focus();
      setNativeValue(inputCodigo, '');
      fire(inputCodigo);
      await sleep(100);

      setNativeValue(inputCodigo, String(codigo || '').trim().toUpperCase());
      fire(inputCodigo);

      try {
        inputCodigo.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));

        inputCodigo.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      } catch (e) {}

      await sleep(700);
      inputCodigo.blur();
      fire(inputCodigo);
    }

    if (texto && textarea && (!textarea.value || !textarea.value.trim())) {
      setNativeValue(textarea, texto);
      fire(textarea);
    }

    await sleep(300);
  };
  
  const setProcedimientoQuirurgico = async (codigoName, textoName, fechaName, cirujanoTextoName, tipoName, item) => {
    if (!item || !item.codigo) return;

    await setCodigoCIE(codigoName, item.codigo);
    await sleep(700);

    // Si SIMMOW no despliega el nombre del procedimiento, se usa el texto del FIEH.
    const textoEl = byName(textoName);
    if (textoEl && (!textoEl.value || !textoEl.value.trim())) {
      setNativeValue(textoEl, item.texto || '');
      fire(textoEl);
    }

    setText(fechaName, item.fecha);

    // El FIEH trae nombre del cirujano, no código interno/JVPM de SIMMOW.
    // Por eso se llena el campo de nombre visible, no el campo corto de código.
    setText(cirujanoTextoName, item.cirujano);

    setSelect(tipoName, item.tipo);

    await sleep(300);
  };

  const setCheckboxFilaPorTexto = (textoBuscar, marcado) => {
    if (!marcado) return;

    const buscado = norm(textoBuscar);

    const filas = [...document.querySelectorAll('tr')];

    const fila = filas.find(tr => {
      const textoFila = norm(tr.innerText || '');
      return textoFila.includes(buscado);
    });

    if (!fila) {
      errores.push('No se encontró fila para checkbox: ' + textoBuscar);
      return;
    }

    const checkbox = fila.querySelector('input[type="checkbox"]');

    if (!checkbox) {
      errores.push('No se encontró checkbox en fila: ' + textoBuscar);
      return;
    }

    checkbox.checked = true;

    try {
      checkbox.dispatchEvent(new Event('input', { bubbles: true }));
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      checkbox.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}

    try {
      if (window.jQuery) {
        window.jQuery(checkbox).trigger('change').trigger('blur');
      }
    } catch (e) {}

    console.log('Checkbox marcado:', textoBuscar);
  };

  const setSelect = (name, value) => {
    if (value === undefined || value === null || value === '') return;

    const el = byName(name);

    if (!el) {
      errores.push('No se encontró select: ' + name);
      return;
    }

    const codigosFinales = {
      AH: true, CA: true, CH: true, CU: true,
      LL: true, LI: true, LP: true, LU: true,
      MO: true, SM: true, SS: true, SV: true,
      SA: true, SO: true, US: true, GT: true
    };

    const quitarCodigoFinal = (txt) => {
      const partes = String(txt || '')
        .trim()
        .split(' ')
        .filter(Boolean);

      if (!partes.length) return '';

      const ultimo = partes[partes.length - 1].toUpperCase();

      if (codigosFinales[ultimo]) {
        partes.pop();
      }

      return partes.join(' ');
    };

    const normLocal = (txt) => norm(quitarCodigoFinal(txt));

    const wantedOriginal = String(value || '').trim();
    const wanted = norm(wantedOriginal);
    const wantedSinCodigo = normLocal(wantedOriginal);

    const opciones = [...el.options];

    let op = opciones.find(o => norm(o.value) === wanted);
    if (!op) op = opciones.find(o => norm(o.text) === wanted);
    if (!op) op = opciones.find(o => normLocal(o.text) === wantedSinCodigo);

    if (!op && wantedSinCodigo) {
      op = opciones.find(o => {
        const textoOpcion = normLocal(o.text);

        return textoOpcion === wantedSinCodigo ||
               textoOpcion.includes(wantedSinCodigo) ||
               wantedSinCodigo.includes(textoOpcion);
      });
    }

    if (op) {
      el.value = op.value;
      fire(el);
      console.log('Select asignado:', name, '=>', op.text, '(' + op.value + ')', 'desde:', value);
    } else {
      const primerasOpciones = opciones
        .slice(0, 12)
        .map(o => o.text)
        .join(' | ');

      errores.push(
        'No se encontró opción "' + value + '" en ' + name +
        '. Buscado flexible: "' + wantedSinCodigo +
        '". Opciones visibles: ' + primerasOpciones
      );
    }
  };

const setComboboxEstablecimiento = (name, texto) => {
  if (texto === undefined || texto === null || texto === '') return;

  const sel = byName(name);

  if (!sel) {
    errores.push('No se encontró combobox/select de establecimiento: ' + name);
    return;
  }

  const buscadoOriginal = String(texto || '').trim();

  if (!buscadoOriginal) return;

  const buscado = norm(buscadoOriginal);

  const opciones = [...sel.options].map(o => ({
    value: o.value || '',
    text: o.text || '',
    normText: norm(o.text || ''),
    normValue: norm(o.value || '')
  })).filter(o => o.value || o.text);

  let op = opciones.find(o => o.normText === buscado);

  if (!op) {
    op = opciones.find(o =>
      o.normText.includes(buscado) ||
      buscado.includes(o.normText)
    );
  }

  if (!op) {
    const tokens = buscado
      .split(/(?=[A-Z])|\s+/)
      .join(' ')
      .split(/[^a-zA-Z0-9]+/)
      .map(t => norm(t))
      .filter(t => t.length >= 3);

    let mejor = null;
    let mejorScore = 0;

    opciones.forEach(o => {
      let score = 0;

      tokens.forEach(t => {
        if (o.normText.includes(t)) score++;
      });

      if (score > mejorScore) {
        mejorScore = score;
        mejor = o;
      }
    });

    if (mejor && mejorScore >= 2) {
      op = mejor;
    }
  }

  if (!op) {
    errores.push(
      'No se encontró establecimiento parecido a "' +
      buscadoOriginal +
      '" en ' +
      name
    );
    return;
  }

  sel.value = op.value;
  fire(sel);

  try {
    if (window.jQuery) {
      window.jQuery(sel).val(op.value).trigger('change');
    }
  } catch (e) {}

  // SIMMOW usa un input visible tipo combobox junto al select oculto.
  // Se intenta actualizar ese input visible para que también se vea el texto seleccionado.
  try {
    let visibleInput = null;

    if (sel.id) {
      visibleInput =
        document.querySelector('.custom-' + sel.id + '-input') ||
        document.querySelector('.custom-' + sel.id + ' input');
    }

    if (!visibleInput) {
      const siguiente = sel.nextElementSibling;
      if (siguiente && siguiente.tagName === 'INPUT') {
        visibleInput = siguiente;
      }
    }

    if (!visibleInput) {
      const cercanos = [...document.querySelectorAll('input')]
        .filter(i => {
          const cls = String(i.className || '');
          return cls.includes('custom-combobox') &&
            !!(i.offsetWidth || i.offsetHeight || i.getClientRects().length);
        });

      if (name === 'estableref') visibleInput = cercanos[0] || null;
      if (name === 'establerefde') visibleInput = cercanos[1] || null;
      if (name === 'retornoHacia') visibleInput = cercanos[2] || null;
    }

    if (visibleInput) {
      visibleInput.value = op.text;
      fire(visibleInput);

      if (window.jQuery) {
        window.jQuery(visibleInput).val(op.text).trigger('change').trigger('blur');
      }
    }
  } catch (e) {}

  console.log('Establecimiento seleccionado en ' + name + ':', op.text, op.value);
};

  const setRadioByIndex = (name, index) => {
    if (index === '' || index === undefined || index === null) return;
    const radios = [...document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]')];
    if (!radios.length) {
      errores.push('No se encontró radio: ' + name);
      return;
    }
    if (!radios[index]) {
      errores.push('No existe índice ' + index + ' para radio: ' + name);
      return;
    }

    const radio = radios[index];

    try {
      radio.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    try { radio.focus(); } catch (e) {}

    // SIMMOW depende del click para desplegar/ocultar campos de fallecido.
    try {
      radio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      radio.click();
    } catch (e) {
      try {
        radio.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch (e2) {}
    }

    radio.checked = true;
    fire(radio);

    try {
      if (window.jQuery) {
        window.jQuery(radio).trigger('change').trigger('blur');
      }
    } catch (e) {}
  };

  const sexoIndex = (sexo) => {
    const s = norm(sexo);
    if (s.includes('masculino')) return 0;
    if (s.includes('femenino')) return 1;
    if (s.includes('intersexual')) return 2;
    return '';
  };

  const areaIndex = (area) => {
    const a = norm(area);
    if (a.includes('urban')) return 0;
    if (a.includes('rural')) return 1;
    return '';
  };

  const condicionIndex = (condicion) => {
    const c = norm(condicion);
    if (c.includes('vivo')) return 0;
    if (c.includes('muerto')) return 1;
    return '';
  };

  console.clear();
  console.log('Iniciando llenado desde FIEH_SIMMOW_HNES...');
  console.log(DATA);

  setSelect('estable', '2317');

  setSelect('tipo_doc', DATA.tipo_doc);
  setText('num_doc', DATA.num_doc);

  setSelect('tipo_afiliacion', DATA.tipo_afiliacion);
  setText('num_afiliacion', DATA.num_afiliacion);

  setText('expe', DATA.expe);

  setText('apellido_1', DATA.apellido_1);
  setText('apellido_2', DATA.apellido_2);
  setText('apellido_3', DATA.apellido_3);

setText('nombre_1', DATA.nombre_1);
setText('nombre_2', DATA.nombre_2);
setText('nombre_3', DATA.nombre_3);

setRadioByIndex('sex', sexoIndex(DATA.sexo));

  setText('direccion', DATA.direccion);

  setSelect('p_dept', DATA.departamento);
  await sleep(1600);

  setSelect('p_muni', DATA.distrito);
  await sleep(1200);

  setSelect('p_canton', DATA.canton);
  await sleep(300);

  setRadioByIndex('urbano', areaIndex(DATA.area));

  setText('fecingreso', DATA.fecingreso);
  setSelect('tipo_accidente', DATA.tipo_accidente);

  await setCodigoCIE('diag_cd', DATA.diag_cd);
  await sleep(300);

  await setCodigoCIE('diag_cds', DATA.diag_cds);
  await sleep(300);

  await setCodigoCIE('diag_cd3', DATA.diag_cd3);
  await sleep(300);

  await setCodigoCIE('diag_cd4', DATA.diag_cd4);
  await sleep(300);

  await setCodigoCIE('diag_cd5', DATA.diag_cd5);
  await sleep(300);

  await setCodigoCIE('diag_cd6', DATA.diag_cd6);
  await sleep(300);

  await setCausaExterna();

  await setCodigoTextoFilaPorTexto(
  'Discapacidad Principal',
  DATA.discapacidad_principal_codigo,
  DATA.discapacidad_principal_texto
);

  await setProcedimientoQuirurgico(
    'proce_cd1',
    'pr1',
    'iq1_fecha',
    'iq1_cir',
    'iq1_tipo',
    {
      codigo: DATA.cirugia_1_codigo,
      texto: DATA.cirugia_1_texto,
      fecha: DATA.cirugia_1_fecha,
      cirujano: DATA.cirugia_1_cirujano,
      tipo: DATA.cirugia_1_tipo
    }
  );

  await setProcedimientoQuirurgico(
    'proce_cd12',
    'pr12',
    'iq12_fecha',
    'iq12_cir',
    'iq12_tipo',
    {
      codigo: DATA.cirugia_2_codigo,
      texto: DATA.cirugia_2_texto,
      fecha: DATA.cirugia_2_fecha,
      cirujano: DATA.cirugia_2_cirujano,
      tipo: DATA.cirugia_2_tipo
    }
  );

  await setProcedimientoQuirurgico(
    'proce_cd13',
    'pr13',
    'iq13_fecha',
    'iq13_cir',
    'iq13_tipo',
    {
      codigo: DATA.cirugia_3_codigo,
      texto: DATA.cirugia_3_texto,
      fecha: DATA.cirugia_3_fecha,
      cirujano: DATA.cirugia_3_cirujano,
      tipo: DATA.cirugia_3_tipo
    }
  );

  await setProcedimientoQuirurgico(
    'proce_cd14',
    'pr14',
    'iq14_fecha',
    'iq14_cir',
    'iq14_tipo',
    {
      codigo: DATA.cirugia_4_codigo,
      texto: DATA.cirugia_4_texto,
      fecha: DATA.cirugia_4_fecha,
      cirujano: DATA.cirugia_4_cirujano,
      tipo: DATA.cirugia_4_tipo
    }
  );

  setCheckboxFilaPorTexto(
  'Se suspendio cirugia',
  String(DATA.cirugia_suspendida || '').toUpperCase() === 'SI'
);

await sleep(200);

setRadioByIndex('vivo', condicionIndex(DATA.condicion));
await sleep(300);

setSelect('servicio', DATA.servicio_hospitalario);
await sleep(300);

setComboboxEstablecimiento('estableref', DATA.referido_a_establecimiento);
await sleep(300);

setComboboxEstablecimiento('establerefde', DATA.referido_del_establecimiento);
await sleep(300);

setComboboxEstablecimiento('retornoHacia', DATA.retorno_hacia);
await sleep(300);

if (norm(DATA.condicion).includes('muerto')) {
  await setCausaDefuncion(
    'diag_cd_a',
    DATA.diag_cd_a,
    DATA.diag_txt_a,
    'diag_cd_a_intervalo',
    DATA.diag_cd_a_intervalo,
    'diag_cd_a_tiempo',
    DATA.diag_cd_a_tiempo
  );

  await setCausaDefuncion(
    'diag_cd_b',
    DATA.diag_cd_b,
    DATA.diag_txt_b,
    'diag_cd_b_intervalo',
    DATA.diag_cd_b_intervalo,
    'diag_cd_b_tiempo',
    DATA.diag_cd_b_tiempo
  );

  await setCausaDefuncion(
    'diag_cd_c',
    DATA.diag_cd_c,
    DATA.diag_txt_c,
    'diag_cd_c_intervalo',
    DATA.diag_cd_c_intervalo,
    'diag_cd_c_tiempo',
    DATA.diag_cd_c_tiempo
  );

  await setCausaDefuncion(
    'diag_cd_d_basica',
    DATA.diag_cd_d_basica,
    DATA.diag_txt_d_basica,
    'diag_cd_d_basica_intervalo',
    DATA.diag_cd_d_basica_intervalo,
    'diag_cd_d_basica_tiempo',
    DATA.diag_cd_d_basica_tiempo
  );

  await setCausaDefuncion(
    'diag_cd_e',
    DATA.diag_cd_e,
    DATA.diag_txt_e,
    'diag_cd_e_intervalo',
    DATA.diag_cd_e_intervalo,
    'diag_cd_e_tiempo',
    DATA.diag_cd_e_tiempo
  );

  await setCausaDefuncion(
    'diag_cd_f',
    DATA.diag_cd_f,
    DATA.diag_txt_f,
    'diag_cd_f_intervalo',
    DATA.diag_cd_f_intervalo,
    'diag_cd_f_tiempo',
    DATA.diag_cd_f_tiempo
  );
}

  setText('fecegreso', DATA.fecegreso);
  setSelect('tiempo_horas', DATA.tiempo_horas);
  setSelect('tiempo_minutos', DATA.tiempo_minutos);

  setSelect('motivo_alta', DATA.motivo_alta);
  setText('observaciones', DATA.observaciones);
  setText('medico_responsable', DATA.medico_responsable);

// Colocar edad al final, únicamente en años.
await setEdadPaciente(DATA.edad);

  console.log('Llenado finalizado.');
  console.warn('Revise los campos antes de presionar Grabar.');

  if (DATA.advertencias && DATA.advertencias.length) {
    console.warn('Advertencias:', DATA.advertencias);
  }

  if (errores.length) {
    console.error('Observaciones del llenado:', errores);
  } else {
    console.log('Sin errores de selector detectados.');
  }
})();
`;
}

function prepararPayloadSIMMOW_(datos) {
  const edadSoloAnios = soloNumeros_(
    datos.EDAD_ANIOS ||
    datos.edad ||
    datos.EDAD ||
    ''
  );

  return {
    
    tipo_doc: datos.TIPO_DOCUMENTO_VALOR || '1',
    num_doc: limpiarNumeroIdentificacionSIMMOW_(datos.NUM_DOCUMENTO),

    tipo_afiliacion: datos.TIPO_AFILIACION_VALOR || '',
    num_afiliacion: limpiarNumeroIdentificacionSIMMOW_(datos.NUM_AFILIACION),

    expe: datos.NEC || '',

    apellido_1: mayus_(datos.PRIMER_APELLIDO),
    apellido_2: mayus_(datos.SEGUNDO_APELLIDO),
    apellido_3: mayus_(datos.TERCER_APELLIDO),

    nombre_1: mayus_(datos.PRIMER_NOMBRE),
    nombre_2: mayus_(datos.SEGUNDO_NOMBRE),
    nombre_3: mayus_(datos.TERCER_NOMBRE),

edad: edadSoloAnios,
meses: '',
dias: '',

    sexo: datos.SEXO || '',

    direccion: limpiarDireccionParaSIMMOW_(datos.DIRECCION || ''),
    departamento: datos.DEPARTAMENTO || '',
    distrito: datos.DISTRITO || '',
    canton: datos.CANTON || '',
    area: datos.AREA || '',

    fecingreso: datos.FECHA_INGRESO || '',
    tipo_accidente: datos.TIPO_ACCIDENTE_VALOR || '',
servicio_hospitalario: datos.SERVICIO_HOSPITALARIO_VALOR || '',

referido_a_establecimiento: datos.REFERIDO_A_ESTABLECIMIENTO || '',
referido_del_establecimiento: datos.REFERIDO_DEL_ESTABLECIMIENTO || '',
retorno_hacia: datos.RETORNO_HACIA || '',

    diag_cd: datos.DIAG_PRINCIPAL_CODIGO || '',

    // En SIMMOW estos quedan como diagnósticos complementarios.
// Diagnósticos complementarios según FIEH:
// Complementario 1 = c)
// Complementario 2 = b)
// Complementario 3 = a)
// Complementario 4 = II) primero
// Complementario 5 = II) segundo
diag_cds: datos.DIAG_C_CODIGO || '',
diag_cd3: datos.DIAG_B_CODIGO || '',
diag_cd4: datos.DIAG_A_CODIGO || '',
diag_cd5: datos.DIAG_II1_CODIGO || '',
diag_cd6: datos.DIAG_II2_CODIGO || '',

// Causa externa del FIEH.
causa_externa_codigo: datos.CAUSA_EXTERNA_CODIGO || '',
causa_externa_texto: datos.CAUSA_EXTERNA_TEXTO || '',
discapacidad_principal_codigo: datos.DISCAPACIDAD_PRINCIPAL_CODIGO || '',
discapacidad_principal_texto: datos.DISCAPACIDAD_PRINCIPAL_TEXTO || '',

// Operaciones / intervenciones quirúrgicas del FIEH.
// SIMMOW solo muestra 4 filas en esta sección.
cirugia_1_codigo: datos.CIRUGIA_1_CODIGO || '',
cirugia_1_texto: datos.CIRUGIA_1_TEXTO || '',
cirugia_1_fecha: datos.CIRUGIA_1_FECHA || '',
cirugia_1_cirujano: datos.CIRUGIA_1_CIRUJANO || '',
cirugia_1_tipo: datos.CIRUGIA_1_TIPO || '',

cirugia_2_codigo: datos.CIRUGIA_2_CODIGO || '',
cirugia_2_texto: datos.CIRUGIA_2_TEXTO || '',
cirugia_2_fecha: datos.CIRUGIA_2_FECHA || '',
cirugia_2_cirujano: datos.CIRUGIA_2_CIRUJANO || '',
cirugia_2_tipo: datos.CIRUGIA_2_TIPO || '',

cirugia_3_codigo: datos.CIRUGIA_3_CODIGO || '',
cirugia_3_texto: datos.CIRUGIA_3_TEXTO || '',
cirugia_3_fecha: datos.CIRUGIA_3_FECHA || '',
cirugia_3_cirujano: datos.CIRUGIA_3_CIRUJANO || '',
cirugia_3_tipo: datos.CIRUGIA_3_TIPO || '',

cirugia_4_codigo: datos.CIRUGIA_4_CODIGO || '',
cirugia_4_texto: datos.CIRUGIA_4_TEXTO || '',
cirugia_4_fecha: datos.CIRUGIA_4_FECHA || '',
cirugia_4_cirujano: datos.CIRUGIA_4_CIRUJANO || '',
cirugia_4_tipo: datos.CIRUGIA_4_TIPO || '',
cirugia_suspendida: String(datos.CIRUGIA_SUSPENDIDA_VALOR || '').toUpperCase() === 'SI' ? 'SI' : '',

condicion: datos.CONDICION_EGRESO || '',

// Solo fallecidos. Estos vienen del Certificado de Defunción, NO del FIEH.
diag_cd_a: datos.CERT_CAUSA_A_CODIGO || '',
diag_txt_a: datos.CERT_CAUSA_A_TEXTO || '',
diag_cd_a_intervalo: datos.CERT_CAUSA_A_INTERVALO || '',
diag_cd_a_tiempo: datos.CERT_CAUSA_A_TIEMPO || '',

diag_cd_b: datos.CERT_CAUSA_B_CODIGO || '',
diag_txt_b: datos.CERT_CAUSA_B_TEXTO || '',
diag_cd_b_intervalo: datos.CERT_CAUSA_B_INTERVALO || '',
diag_cd_b_tiempo: datos.CERT_CAUSA_B_TIEMPO || '',

diag_cd_c: datos.CERT_CAUSA_C_CODIGO || '',
diag_txt_c: datos.CERT_CAUSA_C_TEXTO || '',
diag_cd_c_intervalo: datos.CERT_CAUSA_C_INTERVALO || '',
diag_cd_c_tiempo: datos.CERT_CAUSA_C_TIEMPO || '',

diag_cd_d_basica: datos.CERT_CAUSA_BASICA_D_CODIGO || '',
diag_txt_d_basica: datos.CERT_CAUSA_BASICA_D_TEXTO || '',
diag_cd_d_basica_intervalo: datos.CERT_CAUSA_BASICA_D_INTERVALO || '',
diag_cd_d_basica_tiempo: datos.CERT_CAUSA_BASICA_D_TIEMPO || '',

diag_cd_e: datos.CERT_OTRO_ESTADO_1_CODIGO || '',
diag_txt_e: datos.CERT_OTRO_ESTADO_1_TEXTO || '',
diag_cd_e_intervalo: datos.CERT_OTRO_ESTADO_1_INTERVALO || '',
diag_cd_e_tiempo: datos.CERT_OTRO_ESTADO_1_TIEMPO || '',

diag_cd_f: datos.CERT_OTRO_ESTADO_2_CODIGO || '',
diag_txt_f: datos.CERT_OTRO_ESTADO_2_TEXTO || '',
diag_cd_f_intervalo: datos.CERT_OTRO_ESTADO_2_INTERVALO || '',
diag_cd_f_tiempo: datos.CERT_OTRO_ESTADO_2_TIEMPO || '',

    fecegreso: datos.FECHA_EGRESO || '',
    tiempo_horas: datos.HORA_EGRESO || '',
    tiempo_minutos: datos.MINUTO_EGRESO || '',

    motivo_alta: datos.MOTIVO_ALTA_VALOR || '',
    observaciones: cortar_(datos.RECOMENDACIONES || '', 300),
    medico_responsable: datos.JVPM_MEDICO_NUMERO || '',

    advertencias: datos.ADVERTENCIAS || []
  };
}

function crearHoja_(ss, nombre, encabezados) {
  let sh = ss.getSheetByName(nombre);
  if (!sh) sh = ss.insertSheet(nombre);

  const rango = sh.getRange(1, 1, 1, encabezados.length);
  const actual = rango.getValues()[0];
  const vacia = actual.every(v => String(v || '').trim() === '');

  if (vacia) {
    rango.setValues([encabezados]);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, encabezados.length)
      .setBackground('#1C1E4D')
      .setFontColor('#ffffff')
      .setFontWeight('bold');
    sh.autoResizeColumns(1, encabezados.length);
  }
}

function guardarRaw_(id, nombre, texto) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.RAW);
  sh.appendRow([id, new Date(), nombre, texto, 'CARGADO']);
}

function guardarDatos_(datos) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.DATOS);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];

  const row = headers.map(h => {
    if (h === 'ADVERTENCIAS') return (datos.ADVERTENCIAS || []).join(' | ');
    return datos[h] !== undefined ? datos[h] : '';
  });

  sh.appendRow(row);
}

function registrarHistorial_(accion, nec, condicion, detalle) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEETS.HISTORIAL);
  if (!sh) return;

  sh.appendRow([
    new Date(),
    Session.getActiveUser().getEmail() || 'usuario',
    accion,
    nec || '',
    condicion || '',
    detalle || ''
  ]);
}

function normalizarTexto_(texto) {
  return String(texto || '')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]+/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/[ ]+\n/g, '\n')
    .trim();
}

function buscar_(texto, regex) {
  const m = String(texto || '').match(regex);
  return m ? limpiarDato_(m[1]) : '';
}

function limpiarDato_(txt) {
  return String(txt || '')
    .replace(/\s+/g, ' ')
    .replace(/^[:\-\s]+/, '')
    .replace(/[:\-\s]+$/, '')
    .trim();
}

function limpiarNA_(txt) {
  const v = limpiarDato_(txt);
  if (!v) return '';
  if (/^(N\/A|NA|NO APLICA|_+|____)$/i.test(v)) return '';
  return v;
}

function limpiarNumeroIdentificacionSIMMOW_(txt) {
  const original = String(txt || '').trim();

  if (!original) return '';

  const normal = sinAcentos_(original)
    .toUpperCase()
    .replace(/\s+/g, '');

  // Casos inválidos comunes del FIEH/OCR.
  if (
    normal === 'N/A' ||
    normal === 'NA' ||
    normal === 'N' ||
    normal === 'NOAPLICA' ||
    normal === 'SINNUMERO' ||
    normal === 'SN'
  ) {
    return '';
  }

  // Para SIMMOW estos campos deben ir solo con números.
  const soloDigitos = original.replace(/\D/g, '');

  // Si no hay ningún número, se deja vacío.
  if (!soloDigitos) return '';

  return soloDigitos;
}

function limpiarGuiones_(txt) {
  return String(txt || '').replace(/[^A-Za-z0-9]/g, '').trim();
}

function soloNumeros_(txt) {
  return String(txt || '').replace(/\D/g, '');
}

function dividirNombre_(txt) {
  const palabras = limpiarDato_(txt)
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  const partes = [];

  for (let i = 0; i < palabras.length; i++) {
    const actual = palabras[i];
    const siguiente = palabras[i + 1] || '';
    const tercero = palabras[i + 2] || '';

    // Casos: DE LA CRUZ, DE LAS MERCEDES, DE LOS ANGELES
    if (
      actual === 'DE' &&
      ['LA', 'LAS', 'LOS'].includes(siguiente)
    ) {
      if (tercero) {
        partes.push(actual + ' ' + siguiente + ' ' + tercero);
        i += 2;
      } else {
        partes.push(actual + ' ' + siguiente);
        i += 1;
      }
      continue;
    }

    // Casos: DE LEON, DE MONICO, DE MARQUEZ, DE ALAS
    if (actual === 'DE' && siguiente) {
      partes.push(actual + ' ' + siguiente);
      i += 1;
      continue;
    }

    // Casos: DEL CARMEN, DEL ROSARIO
    if (actual === 'DEL' && siguiente) {
      partes.push(actual + ' ' + siguiente);
      i += 1;
      continue;
    }

    partes.push(actual);
  }

  return partes;
}

function mayus_(txt) {
  return String(txt || '').toUpperCase().trim();
}

function pad2_(n) {
  return String(n || '').padStart(2, '0');
}

function convertirHora24_(hora, ampm) {
  let h = parseInt(hora, 10);
  const mer = String(ampm || '').toUpperCase();

  if (mer === 'PM' && h < 12) h += 12;
  if (mer === 'AM' && h === 12) h = 0;

  return pad2_(h);
}

function tipoDocumentoValor_(tipo) {
  const t = sinAcentos_(tipo).toLowerCase();

  if (t.includes('pasaporte')) return '2';
  if (t.includes('responsable')) return '3';
  if (t.includes('dui') || t.includes('documento unico') || t.includes('identidad')) return '1';

  return '1';
}

function tipoAfiliacionValor_(tipo) {
  const t = sinAcentos_(tipo).toLowerCase();

  if (t.includes('isss') && t.includes('cotizante')) return '1';
  if (t.includes('isss') && t.includes('beneficiario')) return '2';
  if (t.includes('veterano')) return '3';
  if (t.includes('isbm') && t.includes('cotizante')) return '4';
  if (t.includes('isbm') && t.includes('beneficiario')) return '5';
  if (t.includes('ipsfa') && t.includes('cotizante')) return '6';
  if (t.includes('ipsfa') && t.includes('beneficiario')) return '7';

  return '';
}

function tipoAccidenteValor_(transito, laboral) {
  if (/^SI$/i.test(String(transito || '').trim())) return '1';
  if (/^SI$/i.test(String(laboral || '').trim())) return '2';
  return '';
}

function sinAcentos_(txt) {
  return String(txt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extraerDiagnosticosABC_(texto) {
  const res = {};
  const lineas = String(texto || '')
    .split(/\n/)
    .map(limpiarDato_)
    .filter(Boolean);

  lineas.forEach(linea => {
    const m = linea.match(/^([abc])\)\s*(.+?)\s+([A-Z]\d{2}(?:\.\d{1,2})?)$/i);
    if (m) {
      res[m[1].toLowerCase()] = {
        texto: limpiarDato_(m[2]),
        codigo: m[3]
      };
    }
  });

  return res;
}

function detectarCondicion_(datos, advertencias) {
  if (
    datos.DIAG_A_CODIGO &&
    datos.DIAG_B_CODIGO &&
    datos.DIAG_C_CODIGO &&
    datos.DIAG_PRINCIPAL_CODIGO
  ) {
    advertencias.push('Se asignó MUERTO por presencia de causas a, b, c y causa básica d. Confirme antes de pegar en SIMMOW.');
    return 'MUERTO';
  }

  advertencias.push('No se pudo determinar automáticamente la condición de egreso. Seleccione VIVO o MUERTO en la revisión.');
  return '';
}

function validarDatos_(datos, advertencias) {
  const obligatorios = [
    ['NEC', 'No se detectó NEC.'],
    ['NUM_DOCUMENTO', 'No se detectó documento.'],
    ['APELLIDOS', 'No se detectaron apellidos.'],
    ['NOMBRES', 'No se detectaron nombres.'],
    ['FECHA_INGRESO', 'No se detectó fecha de ingreso.'],
    ['DIAG_PRINCIPAL_CODIGO', 'No se detectó diagnóstico principal.'],
    ['FECHA_EGRESO', 'No se detectó fecha de egreso.'],
    ['HORA_EGRESO', 'No se detectó hora de egreso.'],
    ['JVPM_MEDICO_NUMERO', 'No se detectó número JVPM del médico.']
  ];

  obligatorios.forEach(([campo, msg]) => {
    if (!datos[campo]) advertencias.push(msg);
  });
}

function cortar_(txt, max) {
  const v = String(txt || '');
  return v.length > max ? v.slice(0, max) : v;
}

function fechaHoraAhora_() {
  return Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyy-MM-dd HH:mm:ss'
  );
}

function limpiarRespuestaCliente_(valor) {
  if (valor === null || valor === undefined) return '';

  if (Object.prototype.toString.call(valor) === '[object Date]') {
    return Utilities.formatDate(
      valor,
      Session.getScriptTimeZone(),
      'yyyy-MM-dd HH:mm:ss'
    );
  }

  if (Array.isArray(valor)) {
    return valor.map(limpiarRespuestaCliente_);
  }

  if (typeof valor === 'object') {
    const limpio = {};
    Object.keys(valor).forEach(k => {
      limpio[k] = limpiarRespuestaCliente_(valor[k]);
    });
    return limpio;
  }

  return valor;
}

function respuestaCliente_(obj) {
  return limpiarRespuestaCliente_(obj);
}

function limpiarDireccionFIEH_(txt) {
  let v = limpiarDato_(txt);

  // Quita contaminación del OCR si mete sexo dentro de dirección
  v = v.replace(/\bSexo\s*:?\s*(Masculino|Femenino|Intersexual)\b/gi, '');

  // Si el OCR dejó solamente la palabra del sexo pegada al final
  v = v.replace(/\b(Masculino|Femenino|Intersexual)\b$/gi, '');

  // Quita cualquier arrastre hacia el siguiente campo
  v = v.replace(/\bDepartamento\s*:.*$/gi, '');
  v = v.replace(/\bMunicipio\s*:.*$/gi, '');
  v = v.replace(/\bCant[oó]n\s*:.*$/gi, '');
  v = v.replace(/\b[ÁA]rea\s+geogr[aá]fica\s*:.*$/gi, '');

return limpiarDireccionParaSIMMOW_(v);
}

function limpiarDireccionParaSIMMOW_(txt) {
  let v = String(txt || '');

  // Quitar acentos: á -> a, é -> e, etc.
  v = sinAcentos_(v);

  // Convertir a mayúsculas para SIMMOW.
  v = v.toUpperCase();

  // Permitir solo letras, números, Ñ y espacios.
  // Todo carácter especial se convierte en espacio.
  v = v.replace(/[^A-ZÑ0-9\s]/g, ' ');

  // Limpiar espacios duplicados.
  v = v.replace(/\s+/g, ' ').trim();

  return v;
}

function extraerComplementariosFIEH_(texto) {
  const res = {
    c: { texto: '', codigo: '' },
    b: { texto: '', codigo: '' },
    a: { texto: '', codigo: '' },
    ii1: { texto: '', codigo: '' },
    ii2: { texto: '', codigo: '' }
  };

  const raw = String(texto || '');

  const plano = sinAcentos_(raw)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cie = '([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)';

  function normalizarCodigoLocal(cod) {
    return String(cod || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toUpperCase()
      .trim();
  }

  function limpiarTextoDx(txt) {
    return limpiarDato_(
      String(txt || '')
        .replace(/\bCodigo\s*CIE[- ]?10\b/gi, '')
        .replace(/\bCodigo\b/gi, '')
        .replace(/\bDiagnostico\s+complementarios?\s+o\s+Debido\s+a\b/gi, '')
        .replace(/\bDiagnostico\s+de\s+causa\s+externa\b/gi, '')
        .replace(/\bDiscapacidad\s+principal\b/gi, '')
        .replace(/\bProcedimientos?.*$/gi, '')
        .replace(/\s+/g, ' ')
    );
  }

  // Tomar solo el bloque de diagnósticos complementarios del FIEH.
  const bloqueMatch = plano.match(
    /Diagnostico\s+complementarios?\s+o\s+Debido\s+a([\s\S]*?)(?:Diagnostico\s+de\s+causa\s+externa|Discapacidad\s+principal|Procedimientos|Fecha\s+de\s+egreso|Condicion|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[1] : plano;

  function extraerSegmento(letra, siguienteRegex) {
    const patron = new RegExp(
      '(?:^|\\s)' + letra + '\\s*\\)\\s*' +
      '([\\s\\S]*?)' +
      '(?=\\s*(?:' + siguienteRegex + '|Diagnostico\\s+de\\s+causa\\s+externa|Discapacidad\\s+principal|Procedimientos|Fecha\\s+de\\s+egreso|Condicion|$))',
      'i'
    );

    const m = bloque.match(patron);

    if (!m) {
      return { texto: '', codigo: '' };
    }

    const segmento = String(m[1] || '').trim();
    const codMatch = segmento.match(new RegExp(cie, 'i'));

    if (!codMatch) {
      return { texto: limpiarTextoDx(segmento), codigo: '' };
    }

    const codigo = normalizarCodigoLocal(codMatch[1]);
    const texto = limpiarTextoDx(segmento.replace(codMatch[0], ' '));

    return {
      texto: texto,
      codigo: codigo
    };
  }

  // Orden visual del FIEH:
  // c) = Complementario 1
  // b) = Complementario 2
  // a) = Complementario 3
  res.c = extraerSegmento('c', 'b\\s*\\)');
  res.b = extraerSegmento('b', 'a\\s*\\)');
  res.a = extraerSegmento('a', 'II\\s*\\)');

  // Extraer II) si vienen con código.
  const patronII = new RegExp(
    '(?:^|\\s)II\\s*\\)\\s*' +
    '([\\s\\S]*?)' +
    '(?=\\s*(?:II\\s*\\)|Diagnostico\\s+de\\s+causa\\s+externa|Discapacidad\\s+principal|Procedimientos|Fecha\\s+de\\s+egreso|Condicion|$))',
    'gi'
  );

  const encontradosII = [];
  let mII;

  while ((mII = patronII.exec(bloque)) !== null) {
    const segmento = String(mII[1] || '').trim();
    const codMatch = segmento.match(new RegExp(cie, 'i'));

    if (!codMatch) continue;

    encontradosII.push({
      texto: limpiarTextoDx(segmento.replace(codMatch[0], ' ')),
      codigo: normalizarCodigoLocal(codMatch[1])
    });
  }

  if (encontradosII[0]) res.ii1 = encontradosII[0];
  if (encontradosII[1]) res.ii2 = encontradosII[1];

  return res;
}

function corregirDistritoFIEH_(distrito, departamento) {
  let d = limpiarDato_(distrito);
  const dep = sinAcentos_(departamento).toLowerCase();

  // Corrección por OCR: Santa Tecla Ll / LL / Li / II debe quedar Santa Tecla LI
  if (dep.includes('la libertad')) {
    d = d.replace(/\s+Ll$/i, ' LI');
    d = d.replace(/\s+LL$/i, ' LI');
    d = d.replace(/\s+Li$/i, ' LI');
    d = d.replace(/\s+II$/i, ' LI');
  }

  return limpiarDato_(d);
}

function limpiarCamposCertificado_(datos) {
  const campos = [
    'CERT_CAUSA_A_TEXTO',
    'CERT_CAUSA_A_CODIGO',
    'CERT_CAUSA_A_INTERVALO',
    'CERT_CAUSA_A_TIEMPO',

    'CERT_CAUSA_B_TEXTO',
    'CERT_CAUSA_B_CODIGO',
    'CERT_CAUSA_B_INTERVALO',
    'CERT_CAUSA_B_TIEMPO',

    'CERT_CAUSA_C_TEXTO',
    'CERT_CAUSA_C_CODIGO',
    'CERT_CAUSA_C_INTERVALO',
    'CERT_CAUSA_C_TIEMPO',

    'CERT_CAUSA_BASICA_D_TEXTO',
    'CERT_CAUSA_BASICA_D_CODIGO',
    'CERT_CAUSA_BASICA_D_INTERVALO',
    'CERT_CAUSA_BASICA_D_TIEMPO',
  
    'CERT_CAUSA_BASICA_D_TEXTO',
    'CERT_CAUSA_BASICA_D_CODIGO',
    'CERT_CAUSA_BASICA_D_INTERVALO',
    'CERT_CAUSA_BASICA_D_TIEMPO',

    'CERT_OTRO_ESTADO_1_TEXTO',
    'CERT_OTRO_ESTADO_1_CODIGO',
    'CERT_OTRO_ESTADO_1_INTERVALO',
    'CERT_OTRO_ESTADO_1_TIEMPO',

    'CERT_OTRO_ESTADO_2_TEXTO',
    'CERT_OTRO_ESTADO_2_CODIGO',
    'CERT_OTRO_ESTADO_2_INTERVALO',
    'CERT_OTRO_ESTADO_2_TIEMPO'
  ];

  campos.forEach(c => datos[c] = '');
}

function corregirIntervalosPorOrdenVisualCertificado_(texto, causas) {
  if (!causas) return causas;

  const base = sinAcentos_(String(texto || ''))
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ');

  // Solo bloque 13 de causa de defunción.
  // Se corta antes de II. Otros estados para NO tomar el 46 días de K66.1.
  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:II\.?\s*Otros\s+estados|8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[1] : base;

  const unidad = '(ano\\(s\\)|anos?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)';

  function normalizarTiempoLocal(unidadTxt) {
    const u = sinAcentos_(String(unidadTxt || '').toLowerCase());

    if (u.includes('ano')) return 'años';
    if (u.includes('mes')) return 'meses';
    if (u.includes('dia')) return 'dias';
    if (u.includes('hora')) return 'horas';
    if (u.includes('minuto')) return 'minutos';

    return '';
  }

  const plano = String(bloque || '')
    .replace(/\n+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const intervalos = [];
  const patronIntervalos = new RegExp(
    '(\\d+)\\s*' + unidad,
    'gi'
  );

  let m;

  while ((m = patronIntervalos.exec(plano)) !== null) {
    intervalos.push({
      intervalo: String(m[1] || '').trim(),
      tiempo: normalizarTiempoLocal(m[2])
    });
  }

  // Solo causas A, B, C y D.
  // Si C está vacía, NO consume intervalo.
  const letrasConCodigo = ['a', 'b', 'c', 'd'].filter(letra => {
    return causas[letra] && causas[letra].codigo;
  });

  letrasConCodigo.forEach((letra, idx) => {
    if (!intervalos[idx]) return;

    causas[letra].intervalo = intervalos[idx].intervalo;
    causas[letra].tiempo = intervalos[idx].tiempo;
  });

  return causas;
}

function extraerDatosCertificadoDefuncion_(texto) {
  const t = normalizarTexto_(texto);
  const plano = t.replace(/\s+/g, ' ').trim();

const causas = extraerCausasCertificado_(t);

// La corrección por código no funciona bien con este OCR,
// porque los intervalos quedan separados del diagnóstico.
// Se corrige por orden visual de las causas con código.
corregirIntervalosPorOrdenVisualCertificado_(t, causas);

  return {
    CERT_CAUSA_A_TEXTO: causas.a.texto,
    CERT_CAUSA_A_CODIGO: causas.a.codigo,
    CERT_CAUSA_A_INTERVALO: causas.a.intervalo,
    CERT_CAUSA_A_TIEMPO: causas.a.tiempo,

    CERT_CAUSA_B_TEXTO: causas.b.texto,
    CERT_CAUSA_B_CODIGO: causas.b.codigo,
    CERT_CAUSA_B_INTERVALO: causas.b.intervalo,
    CERT_CAUSA_B_TIEMPO: causas.b.tiempo,

    CERT_CAUSA_C_TEXTO: causas.c.texto,
    CERT_CAUSA_C_CODIGO: causas.c.codigo,
    CERT_CAUSA_C_INTERVALO: causas.c.intervalo,
    CERT_CAUSA_C_TIEMPO: causas.c.tiempo,

    CERT_CAUSA_BASICA_D_TEXTO: causas.d.texto,
    CERT_CAUSA_BASICA_D_CODIGO: causas.d.codigo,
    CERT_CAUSA_BASICA_D_INTERVALO: causas.d.intervalo,
    CERT_CAUSA_BASICA_D_TIEMPO: causas.d.tiempo,

    CERT_OTRO_ESTADO_1_TEXTO: causas.e.texto,
    CERT_OTRO_ESTADO_1_CODIGO: causas.e.codigo,
    CERT_OTRO_ESTADO_1_INTERVALO: causas.e.intervalo,
    CERT_OTRO_ESTADO_1_TIEMPO: causas.e.tiempo,

    CERT_OTRO_ESTADO_2_TEXTO: causas.f.texto,
    CERT_OTRO_ESTADO_2_CODIGO: causas.f.codigo,
    CERT_OTRO_ESTADO_2_INTERVALO: causas.f.intervalo,
    CERT_OTRO_ESTADO_2_TIEMPO: causas.f.tiempo
  };
}

function corregirIntervalosPorOrdenCausas_(texto, causas) {
  if (!causas) return causas;

  const base = sinAcentos_(String(texto || ''))
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ');

  // Solo bloque 13: causas de defunción.
  // Se corta antes de II. Otros estados para no agarrar el 46 días de K66.1.
  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:II\.?\s*Otros\s+estados|8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[1] : base;

  const unidad = '(ano\\(s\\)|anos?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)';

  function normalizarTiempoLocal(unidadTxt) {
    const u = sinAcentos_(String(unidadTxt || '').toLowerCase());

    if (u.includes('ano')) return 'años';
    if (u.includes('mes')) return 'meses';
    if (u.includes('dia')) return 'dias';
    if (u.includes('hora')) return 'horas';
    if (u.includes('minuto')) return 'minutos';

    return '';
  }

  const plano = String(bloque || '')
    .replace(/\n+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const intervalos = [];
  const patronIntervalos = new RegExp(
    '(\\d+)\\s*' + unidad,
    'gi'
  );

  let m;

  while ((m = patronIntervalos.exec(plano)) !== null) {
    intervalos.push({
      intervalo: String(m[1] || '').trim(),
      tiempo: normalizarTiempoLocal(m[2])
    });
  }

  // Solo causas principales del certificado: a, b, c, d.
  // Si c está vacía, NO consume intervalo.
  const letrasConCodigo = ['a', 'b', 'c', 'd'].filter(letra => {
    return causas[letra] && causas[letra].codigo;
  });

  letrasConCodigo.forEach((letra, idx) => {
    if (!intervalos[idx]) return;

    causas[letra].intervalo = intervalos[idx].intervalo;
    causas[letra].tiempo = intervalos[idx].tiempo;
  });

  return causas;
}

function corregirIntervalosCertificadoPorCodigo_(texto, causas) {
  if (!causas) return causas;

  const base = sinAcentos_(String(texto || ''))
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ');

  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[1] : base;

  const plano = String(bloque || '')
    .replace(/\n+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const cie = '([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)';
  const unidad = '(ano\\(s\\)|anos?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)';

  function normalizarCodigoLocal(cod) {
    let c = String(cod || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toUpperCase()
      .trim();

    if (/^[A-Z]\d{3,4}$/.test(c)) {
      c = c.slice(0, 3) + '.' + c.slice(3);
    }

    return c;
  }

  function normalizarTiempoLocal(unidadTxt) {
    const u = sinAcentos_(String(unidadTxt || '').toLowerCase());

    if (u.includes('ano')) return 'años';
    if (u.includes('mes')) return 'meses';
    if (u.includes('dia')) return 'dias';
    if (u.includes('hora')) return 'horas';
    if (u.includes('minuto')) return 'minutos';

    return '';
  }

  const mapaIntervalos = {};

  const patron = new RegExp(
    cie +
    '\\s*[-–:]?\\s*' +
    '[\\s\\S]{0,220}?' +
    '\\s+(\\d+)\\s*' +
    unidad,
    'gi'
  );

  let m;

  while ((m = patron.exec(plano)) !== null) {
    const codigo = normalizarCodigoLocal(m[1]);

    if (!/^[A-Z]\d{2}(?:\.\d{1,2})?$/.test(codigo)) continue;

    if (!mapaIntervalos[codigo]) {
      mapaIntervalos[codigo] = {
        intervalo: String(m[2] || '').trim(),
        tiempo: normalizarTiempoLocal(m[3])
      };
    }
  }

  ['a', 'b', 'c', 'd', 'e', 'f'].forEach(letra => {
    if (!causas[letra] || !causas[letra].codigo) return;

    const codigo = normalizarCodigoLocal(causas[letra].codigo);
    const info = mapaIntervalos[codigo];

    if (!info) return;

    causas[letra].intervalo = info.intervalo;
    causas[letra].tiempo = info.tiempo;
  });

  return causas;
}

function extraerCausasCertificado_(texto) {
  const res = {
    a: { texto: '', codigo: '', intervalo: '', tiempo: '' },
    b: { texto: '', codigo: '', intervalo: '', tiempo: '' },
    c: { texto: '', codigo: '', intervalo: '', tiempo: '' },
    d: { texto: '', codigo: '', intervalo: '', tiempo: '' },
    e: { texto: '', codigo: '', intervalo: '', tiempo: '' },
    f: { texto: '', codigo: '', intervalo: '', tiempo: '' }
  };

  const original = String(texto || '');

  const base = sinAcentos_(original)
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ');

  const cie = '([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)';
  const unidad = '(ano\\(s\\)|anos?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)';

  function normalizarCodigo(cod) {
    let c = String(cod || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toUpperCase()
      .trim();

    // Corrige casos como R651, R572, N178, N390.
    if (/^[A-Z]\d{3,4}$/.test(c)) {
      c = c.slice(0, 3) + '.' + c.slice(3);
    }

    return c;
  }

  function normalizarTiempo(unidadTxt) {
    const u = sinAcentos_(String(unidadTxt || '').toLowerCase());

    if (u.includes('ano')) return 'años';
    if (u.includes('mes')) return 'meses';
    if (u.includes('dia')) return 'dias';
    if (u.includes('hora')) return 'horas';
    if (u.includes('minuto')) return 'minutos';

    return '';
  }

  function limpiarTextoCausa(txt) {
    let v = String(txt || '');

    // Corta el texto cuando el OCR mezcla la siguiente causa dentro de la misma línea.
    // Ejemplo:
    // "Síndrome... (b) R57.2 - Choque..." debe quedar solo "Síndrome..."
    v = v.replace(/\s+\(?[abcd]\)?\s*[A-Z]\s*\d\s*\d(?:\s*[.,]\s*\d{1,2})?[\s\S]*$/i, '');

    // Corta también si encuentra una etiqueta sola de otra causa.
    // Ejemplo:
    // "Choque septico (c) (d) J15.8..." debe quedar solo "Choque septico"
    v = v.replace(/\s+\(?[abcd]\)?\s*[\s\S]*$/i, '');

    return limpiarDato_(
      v
        .replace(/\bCodigo\b/gi, '')
        .replace(/\bCIE[- ]?10\b/gi, '')
        .replace(/\bIntervalo\b/gi, '')
        .replace(/\bDebido\s+a\b/gi, '')
        .replace(/\bcomo\s+consecuencia\s+de\b/gi, '')
        .replace(/\(\s*o\s*\)/gi, '')
        .replace(/\bCAUSA\s+BASICA\b/gi, '')
        .replace(/\s+/g, ' ')
    );
  }
  
  function asignar(letra, codigo, textoCausa, intervalo, tiempo) {
    if (!letra || !res[letra]) return;

    res[letra].codigo = normalizarCodigo(codigo);
    res[letra].texto = limpiarTextoCausa(textoCausa);
    res[letra].intervalo = String(intervalo || '').trim();
    res[letra].tiempo = normalizarTiempo(tiempo);
  }

  // Solo tomar el bloque de CAUSA DE DEFUNCION.
  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:II\.?\s*Otros\s+estados|8\.\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  let bloque = bloqueMatch ? bloqueMatch[1] : base;

  bloque = String(bloque || '')
    .replace(/\n+/g, '\n')
    .replace(/[ ]+/g, ' ')
    .trim();

  const orden = ['a', 'b', 'c', 'd'];

  // MÉTODO PRINCIPAL:
  // Busca cada letra de forma independiente.
  // Así A no se come B, C ni D.
  orden.forEach(letra => {
    const patronLetra = new RegExp(
      '\\(\\s*' + letra + '\\s*\\)\\s*' +
      cie +
      '\\s*[-–:]?\\s*' +
      '([\\s\\S]{0,450}?)' +
      '\\s+(\\d+)\\s*' +
      unidad,
      'i'
    );

    const m = bloque.match(patronLetra);

    if (m) {
      asignar(letra, m[1], m[2], m[3], m[4]);
    }
  });

  // RESPALDO POR LÍNEAS:
  // Si una letra no salió arriba, busca línea por línea.
  // Este respaldo respeta la letra real: a, b, c o d.
  const lineas = bloque
    .split(/\n/)
    .map(limpiarDato_)
    .filter(Boolean);

  orden.forEach(letra => {
    if (res[letra].codigo && res[letra].intervalo) return;

    const patronLinea = new RegExp(
      '\\(\\s*' + letra + '\\s*\\)\\s*' +
      cie +
      '\\s*[-–:]?\\s*' +
      '(.+?)' +
      '\\s+(\\d+)\\s*' +
      unidad,
      'i'
    );

    for (const linea of lineas) {
      const m = linea.match(patronLinea);

      if (m) {
        asignar(letra, m[1], m[2], m[3], m[4]);
        break;
      }
    }
  });

  // CORRECCIÓN SEGURA DE INTERVALOS POR CÓDIGO CIE-10:
  // No cambia códigos ni textos. Solo corrige intervalo y unidad
  // buscando el intervalo que aparece después del mismo código CIE-10.
  function rxCodigoFlexible(codigo) {
    const c = normalizarCodigo(codigo);
    const m = c.match(/^([A-Z])(\d)(\d)(?:\.(\d{1,2}))?$/);

    if (!m) {
      return String(c || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    let rx = m[1] + '\\s*' + m[2] + '\\s*' + m[3];

    if (m[4]) {
      rx += '\\s*[\\.,]?\\s*' + m[4];
    }

    return rx;
  }

  function buscarIntervaloPorCodigo(codigo) {
    if (!codigo) return null;

    const plano = String(bloque || '')
      .replace(/\r/g, ' ')
      .replace(/\n+/g, ' ')
      .replace(/[ ]+/g, ' ')
      .trim();

    const rxCod = new RegExp(rxCodigoFlexible(codigo), 'i');
    const mCod = rxCod.exec(plano);

    if (!mCod) return null;

    const desde = mCod.index + mCod[0].length;
    const resto = plano.slice(desde);

    // Cortar antes del siguiente código CIE-10 para que una causa
    // no robe el intervalo de la siguiente.
    const rxOtroCodigo = new RegExp(cie, 'i');
    const mOtro = rxOtroCodigo.exec(resto);

    let segmento = mOtro
      ? resto.slice(0, mOtro.index)
      : resto;

    // Cortes de seguridad para no entrar a otra sección.
    const corte = segmento.search(
      /CAUSA\s+BASICA|II\.?\s*Otros\s+estados|8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA/i
    );

    if (corte >= 0) {
      segmento = segmento.slice(0, corte);
    }

    const mIntervalo = segmento.match(
      new RegExp('(\\d+)\\s*' + unidad, 'i')
    );

    if (!mIntervalo) return null;

    return {
      intervalo: String(mIntervalo[1] || '').trim(),
      tiempo: normalizarTiempo(mIntervalo[2])
    };
  }

  orden.forEach(letra => {
    if (!res[letra].codigo) {
      res[letra].intervalo = '';
      res[letra].tiempo = '';
      return;
    }

    const hallado = buscarIntervaloPorCodigo(res[letra].codigo);

    if (hallado) {
      res[letra].intervalo = hallado.intervalo;
      res[letra].tiempo = hallado.tiempo;
    }
  });

    // CORRECCIÓN FINAL DE INTERVALOS POR LÍNEA REAL DEL CERTIFICADO:
  // No cambia códigos ni textos. Solo corrige intervalo y unidad.
  // Busca el intervalo en la misma línea donde aparece cada código.
  (function corregirIntervalosPorLinea_() {
    const lineasIntervalo = String(bloque || '')
      .split(/\n/)
      .map(limpiarDato_)
      .filter(Boolean);

    function extraerIntervaloDeLinea(linea) {
      const patron = new RegExp(
        cie +
        '[\\s\\S]*?' +
        '(\\d+)\\s*' +
        unidad,
        'i'
      );

      const m = String(linea || '').match(patron);

      if (!m) return null;

      return {
        codigo: normalizarCodigo(m[1]),
        intervalo: String(m[2] || '').trim(),
        tiempo: normalizarTiempo(m[3])
      };
    }

    function aplicarIntervalo(letra, info) {
      if (!info) return;
      if (!res[letra] || !res[letra].codigo) return;

      const codigoActual = normalizarCodigo(res[letra].codigo);

      // Solo corrige si el código de la línea es el mismo código ya extraído.
      // Así no mueve códigos ni toca textos.
      if (codigoActual !== info.codigo) return;

      res[letra].intervalo = info.intervalo;
      res[letra].tiempo = info.tiempo;
    }

    for (let i = 0; i < lineasIntervalo.length; i++) {
      const linea = lineasIntervalo[i];

      const mLetra = linea.match(/^\(?\s*([abcd])\s*\)/i);

      if (!mLetra) continue;

      const letra = mLetra[1].toLowerCase();

      // Caso normal: la misma línea tiene letra + código + intervalo.
      const infoMismaLinea = extraerIntervaloDeLinea(linea);

      if (infoMismaLinea) {
        aplicarIntervalo(letra, infoMismaLinea);
        continue;
      }

      // Caso especial: la letra está sola, como:
      // (d)
      // J15.8 - Otras neumonías bacterianas 21 día(s)
      for (let j = i + 1; j < Math.min(i + 4, lineasIntervalo.length); j++) {
        const siguienteLinea = lineasIntervalo[j];

        if (/^\(?\s*[abcd]\s*\)/i.test(siguienteLinea)) break;
        if (/CAUSA\s+BASICA|II\.?\s*Otros\s+estados/i.test(siguienteLinea)) break;

        const infoSiguiente = extraerIntervaloDeLinea(siguienteLinea);

        if (infoSiguiente) {
          aplicarIntervalo(letra, infoSiguiente);
          break;
        }
      }
    }
  })();

  // OTROS ESTADOS PATOLÓGICOS:
  // Corresponden a la sección II del certificado.
  // Se asignan a:
  // e = Otro Estado Patológico 1
  // f = Otro Estado Patológico 2
  const otrosMatch = base.match(
    /II\.?\s*Otros\s+estados\s+patologicos([\s\S]*?)(?:8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  let bloqueOtros = otrosMatch ? otrosMatch[1] : '';

  bloqueOtros = String(bloqueOtros || '')
    .replace(/\n+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const patronOtros = new RegExp(
    cie +
    '\\s*[-–:]?\\s*' +
    '([\\s\\S]{0,300}?)' +
    '\\s+(\\d+)\\s*' +
    unidad,
    'gi'
  );

  const otros = [];
  let mo;

  while ((mo = patronOtros.exec(bloqueOtros)) !== null) {
    const codigo = normalizarCodigo(mo[1]);

    if (!/^[A-Z]\d{2}(?:\.\d{1,2})?$/.test(codigo)) continue;

    otros.push({
      codigo: mo[1],
      texto: mo[2],
      intervalo: mo[3],
      tiempo: mo[4]
    });
  }

  if (otros[0]) {
    asignar(
      'e',
      otros[0].codigo,
      otros[0].texto,
      otros[0].intervalo,
      otros[0].tiempo
    );
  }

  if (otros[1]) {
    asignar(
      'f',
      otros[1].codigo,
      otros[1].texto,
      otros[1].intervalo,
      otros[1].tiempo
    );
  }

  return res;
}

function normalizarCodigoCIE_(cod) {
  return String(cod || '')
    .replace(/\s+/g, '')
    .replace(',', '.')
    .toUpperCase()
    .trim();
}

function extraerEdadFIEH_(plano) {
  const resultado = {
    anios: '',
    meses: '',
    dias: ''
  };

  let bloque = '';

  const mBloque = String(plano || '').match(/Edad\s*:?\s*(.*?)\s*Sexo\s*:/i);

  if (mBloque) {
    bloque = mBloque[1];
  } else {
    const m = String(plano || '').match(/Edad\s*:?\s*(.{0,80})/i);
    bloque = m ? m[1] : '';
  }

  let texto = sinAcentos_(bloque)
    .replace(/,/g, ' ')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  texto = texto
    .replace(/\ba\s*nos?\b/g, 'anos')
    .replace(/\banos?\b/g, 'anos')
    .replace(/\bmes\b/g, 'meses')
    .replace(/\bdia\b/g, 'dias');

  const mAnio = texto.match(/(\d+)\s*anos?/i);
  const mMes = texto.match(/(\d+)\s*meses?/i);
  const mDia = texto.match(/(\d+)\s*dias?/i);

  if (mAnio) resultado.anios = mAnio[1];
  if (mMes) resultado.meses = mMes[1];
  if (mDia) resultado.dias = mDia[1];

  if (!resultado.anios && !resultado.meses && !resultado.dias) {
    const nums = texto.match(/\d+/g) || [];

    resultado.anios = nums[0] || '';
    resultado.meses = nums[1] || '';
    resultado.dias = nums[2] || '';
  }

  return resultado;
}

function diagnosticarUltimoCertificadoDefuncion_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRaw = ss.getSheetByName(SHEETS.RAW);

  if (!shRaw) {
    throw new Error('No existe la hoja RAW: ' + SHEETS.RAW);
  }

  const data = shRaw.getDataRange().getValues();

  let filaCert = null;

  for (let i = data.length - 1; i >= 1; i--) {
    const id = String(data[i][0] || '');
    const nombre = String(data[i][2] || '');

    if (id.includes('_CERT') || nombre.toUpperCase().includes('CERT')) {
      filaCert = data[i];
      break;
    }
  }

  if (!filaCert) {
    throw new Error('No se encontró ningún certificado en FIEH_RAW.');
  }

  const texto = String(filaCert[3] || '');
  const t = normalizarTexto_(texto);

  const base = sinAcentos_(String(t || ''))
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ');

  const bloqueMatch = base.match(
    /13\.?\s*CAUSA\s+DE\s+DEFUNCION([\s\S]*?)(?:8\.?\s*Edad|14\.|MUERTE\s+ACCIDENTAL|ASISTENCIA|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[1] : base;

  const cie = '([A-Z]\\s*\\d\\s*\\d(?:\\s*[\\.,]\\s*\\d{1,2})?)';
  const unidad = '(ano\\(s\\)|anos?|mes\\(es\\)|meses?|dia\\(s\\)|dias?|hora\\(s\\)|horas?|minuto\\(s\\)|minutos?)';

  function normalizarCodigoDebug_(cod) {
    let c = String(cod || '')
      .replace(/\s+/g, '')
      .replace(',', '.')
      .toUpperCase()
      .trim();

    if (/^[A-Z]\d{3,4}$/.test(c)) {
      c = c.slice(0, 3) + '.' + c.slice(3);
    }

    return c;
  }

  function normalizarTiempoDebug_(unidadTxt) {
    const u = sinAcentos_(String(unidadTxt || '').toLowerCase());

    if (u.includes('ano')) return 'años';
    if (u.includes('mes')) return 'meses';
    if (u.includes('dia')) return 'dias';
    if (u.includes('hora')) return 'horas';
    if (u.includes('minuto')) return 'minutos';

    return '';
  }

  const plano = String(bloque || '')
    .replace(/\n+/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();

  const patronCodigoIntervalo = new RegExp(
    cie +
    '\\s*[-–:]?\\s*' +
    '[\\s\\S]{0,220}?' +
    '\\s+(\\d+)\\s*' +
    unidad,
    'gi'
  );

  const coincidenciasCodigoIntervalo = [];
  const mapaIntervalos = {};

  let m;

  while ((m = patronCodigoIntervalo.exec(plano)) !== null) {
    const codigo = normalizarCodigoDebug_(m[1]);

    const item = {
      codigo: codigo,
      intervalo: String(m[2] || '').trim(),
      tiempo: normalizarTiempoDebug_(m[3]),
      coincidenciaCompleta: m[0]
    };

    coincidenciasCodigoIntervalo.push(item);

    if (!mapaIntervalos[codigo]) {
      mapaIntervalos[codigo] = {
        intervalo: item.intervalo,
        tiempo: item.tiempo
      };
    }
  }

  const intervalosSueltos = [];
  const patronIntervalos = new RegExp('(\\d+)\\s*' + unidad, 'gi');
  let mi;

  while ((mi = patronIntervalos.exec(plano)) !== null) {
    intervalosSueltos.push({
      intervalo: String(mi[1] || '').trim(),
      tiempo: normalizarTiempoDebug_(mi[2]),
      coincidenciaCompleta: mi[0]
    });
  }

  const causasAntes = extraerCausasCertificado_(t);

  const causasDespues = JSON.parse(JSON.stringify(causasAntes));
  corregirIntervalosCertificadoPorCodigo_(t, causasDespues);

  let shDebug = ss.getSheetByName('DEBUG_CERT');
  if (!shDebug) shDebug = ss.insertSheet('DEBUG_CERT');

  shDebug.clear();

  const filas = [
    ['ITEM', 'VALOR'],
    ['ID_PROCESO_CERT', filaCert[0]],
    ['NOMBRE_ARCHIVO', filaCert[2]],
    ['TEXTO_COMPLETO_CERTIFICADO', texto],
    ['BLOQUE_CAUSA_DEFUNCION', bloque],
    ['PLANO_CAUSAS', plano],
    ['LINEAS_BLOQUE', JSON.stringify(String(bloque || '').split(/\n/).map(limpiarDato_).filter(Boolean), null, 2)],
    ['COINCIDENCIAS_CODIGO_INTERVALO', JSON.stringify(coincidenciasCodigoIntervalo, null, 2)],
    ['MAPA_INTERVALOS', JSON.stringify(mapaIntervalos, null, 2)],
    ['INTERVALOS_SUELTOS', JSON.stringify(intervalosSueltos, null, 2)],
    ['CAUSAS_EXTRAIDAS_ANTES_CORRECCION', JSON.stringify(causasAntes, null, 2)],
    ['CAUSAS_DESPUES_CORRECCION_POR_CODIGO', JSON.stringify(causasDespues, null, 2)]
  ];

  shDebug.getRange(1, 1, filas.length, 2).setValues(filas);
  shDebug.autoResizeColumns(1, 2);

  return 'Diagnóstico generado en la hoja DEBUG_CERT.';
}

function diagnosticarCertificado() {
  return diagnosticarUltimoCertificadoDefuncion_();
}

function diagnosticarCircunstanciaAlta() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shRaw = ss.getSheetByName(SHEETS.RAW);

  if (!shRaw) {
    throw new Error('No existe la hoja RAW: ' + SHEETS.RAW);
  }

  const data = shRaw.getDataRange().getValues();

  let filaFieh = null;

  for (let i = data.length - 1; i >= 1; i--) {
    const id = String(data[i][0] || '');
    const nombre = String(data[i][2] || '').toUpperCase();

    if (!id.includes('_CERT') && !nombre.includes('CERT')) {
      filaFieh = data[i];
      break;
    }
  }

  if (!filaFieh) {
    throw new Error('No se encontró FIEH en FIEH_RAW.');
  }

  const texto = String(filaFieh[3] || '');

  const bloqueMatch = texto.match(
    /Circunstancia\s+de\s+alta\s*:?\s*([\s\S]*?)(?:Recomendaciones|Nombre\s+del\s+m[eé]dico|No\.?\s*JVPM|Fecha\s+de\s+digitaci[oó]n|$)/i
  );

  const bloque = bloqueMatch ? bloqueMatch[0] : 'NO SE ENCONTRÓ BLOQUE CIRCUNSTANCIA';

  let shDebug = ss.getSheetByName('DEBUG_CIRCUNSTANCIA');
  if (!shDebug) shDebug = ss.insertSheet('DEBUG_CIRCUNSTANCIA');

  shDebug.clear();

  const filas = [
    ['ITEM', 'VALOR'],
    ['ID_PROCESO', filaFieh[0]],
    ['NOMBRE_ARCHIVO', filaFieh[2]],
    ['BLOQUE_CIRCUNSTANCIA', bloque],
    ['TEXTO_COMPLETO_FIEH', texto]
  ];

  shDebug.getRange(1, 1, filas.length, 2).setValues(filas);
  shDebug.autoResizeColumns(1, 2);

  return 'Diagnóstico generado en la hoja DEBUG_CIRCUNSTANCIA.';
}

function PROBAR_DIVISION_NOMBRES_APELLIDOS() {
  const pruebas = [
    'MARIA DEL CARMEN',
    'DEL CARMEN',
    'JOSE DE LEON',
    'DE LEON',
    'GARCIA DE MONICO',
    'MARTINEZ DE ALAS',
    'LOPEZ DE LA CRUZ',
    'MARIA DE LOS ANGELES',
    'RODRIGUEZ DE LAS MERCEDES'
  ];

  pruebas.forEach(p => {
    Logger.log(p + ' => ' + JSON.stringify(dividirNombre_(p)));
  });
}
