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
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const clean = text.replace(/<[^>]*>?/gm, '').trim();
  const utter = new SpeechSynthesisUtterance(clean);
  utter.lang = 'en-US';
  utter.rate = 0.9;
  window.speechSynthesis.speak(utter);
}
