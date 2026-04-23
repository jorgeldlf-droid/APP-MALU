import OpenAI, { toFile } from 'openai';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

function runMiddleware(req, res, fn) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result) => {
      if (result instanceof Error) return reject(result);
      return resolve(result);
    });
  });
}

function guessExtension(mimeType = '') {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido.' });
  }

  try {
    await runMiddleware(req, res, upload.single('audio'));

    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio foi enviado.' });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'API key não configurada.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const ext = guessExtension(req.file.mimetype);
    const audioFile = await toFile(
      req.file.buffer,
      `audio.${ext}`,
      { type: req.file.mimetype || 'audio/webm' }
    );

    const response = await client.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text'
    });

    return res.status(200).json({
      text: typeof response === 'string' ? response : (response.text || '')
    });

  } catch (error) {
    console.error('Erro na transcrição:', error);
    return res.status(500).json({
      error: error?.message || 'Erro interno ao transcrever áudio.'
    });
  }
}
