// Boots the full termverse for local dev: both game dev servers plus the landing
// page, all from one `npm run dev`. Zero dependencies (Node built-ins only) — see
// scripts/visual/pane-dividers.mjs for the same convention.
//
// In dev each game's basePath is "" (see apps/*/next.config.ts: basePath only
// applies when isProd), so the games run at the root of their own ports. The landing
// page links to relative siblings ./termoil/ and ./term-crunch/, which don't resolve
// across ports — so we serve it with those two links rewritten to the dev URLs.
//
// This is a live-dev convenience, NOT a production-faithful preview of the nested
// /termverse/ layout (that only exists in the deploy artifact).

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const TERMOIL_PORT = 3000;
const CRUNCH_PORT = 3001;
const LANDING_PORT = 8080;

const TERMOIL_URL = `http://localhost:${TERMOIL_PORT}`;
const CRUNCH_URL = `http://localhost:${CRUNCH_PORT}`;
const LANDING_URL = `http://localhost:${LANDING_PORT}`;

let shuttingDown = false;

/** Spawn a workspace dev server, prefixing its output so streams stay readable. */
function spawnGame(label, workspace, port) {
  const child = spawn("npm", ["-w", workspace, "run", "dev"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = (stream) => {
    let buffered = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk) => {
      buffered += chunk;
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) process.stdout.write(`[${label}] ${line}\n`);
    });
  };
  prefix(child.stdout);
  prefix(child.stderr);

  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`\n[${label}] exited (code ${code ?? "null"}) — shutting down.`);
      shutdown(1);
    }
  });

  return child;
}

const children = [
  spawnGame("termoil", "@tt/termoil", TERMOIL_PORT),
  spawnGame("crunch", "@tt/term-crunch", CRUNCH_PORT),
];

// Landing page: rewrite the two relative game links to the dev-server URLs so the
// cards actually navigate. site/index.html stays the single source of truth.
const landing = createServer((req, res) => {
  try {
    const html = readFileSync(join(ROOT, "site", "index.html"), "utf8")
      .replaceAll('href="./termoil/"', `href="${TERMOIL_URL}/"`)
      .replaceAll('href="./term-crunch/"', `href="${CRUNCH_URL}/"`);
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(`Failed to read site/index.html: ${err.message}`);
  }
});

landing.listen(LANDING_PORT, () => {
  console.log(
    [
      "",
      "  termverse dev — all three are live with hot reload:",
      "",
      `    landing      ${LANDING_URL}`,
      `    termoil      ${TERMOIL_URL}`,
      `    term-crunch  ${CRUNCH_URL}`,
      "",
      "  Press Ctrl+C to stop everything.",
      "",
    ].join("\n"),
  );
});

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  landing.close();
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
