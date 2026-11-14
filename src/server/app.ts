import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { serveStatic } from "@hono/node-server/serve-static";
import { DEV_UI_ORIGINS, checkRequest } from "../shared/requestGuard.js";
import { docSummary, validateDoc } from "../shared/doc.js";
import { STYLES, type UiDoc, type UiStyle } from "../shared/types.js";
import { FONT_DIR } from "../lib/assets.js";
import { exportUi, type ExportPreset } from "../lib/export.js";
import { iconSheetPng, renderScreenPng } from "../lib/render.js";
import { assertSafeId, dirs, fileWarnings, listBackgrounds, listDocs, loadDoc, readDocRaw, resolveInside, saveDoc, workspaceSummary } from "../lib/workspace.js";

export interface CreateAppOptions {
  workspaceRoot: string;
  webRoot?: string;
  dev?: boolean;
  host?: string;
  token?: string;
}

const TOKEN_COOKIE = "easyui_token";
const fail = (e: unknown) => (e instanceof Error ? e.message : String(e));

function tokenPage(): string {
  return `<!doctype html><meta charset="utf-8"><title>Easy UI</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy UI token required</h1>
<p>Paste the token printed in the terminal that started Easy UI.</p>
<form method="get"><input name="token" autocomplete="off" style="width:22rem"> <button>Open</button></form>
</body>`;
}

const bytes = (buf: Buffer) => new Uint8Array(buf);

export function createApp(options: CreateAppOptions): Hono {
  const app = new Hono();
  const { workspaceRoot: root, webRoot, dev, host = "127.0.0.1", token } = options;
  const guard = { bindHost: host, token, extraOrigins: dev ? DEV_UI_ORIGINS : [] };

  app.use("*", async (c, next) => {
    const queryToken = c.req.query("token");
    const provided = c.req.header("x-easyui-token") ?? queryToken ?? getCookie(c, TOKEN_COOKIE);
    const denied = checkRequest(guard, { method: c.req.method, host: c.req.header("host"), origin: c.req.header("origin"), token: provided });
    if (denied) {
      if (denied.status === 401 && c.req.method === "GET" && !c.req.path.startsWith("/api/")) return c.html(tokenPage(), 401);
      return c.json({ error: denied.error }, denied.status);
    }
    if (token && queryToken) setCookie(c, TOKEN_COOKIE, queryToken, { httpOnly: true, sameSite: "Strict", path: "/", maxAge: 60 * 60 * 24 * 365 });
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true, workspaceRoot: root }));
  app.get("/api/workspace", async (c) => c.json(await workspaceSummary(root)));
  app.get("/api/docs", async (c) => c.json({ docs: await listDocs(root), backgrounds: await listBackgrounds(root) }));

  app.get("/api/docs/:id", async (c) => {
    try {
      const raw = await readDocRaw(root, c.req.param("id"));
      const v = validateDoc(raw);
      return c.json({ id: c.req.param("id"), doc: raw, errors: v.errors, warnings: [...v.warnings, ...(v.doc ? fileWarnings(root, v.doc) : [])], summary: v.doc ? docSummary(v.doc) : null });
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  app.post("/api/docs/:id", async (c) => {
    try {
      const body = (await c.req.json()) as { doc: unknown; force?: boolean };
      const res = await saveDoc(root, c.req.param("id"), body.doc, { force: body.force });
      return c.json({ ok: res.saved, file: res.file, errors: res.errors, warnings: res.warnings });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.post("/api/validate", async (c) => {
    const body = (await c.req.json()) as { doc: unknown };
    const v = validateDoc(body.doc);
    return c.json({ errors: v.errors, warnings: [...v.warnings, ...(v.doc ? fileWarnings(root, v.doc) : [])] });
  });

  /** PNG of a screen from a saved doc (or an unsaved `doc` body). */
  app.post("/api/render", async (c) => {
    try {
      const body = (await c.req.json()) as { id?: string; doc?: UiDoc; screen: string; scale?: number; style?: UiStyle };
      let doc: UiDoc;
      if (body.doc) {
        const v = validateDoc(body.doc);
        if (!v.doc) return c.json({ error: "Doc has errors", errors: v.errors }, 400);
        doc = v.doc;
      } else doc = await loadDoc(root, assertSafeId(body.id, "doc id"));
      if (body.style && !STYLES.includes(body.style)) throw new Error(`Unknown style ${body.style}`);
      const scale = Math.max(1, Math.min(6, Math.round(body.scale ?? 3)));
      const r = await renderScreenPng(root, doc, assertSafeId(body.screen, "screen id"), { scale, style: body.style });
      return c.body(bytes(r.png), 200, { "Content-Type": "image/png" });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  app.get("/api/icons.png", (c) => c.body(bytes(iconSheetPng()), 200, { "Content-Type": "image/png" }));

  /** Workspace images (backgrounds, image widgets) for the editor preview. PNG only, inside the workspace. */
  app.get("/api/files/*", async (c) => {
    try {
      const rel = decodeURIComponent(c.req.path.replace(/^\/api\/files\//, ""));
      if (!rel.toLowerCase().endsWith(".png")) return c.json({ error: "PNG only" }, 400);
      const abs = resolveInside(root, rel);
      if (!abs.startsWith(path.resolve(root) + path.sep)) return c.json({ error: "outside workspace" }, 403);
      return c.body(bytes(await readFile(abs)), 200, { "Content-Type": "image/png", "Cache-Control": "no-cache" });
    } catch (e) {
      return c.json({ error: fail(e) }, 404);
    }
  });

  app.get("/api/fonts/:name", async (c) => {
    const name = c.req.param("name");
    if (!["Kanit-Regular.ttf", "Kanit-Medium.ttf"].includes(name)) return c.json({ error: "unknown font" }, 404);
    return c.body(bytes(await readFile(path.join(FONT_DIR, name))), 200, { "Content-Type": "font/ttf", "Cache-Control": "max-age=86400" });
  });

  app.post("/api/export", async (c) => {
    try {
      const body = (await c.req.json()) as { id: string; preset?: ExportPreset; out?: string };
      const res = await exportUi(root, { doc: assertSafeId(body.id, "doc id"), preset: body.preset, out: body.out });
      return c.json({ ok: true, ...res, files: res.files.length });
    } catch (e) {
      return c.json({ error: fail(e) }, 400);
    }
  });

  if (!dev && webRoot) {
    app.use("/*", serveStatic({ root: webRoot }));
    app.get("*", async (c) => {
      try {
        return c.html((await readFile(path.join(webRoot, "index.html"))).toString("utf8"));
      } catch {
        return c.text("Web UI not built yet. Run npm run build:web or start with --dev.", 503);
      }
    });
  } else if (dev) {
    app.get("/", (c) =>
      c.html(`<!doctype html><meta charset="utf-8"><title>Easy UI (dev)</title>
<body style="font-family:system-ui;background:#1a1410;color:#f3e7d3;padding:2rem">
<h1>Easy UI API is running</h1><p>Workspace: <code>${root}</code></p>
<p>Open the Vite UI at <a href="http://127.0.0.1:5179" style="color:#f0c36a">http://127.0.0.1:5179</a></p></body>`),
    );
  }
  void dirs;
  return app;
}

export function defaultWebRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [path.resolve(here, "../web/dist"), path.resolve(here, "../../web/dist")];
  return candidates.find((p) => existsSync(path.join(p, "index.html"))) ?? candidates[1]!;
}
