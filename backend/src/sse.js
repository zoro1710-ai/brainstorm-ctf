'use strict';
// Minimal Server-Sent-Events hub -- this is the "real-time push" mechanism.
// Two channels: public (leaderboard-safe, sanitized) and organizer (full evidence).
// Kept dependency-free (no socket.io) since SSE over plain HTTP is enough for a
// one-way leaderboard/alert feed and needs zero client-side library.

function createHub() {
  const publicClients = new Set();
  const organizerClients = new Set();

  function attach(res, set) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(':ok\n\n');
    set.add(res);
    const keepAlive = setInterval(() => { try { res.write(':ping\n\n'); } catch (_) {} }, 20000);
    res.req.on('close', () => { clearInterval(keepAlive); set.delete(res); });
  }

  // Write to one client. Returns false (and never throws) if the socket is dead,
  // so a single broken/half-open connection can't abort a broadcast to everyone
  // else or bubble an exception up into the submission pipeline.
  function send(res, event, data) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (_) {
      return false;
    }
  }

  function broadcast(set, event, data) {
    for (const res of set) {
      if (!send(res, event, data)) set.delete(res); // prune dead clients
    }
  }

  function broadcastPublic(event, data) {
    broadcast(publicClients, event, data);
  }

  function broadcastOrganizer(event, data) {
    broadcast(organizerClients, event, data);
  }

  return {
    attachPublic: (res) => attach(res, publicClients),
    attachOrganizer: (res) => attach(res, organizerClients),
    broadcastPublic,
    broadcastOrganizer,
    counts: () => ({ public: publicClients.size, organizer: organizerClients.size }),
  };
}

module.exports = { createHub };
