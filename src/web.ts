import { createServer, type Server } from 'node:http';

export type HealthOptions = {
  port: number;
  isReady: () => boolean;
  getStats: () => { authorizedGuilds: number; autoBypassChannels: number; commands: number };
};

export function startHealthServer(options: HealthOptions): Server {
  const startedAt = Date.now();
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`).pathname;
    const ready = options.isReady();
    const stats = options.getStats();
    if (path === '/' || path === '/health') {
      const payload = {
        ok: true,
        service: 'BypassX',
        status: ready ? 'ready' : 'starting',
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
        discordReady: ready,
        ...stats,
      };
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify(payload));
      return;
    }
    if (path === '/ready') {
      response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: ready, service: 'BypassX', status: ready ? 'ready' : 'starting' }));
      return;
    }
    if (path === '/metrics') {
      response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
      response.end([
        '# HELP bypassx_up BypassX process is alive.',
        '# TYPE bypassx_up gauge',
        'bypassx_up 1',
        '# HELP bypassx_discord_ready Discord gateway readiness.',
        '# TYPE bypassx_discord_ready gauge',
        `bypassx_discord_ready ${ready ? 1 : 0}`,
        `bypassx_authorized_guilds ${stats.authorizedGuilds}`,
        `bypassx_autobypass_channels ${stats.autoBypassChannels}`,
        `bypassx_commands_loaded ${stats.commands}`,
      ].join('\n') + '\n');
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: false, error: 'not_found' }));
  });
  server.listen(options.port, '0.0.0.0', () => console.log(`Health server listening on 0.0.0.0:${options.port} (` + `GET /health` + ')'));
  return server;
}
