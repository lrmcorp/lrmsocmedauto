// Classify disposable CI logs without publishing raw requests, tokens, or config.
const { readFileSync } = require('node:fs');
const log = readFileSync(0, 'utf8');
const signatures = {
  upstream_connection_refused_ipv4: /connect\(\) failed.*upstream: "http:\/\/127\.0\.0\.1:/g,
  upstream_connection_refused_ipv6: /connect\(\) failed.*upstream: "http:\/\/\[::1\]:/g,
  upstream_closed_connection: /upstream prematurely closed connection/g,
  upstream_timeout: /upstream timed out/g,
  node_heap_exhausted: /heap out of memory|Reached heap limit|Ineffective mark-compacts/gi,
  killed_process: /SIGKILL/g,
  backend_started: /Backend started successfully/g,
  backend_start_failed: /Backend failed to start/g,
  database_connection_failed: /Can't reach database server|ECONNREFUSED|P1001/g,
  process_exited: /exited with code/g,
};
for (const [name, pattern] of Object.entries(signatures)) {
  console.log(`${name}=${[...log.matchAll(pattern)].length}`);
}
