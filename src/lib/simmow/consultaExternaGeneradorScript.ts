// Generador del script de consola para el flujo "Consulta Externa": llena el
// formulario "Ingreso/Edición Consulta Curativa / Atención Preventiva"
// (conrec.php) de SIMMOW. Mismo patrón que ambulatorioGeneradorScript.ts (un
// template literal autocontenido que se pega en la consola de Chrome, sin
// código compartido en tiempo de ejecución), pero con las diferencias propias
// de consulta externa: todos los valores salen del reporte (nada fijo como
// "Emergencia"), se llenan los campos de Atención Preventiva y la edad admite
// meses/días para menores de un año.
//
// Verificado en vivo contra conrec.php: los selects de SIMMOW usan como value
// el mismo número que trae el censo (1..N), y edad/meses/dias son tres campos
// con su propia función que ponen en cero a los otros dos.

import type { DatosSimmowConsultaExterna } from "./consultaExternaTypes";
import { soloNumeros } from "./texto";

interface PayloadConsultaExterna {
  estable: string;
  fecha: string;
  semana: string;
  expe: string;
  DUI: string;
  paciente: string;
  sex_valor: string;
  /** "edad" | "meses" | "dias": el campo de edad que corresponde (son excluyentes en SIMMOW). */
  edad_campo: string;
  edad_valor: string;
  p_dept: string;
  p_muni: string;
  urbano_valor: string;

  tabaquismo: string;
  m_inscripcion: string;
  m_control: string;
  evaluacion_infantil: string;
  per_cefalico: string;
  m_est_nut_pe: string;
  m_est_nut_te: string;
  m_est_nut_pt: string;
  m_est_nut_mc: string;
  m_lac_mat: string;
  pf_in_con: string;
  pf_metodo: string;
  pf_usuaria: string;
  c_citologia: string;
  amenorrea: string;

  dptcon_valor: string;
  dpst: boolean;
  tipo_consulta_especialista: string;
  diag_cd: string;
  dp: string;
  dstcon_valor: string;
  diag_cds: string;
  ds: string;
  diag_cdc: string;
  ce: string;

  tipo_discapacidad: string;
  violencia_condicion: string;
  violencia_ambito: string;
  proc_salud_mental: string;
  ingreso: boolean;

  refa_valor: string;
  refaest: string;
  refde_valor: string;
  refdeest: string;

  isss: boolean;
  tipoisss_valor: string;
  isssn: string;
  otros_derechohabientes: string;
  numero_otros_derechohabientes: string;
  victimaDH2: string;
  privado_libertad: string;

  medico: string;
  meddes: string;
  advertencias: string[];
}

/**
 * SIMMOW no admite años + meses + días a la vez: se digita solo el tramo mayor
 * distinto de cero (años; si es 0, meses; si es 0, días).
 */
export function campoEdadSimmow(datos: Pick<DatosSimmowConsultaExterna, "edadAnios" | "edadMeses" | "edadDias">): {
  campo: "edad" | "meses" | "dias";
  valor: string;
} {
  const n = (v: string) => Number(String(v || "").replace(/\D/g, "")) || 0;
  if (n(datos.edadAnios) > 0) return { campo: "edad", valor: String(n(datos.edadAnios)) };
  if (n(datos.edadMeses) > 0) return { campo: "meses", valor: String(n(datos.edadMeses)) };
  if (n(datos.edadDias) > 0) return { campo: "dias", valor: String(n(datos.edadDias)) };
  // Recién nacido de menos de un día u edad no informada: años en 0, que es lo que ya trae el formulario.
  return { campo: "edad", valor: "" };
}

function prepararPayload(datos: DatosSimmowConsultaExterna, semana: string, advertencias: string[]): PayloadConsultaExterna {
  const edad = campoEdadSimmow(datos);
  return {
    estable: "2317",
    fecha: datos.fecha || "",
    semana,
    expe: datos.expediente || "",
    // El campo DUI de SIMMOW va sin guion; en el resto de la app se muestra como viene del reporte.
    DUI: soloNumeros(datos.dui || ""),
    paciente: datos.paciente || "",
    sex_valor: datos.sexoValor || "",
    edad_campo: edad.campo,
    edad_valor: edad.valor,
    p_dept: datos.departamentoValor || "",
    p_muni: datos.municipio || "",
    urbano_valor: datos.areaValor || "",

    tabaquismo: datos.tabaquismoValor || "",
    m_inscripcion: datos.inscripcionValor || "",
    m_control: datos.controlValor || "",
    evaluacion_infantil: datos.evaluacionInfantilValor || "",
    per_cefalico: datos.perimetroCefalico || "",
    m_est_nut_pe: datos.pesoEdadValor || "",
    m_est_nut_te: datos.tallaEdadValor || "",
    m_est_nut_pt: datos.pesoTallaValor || "",
    m_est_nut_mc: datos.imcValor || "",
    m_lac_mat: datos.lactanciaValor || "",
    pf_in_con: datos.pfInscripcionControlValor || "",
    pf_metodo: datos.pfMetodoValor || "",
    pf_usuaria: datos.pfUsuariaValor || "",
    c_citologia: datos.deteccionCancerValor || "",
    amenorrea: datos.amenorreaSemanas || "",

    dptcon_valor: datos.dptconValor || "",
    dpst: datos.dpstMarcado,
    tipo_consulta_especialista: datos.especialistaValor || "0",
    diag_cd: datos.diagPrincipalCodigo || "",
    dp: datos.diagPrincipalTexto || "",
    dstcon_valor: datos.dstconValor || "",
    diag_cds: datos.diagSecundarioCodigo || "",
    ds: datos.diagSecundarioTexto || "",
    diag_cdc: datos.causaExternaCodigo || "",
    ce: datos.causaExternaTexto || "",

    tipo_discapacidad: datos.discapacidadValor || "",
    violencia_condicion: datos.violenciaCondicionValor || "",
    violencia_ambito: datos.violenciaAmbitoValor || "",
    proc_salud_mental: datos.procSaludMentalValor || "",
    ingreso: datos.ingresoHospitalario,

    refa_valor: datos.refAValor || (datos.refAEstablecimientoCodigo ? "3" : ""),
    refaest: datos.refAEstablecimientoCodigo || "",
    refde_valor: datos.refDeValor || (datos.refDeEstablecimientoCodigo ? "3" : ""),
    refdeest: datos.refDeEstablecimientoCodigo || "",

    isss: datos.isss,
    tipoisss_valor: datos.tipoIsssValor || "",
    isssn: datos.numeroAfiliacion || "",
    otros_derechohabientes: datos.derechohabienteOtrosValor || "",
    numero_otros_derechohabientes: datos.derechohabienteOtrosNumero || "",
    victimaDH2: datos.victimaDHValor || "",
    privado_libertad: datos.privadoLibertadValor || "",

    medico: datos.medicoCodigoSimmow || "",
    meddes: datos.medicoNombre || "",
    advertencias,
  };
}

function escaparParaTemplateLiteral(json: string): string {
  return json.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Genera el script que se pega en la consola de Chrome dentro de SIMMOW para
 * una consulta externa. Nunca presiona Grabar.
 */
export function generarScriptConsolaConsultaExterna(
  datos: DatosSimmowConsultaExterna,
  semana: string,
  advertencias: string[] = []
): string {
  const data = prepararPayload(datos, semana, advertencias);
  const dataJson = escaparParaTemplateLiteral(JSON.stringify(data, null, 2));

  return `
// Código generado por el módulo SIMMOW de esdomed-services (Consulta Externa)
// Pegue este bloque en la consola de Chrome dentro de SIMMOW, en la pantalla
// "Ingreso/Edición Consulta Curativa / Atención Preventiva".
// Este código NO presiona Grabar. Revise antes de guardar.

;(async () => {
  if (window.__simmowLlenadoEnCurso) {
    console.error('Ya hay un llenado en curso en esta pestaña. Espere a que termine (o recargue la página) antes de pegar el código de nuevo — ejecutarlo dos veces a la vez duplica los caracteres escritos en los campos.');
    return;
  }
  window.__simmowLlenadoEnCurso = true;

  const DATA = JSON.parse(\`${dataJson}\`);
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

  // Edad / meses / días: tres campos excluyentes, cada uno con su propia
  // función en la página (edad(), meses(), dias()) que pone en cero a los
  // otros dos. Solo se acepta el valor si llega por tecleo real.
  const setEdad = async (campo, valor) => {
    const limpio = String(valor || '').replace(/[^\\d]/g, '').trim();
    if (!limpio) return;

    const el = byName(campo);
    if (!el) {
      errores.push('No se encontró el campo ' + campo + '.');
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

    for (const ch of limpio) {
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
      }

      if (!String(el.value || '').endsWith(ch)) {
        setNativeValue(el, String(el.value || '') + ch);
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

    if (typeof window[campo] === 'function') {
      try {
        window[campo]();
        await sleep(300);
      } catch (e) {
        errores.push('Se digitó ' + campo + ', pero falló la función ' + campo + '() de SIMMOW: ' + e.message);
      }
    } else {
      fire(el);
    }

    if (String(el.value || '').trim() !== limpio) {
      errores.push('La edad no quedó igual al valor esperado en ' + campo + '. Esperado: ' + limpio + ', campo: ' + el.value);
    } else {
      console.log('Edad digitada y validada correctamente en SIMMOW (' + campo + '):', el.value);
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

  // Select cuyo value es el mismo número que trae el reporte (1..N): se busca
  // por value exacto y, si no, por texto que empiece con ese número ("4 - ...").
  // Nunca por coincidencia aproximada, para que un "1" no caiga en la opción 10.
  const setSelectCodigo = (name, codigo) => {
    if (codigo === undefined || codigo === null || codigo === '') return;
    const el = byName(name);
    if (!el) {
      errores.push('No se encontró select: ' + name);
      return;
    }
    const n = String(codigo).trim();
    const opciones = [...el.options];
    let op = opciones.find(o => o.value === n);
    if (!op) op = opciones.find(o => new RegExp('^\\\\s*' + n + '(?!\\\\d)').test(o.text));
    if (op) {
      el.value = op.value;
      fire(el);
      console.log('Select asignado:', name, '=>', op.text.trim(), '(' + op.value + ')');
    } else {
      errores.push('No se encontró la opción ' + n + ' en ' + name + '. Opciones: ' + opciones.slice(0, 12).map(o => o.text.trim()).join(' | '));
    }
  };

  // Municipio: el texto del reporte lleva el sufijo del departamento
  // ("Colón LI"); se compara sin ese sufijo.
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
    console.log('Iniciando llenado de Consulta Externa desde el módulo SIMMOW de esdomed-services...');
    console.log(DATA);

    setSelect('estable', DATA.estable);
    setText('fecha', DATA.fecha);
    setText('semana', DATA.semana);

    setText('expe', DATA.expe);
    setText('DUI', DATA.DUI);
    setText('paciente', DATA.paciente);

    setRadioByValue('sex', DATA.sex_valor);

    await setEdad(DATA.edad_campo, DATA.edad_valor);

    setSelectCodigo('p_dept', DATA.p_dept);
    await sleep(1600);
    setSelect('p_muni', DATA.p_muni);
    await sleep(1200);

    setRadioByValue('urbano', DATA.urbano_valor);

    // Atención preventiva
    setSelectCodigo('tabaquismo', DATA.tabaquismo);
    setSelectCodigo('m_inscripcion', DATA.m_inscripcion);
    setSelectCodigo('m_control', DATA.m_control);
    setSelectCodigo('evaluacion_infantil', DATA.evaluacion_infantil);
    setText('per_cefalico', DATA.per_cefalico);
    setSelectCodigo('m_est_nut_pe', DATA.m_est_nut_pe);
    setSelectCodigo('m_est_nut_te', DATA.m_est_nut_te);
    setSelectCodigo('m_est_nut_pt', DATA.m_est_nut_pt);
    setSelectCodigo('m_est_nut_mc', DATA.m_est_nut_mc);
    setSelectCodigo('m_lac_mat', DATA.m_lac_mat);
    setSelectCodigo('pf_in_con', DATA.pf_in_con);
    setSelectCodigo('pf_metodo', DATA.pf_metodo);
    setSelectCodigo('pf_usuaria', DATA.pf_usuaria);
    setSelectCodigo('c_citologia', DATA.c_citologia);
    setText('amenorrea', DATA.amenorrea);

    // Diagnósticos
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

    setText('medico', DATA.medico);
    setText('meddes', DATA.meddes);

    setSelectCodigo('tipo_discapacidad', DATA.tipo_discapacidad);
    setSelectCodigo('violencia_condicion', DATA.violencia_condicion);
    setSelectCodigo('violencia_ambito', DATA.violencia_ambito);
    setSelectCodigo('proc_salud_mental', DATA.proc_salud_mental);

    setCheckbox('ingreso', DATA.ingreso);

    setCheckbox('isss', DATA.isss);
    setRadioByValue('tipoisss', DATA.tipoisss_valor);
    setText('isssn', DATA.isssn);

    setSelectCodigo('otros_derechohabientes', DATA.otros_derechohabientes);
    setText('numero_otros_derechohabientes', DATA.numero_otros_derechohabientes);
    if (DATA.victimaDH2) {
      setCheckbox('victimaDH', true);
      setSelectCodigo('victimaDH2', DATA.victimaDH2);
    }

    if (DATA.refde_valor) {
      setRadioByValue('refde', DATA.refde_valor);
      setText('refdeest', DATA.refdeest);
    }
    if (DATA.refa_valor) {
      setRadioByValue('refa', DATA.refa_valor);
      setText('refaest', DATA.refaest);
    }

    setSelectCodigo('privado_libertad', DATA.privado_libertad);

    console.log('Llenado de Consulta Externa finalizado.');

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
