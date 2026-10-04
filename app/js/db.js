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
 * Síntesis de voz offline en inglés
 * @param {string} text - Texto en inglés a pronunciar
 */
let lastSpokenText = '';

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  stopAudio();
  lastSpokenText = text;
  const clean = text.replace(/<[^>]*>?/gm, '').trim();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'en-US';
  utter.rate = 0.88;
  window.speechSynthesis.speak(utter);
}

/**
 * Detener cualquier audio en reproducción
 */
function stopAudio() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
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
    }, 80);
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
