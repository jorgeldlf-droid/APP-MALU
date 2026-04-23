const OpenAI = require('openai').default;
const { toFile } = require('openai');
const { IncomingForm } = require('formidable');
const fs = require('fs');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const form = new IncomingForm({ keepExtensions: true });

    const [fields, files] = await form.parse(req);

    const audioFile = files.audio?.[0];
    if (!audioFile) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio encontrado.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const fileBuffer = fs.readFileSync(audioFile.filepath);
    const mime = audioFile.mimetype || 'audio/webm';
    const ext = mime.includes('mp4') ? 'm4a'
      : mime.includes('mpeg') ? 'mp3'
      : mime.includes('wav') ? 'wav'
      : mime.includes('ogg') ? 'ogg'
      : 'webm';

    const file = await toFile(fileBuffer, `audio.${ext}`, { type: mime });

    const response = await client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'pt',
      response_format: 'text'
    });

    return res.status(200).json({
      text: typeof response === 'string' ? response : (response.text || '')
    });

  } catch (error) {
    console.error('Erro:', error);
    return res.status(500).json({ error: error?.message || 'Erro interno.' });
  }
};
