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
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => {}));
  }
}

function checkSupport() {
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  if (!canRecord) {
    showNotice(els.supportNotice, 'Este aparelho ou navegador não oferece suporte completo para gravação de áudio neste modo. Abra o link em Safari ou Chrome atualizados, sempre em HTTPS.', 'warning');
  }
}

async function startFlow() {
  const granted = await requestMicrophone();
  if (!granted) {
    showNotice(els.supportNotice, 'Não foi possível acessar o microfone. No iPhone ou Android, abra o link em HTTPS e permita o microfone no navegador.', 'warning');
    return;
  }
  showScreen('screenQuestion');
  renderQuestion();
}

async function requestMicrophone() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    return true;
  } catch (error) {
    return false;
  }
}

function showScreen(id) {
  ['screenIntro','screenQuestion','screenReview'].forEach(screenId => {
    els[screenId].classList.toggle('active', screenId === id);
  });
}

function updateProgress() {
  const pct = Math.round((state.currentIndex / QUESTIONS.length) * 100);
  els.progressBar.style.width = `${pct}%`;
  els.progressText.textContent = state.currentIndex < QUESTIONS.length
    ? `Pergunta ${state.currentIndex + 1} de ${QUESTIONS.length}`
    : 'Ficha pronta para gerar o PDF';
}

function renderQuestion() {
  const q = QUESTIONS[state.currentIndex];
  updateProgress();
  els.questionCounter.textContent = `Pergunta ${state.currentIndex + 1} de ${QUESTIONS.length}`;
  els.questionLabel.textContent = `${q.label})`;
  els.questionText.textContent = q.text;
  els.recordingState.textContent = 'Aguardando';
  hideNotice(els.questionNotice);

  const answer = state.answers[state.currentIndex];
  els.answerText.value = answer.text || '';
  if (answer.audioUrl) {
    els.audioPlayer.src = answer.audioUrl;
    els.audioPlayer.classList.remove('hidden');
    els.btnPlay.disabled = false;
    els.btnTranscribe.disabled = false;
  } else {
    els.audioPlayer.removeAttribute('src');
    els.audioPlayer.classList.add('hidden');
    els.btnPlay.disabled = true;
    els.btnTranscribe.disabled = true;
  }

  els.btnRecord.disabled = false;
  els.btnStop.disabled = true;
}

async function startRecording() {
  hideNotice(els.questionNotice);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    state.mediaStream = stream;
    state.chunks = [];
    state.mediaRecorder = new MediaRecorder(stream, { mimeType });

    state.mediaRecorder.ondataavailable = event => {
      if (event.data && event.data.size > 0) state.chunks.push(event.data);
    };

    state.mediaRecorder.onstop = finalizeRecording;
    state.mediaRecorder.start();
    state.isRecording = true;
    els.recordingState.textContent = 'Gravando...';
    els.btnRecord.disabled = true;
    els.btnStop.disabled = false;
    els.btnTranscribe.disabled = true;
  } catch (error) {
    showNotice(els.questionNotice, 'Não foi possível iniciar a gravação. Verifique a permissão do microfone e teste novamente.', 'warning');
  }
}

function stopRecording() {
  if (!state.mediaRecorder || !state.isRecording) return;
  state.mediaRecorder.stop();
  state.isRecording = false;
  els.recordingState.textContent = 'Processando gravação...';
  els.btnStop.disabled = true;
}

function finalizeRecording() {
  const blob = new Blob(state.chunks, { type: state.mediaRecorder.mimeType || 'audio/webm' });
  const currentAnswer = state.answers[state.currentIndex];

  if (currentAnswer.audioUrl) URL.revokeObjectURL(currentAnswer.audioUrl);
  currentAnswer.audioBlob = blob;
  currentAnswer.audioUrl = URL.createObjectURL(blob);

  els.audioPlayer.src = currentAnswer.audioUrl;
  els.audioPlayer.classList.remove('hidden');
  els.btnPlay.disabled = false;
  els.btnTranscribe.disabled = false;
  els.btnRecord.disabled = false;
  els.recordingState.textContent = 'Gravação concluída';

  state.mediaStream?.getTracks().forEach(track => track.stop());
  state.mediaStream = null;
  state.mediaRecorder = null;
}

async function transcribeCurrentAudio() {
  const answer = state.answers[state.currentIndex];
  if (!answer.audioBlob) {
    showNotice(els.questionNotice, 'Grave uma resposta antes de transcrever.', 'warning');
    return;
  }

  hideNotice(els.questionNotice);
  els.btnTranscribe.disabled = true;
  els.btnTranscribe.textContent = 'Transcrevendo...';

  try {
    const formData = new FormData();
    formData.append('audio', answer.audioBlob, `resposta-${state.currentIndex + 1}.webm`);
    formData.append('questionLabel', QUESTIONS[state.currentIndex].label);
    formData.append('questionText', QUESTIONS[state.currentIndex].text);

    const API_BASE_URL = 'https://app-malu-backend.onrender.com';

const response = await fetch(`${API_BASE_URL}/api/transcribe`, {
  method: 'POST',
  body: formData
});

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na transcrição.');

    answer.text = data.text?.trim() || '';
    els.answerText.value = answer.text;
    els.recordingState.textContent = 'Transcrição pronta';
    showNotice(els.questionNotice, 'Áudio transcrito com sucesso. Revise o texto antes de continuar.', 'success');
  } catch (error) {
    showNotice(els.questionNotice, error.message || 'Não foi possível transcrever o áudio.', 'warning');
  } finally {
    els.btnTranscribe.disabled = false;
    els.btnTranscribe.textContent = 'Transcrever áudio';
  }
}

function skipQuestion() {
  state.answers[state.currentIndex].text = els.answerText.value.trim();
  moveForward();
}

function nextQuestion() {
  state.answers[state.currentIndex].text = els.answerText.value.trim();
  moveForward();
}

function moveForward() {
  if (state.currentIndex < QUESTIONS.length - 1) {
    state.currentIndex += 1;
    renderQuestion();
  } else {
    buildReview();
    state.currentIndex = QUESTIONS.length;
    updateProgress();
    showScreen('screenReview');
  }
}

function buildReview() {
  els.reviewList.innerHTML = '';
  QUESTIONS.forEach((q, index) => {
    const card = document.createElement('article');
    card.className = 'review-card';
    const answer = state.answers[index].text || 'Não informado';
    card.innerHTML = `<h3>${q.label}) ${q.text}</h3><p>${escapeHtml(answer)}</p>`;
    els.reviewList.appendChild(card);
  });
}

async function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 42;
  let y = 54;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Ficha do Paciente', margin, y);
  y += 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin, y);
  y += 28;

  QUESTIONS.forEach((q, index) => {
    const answer = state.answers[index].text || 'Não informado';
    const questionLines = doc.splitTextToSize(`${q.label}) ${q.text}`, pageWidth - margin * 2);
    const answerLines = doc.splitTextToSize(answer, pageWidth - margin * 2 - 12);
    const blockHeight = 22 + questionLines.length * 14 + answerLines.length * 14 + 26;

    if (y + blockHeight > doc.internal.pageSize.getHeight() - 48) {
      doc.addPage();
      y = 48;
    }

    doc.setDrawColor(212, 223, 219);
    doc.roundedRect(margin, y, pageWidth - margin * 2, blockHeight, 10, 10, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(questionLines, margin + 12, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text(answerLines, margin + 12, y + 18 + questionLines.length * 14 + 12);
    y += blockHeight + 14;
  });

  if (state.generatedPdfUrl) URL.revokeObjectURL(state.generatedPdfUrl);
  state.generatedPdfBlob = doc.output('blob');
  state.generatedPdfUrl = URL.createObjectURL(state.generatedPdfBlob);
  els.btnShare.disabled = false;
  showNotice(els.shareNotice, 'PDF gerado com sucesso. Agora você pode compartilhar com quem quiser.', 'success');
  window.open(state.generatedPdfUrl, '_blank');
}

async function sharePdf() {
  if (!state.generatedPdfBlob) return;
  const file = new File([state.generatedPdfBlob], 'ficha-paciente.pdf', { type: 'application/pdf' });

  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Ficha do Paciente',
        text: 'Segue a ficha em PDF.',
        files: [file]
      });
      showNotice(els.shareNotice, 'PDF compartilhado com sucesso.', 'success');
      return;
    }
  } catch (error) {
    // falls through to download
  }

  const a = document.createElement('a');
  a.href = state.generatedPdfUrl;
  a.download = 'ficha-paciente.pdf';
  a.click();
  showNotice(els.shareNotice, 'O compartilhamento direto não está disponível neste aparelho. O PDF foi baixado para envio manual.', 'success');
}

function restart() {
  state.currentIndex = 0;
  state.answers.forEach(answer => {
    if (answer.audioUrl) URL.revokeObjectURL(answer.audioUrl);
    answer.text = '';
    answer.audioBlob = null;
    answer.audioUrl = '';
  });
  if (state.generatedPdfUrl) URL.revokeObjectURL(state.generatedPdfUrl);
  state.generatedPdfBlob = null;
  state.generatedPdfUrl = '';
  hideNotice(els.shareNotice);
  els.btnShare.disabled = true;
  els.progressBar.style.width = '0%';
  els.progressText.textContent = 'Toque em iniciar para começar';
  showScreen('screenIntro');
}

function showNotice(el, message, type) {
  el.textContent = message;
  el.classList.remove('hidden', 'warning', 'success');
  el.classList.add(type === 'success' ? 'success' : 'warning');
}

function hideNotice(el) {
  el.classList.add('hidden');
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
