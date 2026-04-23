import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import OpenAI, { toFile } from 'openai';

const app = express();

// Upload de áudio em memória
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB
});

const port = process.env.PORT || 3000;

// 🔥 CORS LIBERADO (evita erro de fetch)
app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.options('*', cors());
app.use(express.json());

// 🔑 Cliente OpenAI
let client = null;
if (process.env.OPENAI_API_KEY) {
  client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
}

// 🔍 Health check
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    transcriptionConfigured: Boolean(client)
  });
});

// 🎤 Transcrição
app.post('/api/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Nenhum arquivo de áudio foi enviado.'
      });
    }

    if (!client) {
      return res.status(500).json({
        error: 'API key não configurada no backend.'
      });
    }

    const ext = guessExtension(req.file.mimetype);

    const audioFile = await toFile(
      req.file.buffer,
      `audio.${ext}`,
      { type: req.file.mimetype || 'audio/webm' }
    );

    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'gpt-4o-mini-transcribe',
      language: 'pt'
    });

    return res.json({
      text: response.text || ''
    });

  } catch (error) {
    console.error('Erro na transcrição:', error);

    return res.status(500).json({
      error:
        error?.message ||
        error?.error?.message ||
        'Erro interno ao transcrever áudio.'
    });
  }
});

// 🚀 Start servidor
app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

// 🔧 Auxiliar
function guessExtension(mimeType = '') {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}
