// Generador del script de consola de Chrome que autollena SIMMOW. Port
// verbatim del template de la herramienta original de Apps Script
// (generarCodigoConsola_ / prepararPayloadSIMMOW_): el propio script generado
// es JavaScript de navegador plano, sin ninguna dependencia de Apps Script,
// así que se reproduce tal cual — solo cambia de dónde saca los datos.

import type { DatosSimmow } from "./types";
import { limpiarNumeroIdentificacionSIMMOW, limpiarDireccionParaSIMMOW, mayus, soloNumeros, cortar } from "./texto";

interface PayloadSimmow {
  tipo_doc: string;
  num_doc: string;
  tipo_afiliacion: string;
  num_afiliacion: string;
  expe: string;
  apellido_1: string;
  apellido_2: string;
  apellido_3: string;
  nombre_1: string;
  nombre_2: string;
  nombre_3: string;
  edad: string;
  meses: string;
  dias: string;
  sexo: string;
  direccion: string;
  departamento: string;
  distrito: string;
  canton: string;
  area: string;
  fecingreso: string;
  tipo_accidente: string;
  servicio_hospitalario: string;
  referido_a_establecimiento: string;
  referido_del_establecimiento: string;
  retorno_hacia: string;
  diag_cd: string;
  diag_cds: string;
  diag_cd3: string;
  diag_cd4: string;
  diag_cd5: string;
  diag_cd6: string;
  causa_externa_codigo: string;
  causa_externa_texto: string;
  discapacidad_principal_codigo: string;
  discapacidad_principal_texto: string;
  cirugia_1_codigo: string;
  cirugia_1_texto: string;
  cirugia_1_fecha: string;
  cirugia_1_cirujano: string;
  cirugia_1_tipo: string;
  cirugia_2_codigo: string;
  cirugia_2_texto: string;
  cirugia_2_fecha: string;
  cirugia_2_cirujano: string;
  cirugia_2_tipo: string;
  cirugia_3_codigo: string;
  cirugia_3_texto: string;
  cirugia_3_fecha: string;
  cirugia_3_cirujano: string;
  cirugia_3_tipo: string;
  cirugia_4_codigo: string;
  cirugia_4_texto: string;
  cirugia_4_fecha: string;
  cirugia_4_cirujano: string;
  cirugia_4_tipo: string;
  cirugia_suspendida: string;
  condicion: string;
  diag_cd_a: string;
  diag_txt_a: string;
  diag_cd_a_intervalo: string;
  diag_cd_a_tiempo: string;
  diag_cd_b: string;
  diag_txt_b: string;
  diag_cd_b_intervalo: string;
  diag_cd_b_tiempo: string;
  diag_cd_c: string;
  diag_txt_c: string;
  diag_cd_c_intervalo: string;
  diag_cd_c_tiempo: string;
  diag_cd_d_basica: string;
  diag_txt_d_basica: string;
  diag_cd_d_basica_intervalo: string;
  diag_cd_d_basica_tiempo: string;
  diag_cd_e: string;
  diag_txt_e: string;
  diag_cd_e_intervalo: string;
  diag_cd_e_tiempo: string;
  diag_cd_f: string;
  diag_txt_f: string;
  diag_cd_f_intervalo: string;
  diag_cd_f_tiempo: string;
  fecegreso: string;
  tiempo_horas: string;
  tiempo_minutos: string;
  motivo_alta: string;
  observaciones: string;
  medico_responsable: string;
  advertencias: string[];
}

function prepararPayloadSIMMOW(datos: DatosSimmow, advertencias: string[]): PayloadSimmow {
  const edadSoloAnios = soloNumeros(datos.EDAD_ANIOS || "");

  return {
    tipo_doc: datos.TIPO_DOCUMENTO_VALOR || "1",
    num_doc: limpiarNumeroIdentificacionSIMMOW(datos.NUM_DOCUMENTO),

    tipo_afiliacion: datos.TIPO_AFILIACION_VALOR || "",
    num_afiliacion: limpiarNumeroIdentificacionSIMMOW(datos.NUM_AFILIACION),

    expe: datos.NEC || "",

    apellido_1: mayus(datos.PRIMER_APELLIDO),
    apellido_2: mayus(datos.SEGUNDO_APELLIDO),
    apellido_3: mayus(datos.TERCER_APELLIDO),

    nombre_1: mayus(datos.PRIMER_NOMBRE),
    nombre_2: mayus(datos.SEGUNDO_NOMBRE),
    nombre_3: mayus(datos.TERCER_NOMBRE),

    edad: edadSoloAnios,
    meses: "",
    dias: "",

    sexo: datos.SEXO || "",

    direccion: limpiarDireccionParaSIMMOW(datos.DIRECCION || ""),
    departamento: datos.DEPARTAMENTO || "",
    distrito: datos.DISTRITO || "",
    canton: datos.CANTON || "",
    area: datos.AREA || "",

    fecingreso: datos.FECHA_INGRESO || "",
    tipo_accidente: datos.TIPO_ACCIDENTE_VALOR || "",
    servicio_hospitalario: datos.SERVICIO_HOSPITALARIO_VALOR || "",

    referido_a_establecimiento: datos.REFERIDO_A_ESTABLECIMIENTO || "",
    referido_del_establecimiento: datos.REFERIDO_DEL_ESTABLECIMIENTO || "",
    retorno_hacia: datos.RETORNO_HACIA || "",

    diag_cd: datos.DIAG_PRINCIPAL_CODIGO || "",

    // Orden visual del FIEH: complementario 1=c) 2=b) 3=a) 4=II) 5=II)
    diag_cds: datos.DIAG_C_CODIGO || "",
    diag_cd3: datos.DIAG_B_CODIGO || "",
    diag_cd4: datos.DIAG_A_CODIGO || "",
    diag_cd5: datos.DIAG_II1_CODIGO || "",
    diag_cd6: datos.DIAG_II2_CODIGO || "",

    causa_externa_codigo: datos.CAUSA_EXTERNA_CODIGO || "",
    causa_externa_texto: datos.CAUSA_EXTERNA_TEXTO || "",
    discapacidad_principal_codigo: datos.DISCAPACIDAD_PRINCIPAL_CODIGO || "",
    discapacidad_principal_texto: datos.DISCAPACIDAD_PRINCIPAL_TEXTO || "",

    cirugia_1_codigo: datos.CIRUGIA_1_CODIGO || "",
    cirugia_1_texto: datos.CIRUGIA_1_TEXTO || "",
    cirugia_1_fecha: datos.CIRUGIA_1_FECHA || "",
    cirugia_1_cirujano: datos.CIRUGIA_1_CIRUJANO || "",
    cirugia_1_tipo: datos.CIRUGIA_1_TIPO || "",

    cirugia_2_codigo: datos.CIRUGIA_2_CODIGO || "",
    cirugia_2_texto: datos.CIRUGIA_2_TEXTO || "",
    cirugia_2_fecha: datos.CIRUGIA_2_FECHA || "",
    cirugia_2_cirujano: datos.CIRUGIA_2_CIRUJANO || "",
    cirugia_2_tipo: datos.CIRUGIA_2_TIPO || "",

    cirugia_3_codigo: datos.CIRUGIA_3_CODIGO || "",
    cirugia_3_texto: datos.CIRUGIA_3_TEXTO || "",
    cirugia_3_fecha: datos.CIRUGIA_3_FECHA || "",
    cirugia_3_cirujano: datos.CIRUGIA_3_CIRUJANO || "",
    cirugia_3_tipo: datos.CIRUGIA_3_TIPO || "",

    cirugia_4_codigo: datos.CIRUGIA_4_CODIGO || "",
    cirugia_4_texto: datos.CIRUGIA_4_TEXTO || "",
    cirugia_4_fecha: datos.CIRUGIA_4_FECHA || "",
    cirugia_4_cirujano: datos.CIRUGIA_4_CIRUJANO || "",
    cirugia_4_tipo: datos.CIRUGIA_4_TIPO || "",
    cirugia_suspendida: String(datos.CIRUGIA_SUSPENDIDA_VALOR || "").toUpperCase() === "SI" ? "SI" : "",

    condicion: datos.CONDICION_EGRESO || "",

    // Solo fallecidos. Vienen del Certificado de Defunción, no del FIEH.
    diag_cd_a: datos.CERT_CAUSA_A_CODIGO || "",
    diag_txt_a: datos.CERT_CAUSA_A_TEXTO || "",
    diag_cd_a_intervalo: datos.CERT_CAUSA_A_INTERVALO || "",
    diag_cd_a_tiempo: datos.CERT_CAUSA_A_TIEMPO || "",

    diag_cd_b: datos.CERT_CAUSA_B_CODIGO || "",
    diag_txt_b: datos.CERT_CAUSA_B_TEXTO || "",
    diag_cd_b_intervalo: datos.CERT_CAUSA_B_INTERVALO || "",
    diag_cd_b_tiempo: datos.CERT_CAUSA_B_TIEMPO || "",

    diag_cd_c: datos.CERT_CAUSA_C_CODIGO || "",
    diag_txt_c: datos.CERT_CAUSA_C_TEXTO || "",
    diag_cd_c_intervalo: datos.CERT_CAUSA_C_INTERVALO || "",
    diag_cd_c_tiempo: datos.CERT_CAUSA_C_TIEMPO || "",

    diag_cd_d_basica: datos.CERT_CAUSA_BASICA_D_CODIGO || "",
    diag_txt_d_basica: datos.CERT_CAUSA_BASICA_D_TEXTO || "",
    diag_cd_d_basica_intervalo: datos.CERT_CAUSA_BASICA_D_INTERVALO || "",
    diag_cd_d_basica_tiempo: datos.CERT_CAUSA_BASICA_D_TIEMPO || "",

    diag_cd_e: datos.CERT_OTRO_ESTADO_1_CODIGO || "",
    diag_txt_e: datos.CERT_OTRO_ESTADO_1_TEXTO || "",
    diag_cd_e_intervalo: datos.CERT_OTRO_ESTADO_1_INTERVALO || "",
    diag_cd_e_tiempo: datos.CERT_OTRO_ESTADO_1_TIEMPO || "",

    diag_cd_f: datos.CERT_OTRO_ESTADO_2_CODIGO || "",
    diag_txt_f: datos.CERT_OTRO_ESTADO_2_TEXTO || "",
    diag_cd_f_intervalo: datos.CERT_OTRO_ESTADO_2_INTERVALO || "",
    diag_cd_f_tiempo: datos.CERT_OTRO_ESTADO_2_TIEMPO || "",

    fecegreso: datos.FECHA_EGRESO || "",
    tiempo_horas: datos.HORA_EGRESO || "",
    tiempo_minutos: datos.MINUTO_EGRESO || "",

    motivo_alta: datos.MOTIVO_ALTA_VALOR || "",
    observaciones: cortar(datos.RECOMENDACIONES || "", 300),
    // El campo "Médico Responsable" de SIMMOW espera el código interno que
    // SIMMOW le asigna al médico (no el JVPM del SIS, que no coincide entre
    // ambos sistemas) — se resuelve por nombre contra el catálogo real.
    medico_responsable: datos.MEDICO_RESPONSABLE_CODIGO_SIMMOW || "",

    advertencias,
  };
}

/** Escapa lo mínimo necesario para insertar un JSON dentro de un template literal. */
function escaparParaTemplateLiteral(json: string): string {
  return json.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Genera el script que se pega en la consola de Chrome dentro de SIMMOW.
 * Es JavaScript de navegador puro (sin nada de React/Next): localiza los
 * campos del formulario de SIMMOW por `name`, simula tecleo real para que
 * los listeners de SIMMOW disparen sus validaciones, y NUNCA presiona Grabar.
 */
export function generarScriptConsola(datos: DatosSimmow, advertencias: string[] = []): string {
  const data = prepararPayloadSIMMOW(datos, advertencias);
  const dataJson = escaparParaTemplateLiteral(JSON.stringify(data, null, 2));

  return `
// Código generado por el módulo SIMMOW de esdomed-services
// Pegue este bloque en la consola de Chrome dentro de SIMMOW.
// Este código NO presiona Grabar. Revise antes de guardar.

;(async () => {
  if (window.__simmowLlenadoEnCurso) {
    console.error('Ya hay un llenado en curso en esta pestaña. Espere a que termine (o recargue la página) antes de pegar el código de nuevo — ejecutarlo dos veces a la vez duplica los caracteres escritos en los campos.');
    return;
  }
  window.__simmowLlenadoEnCurso = true;

  const DATA = ${dataJson};
  const errores = [];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const norm = (txt) => String(txt || '')
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
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

    try {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    } catch (e) {
      try { el.click(); } catch (e2) {}
    }

    el.focus();
    await sleep(200);

    try {
      el.select();
      el.setSelectionRange(0, String(el.value || '').length);
    } catch (e) {}

    setNativeValue(el, '');
    el.value = '';
    await sleep(150);

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

    const textoEl = byName(textoName);
    if (textoEl && (!textoEl.value || !textoEl.value.trim())) {
      setNativeValue(textoEl, item.texto || '');
      fire(textoEl);
    }

    setText(fechaName, item.fecha);
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
      // SIMMOW valida el combobox comparando el input visible contra el
      // textContent SIN normalizar de la opción (algunas tienen espacios
      // dobles en su texto real) — si no coincide exacto, su propio widget
      // borra el input y el select al perder el foco. Por eso guardamos el
      // texto crudo aparte del texto normalizado usado para buscar/loguear.
      rawText: o.textContent || o.text || '',
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
        .split(/(?=[A-Z])|\\s+/)
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
        visibleInput.value = op.rawText;
        fire(visibleInput);

        if (window.jQuery) {
          window.jQuery(visibleInput).val(op.rawText).trigger('change').trigger('blur');
        }
      }
    } catch (e) {}

    console.log('Establecimiento seleccionado en ' + name + ':', op.text, op.value);
  };

  const setRadioByIndex = (name, index) => {
    if (index === '' || index === undefined || index === null) return;

    const radios = [...document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]')]
      .filter(el => {
        if (!el) return false;
        return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      });

    if (!radios.length) {
      errores.push('No se encontró radio visible: ' + name);
      return;
    }

    const radio = radios[index];

    if (!radio) {
      errores.push('No existe índice ' + index + ' para radio visible: ' + name);
      return;
    }

    try { radio.removeAttribute('disabled'); } catch (e) {}

    try {
      radio.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (e) {}

    try {
      radio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
      radio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (e) {
      try { radio.click(); } catch (e2) {}
    }

    radio.checked = true;

    try {
      radio.dispatchEvent(new Event('input', { bubbles: true }));
      radio.dispatchEvent(new Event('change', { bubbles: true }));
      radio.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}

    try {
      if (window.jQuery) {
        window.jQuery(radio).prop('checked', true).trigger('click').trigger('change').trigger('blur');
      }
    } catch (e) {}

    console.log('Radio asignado con clic simulado:', name, index);
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

  try {
  console.clear();
  console.log('Iniciando llenado desde el módulo SIMMOW de esdomed-services...');
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

  await setProcedimientoQuirurgico('proce_cd1', 'pr1', 'iq1_fecha', 'iq1_cir', 'iq1_tipo', {
    codigo: DATA.cirugia_1_codigo,
    texto: DATA.cirugia_1_texto,
    fecha: DATA.cirugia_1_fecha,
    cirujano: DATA.cirugia_1_cirujano,
    tipo: DATA.cirugia_1_tipo
  });

  await setProcedimientoQuirurgico('proce_cd12', 'pr12', 'iq12_fecha', 'iq12_cir', 'iq12_tipo', {
    codigo: DATA.cirugia_2_codigo,
    texto: DATA.cirugia_2_texto,
    fecha: DATA.cirugia_2_fecha,
    cirujano: DATA.cirugia_2_cirujano,
    tipo: DATA.cirugia_2_tipo
  });

  await setProcedimientoQuirurgico('proce_cd13', 'pr13', 'iq13_fecha', 'iq13_cir', 'iq13_tipo', {
    codigo: DATA.cirugia_3_codigo,
    texto: DATA.cirugia_3_texto,
    fecha: DATA.cirugia_3_fecha,
    cirujano: DATA.cirugia_3_cirujano,
    tipo: DATA.cirugia_3_tipo
  });

  await setProcedimientoQuirurgico('proce_cd14', 'pr14', 'iq14_fecha', 'iq14_cir', 'iq14_tipo', {
    codigo: DATA.cirugia_4_codigo,
    texto: DATA.cirugia_4_texto,
    fecha: DATA.cirugia_4_fecha,
    cirujano: DATA.cirugia_4_cirujano,
    tipo: DATA.cirugia_4_tipo
  });

  setCheckboxFilaPorTexto('Se suspendio cirugia', String(DATA.cirugia_suspendida || '').toUpperCase() === 'SI');

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
      'diag_cd_a', DATA.diag_cd_a, DATA.diag_txt_a,
      'diag_cd_a_intervalo', DATA.diag_cd_a_intervalo,
      'diag_cd_a_tiempo', DATA.diag_cd_a_tiempo
    );

    await setCausaDefuncion(
      'diag_cd_b', DATA.diag_cd_b, DATA.diag_txt_b,
      'diag_cd_b_intervalo', DATA.diag_cd_b_intervalo,
      'diag_cd_b_tiempo', DATA.diag_cd_b_tiempo
    );

    await setCausaDefuncion(
      'diag_cd_c', DATA.diag_cd_c, DATA.diag_txt_c,
      'diag_cd_c_intervalo', DATA.diag_cd_c_intervalo,
      'diag_cd_c_tiempo', DATA.diag_cd_c_tiempo
    );

    await setCausaDefuncion(
      'diag_cd_d_basica', DATA.diag_cd_d_basica, DATA.diag_txt_d_basica,
      'diag_cd_d_basica_intervalo', DATA.diag_cd_d_basica_intervalo,
      'diag_cd_d_basica_tiempo', DATA.diag_cd_d_basica_tiempo
    );

    await setCausaDefuncion(
      'diag_cd_e', DATA.diag_cd_e, DATA.diag_txt_e,
      'diag_cd_e_intervalo', DATA.diag_cd_e_intervalo,
      'diag_cd_e_tiempo', DATA.diag_cd_e_tiempo
    );

    await setCausaDefuncion(
      'diag_cd_f', DATA.diag_cd_f, DATA.diag_txt_f,
      'diag_cd_f_intervalo', DATA.diag_cd_f_intervalo,
      'diag_cd_f_tiempo', DATA.diag_cd_f_tiempo
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
  } finally {
    window.__simmowLlenadoEnCurso = false;
  }
})();
`;
}
