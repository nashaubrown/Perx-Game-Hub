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
