/**
 * AudioTimelinePlayer: Controlador de Audio con Ruta de Tiempo para Textos e Historias
 * Permite reproducir mediante SpeechSynthesis offline con:
 * - Barra de progreso interactiva (slider de tiempo)
 * - Indicador de tiempo transcurrido / tiempo total (ej: 00:15 / 00:48)
 * - Botones: Adelantar (+5s), Retroceder (-5s), Play, Pausa, Stop, Reiniciar
 * - Selector de velocidad (0.8x Lento, 1.0x Normal, 1.2x Rápido)
 * - Seguimiento y resalte en tiempo real de la frase que se está leyendo
 * - Clic en cualquier frase del texto para saltar directamente a ella
 */

class AudioTimelinePlayer {
  constructor(options = {}) {
    this.containerId = options.containerId;
    this.textContainerId = options.textContainerId;
    this.text = options.text || '';
    this.rate = options.rate || 0.88;
    this.lang = options.lang || 'en-US';
    this.instanceName = options.instanceName || 'activeAudioPlayer';
    this.onSentenceHighlight = options.onSentenceHighlight || null;

    if (typeof window !== 'undefined') {
      window[this.instanceName] = this;
      window.activeAudioPlayer = this;
    }

    this.sentences = [];
    this.sentenceDurations = [];
    this.sentenceStartTimes = [];
    this.totalDuration = 0; // en segundos estimados
    this.currentIndex = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.currentUtterance = null;
    this.timer = null;
    this.currentTime = 0;
    this.speechTimeout = null;

    this.initText(this.text);
  }

  getSynth() {
    if (typeof window !== 'undefined') {
      if (window.speechSynthesis) return window.speechSynthesis;
      if (window.parent && window.parent.speechSynthesis) return window.parent.speechSynthesis;
      if (window.top && window.top.speechSynthesis) return window.top.speechSynthesis;
    }
    return null;
  }

  initText(rawText) {
    this.stop();
    this.text = rawText || '';
    if (!this.text) {
      this.sentences = [];
      this.totalDuration = 0;
      return;
    }

    // Dividir en oraciones limpias respetando puntuación (. ! ?)
    const rawSentences = this.text
      .replace(/\r\n/g, '\n')
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    this.sentences = rawSentences;
    this.sentenceDurations = [];
    this.sentenceStartTimes = [];

    // Calcular duración estimada por oración basada en número de palabras y velocidad
    // Tasa 0.88 ≈ 125 palabras por minuto (~0.48s por palabra + pausa de 0.3s)
    let cumulative = 0;
    const secPerWord = 0.48 / (this.rate / 0.88);

    this.sentences.forEach(s => {
      const words = s.split(/\s+/).filter(w => w.length > 0).length;
      const dur = Math.max(1.2, words * secPerWord + 0.35);
      this.sentenceStartTimes.push(cumulative);
      this.sentenceDurations.push(dur);
      cumulative += dur;
    });

    this.totalDuration = Math.max(3, Math.round(cumulative));
    this.currentTime = 0;
    this.currentIndex = 0;

    this.renderTextWithSentenceSpans();
    this.renderControls();
  }

  renderTextWithSentenceSpans() {
    if (!this.textContainerId) return;
    const target = document.getElementById(this.textContainerId);
    if (!target) return;

    const inst = this.instanceName || 'activeAudioPlayer';
    let html = '';
    this.sentences.forEach((sentence, idx) => {
      // Si la frase contiene saltos de línea en el texto original
      const formatted = sentence.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>');
      html += `<span class="timeline-audio-sentence" id="atp-sent-${idx}" onclick="(window['${inst}'] || window.activeAudioPlayer).jumpToSentence(${idx})" title="Haz clic para escuchar desde aquí">${formatted} </span>`;
    });

    target.innerHTML = html;
  }

  renderControls() {
    if (!this.containerId) return;
    const el = document.getElementById(this.containerId);
    if (!el) return;

    const playerId = this.containerId + '-ctrl';
    el.innerHTML = `
      <div class="audio-timeline-card" id="${playerId}">
        <div class="atp-top-row">
          <div class="atp-time-display">
            <span class="atp-time-badge" id="${playerId}-time">⏱️ 00:00 / ${this.formatTime(this.totalDuration)}</span>
            <span class="atp-sentence-badge" id="${playerId}-sent-info">Frase: 0 / ${this.sentences.length}</span>
          </div>
          <div class="atp-speed-controls">
            <label style="font-size:11.5px; color:#94a3b8; margin-right:4px;">Velocidad:</label>
            <button class="atp-speed-btn ${this.rate === 0.78 ? 'active' : ''}" onclick="window['${this.instanceName}'].setRate(0.78, this)">0.8x</button>
            <button class="atp-speed-btn ${this.rate === 0.88 ? 'active' : ''}" onclick="window['${this.instanceName}'].setRate(0.88, this)">1.0x</button>
            <button class="atp-speed-btn ${this.rate === 1.05 ? 'active' : ''}" onclick="window['${this.instanceName}'].setRate(1.05, this)">1.2x</button>
          </div>
        </div>

        <!-- Barra de Progreso / Ruta de Tiempo Deslizable -->
        <div class="atp-slider-row">
          <input type="range" class="atp-slider" id="${playerId}-slider" min="0" max="${this.totalDuration}" value="0" step="0.5"
                 oninput="window['${this.instanceName}'].onSliderInput(this.value)"
                 onchange="window['${this.instanceName}'].onSliderChange(this.value)"
                 title="Desliza para adelantar o retroceder el audio">
        </div>

        <!-- Botonera de Control -->
        <div class="atp-buttons-row">
          <button class="atp-btn atp-btn-step" onclick="window['${this.instanceName}'].stepTime(-5)" title="Retroceder 5 segundos / Frase anterior">
            ⏪ -5s
          </button>
          
          <button class="atp-btn atp-btn-primary" id="${playerId}-play-btn" onclick="window['${this.instanceName}'].togglePlay()">
            ▶️ Reproducir
          </button>

          <button class="atp-btn atp-btn-step" onclick="window['${this.instanceName}'].stepTime(5)" title="Adelantar 5 segundos / Siguiente frase">
            ⏩ +5s
          </button>

          <button class="atp-btn atp-btn-danger" onclick="window['${this.instanceName}'].stop()" title="Detener reproducción">
            ⏹️ Detener
          </button>

          <button class="atp-btn atp-btn-warning" onclick="window['${this.instanceName}'].restart()" title="Reiniciar desde el inicio">
            🔄 Reiniciar
          </button>
        </div>
      </div>
    `;
    this.updateUI();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    const synth = this.getSynth();
    if (!synth) {
      alert('Tu navegador no soporta síntesis de voz offline.');
      return;
    }

    if (this.isPaused) {
      this.isPaused = false;
      this.isPlaying = true;
      this.startTimer();
      this.updatePlayBtn(true);
      try {
        if (synth.paused) synth.resume();
      } catch (e) {}
      this.speakSentence(this.currentIndex);
      return;
    }

    this.stopAudioSynthesis();
    this.isPlaying = true;
    this.isPaused = false;
    this.startTimer();
    this.updatePlayBtn(true);

    this.speechTimeout = setTimeout(() => {
      this.speakSentence(this.currentIndex);
    }, 50);
  }

  pause() {
    this.isPaused = true;
    this.isPlaying = false;
    this.stopAudioSynthesis();
    this.stopTimer();
    this.updatePlayBtn(false);
  }

  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.stopAudioSynthesis();
    this.stopTimer();
    this.currentIndex = 0;
    this.currentTime = 0;
    this.clearHighlights();
    this.updateUI();
    this.updatePlayBtn(false);
  }

  restart() {
    this.stop();
    setTimeout(() => {
      this.play();
    }, 100);
  }

  jumpToSentence(index) {
    if (index < 0 || index >= this.sentences.length) return;
    this.currentIndex = index;
    this.currentTime = this.sentenceStartTimes[index] || 0;
    this.stopAudioSynthesis();
    this.isPlaying = true;
    this.isPaused = false;
    this.startTimer();
    this.updatePlayBtn(true);
    this.updateUI();

    this.speechTimeout = setTimeout(() => {
      this.speakSentence(index);
    }, 50);
  }

  stepTime(deltaSeconds) {
    let newTime = Math.max(0, Math.min(this.totalDuration, this.currentTime + deltaSeconds));
    this.seekToTime(newTime);
  }

  onSliderInput(val) {
    // Al arrastrar el slider, actualizar visualmente el tiempo
    this.currentTime = parseFloat(val);
    this.updateTimeDisplay();
  }

  onSliderChange(val) {
    // Al soltar el slider, buscar la frase correspondiente y reproducir
    this.seekToTime(parseFloat(val));
  }

  seekToTime(targetTime) {
    this.currentTime = Math.max(0, Math.min(this.totalDuration, targetTime));

    // Encontrar qué oración corresponde a este tiempo
    let foundIndex = 0;
    for (let i = 0; i < this.sentenceStartTimes.length; i++) {
      if (this.currentTime >= this.sentenceStartTimes[i]) {
        foundIndex = i;
      } else {
        break;
      }
    }

    this.currentIndex = foundIndex;
    this.stopAudioSynthesis();

    if (this.isPlaying) {
      this.speechTimeout = setTimeout(() => {
        this.speakSentence(foundIndex);
      }, 50);
    } else {
      this.highlightSentence(foundIndex);
      this.updateUI();
    }
  }

  setRate(newRate, btnElement) {
    this.rate = newRate;
    const oldPlaying = this.isPlaying;
    if (oldPlaying) {
      this.stopAudioSynthesis();
    }

    // Recalcular duraciones con la nueva tasa
    let cumulative = 0;
    const secPerWord = 0.48 / (this.rate / 0.88);
    this.sentenceStartTimes = [];
    this.sentenceDurations = [];
    this.sentences.forEach(s => {
      const words = s.split(/\s+/).filter(w => w.length > 0).length;
      const dur = Math.max(1.2, words * secPerWord + 0.35);
      this.sentenceStartTimes.push(cumulative);
      this.sentenceDurations.push(dur);
      cumulative += dur;
    });
    this.totalDuration = Math.max(3, Math.round(cumulative));

    if (this.containerId) {
      const parent = document.getElementById(this.containerId);
      if (parent) {
        parent.querySelectorAll('.atp-speed-btn').forEach(b => b.classList.remove('active'));
      }
    }
    if (btnElement && btnElement.classList && typeof btnElement.classList.add === 'function') {
      btnElement.classList.add('active');
    }

    if (oldPlaying) {
      this.speechTimeout = setTimeout(() => {
        this.speakSentence(this.currentIndex);
      }, 50);
    } else {
      this.updateUI();
    }
  }

  speakSentence(idx) {
    if (idx >= this.sentences.length) {
      // Llegamos al final de la historia
      this.stop();
      return;
    }

    this.highlightSentence(idx);
    this.updateUI();

    const raw = this.sentences[idx];
    const clean = raw.replace(/<[^>]*>?/gm, '').trim();
    if (!clean) {
      this.currentIndex++;
      this.speakSentence(this.currentIndex);
      return;
    }

    const synth = this.getSynth();
    if (!synth) return;

    try {
      if (synth.paused) {
        synth.resume();
      }
    } catch (e) {}

    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = this.lang;
    utter.rate = this.rate;

    // Asignar mejor voz en inglés si está disponible
    if (this.lang.startsWith('en')) {
      let v = (typeof window !== 'undefined' && window._englishVoice) ? window._englishVoice : null;
      if (!v && synth.getVoices) {
        const voices = synth.getVoices();
        if (voices && voices.length > 0) {
          v = voices.find(item => item.lang === 'en-US') ||
              voices.find(item => item.lang.startsWith('en')) ||
              voices[0];
        }
      }
      if (v) utter.voice = v;
    }

    utter.onend = () => {
      this.currentUtterance = null;
      if (typeof window !== 'undefined') window._activeTimelineUtterance = null;

      if (this.isPlaying && !this.isPaused) {
        this.currentIndex++;
        if (this.currentIndex < this.sentences.length) {
          this.currentTime = this.sentenceStartTimes[this.currentIndex];
          this.speakSentence(this.currentIndex);
        } else {
          this.stop();
        }
      }
    };

    utter.onerror = (e) => {
      if (e && (e.error === 'canceled' || e.error === 'interrupted')) {
        // Cancelado intencionalmente por salto de frase o botón detener
        return;
      }
      console.warn('SpeechSynthesisUtterance error:', e ? e.error : e);
      this.currentUtterance = null;
      if (typeof window !== 'undefined') window._activeTimelineUtterance = null;

      if (this.isPlaying && !this.isPaused) {
        this.currentIndex++;
        if (this.currentIndex < this.sentences.length) {
          this.currentTime = this.sentenceStartTimes[this.currentIndex];
          this.speakSentence(this.currentIndex);
        } else {
          this.stop();
        }
      }
    };

    this.currentUtterance = utter;
    if (typeof window !== 'undefined') {
      window._activeTimelineUtterance = utter;
      window._activeSpeechUtterance = utter; // Proteger de GC en V8
    }

    try {
      synth.speak(utter);
    } catch (err) {
      console.warn('synth.speak() error:', err);
    }
  }

  stopAudioSynthesis() {
    if (this.speechTimeout) {
      clearTimeout(this.speechTimeout);
      this.speechTimeout = null;
    }
    const synth = this.getSynth();
    if (synth) {
      try {
        if (synth.paused) {
          synth.resume();
        }
        synth.cancel();
      } catch (e) {}
    }
    this.currentUtterance = null;
    if (typeof window !== 'undefined') {
      window._activeTimelineUtterance = null;
    }
  }

  startTimer() {
    this.stopTimer();
    this.timer = setInterval(() => {
      if (this.isPlaying && !this.isPaused) {
        this.currentTime = Math.min(this.totalDuration, this.currentTime + 0.25);
        this.updateTimeDisplay();
        this.updateSlider();
      }
    }, 250);
  }

  stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  highlightSentence(idx) {
    this.clearHighlights();
    const el = document.getElementById(`atp-sent-${idx}`);
    if (el) {
      el.classList.add('atp-active-sentence');
      // Scroll suave si el elemento está fuera de la vista
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e) {}
    }
    if (this.onSentenceHighlight) {
      this.onSentenceHighlight(idx, this.sentences[idx]);
    }
  }

  clearHighlights() {
    document.querySelectorAll('.atp-active-sentence').forEach(el => {
      el.classList.remove('atp-active-sentence');
    });
  }

  updatePlayBtn(playing) {
    if (!this.containerId) return;
    const btn = document.getElementById(`${this.containerId}-ctrl-play-btn`);
    if (btn) {
      if (playing) {
        btn.innerHTML = '⏸️ Pausar';
        btn.classList.add('atp-btn-active-play');
      } else {
        btn.innerHTML = '▶️ Reproducir';
        btn.classList.remove('atp-btn-active-play');
      }
    }
  }

  updateTimeDisplay() {
    if (!this.containerId) return;
    const timeEl = document.getElementById(`${this.containerId}-ctrl-time`);
    const sentEl = document.getElementById(`${this.containerId}-ctrl-sent-info`);
    if (timeEl) {
      timeEl.textContent = `⏱️ ${this.formatTime(this.currentTime)} / ${this.formatTime(this.totalDuration)}`;
    }
    if (sentEl) {
      const cur = Math.min(this.sentences.length, this.currentIndex + 1);
      sentEl.textContent = `Frase: ${cur} / ${this.sentences.length}`;
    }
  }

  updateSlider() {
    if (!this.containerId) return;
    const slider = document.getElementById(`${this.containerId}-ctrl-slider`);
    if (slider) {
      slider.max = this.totalDuration;
      slider.value = this.currentTime;
    }
  }

  updateUI() {
    this.updateTimeDisplay();
    this.updateSlider();
  }

  formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
}

// Exportar globalmente para cualquier módulo
window.AudioTimelinePlayer = AudioTimelinePlayer;
