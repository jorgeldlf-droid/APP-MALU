import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(frontendDir));

let client = null;
if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, transcriptionConfigured: Boolean(client) });
});

app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio foi enviado.' });
    }
    if (!client) {
      return res.status(500).json({ error: 'A chave da API de transcrição não foi configurada no backend.' });
    }

    const ext = guessExtension(req.file.mimetype);
    const audioFile = new File([req.file.buffer], `resposta.${ext}`, { type: req.file.mimetype || 'audio/webm' });

    const transcript = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe',
      language: 'pt'
    });

    return res.json({ text: transcript.text || '' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Falha ao transcrever o áudio.' });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

function guessExtension(mimeType = '') {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}
