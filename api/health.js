export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    transcriptionConfigured: Boolean(process.env.OPENAI_API_KEY)
  });
}
