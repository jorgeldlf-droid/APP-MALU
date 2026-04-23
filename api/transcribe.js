const OpenAI = require('openai').default;
const { toFile } = require('openai');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const chunks = [];
    await new Promise((resolve, reject) => {
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', resolve);
      req.on('error', reject);
    });

    const body = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(.+)$/);
    if (!boundaryMatch) return res.status(400).json({ error: 'Boundary não encontrado.' });

    const boundary = boundaryMatch[1].trim();
    const delimiter = Buffer.from('\r\n--' + boundary);
    const parts = [];
    let start = body.indexOf(Buffer.from('--' + boundary)) + boundary.length + 4;

    while (start < body.length) {
      const end = body.indexOf(delimiter, start);
      if (end === -1) break;
      const part = body.slice(start, end);
      const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
      if (headerEnd === -1) { start = end + delimiter.length + 2; continue; }
      const headers = part.slice(0, headerEnd).toString();
      const data = part.slice(headerEnd + 4);
      parts.push({ headers, data });
      start = end + delimiter.length + 2;
    }

    const audioPart = parts.find(p => p.headers.includes('name="audio"'));
    if (!audioPart) return res.status(400).json({ error: 'Áudio não encontrado.' });

    const mimeMatch = audioPart.headers.match(/Content-Type:\s*([^\r\n]+)/i);
    const mime = mimeMatch ? mimeMatch[1].trim() : 'audio/webm';
    const ext = mime.includes('mp4') ? 'm4a'
      : mime.includes('mpeg') ? 'mp3'
      : mime.includes('wav') ? 'wav'
      : mime.includes('ogg') ? 'ogg'
      : 'webm';

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const file = await toFile(audioPart.data, `audio.${ext}`, { type: mime });

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
