/**
 * LocalDB: Base de Datos Local Offline (localStorage)
 * Permite guardar y restaurar el progreso, respuestas y notas de cada módulo.
 * Funciona 100% offline dentro de Windows y del .exe sin requerir conexión a internet.
 */

const LocalDB = {
  prefix: 'eng_u7_',

  save: function(key, val) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(val));
      return true;
    } catch (e) {
      console.warn('LocalDB save error:', e);
      return false;
    }
  },

  load: function(key, defaultVal = null) {
    try {
      const item = localStorage.getItem(this.prefix + key);
      return item ? JSON.parse(item) : defaultVal;
    } catch (e) {
      console.warn('LocalDB load error:', e);
      return defaultVal;
    }
  },

  saveModule: function(moduleId, stateObj) {
    const current = this.load('module_' + moduleId, {});
    const updated = Object.assign({}, current, stateObj, { lastUpdated: new Date().toISOString() });
    return this.save('module_' + moduleId, updated);
  },

  loadModule: function(moduleId) {
    return this.load('module_' + moduleId, {});
  },

  clearModule: function(moduleId) {
    try {
      localStorage.removeItem(this.prefix + 'module_' + moduleId);
      return true;
    } catch (e) {
      return false;
    }
  },

  clearAll: function() {
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith(this.prefix)) {
          localStorage.removeItem(k);
        }
      });
      return true;
    } catch (e) {
      return false;
    }
  }
};

/**
 * Cálculo de nota oficial chilena (Escala al 60% de exigencia)
 * @param {number} score - Puntaje obtenido
 * @param {number} total - Puntaje máximo
 * @returns {number} Nota chilena de 1.0 a 7.0 con 1 decimal
 */
function calcChileanGrade(score, total) {
  if (total <= 0) return 1.0;
  const passing = total * 0.6;
  let grade = 1.0;

  if (score < passing) {
    grade = 1.0 + 3.0 * (score / passing);
  } else {
    grade = 4.0 + 3.0 * ((score - passing) / (total - passing));
  }

  return Math.round(grade * 10) / 10;
}

/**
 * ==========================================================================
 * MOTOR DE SÍNTESIS DE VOZ ROBUSTO OFFLINE (Chromium, Edge, Safari, WebViews)
 * Soluciona:
 * 1. Bug de cancelación prematura al llamar cancel() antes de speak()
 * 2. Bug de Garbage Collection en V8 que cortaba el audio a los pocos segundos
 * 3. Bug de estado paused congelado
 * 4. Selección preferencial de voz en inglés americano nativo
 * ==========================================================================
 */
let lastSpokenText = '';
let _activeSpeechUtterance = null;
let _englishVoice = null;
let _speechTimeout = null;

function getSpeechSynth() {
  if (typeof window !== 'undefined') {
    if (window.speechSynthesis) return window.speechSynthesis;
    if (window.parent && window.parent.speechSynthesis) return window.parent.speechSynthesis;
    if (window.top && window.top.speechSynthesis) return window.top.speechSynthesis;
  }
  return null;
}

function initVoices() {
  try {
    const synth = getSpeechSynth();
    if (!synth) return;
    const voices = synth.getVoices();
    if (voices && voices.length > 0) {
      _englishVoice = voices.find(v => v.lang === 'en-US') ||
                      voices.find(v => v.lang.startsWith('en')) ||
                      voices[0];
    }
  } catch (e) {
    console.warn('initVoices error:', e);
  }
}

if (typeof window !== 'undefined') {
  const synth = getSpeechSynth();
  if (synth) {
    if (synth.onvoiceschanged !== undefined) {
      synth.onvoiceschanged = initVoices;
    }
    initVoices();
  }
}

/**
 * Pronunciar texto con soporte bilingüe (inglés o español)
 * @param {string} text - Texto a pronunciar
 * @param {string} lang - Código de idioma ('en-US' o 'es-ES')
 * @param {function} onEndCallback - Callback opcional al finalizar
 */
function speak(text, lang = 'en-US', onEndCallback = null) {
  const synth = getSpeechSynth();
  if (!synth) {
    console.warn('SpeechSynthesis no disponible en este entorno.');
    return;
  }

  // Detener y limpiar timeout previo
  if (_speechTimeout) {
    clearTimeout(_speechTimeout);
    _speechTimeout = null;
  }

  try {
    if (synth.paused) {
      synth.resume();
    }
    synth.cancel();
  } catch (e) {}

  lastSpokenText = text;
  const clean = String(text || '').replace(/<[^>]*>?/gm, '').trim();
  if (!clean) return;

  // Espera obligatoria de 50ms para permitir que el hilo de audio del navegador
  // complete la cancelación sin abortar el nuevo utterance (Bug histórico de Chromium)
  _speechTimeout = setTimeout(() => {
    try {
      if (synth.paused) {
        synth.resume();
      }

      const utter = new SpeechSynthesisUtterance(clean);
      utter.lang = lang;
      utter.rate = (lang === 'en-US') ? 0.88 : 0.95;

      if (lang === 'en-US') {
        if (!_englishVoice) initVoices();
        if (_englishVoice) utter.voice = _englishVoice;
      }

      utter.onend = () => {
        _activeSpeechUtterance = null;
        if (typeof window !== 'undefined') window._activeSpeechUtterance = null;
        if (typeof onEndCallback === 'function') onEndCallback();
      };

      utter.onerror = (e) => {
        if (e.error !== 'canceled' && e.error !== 'interrupted') {
          console.warn('SpeechSynthesis error:', e.error);
        }
        _activeSpeechUtterance = null;
        if (typeof window !== 'undefined') window._activeSpeechUtterance = null;
      };

      // Guardar en variable global para que el Garbage Collector de V8 no lo destruya a mitad de camino
      _activeSpeechUtterance = utter;
      if (typeof window !== 'undefined') {
        window._activeSpeechUtterance = utter;
      }

      synth.speak(utter);
    } catch (err) {
      console.warn('Error al ejecutar speak:', err);
    }
  }, 50);
}

/**
 * Detener cualquier audio en reproducción
 */
function stopAudio() {
  const synth = getSpeechSynth();
  if (_speechTimeout) {
    clearTimeout(_speechTimeout);
    _speechTimeout = null;
  }
  if (synth) {
    try {
      synth.cancel();
    } catch (e) {}
  }
  _activeSpeechUtterance = null;
  if (typeof window !== 'undefined') {
    window._activeSpeechUtterance = null;
  }
}

/**
 * Reiniciar la reproducción del audio actual o texto dado
 * @param {string} text - Texto opcional a reiniciar
 */
function restartAudio(text) {
  stopAudio();
  const t = text || lastSpokenText;
  if (t) {
    setTimeout(() => {
      speak(t);
    }, 90);
  }
}

/**
 * Navegación unificada entre módulos (Iframe <-> Parent Shell <-> Standalone)
 * @param {string} moduleId - Nombre del archivo o ID del módulo (ej: 'mod_05_writing_studio')
 */
function navigateModule(moduleId) {
  const cleanId = moduleId.replace(/\.html$/, '');
  if (window.parent && window.parent.loadModule && window.parent !== window) {
    window.parent.loadModule(cleanId);
  } else {
    window.location.href = cleanId + '.html';
  }
}

/**
 * Compatibilidad con nombres de vistas anteriores
 * @param {string} viewName - Nombre de vista antigua
 */
function loadView(viewName) {
  const map = {
    'writing-studio': 'mod_05_writing_studio',
    'connectors-guide': 'mod_05_1_connectors',
    'weather-classifier': 'mod_01_weather',
    'scott-reading': 'mod_02_stories',
    'regular-verbs': 'mod_03_correct_incorrect',
    'multiple-choice': 'mod_04_multiple_choice',
    'dictionary': 'mod_06_dictionary',
    'flashcards': 'mod_07_flashcards',
    'image-quiz': 'mod_07_1_image_quiz',
    'trap-game': 'mod_08_trap_game',
    'exam-simulator': 'mod_09_exam_simulator',
    'written-exam': 'mod_10_written_exam',
    'four-questions': 'mod_11_four_questions',
    'documents': 'mod_12_documents',
    'final-exam': 'mod_13_final_exam'
  };
  const target = map[viewName] || viewName;
  navigateModule(target);
}
