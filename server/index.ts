/**
 * Perx Play server entry.
 *
 * Two modes, one codebase — the socket layer stays separable:
 *  - Default (`npm run dev` / `npm start`): one process serving Next.js AND
 *    Socket.IO on PORT. Right for a single VPS.
 *  - Standalone (`SOCKET_STANDALONE=1`, `npm run dev:socket`): Socket.IO only,
 *    on SOCKET_PORT. Deploy Next to Vercel and point the frontend at this
 *    host via NEXT_PUBLIC_SOCKET_URL.
 */
import { createServer } from 'http';
import { Server } from 'socket.io';
import { attachRealtime } from './realtime';

const standalone = !!process.env.SOCKET_STANDALONE;
const dev = process.env.NODE_ENV !== 'production';
const port = Number(standalone ? process.env.SOCKET_PORT || 3001 : process.env.PORT || 3000);

async function main() {
  let handler: (req: any, res: any) => void = (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'perx-play-socket' }));
  };

  if (!standalone) {
    const next = (await import('next')).default;
    const app = next({ dev });
    await app.prepare();
    handler = app.getRequestHandler();
  }

  const httpServer = createServer(handler);
  const io = new Server(httpServer, {
    cors: standalone ? { origin: process.env.APP_URL || '*', credentials: true } : undefined,
    // cafe Wi-Fi is flaky — be generous before declaring a client gone
    pingTimeout: 30000,
    pingInterval: 10000,
  });

  attachRealtime(io);

  // Background jobs: MyPerx earn-event lifecycle + news feed refresh.
  // Runs wherever the socket layer runs (one process in either deploy mode).
  if (!process.env.DISABLE_JOBS) {
    const { expireStalePending, dispatchConfirmed } = await import('../src/lib/integration');
    const { refreshFeeds } = await import('../src/lib/news');
    setInterval(async () => {
      try {
        await expireStalePending();
        await dispatchConfirmed();
      } catch (err) {
        console.error('[jobs:integration]', err);
      }
    }, 60000);
    const news = async () => {
      try {
        const results = await refreshFeeds();
        const ok = results.filter((r) => !r.error);
        if (ok.length) console.log('[jobs:news]', ok.map((r) => `${r.provider}+${r.added}`).join(' '));
      } catch (err) {
        console.error('[jobs:news]', err);
      }
    };
    setTimeout(news, 5000);
    setInterval(news, 60 * 60 * 1000);
  }

  httpServer.listen(port, () => {
    console.log(
      `[perx-play] ${standalone ? 'socket server' : 'app + socket'} listening on http://localhost:${port}`
    );
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
