import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});
const port = process.env.PORT || 3000;

const allowedOrigins = [
  'https://app-malu.vercel.app',
  'https://app-malu-87snh5631-jorgeldlf-8468s-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, true); // temporário para teste
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.options('*', cors());
app.use(express.json());

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
    const audioFile = await toFile(
      req.file.buffer,
      `resposta.${ext}`,
      { type: req.file.mimetype || 'audio/webm' }
    );

    const transcript = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe',
      language: 'pt'
    });

    return res.json({ text: transcript.text || '' });
  } catch (error) {
    console.error('Erro na transcrição:', error);

    return res.status(500).json({
      error:
        error?.message ||
        error?.error?.message ||
        'Falha ao transcrever o áudio.'
    });
  }
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
