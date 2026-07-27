// Generador del script de consola para el formulario "Ingreso/Edición
// Consulta Curativa / Atención Preventiva" de SIMMOW (Atención Ambulatoria).
// Mismo patrón que generadorScript.ts (flujo hospitalario): un template
// literal autocontenido que se pega en la consola de Chrome. No comparte
// código en tiempo de ejecución con el otro generador (cada uno es un
// string independiente), pero SÍ incluye desde el día uno las dos lecciones
// aprendidas ahí: el guard de reentrancia y usar el texto crudo (no
// normalizado) de las opciones cuando corresponda.

import type { DatosSimmowAmbulatorio } from "./ambulatorioTypes";

interface PayloadAmbulatorio {
  estable: string;
  fecha: string;
  expe: string;
  DUI: string;
  paciente: string;
  sex_valor: string;
  // Solo años: meses/dias/horas/minutos no se digitan (ver setEdadAnios).
  edad: string;
  p_dept: string;
  p_muni: string;
  urbano_valor: string;
  diag_cd: string;
  dp: string;
  diag_cds: string;
  ds: string;
  diag_cdc: string;
  ce: string;
  medico: string;
  meddes: string;
  ingreso: boolean;
  isss: boolean;
  tipoisss_valor: string;
  isssn: string;
  refde_valor: string;
  refdeest: string;
  privado_libertad: string;
  amenorrea: string;
  consultorio: string;
  semana: string;
  preventivo: boolean;
  tipo_atencion: string;
  especialidad: string;
  escuela: boolean;
  dptcon_valor: string;
  dpst: boolean;
  dstcon_valor: string;
  tipo_discapacidad: string;
  violencia_tipo: string;
  violencia_condicion: string;
  violencia_ambito: string;
  proc_salud_mental: string;
  otros_derechohabientes: string;
  numero_otros_derechohabientes: string;
  victimaDH: boolean;
  victimaDH2: string;
  refa_valor: string;
  refaest: string;
  especialidad_referido_a: boolean;
  ucsf: string;
  ucsf_nombre: string;
  tipo_consulta_especialista: string;
  advertencias: string[];
}

function prepararPayloadAmbulatorio(datos: DatosSimmowAmbulatorio, advertencias: string[]): PayloadAmbulatorio {
  return {
    estable: "2317",
    fecha: datos.fecha || "",
    expe: datos.expediente || "",
    DUI: datos.dui || "",
    paciente: datos.paciente || "",
    sex_valor: datos.sexoValor || "",
    edad: datos.edadAnios || "",
    p_dept: datos.departamento || "",
    p_muni: datos.municipio || "",
    urbano_valor: datos.areaValor || "",
    diag_cd: datos.diagPrincipalCodigo || "",
    dp: datos.diagPrincipalTexto || "",
    diag_cds: datos.diagSecundarioCodigo || "",
    ds: datos.diagSecundarioTexto || "",
    diag_cdc: datos.causaExternaCodigo || "",
    ce: datos.causaExternaTexto || "",
    medico: datos.medicoCodigoSimmow || "",
    meddes: datos.medicoNombre || "",
    ingreso: datos.ingresoHospitalario,
    isss: datos.isss,
    tipoisss_valor: datos.tipoIsssValor || "",
    isssn: datos.numeroAfiliacion || "",
    refde_valor: datos.refdeValor || (datos.establecimientoReferidoCodigo ? "3" : ""),
    refdeest: datos.establecimientoReferidoCodigo || "",
    privado_libertad: datos.privadoLibertadTexto || "",
    amenorrea: datos.amenorreaSemanas || "",
    consultorio: datos.modalidadValor || "",
    semana: datos.semanaEpidemiologica || "",
    preventivo: datos.soloPreventivo,
    tipo_atencion: datos.tipoAtencionValor || "",
    especialidad: datos.especialidadValor || "",
    escuela: datos.escuelaPromotora,
    dptcon_valor: datos.dptconValor || "",
    dpst: datos.dpstMarcado,
    dstcon_valor: datos.dstconValor || "",
    tipo_discapacidad: datos.discapacidadValor || "",
    violencia_tipo: datos.violenciaTipoValor || "",
    violencia_condicion: datos.violenciaCondicionValor || "",
    violencia_ambito: datos.violenciaAmbitoValor || "",
    proc_salud_mental: datos.procSaludMentalValor || "",
    otros_derechohabientes: datos.derechohabienteOtrosValor || "",
    numero_otros_derechohabientes: datos.derechohabienteOtrosNumero || "",
    victimaDH: datos.victimaDH,
    victimaDH2: datos.victimaDHValor || "",
    refa_valor: datos.refAValor || "",
    refaest: datos.refAEstablecimientoCodigo || "",
    especialidad_referido_a: datos.referidoAFisioterapia,
    ucsf: datos.ucsf || "",
    ucsf_nombre: datos.ucsfNombre || "",
    tipo_consulta_especialista: datos.especialistaValor || "0",
    advertencias,
  };
}

function escaparParaTemplateLiteral(json: string): string {
  return json.replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Genera el script que se pega en la consola de Chrome dentro de SIMMOW
 * para el formulario de Atención Ambulatoria. Nunca presiona Grabar.
 */
export function generarScriptConsolaAmbulatorio(
  datos: DatosSimmowAmbulatorio,
  advertencias: string[] = []
): string {
  const data = prepararPayloadAmbulatorio(datos, advertencias);
  const dataJson = escaparParaTemplateLiteral(JSON.stringify(data, null, 2));

  return `
// Código generado por el módulo SIMMOW de esdomed-services (Atención Ambulatoria)
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

  const setEdadAnios = async (anios) => {
    const edadLimpia = String(anios || '').replace(/[^\\d]/g, '').trim();
    if (!edadLimpia) return;

    const el = document.querySelector('input[name="edad"]');
    if (!el) {
      errores.push('No se encontró el campo input[name="edad"].');
      return;
    }

    // setText simple deja el valor en "0": esta página tiene un window.edad()
    // que recalcula el campo y solo respeta el valor si llega por tecleo real
    // (igual que el flujo hospitalario) — confirmado en vivo contra SIMMOW.
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
          key: ch, code: 'Digit' + ch, keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0),
          bubbles: true, cancelable: true
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
          data: ch, inputType: 'insertText', bubbles: true, cancelable: true
        }));
      } catch (e) {
        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {}
      }

      try {
        el.dispatchEvent(new KeyboardEvent('keyup', {
          key: ch, code: 'Digit' + ch, keyCode: ch.charCodeAt(0), which: ch.charCodeAt(0),
          bubbles: true, cancelable: true
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
        'La edad no quedó igual al valor esperado. Esperado: ' + edadLimpia + ', campo: ' + el.value
      );
    } else {
      console.log('Edad digitada y validada correctamente en SIMMOW:', el.value);
    }
  };

  const setCheckbox = (name, marcado) => {
    if (!marcado) return;
    const el = byName(name);
    if (!el) {
      errores.push('No se encontró checkbox: ' + name);
      return;
    }
    el.checked = true;
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('blur', { bubbles: true }));
    } catch (e) {}
    try {
      if (window.jQuery) {
        window.jQuery(el).prop('checked', true).trigger('change').trigger('blur');
      }
    } catch (e) {}
  };

  const setRadioByValue = (name, valor) => {
    if (valor === undefined || valor === null || valor === '') return;
    const radios = [...document.querySelectorAll('input[type="radio"][name="' + CSS.escape(name) + '"]')];
    const radio = radios.find(r => r.value === String(valor));
    if (!radio) {
      errores.push('No se encontró radio value="' + valor + '" en ' + name);
      return;
    }
    try { radio.removeAttribute('disabled'); } catch (e) {}
    try {
      radio.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      radio.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
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
      const partes = String(txt || '').trim().split(' ').filter(Boolean);
      if (!partes.length) return '';
      const ultimo = partes[partes.length - 1].toUpperCase();
      if (codigosFinales[ultimo]) partes.pop();
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
      const primerasOpciones = opciones.slice(0, 12).map(o => o.text).join(' | ');
      errores.push(
        'No se encontró opción "' + value + '" en ' + name +
        '. Buscado flexible: "' + wantedSinCodigo +
        '". Opciones visibles: ' + primerasOpciones
      );
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
        el.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true }));
      } catch (e) {}
      setNativeValue(el, el.value + ch);
      try {
        el.dispatchEvent(new InputEvent('input', { data: ch, inputType: 'insertText', bubbles: true, cancelable: true }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      try {
        el.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true, cancelable: true }));
      } catch (e) {}
      await sleep(60);
    }

    fire(el);

    try {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
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

  try {
    console.clear();
    console.log('Iniciando llenado de Atención Ambulatoria desde el módulo SIMMOW de esdomed-services...');
    console.log(DATA);

    setSelect('estable', DATA.estable);
    setText('fecha', DATA.fecha);
    setSelect('consultorio', DATA.consultorio);
    setText('semana', DATA.semana);
    setCheckbox('preventivo', DATA.preventivo);
    setSelect('tipo_atencion', DATA.tipo_atencion);

    setText('expe', DATA.expe);
    setText('DUI', DATA.DUI);
    setCheckbox('escuela', DATA.escuela);
    setText('paciente', DATA.paciente);

    setRadioByValue('sex', DATA.sex_valor);

    // Solo interesa la edad en años — meses/días/horas/minutos no se tocan:
    // la función edad() de la propia página los resetea a 0 al digitar años
    // (son mutuamente excluyentes), así que tocarlos después solo generaría
    // el error inverso (reseteo del campo de años).
    await setEdadAnios(DATA.edad);

    setSelect('p_dept', DATA.p_dept);
    await sleep(1600);
    setSelect('p_muni', DATA.p_muni);
    await sleep(1200);

    setRadioByValue('urbano', DATA.urbano_valor);

    setRadioByValue('dptcon', DATA.dptcon_valor);
    setCheckbox('dpst', DATA.dpst);
    await setCodigoCIE('diag_cd', DATA.diag_cd);
    await sleep(300);
    setText('dp', DATA.dp);

    setRadioByValue('dstcon', DATA.dstcon_valor);
    await setCodigoCIE('diag_cds', DATA.diag_cds);
    await sleep(300);
    setText('ds', DATA.ds);

    await setCodigoCIE('diag_cdc', DATA.diag_cdc);
    await sleep(300);
    setText('ce', DATA.ce);

    setRadioByValue('tipo_consulta_especialista', DATA.tipo_consulta_especialista);

    setSelect('especialidad', DATA.especialidad);
    setText('medico', DATA.medico);
    setText('meddes', DATA.meddes);

    setSelect('tipo_discapacidad', DATA.tipo_discapacidad);
    setSelect('violencia_tipo', DATA.violencia_tipo);
    setSelect('violencia_condicion', DATA.violencia_condicion);
    setSelect('violencia_ambito', DATA.violencia_ambito);
    setSelect('proc_salud_mental', DATA.proc_salud_mental);

    setCheckbox('ingreso', DATA.ingreso);

    setCheckbox('isss', DATA.isss);
    setRadioByValue('tipoisss', DATA.tipoisss_valor);
    setText('isssn', DATA.isssn);

    setSelect('otros_derechohabientes', DATA.otros_derechohabientes);
    setText('numero_otros_derechohabientes', DATA.numero_otros_derechohabientes);
    setCheckbox('victimaDH', DATA.victimaDH);
    setSelect('victimaDH2', DATA.victimaDH2);

    if (DATA.refde_valor) {
      setRadioByValue('refde', DATA.refde_valor);
      setText('refdeest', DATA.refdeest);
    }

    if (DATA.refa_valor) {
      setRadioByValue('refa', DATA.refa_valor);
      setText('refaest', DATA.refaest);
    }
    setCheckbox('especialidad_referido_a', DATA.especialidad_referido_a);

    setText('ucsf', DATA.ucsf);
    setText('ucsf_nombre', DATA.ucsf_nombre);
    setSelect('privado_libertad', DATA.privado_libertad);
    setText('amenorrea', DATA.amenorrea);

    console.log('Llenado de Atención Ambulatoria finalizado.');

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
