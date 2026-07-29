import server from "./.output/server/index.mjs";
import { join, resolve } from "path";

const PORT = Number(process.env.PORT ?? 9003);
const staticDir = resolve("./.output/public");

const MIME = {
  ".js":   "application/javascript",
  ".mjs":  "application/javascript",
  ".css":  "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".ttf":  "font/ttf",
  ".webp": "image/webp",
};

function getMime(path) {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Serve static assets from .output/public (fall through to SSR if not found)
    if (pathname !== "/") {
      const file = Bun.file(join(staticDir, pathname));
      if (await file.exists()) {
        return new Response(file, {
          headers: {
            "content-type": getMime(pathname),
            "cache-control": pathname.startsWith("/assets/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          },
        });
      }
    }

    // All other requests → SSR handler
    try {
      return await server.fetch(req, {}, { waitUntil: () => {} });
    } catch (err) {
      console.error("[SSR ERROR]", err);
      return new Response("Erro interno no servidor", { status: 500 });
    }
  },
});

console.log(`Servidor rodando em http://localhost:${PORT}`);
