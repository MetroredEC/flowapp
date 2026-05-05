import { Hono } from 'hono';
import { AppEnv } from '../types';
import { startProcess } from '../utils/bpm-engine';

const router = new Hono<AppEnv>();

router.post('/start', async (c) => {
  const body = await c.req.json();

  const id = await startProcess(
    body.processId,
    body.requestId,
    body.data,
    c.env
  );

  return c.json({ instanceId: id });
});

export default router;
