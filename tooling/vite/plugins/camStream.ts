// Vite dev-server plugin — robot camera stream relay.
//
// Mounts a single `ws.WebSocketServer` on Vite's existing HTTP server (no
// extra port) and routes upgrade requests under `/robot/<streamId>` between
// one producer and N consumers per streamId.
//
// Each producer's messages (text headers + binary JPEG frames) are forwarded
// in arrival order to all current consumers of the same streamId.  No parsing,
// no buffering beyond what `ws` does internally — the relay is a dumb fanout.
//
// Connection roles are conveyed via `?role=producer` or `?role=consumer` query
// param.  Multiple producers per streamId are rejected (HTTP 409 on upgrade)
// so the wire model stays single-source-of-truth.

import type { Plugin, ViteDevServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { parse as parseUrl } from 'url';

interface StreamState {
  producer: WebSocket | null;
  consumers: Set<WebSocket>;
}

export function camStreamPlugin(): Plugin {
  return {
    name: 'farmsim:cam-stream',
    configureServer(server: ViteDevServer) {
      const wss = new WebSocketServer({ noServer: true });
      const streams = new Map<string, StreamState>();

      function getOrCreate(streamId: string): StreamState {
        let s = streams.get(streamId);
        if (!s) { s = { producer: null, consumers: new Set() }; streams.set(streamId, s); }
        return s;
      }

      function log(msg: string): void {
        // eslint-disable-next-line no-console
        console.log(`[cam-stream] ${msg}`);
      }

      wss.on('connection', (ws: WebSocket, req: IncomingMessage, ctx: { streamId: string; role: 'producer' | 'consumer' }) => {
        const { streamId, role } = ctx;
        const state = getOrCreate(streamId);

        if (role === 'producer') {
          if (state.producer) {
            log(`producer already attached on ${streamId} — closing new`);
            ws.close(1008, 'producer-busy');
            return;
          }
          state.producer = ws;
          log(`producer attached on ${streamId} (consumers=${state.consumers.size})`);

          let fwdCount = 0;
          ws.on('message', (data, isBinary) => {
            // Fanout to all consumers (readyState 1 = OPEN).
            for (const c of state.consumers) {
              if (c.readyState === 1) {
                try { c.send(data, { binary: isBinary }); } catch { /* consumer dropped */ }
              }
            }
            fwdCount++;
          });
          ws.on('close', () => {
            state.producer = null;
            log(`producer detached from ${streamId} (forwarded ${fwdCount} msgs)`);
            // Notify consumers via a small text frame so they can show "disconnected".
            const notice = JSON.stringify({ __event: 'producer-detached', streamId });
            for (const c of state.consumers) {
              if (c.readyState === 1) {
                try { c.send(notice); } catch { /* */ }
              }
            }
          });
          ws.on('error', (err) => log(`producer error on ${streamId}: ${err.message}`));
        } else {
          state.consumers.add(ws);
          log(`consumer attached on ${streamId} (total=${state.consumers.size}, hasProducer=${state.producer != null})`);
          // If producer isn't attached yet, the consumer just sits idle until
          // it shows up — relay doesn't synthesise stub frames.
          if (!state.producer) {
            try { ws.send(JSON.stringify({ __event: 'no-producer', streamId })); } catch { /* */ }
          }
          ws.on('close', () => {
            state.consumers.delete(ws);
            log(`consumer detached from ${streamId} (remaining=${state.consumers.size})`);
          });
          ws.on('error', (err) => log(`consumer error on ${streamId}: ${err.message}`));
        }
      });

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!req.url) return;
        const { pathname, query } = parseUrl(req.url, true);
        if (!pathname || !pathname.startsWith('/robot/')) return;
        const streamId = pathname.slice('/robot/'.length);
        if (streamId.length === 0) {
          socket.write('HTTP/1.1 400 Bad Request\r\n\r\n'); socket.destroy(); return;
        }
        const roleRaw = (query?.role as string | undefined) ?? 'consumer';
        const role: 'producer' | 'consumer' = roleRaw === 'producer' ? 'producer' : 'consumer';

        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req, { streamId, role });
        });
      });

      log('listening on /robot/* (mounted on Vite HTTP server)');
    },
  };
}
