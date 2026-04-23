const API_BASE_URL = '';

const QUESTIONS = [
  { label: 'A', text: 'Quais são os medicamentos de uso contínuo que você utiliza?' },
  { label: 'B', text: 'Você tem alguma alergia? Se sim, a quê?' },
  { label: 'C', text: 'Já realizou alguma cirurgia? Qual foi e quando?' },
  { label: 'D', text: 'Realizou preventivo, mamografia ou colonoscopia nos últimos anos?' },
  { label: 'E', text: 'Qual é a sua queixa hoje?' }
];

const state = {
  currentIndex: 0,
  answers: QUESTIONS.map(() => ({
    text: '',
    audioBlob: null,
    audioUrl: ''
  })),
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
    'screenIntro',
    'screenQuestion',
    'screenReview',
    'progressBar',
    'progressText',
    'supportNotice',
    'btnStart',
    'questionCounter',
    'recordingState',
    'questionLabel',
    'questionText',
    'answerText',
    'questionNotice',
    'btnRecord',
    'btnStop',
    'btnTranscribe',
    'btnPlay',
    'audioPlayer',
    'btnSkip',
    'btnNext',
    'reviewList',
    'btnPdf',
    'btnShare',
    'btnRestart',
    'shareNotice'
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.btnStart?.addEventListener('click', startFlow);
  els.btnRecord?.addEventListener('click', startRecording);
  els.btnStop?.addEventListener('click', stopRecording);
  els.btnTranscribe?.addEventListener('click', transcribeCurrentAudio);
  els.btnPlay?.addEventListener('click', () => els.audioPlayer?.play());
  els.btnSkip?.addEventListener('click', skipQuestion);
  els.btnNext?.addEventListener('click', nextQuestion);
  els.answerText?.addEventListener('input', () => {
    state.answers[state.currentIndex].text = els.answerText.value.trim();
  });
  els.btnPdf?.addEventListener('click', generatePdf);
  els.btnShare?.addEventListener('click', sharePdf);
  els.btnRestart?.addEventListener('click', restart);
}

function registerServiceWorker() {
  // Desativado temporariamente durante os testes
}

function checkSupport() {
  const canRecord = Boolean(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    window.MediaRecorder
  );

  if (!canRecord) {
    showNotice(
      els.supportNotice,
      'Este aparelho ou navegador não oferece suporte completo para gravação de áudio. Abra o link em Safari ou Chrome atualizados, sempre em HTTPS.',
      'warning'
    );
  }
}

async function startFlow() {
  const granted = await requestMicrophone();

  if (!granted) {
    showNotice(
      els.supportNotice,
      'Não foi possível acessar o microfone. Permita o uso do microfone no navegador e tente novamente.',
      'warning'
    );
    return;
  }

  showScreen('screenQuestion');
  renderQuestion();
}

async function requestMicrophone() {
  try {
    if (!navigator.mediaDevices?.getUserMedia) return false;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch (error) {
    console.error('Erro ao pedir microfone:', error);
    return false;
  }
}

function showScreen(id) {
  ['screenIntro', 'screenQuestion', 'screenReview'].forEach((screenId) => {
    els[screenId]?.classList.toggle('active', screenId === id);
  });
}

function updateProgress() {
  const pct = Math.round((state.currentIndex / QUESTIONS.length) * 100);

  if (els.progressBar) {
    els.progressBar.style.width = `${pct}%`;
  }

  if (els.progressText) {
    els.progressText.textContent =
      state.currentIndex < QUESTIONS.length
        ? `Pergunta ${state.currentIndex + 1} de ${QUESTIONS.length}`
        : 'Ficha pronta para gerar o PDF';
  }
}

function renderQuestion() {
  const q = QUESTIONS[state.currentIndex];
  updateProgress();

  if (els.questionCounter) {
    els.questionCounter.textContent = `Pergunta ${state.currentIndex + 1} de ${QUESTIONS.length}`;
  }

  if (els.questionLabel) {
    els.questionLabel.textContent = `${q.label})`;
  }

  if (els.questionText) {
    els.questionText.textContent = q.text;
  }

  if (els.recordingState) {
    els.recordingState.textContent = 'Aguardando';
  }

  hideNotice(els.questionNotice);

  const answer = state.answers[state.currentIndex];
  if (els.answerText) {
    els.answerText.value = answer.text || '';
  }

  if (answer.audioUrl) {
    if (els.audioPlayer) {
      els.audioPlayer.src = answer.audioUrl;
      els.audioPlayer.classList.remove('hidden');
    }
    if (els.btnPlay) els.btnPlay.disabled = false;
    if (els.btnTranscribe) els.btnTranscribe.disabled = false;
  } else {
    if (els.audioPlayer) {
      els.audioPlayer.removeAttribute('src');
      els.audioPlayer.classList.add('hidden');
    }
    if (els.btnPlay) els.btnPlay.disabled = true;
    if (els.btnTranscribe) els.btnTranscribe.disabled = true;
  }

  if (els.btnRecord) els.btnRecord.disabled = false;
  if (els.btnStop) els.btnStop.disabled = true;
}

async function startRecording() {
  hideNotice(els.questionNotice);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let mimeType = '';
    if (window.MediaRecorder?.isTypeSupported?.('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (window.MediaRecorder?.isTypeSupported?.('audio/webm')) {
      mimeType = 'audio/webm';
    }

    state.mediaStream = stream;
    state.chunks = [];
    state.mediaRecorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        state.chunks.push(event.data);
      }
    };

    state.mediaRecorder.onerror = (event) => {
      console.error('Erro no MediaRecorder:', event);
      showNotice(
        els.questionNotice,
        'Ocorreu um erro durante a gravação. Tente novamente.',
        'warning'
      );
    };

    state.mediaRecorder.onstop = finalizeRecording;
    state.mediaRecorder.start();

    state.isRecording = true;

    if (els.recordingState) {
      els.recordingState.textContent = 'Gravando...';
    }

    if (els.btnRecord) els.btnRecord.disabled = true;
    if (els.btnStop) els.btnStop.disabled = false;
    if (els.btnTranscribe) els.btnTranscribe.disabled = true;
  } catch (error) {
    console.error('Erro ao iniciar gravação:', error);
    showNotice(
      els.questionNotice,
      'Não foi possível iniciar a gravação. Verifique a permissão do microfone e tente novamente.',
      'warning'
    );
  }
}

function stopRecording() {
  if (!state.mediaRecorder || !state.isRecording) return;

  try {
    state.mediaRecorder.stop();
  } catch (error) {
    console.error('Erro ao parar gravação:', error);
  }

  state.isRecording = false;

  if (els.recordingState) {
    els.recordingState.textContent = 'Processando gravação...';
  }

  if (els.btnStop) els.btnStop.disabled = true;
}

function finalizeRecording() {
  const mimeType = state.mediaRecorder?.mimeType || 'audio/webm';
  const blob = new Blob(state.chunks, { type: mimeType });

  if (!blob || blob.size === 0) {
    showNotice(
      els.questionNotice,
      'A gravação não capturou áudio. Grave novamente e fale por pelo menos 2 segundos.',
      'warning'
    );

    if (els.btnPlay) els.btnPlay.disabled = true;
    if (els.btnTranscribe) els.btnTranscribe.disabled = true;
    if (els.btnRecord) els.btnRecord.disabled = false;
    if (els.recordingState) {
      els.recordingState.textContent = 'Falha na gravação';
    }

    state.mediaStream?.getTracks().forEach((track) => track.stop());
    state.mediaStream = null;
    state.mediaRecorder = null;
    return;
  }

  const currentAnswer = state.answers[state.currentIndex];

  if (currentAnswer.audioUrl) {
    URL.revokeObjectURL(currentAnswer.audioUrl);
  }

  currentAnswer.audioBlob = blob;
  currentAnswer.audioUrl = URL.createObjectURL(blob);

  if (els.audioPlayer) {
    els.audioPlayer.src = currentAnswer.audioUrl;
    els.audioPlayer.classList.remove('hidden');
  }

  if (els.btnPlay) els.btnPlay.disabled = false;
  if (els.btnTranscribe) els.btnTranscribe.disabled = false;
  if (els.btnRecord) els.btnRecord.disabled = false;

  if (els.recordingState) {
    els.recordingState.textContent = 'Gravação concluída';
  }

  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
  state.mediaRecorder = null;
}

async function transcribeCurrentAudio() {
  const answer = state.answers[state.currentIndex];

  if (!answer.audioBlob || answer.audioBlob.size === 0) {
    showNotice(
      els.questionNotice,
      'A gravação ficou vazia. Grave novamente e fale por pelo menos 2 segundos.',
      'warning'
    );
    return;
  }

  hideNotice(els.questionNotice);

  if (els.btnTranscribe) {
    els.btnTranscribe.disabled = true;
    els.btnTranscribe.textContent = 'Transcrevendo...';
  }

  try {
    const formData = new FormData();
    formData.append('audio', answer.audioBlob, `resposta-${state.currentIndex + 1}.webm`);
    formData.append('questionLabel', QUESTIONS[state.currentIndex].label);
    formData.append('questionText', QUESTIONS[state.currentIndex].text);

const response = await fetch('/api/transcribe', {
  method: 'POST',
  body: formData
});

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Falha na transcrição.');
    }

    answer.text = (data.text || '').trim();

    if (els.answerText) {
      els.answerText.value = answer.text;
    }

    if (els.recordingState) {
      els.recordingState.textContent = 'Transcrição pronta';
    }

    showNotice(
      els.questionNotice,
      'Áudio transcrito com sucesso. Revise o texto antes de continuar.',
      'success'
    );
  } catch (error) {
    console.error('Erro ao transcrever:', error);
    showNotice(
      els.questionNotice,
      error?.message || 'Erro de conexão com o servidor.',
      'warning'
    );
  } finally {
    if (els.btnTranscribe) {
      els.btnTranscribe.disabled = false;
      els.btnTranscribe.textContent = 'Transcrever áudio';
    }
  }
}

function skipQuestion() {
  state.answers[state.currentIndex].text = els.answerText?.value.trim() || '';
  moveForward();
}

function nextQuestion() {
  state.answers[state.currentIndex].text = els.answerText?.value.trim() || '';
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
  if (!els.reviewList) return;

  els.reviewList.innerHTML = '';

  QUESTIONS.forEach((q, index) => {
    const card = document.createElement('article');
    card.className = 'review-card';

    const answer = state.answers[index].text || 'Não informado';

    card.innerHTML = `
      <h3>${q.label}) ${escapeHtml(q.text)}</h3>
      <p>${escapeHtml(answer)}</p>
    `;

    els.reviewList.appendChild(card);
  });
}

async function generatePdf() {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
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

      if (y + blockHeight > pageHeight - 48) {
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

    if (state.generatedPdfUrl) {
      URL.revokeObjectURL(state.generatedPdfUrl);
    }

    state.generatedPdfBlob = doc.output('blob');
    state.generatedPdfUrl = URL.createObjectURL(state.generatedPdfBlob);

    if (els.btnShare) els.btnShare.disabled = false;

    showNotice(
      els.shareNotice,
      'PDF gerado com sucesso. Agora você pode compartilhar com quem quiser.',
      'success'
    );

    window.open(state.generatedPdfUrl, '_blank');
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    showNotice(
      els.shareNotice,
      'Não foi possível gerar o PDF.',
      'warning'
    );
  }
}

async function sharePdf() {
  if (!state.generatedPdfBlob || !state.generatedPdfUrl) {
    showNotice(
      els.shareNotice,
      'Gere o PDF antes de compartilhar.',
      'warning'
    );
    return;
  }

  const file = new File(
    [state.generatedPdfBlob],
    'ficha-paciente.pdf',
    { type: 'application/pdf' }
  );

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
    console.error('Erro ao compartilhar PDF:', error);
  }

  const a = document.createElement('a');
  a.href = state.generatedPdfUrl;
  a.download = 'ficha-paciente.pdf';
  a.click();

  showNotice(
    els.shareNotice,
    'O compartilhamento direto não está disponível neste aparelho. O PDF foi baixado para envio manual.',
    'success'
  );
}

function restart() {
  state.currentIndex = 0;

  state.answers.forEach((answer) => {
    if (answer.audioUrl) {
      URL.revokeObjectURL(answer.audioUrl);
    }
    answer.text = '';
    answer.audioBlob = null;
    answer.audioUrl = '';
  });

  if (state.generatedPdfUrl) {
    URL.revokeObjectURL(state.generatedPdfUrl);
  }

  state.generatedPdfBlob = null;
  state.generatedPdfUrl = '';

  hideNotice(els.shareNotice);

  if (els.btnShare) els.btnShare.disabled = true;
  if (els.progressBar) els.progressBar.style.width = '0%';
  if (els.progressText) els.progressText.textContent = 'Toque em iniciar para começar';

  showScreen('screenIntro');
}

function showNotice(el, message, type) {
  if (!el) return;

  el.textContent = message;
  el.classList.remove('hidden', 'warning', 'success');
  el.classList.add(type === 'success' ? 'success' : 'warning');
}

function hideNotice(el) {
  if (!el) return;
  el.classList.add('hidden');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
