// src/index.ts
import express, { Request, Response } from 'express';
import { pipeline } from '@xenova/transformers';

const PORT = 8080;
const app = express();
app.use(express.json());

let embeddingPipeline: any = null;
let modelReady = false;

async function getPipeline() {
  if (!embeddingPipeline) {
    console.log('[Embedder] Loading embedding model (first boot only — 2GB required)');
    embeddingPipeline = await (pipeline as any)(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2'
    );
    console.log('[Embedder] Model loaded successfully');
  }
  return embeddingPipeline;
}

async function getEmbedding(text: string): Promise<number[]> {
  const pipe = await getPipeline();
  const output = await (pipe as any)(text, {
    pooling: 'mean',
    normalize: true,
  });
  const embedding = Array.from(output.data) as number[];
  if (embedding.length !== 384) {
    throw new Error(`Vector dimension error: expected 384, got ${embedding.length}`);
  }
  return embedding;
}

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    bot: 'openclaw-embedder',
    version: '1.0.0',
    modelReady,
  });
});

app.post('/embed', async (req: Request, res: Response) => {
  if (!modelReady) {
    res.status(503).json({ error: 'Model still loading — retry in a moment' });
    return;
  }

  const { text } = req.body as { text?: unknown };

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ error: 'text field required and must be a non-empty string' });
    return;
  }

  try {
    const vector = await getEmbedding(text.trim());
    res.json({ vector });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error('[Embedder] /embed failed:', e.message);
    res.status(500).json({ error: e.message });
  }
});

async function main(): Promise<void> {
  console.log('[Embedder] Boot confirmed — openclaw-embedder v1.0.0');

  // Start server immediately so health checks pass
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Embedder] Health server on port ${PORT}`);
  });

  // Load model after server is up
  try {
    console.log('[Embedder] Pre-warming embedding model...');
    await getPipeline();
    const smokeVector = await getEmbedding('boot smoke test');
    console.log(`[Embedder] Smoke test vector length: ${smokeVector.length}`);
    if (smokeVector.length !== 384) {
      throw new Error('Smoke test failed — wrong vector dimension');
    }
    modelReady = true;
    console.log('[Embedder] Model ready — accepting /embed requests');
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[Embedder] Model load failed:', err.message);
    process.exit(1);
  }
}

main().catch(console.error);
