// Entrada por voz (Web Speech API)
import { state, render, setFeedback } from "./state.js";
import { processCommand } from "./actions.js";

export function toggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    setFeedback("Microfone indisponível neste navegador. Use o campo abaixo.", "warn");
    render();
    return;
  }
  if (state.isListening && state.recognition) {
    try { state.recognition.stop(); } catch (_) {}
    state.isListening = false;
    render();
    return;
  }
  try {
    const rec = new SR();
    state.recognition = rec;
    rec.lang = "pt-BR";
    rec.interimResults = false;
    state.isListening = true;
    setFeedback('Ouvindo... fale ex.: "Uber 32 reais" ou "estorno 20 mercado".', "ok");
    render();

    rec.onresult = e => {
      const said = e && e.results && e.results[0] && e.results[0][0] ? e.results[0][0].transcript : "";
      state.isListening = false;
      processCommand(said);
    };
    rec.onerror = () => {
      state.isListening = false;
      setFeedback("Não foi possível captar o áudio. Tente digitar.", "warn");
      render();
    };
    rec.onend = () => {
      if (state.isListening) { state.isListening = false; render(); }
    };
    rec.start();
  } catch (_) {
    state.isListening = false;
    setFeedback("Microfone bloqueado. Digite o lançamento abaixo.", "warn");
    render();
  }
}
