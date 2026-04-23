import OpenAI, { toFile } from 'openai';

export const config = {
  api: {
    bodyParser: false
  }
};

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseBoundary(contentType) {
  const match = contentType?.match(/boundary=([^\s;]+)/);
  return match ? match[1] : null;
}

function extractAudioFromMultipart(buffer, boundary) {
  const boundaryBuffer = Buffer.from('--' + boundary);
  const parts = [];
  let start = 0;

  while (start < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;
    const headerStart = boundaryIndex + boundaryBuffer.length + 2;
    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;
    const header = buffer.slice(headerStart, headerEnd).toString();
    const dataStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(boundaryBuffer, dataStart);
    const dataEnd = nextBoundary === -1 ? buffer.length : nextBoundary - 2;
    if (header.includes('name="audio"')) {
      const mimeMatch = header.match(/Content-Type:\s*([^\r\n]+)/i);
      const mime = mimeMatch ? mimeMatch[1].trim() : 'audio/webm';
      parts.push({ data: buffer.slice(dataStart, dataEnd), mime });
    }
    start = nextBoundary === -1 ? buffer.length : nextBoundary;
  }

  return parts[0] || null;
}

function guessExtension(mimeType = '') {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const contentType = req.headers['content-type'] || '';
    const boundary = parseBoundary(contentType);

    if (!boundary) {
      return res.status(400).json({ error: 'Content-Type inválido.' });
    }

    const rawBody = await getRawBody(req);
    const audioPart = extractAudioFromMultipart(rawBody, boundary);

    if (!audioPart) {
      return res.status(400).json({ error: 'Nenhum arquivo de áudio encontrado.' });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ext = guessExtension(audioPart.mime);

    const audioFile = await toFile(
      audioPart.data,
      `audio.${ext}`,
      { type: audioPart.mime }
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
