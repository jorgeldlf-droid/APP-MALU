const API_BASE_URL = 'https://app-malu-backend.onrender.com';

const QUESTIONS = [
  { label: 'A', text: 'Quais são os medicamentos de uso contínuo que você utiliza?' },
  { label: 'B', text: 'Você tem alguma alergia? Se sim, a quê?' },
  { label: 'C', text: 'Já realizou alguma cirurgia? Qual foi e quando?' },
  { label: 'D', text: 'Realizou preventivo, mamografia ou colonoscopia nos últimos anos?' },
  { label: 'E', text: 'Qual é a sua queixa hoje?' }
];

const state = {
  currentIndex: 0,
  answers: QUESTIONS.map(() => ({ text: '', audioBlob: null, audioUrl: '' })),
  mediaRecorder: null,
  mediaStream: null,
  chunks: [],
  isRecording: false,
  generatedPdfBlob: null,
  generatedPdfUrl: ''
};

const els = {};

document.addEventListener('DOMContentLoaded', () => {
  bindElements();
  bindEvents();
  registerServiceWorker();
  checkSupport();
});

function bindElements() {
  [
    'screenIntro','screenQuestion','screenReview','progressBar','progressText','supportNotice','btnStart',
    'questionCounter','recordingState','questionLabel','questionText','answerText','questionNotice',
    'btnRecord','btnStop','btnTranscribe','btnPlay','audioPlayer','btnSkip','btnNext','reviewList',
    'btnPdf','btnShare','btnRestart','shareNotice'
  ].forEach(id => els[id] = document.getElementById(id));
}

function bindEvents() {
  els.btnStart.addEventListener('click', startFlow);
  els.btnRecord.addEventListener('click', startRecording);
  els.btnStop.addEventListener('click', stopRecording);
  els.btnTranscribe.addEventListener('click', transcribeCurrentAudio);
  els.btnPlay.addEventListener('click', () => els.audioPlayer.play());
  els.btnSkip.addEventListener('click', skipQuestion);
  els.btnNext.addEventListener('click', nextQuestion);
  els.answerText.addEventListener('input', () => {
    state.answers[state.currentIndex].text = els.answerText.value.trim();
  });
  els.btnPdf.addEventListener('click', generatePdf);
  els.btnShare.addEventListener('click', sharePdf);
  els.btnRestart.addEventListener('click', restart);
}

function registerServiceWorker() {
  // DESATIVADO (evita cache quebrando requisições)
}

function checkSupport() {
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!canRecord) {
    showNotice(els.supportNotice, 'Seu navegador não suporta gravação de áudio corretamente.', 'warning');
  }
}

async function startFlow() {
  const granted = await requestMicrophone();
  if (!granted) {
    showNotice(els.supportNotice, 'Permita o microfone para continuar.', 'warning');
    return;
  }
  showScreen('screenQuestion');
  renderQuestion();
}

async function requestMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch {
    return false;
  }
}

function showScreen(id) {
  ['screenIntro','screenQuestion','screenReview'].forEach(screenId => {
    els[screenId].classList.toggle('active', screenId === id);
  });
}

function renderQuestion() {
  const q = QUESTIONS[state.currentIndex];

  els.questionCounter.textContent = `Pergunta ${state.currentIndex + 1} de ${QUESTIONS.length}`;
  els.questionLabel.textContent = `${q.label})`;
  els.questionText.textContent = q.text;
  els.recordingState.textContent = 'Aguardando';

  const answer = state.answers[state.currentIndex];
  els.answerText.value = answer.text || '';

  if (answer.audioUrl) {
    els.audioPlayer.src = answer.audioUrl;
    els.audioPlayer.classList.remove('hidden');
    els.btnPlay.disabled = false;
    els.btnTranscribe.disabled = false;
  } else {
    els.audioPlayer.classList.add('hidden');
    els.btnPlay.disabled = true;
    els.btnTranscribe.disabled = true;
  }

  els.btnRecord.disabled = false;
  els.btnStop.disabled = true;
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    state.mediaStream = stream;
    state.chunks = [];

    state.mediaRecorder = new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = e => {
      if (e.data.size > 0) state.chunks.push(e.data);
    };

    state.mediaRecorder.onstop = finalizeRecording;
    state.mediaRecorder.start();

    els.recordingState.textContent = 'Gravando...';
    els.btnRecord.disabled = true;
    els.btnStop.disabled = false;

  } catch {
    showNotice(els.questionNotice, 'Erro ao acessar microfone', 'warning');
  }
}

function stopRecording() {
  if (state.mediaRecorder) {
    state.mediaRecorder.stop();
    els.btnStop.disabled = true;
  }
}

function finalizeRecording() {
  const blob = new Blob(state.chunks, { type: 'audio/webm' });

  // 🚨 CORREÇÃO IMPORTANTE
  if (!blob || blob.size === 0) {
    showNotice(els.questionNotice, 'Gravação vazia, tente novamente.', 'warning');
    return;
  }

  const answer = state.answers[state.currentIndex];

  answer.audioBlob = blob;
  answer.audioUrl = URL.createObjectURL(blob);

  els.audioPlayer.src = answer.audioUrl;
  els.audioPlayer.classList.remove('hidden');

  els.btnPlay.disabled = false;
  els.btnTranscribe.disabled = false;
  els.btnRecord.disabled = false;

  els.recordingState.textContent = 'Gravação concluída';

  state.mediaStream.getTracks().forEach(track => track.stop());
}

async function transcribeCurrentAudio() {
  const answer = state.answers[state.currentIndex];

  if (!answer.audioBlob) {
    showNotice(els.questionNotice, 'Grave um áudio primeiro.', 'warning');
    return;
  }

  els.btnTranscribe.disabled = true;
  els.btnTranscribe.textContent = 'Transcrevendo...';

  try {
    const formData = new FormData();
    formData.append('audio', answer.audioBlob, 'audio.webm');

    const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error);

    answer.text = data.text || '';
    els.answerText.value = answer.text;

    showNotice(els.questionNotice, 'Transcrição pronta!', 'success');

  } catch (error) {
    console.error(error);
    showNotice(els.questionNotice, 'Erro de conexão com servidor', 'warning');
  }

  els.btnTranscribe.disabled = false;
  els.btnTranscribe.textContent = 'Transcrever áudio';
}

function skipQuestion() {
  state.currentIndex++;
  renderQuestion();
}

function nextQuestion() {
  state.currentIndex++;
  renderQuestion();
}

function showNotice(el, msg, type) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideNotice(el) {
  el.classList.add('hidden');
}
