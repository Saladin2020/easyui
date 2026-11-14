#!/usr/bin/env node
/**
 * Easy UI MCP server (stdio by default; optional Streamable HTTP).
 *
 *   npx tsx src/mcp/server.ts
 *   npx tsx src/mcp/server.ts --http --port 8839
 *
 * Env: EASYUI_WORKSPACE  absolute path to the workspace (default: cwd)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { z } from "zod";
import { checkRequest, resolveToken } from "../shared/requestGuard.js";
import { docSummary, validateDoc } from "../shared/doc.js";
import { PARTS, STYLE_LABELS } from "../shared/frames.js";
import { ICONS, ICON_NAMES } from "../shared/icons.js";
import { BAR_KINDS, BUTTON_STATES, STYLES, WIDGET_TYPES, type Screen, type UiDoc } from "../shared/types.js";
import { EXPORT_PRESETS, exportUi } from "../lib/export.js";
import { iconSheetPng, renderScreenPng } from "../lib/render.js";
import { dirs, fileWarnings, listBackgrounds, loadConfig, readDocRaw, resolveWorkspace, saveDoc, workspaceSummary } from "../lib/workspace.js";

export const MCP_TOOL_NAMES = ["workspace_info", "list_screens", "get_screen", "write_screen", "render_screen", "list_icons", "export_ui"] as const;

const IdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, "Use a-z, 0-9, _ or -");

function text(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}
function err(message: string) {
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const WIDGET_CHEATSHEET = `Screen: { title?, background? (workspace PNG like "backgrounds/x.png", "#hex" or "none"), dim? 0..1, style? (${STYLES.join("|")}), widgets: [...] }
Coordinates are viewport pixels (default 480×270, origin top-left). Every widget has type, x, y and an optional id.
  panel {w,h,title?,small?} · label {text,size?=10,color?,align? left|center|right (x is the anchor),w? (wraps; Thai-aware),font? body|title} — label y is the text BASELINE
  button {w,h?=20,text,state? ${BUTTON_STATES.join("|")},icon?} · menu {w,items[],selected?,disabled?[],itemH?=20,gap?=4,panel?=true,title?} (x,y = first item; the panel adds 18px left/right, 10px top/bottom)
  bar {w,h?=10,kind ${BAR_KINDS.join("|")},value,max,label? (adds 22px on the left),showText?}
  inventory {cols,rows,slot?=22,gap?=2,items:[{icon,count?}|null],selected?} · hotbar {slots,slot?=22,items,selected?,keys?=true}
  icon {icon,scale?} · toggle {text,on,focus?} · slider {w,text,value 0..1,focus?} · tabs {w,tabs[],selected?} · tooltip {w,title,text,icon?} · cursor {kind? hand|arrow} · image {src,w?,h?}
Icons (16×16): ${ICON_NAMES.join(", ")}.`;

function parseArgs(argv: string[]) {
  const out = { http: false, port: 8839, host: "127.0.0.1", workspace: process.env.EASYUI_WORKSPACE ?? process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--http") out.http = true;
    else if (a === "--port") out.port = Number(argv[++i] ?? out.port);
    else if (a === "--host") out.host = argv[++i] ?? out.host;
    else if (a === "--workspace") out.workspace = argv[++i] ?? out.workspace;
  }
  return out;
}

export function createEasyUiMcp(workspaceRoot: string): McpServer {
  const root = resolveWorkspace(workspaceRoot);
  const server = new McpServer({ name: "easyui", version: "0.1.0" });
  const docOf = async (d?: string) => d ?? (await loadConfig(root)).doc;

  server.registerTool(
    "workspace_info",
    { title: "Workspace info", description: "Summarize the Easy UI workspace (docs, screens of the default doc, backgrounds), the 5 styles, widget types, icon names and the screen format. Call this first.", inputSchema: {} },
    async () => {
      const s = await workspaceSummary(root);
      return text({ name: "easyui", root: s.root, config: s.config, docs: s.docs, backgrounds: s.backgrounds, current: s.current, styles: STYLE_LABELS, widgets: WIDGET_TYPES, icons: ICON_NAMES, parts: Object.keys(PARTS), exportPresets: EXPORT_PRESETS, screenFormat: WIDGET_CHEATSHEET });
    },
  );

  server.registerTool(
    "list_screens",
    { title: "List screens", description: "List the screens of a UI doc (default doc when omitted) with style, widget count and widget types, plus validation counts.", inputSchema: { doc: IdSchema.optional() } },
    async ({ doc }) => {
      try {
        const id = await docOf(doc);
        const raw = await readDocRaw(root, id);
        const v = validateDoc(raw);
        if (!v.doc) return text({ doc: id, errors: v.errors });
        return text({ doc: id, ...docSummary(v.doc), warnings: [...v.warnings, ...fileWarnings(root, v.doc)] });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "get_screen",
    { title: "Get screen", description: "Full JSON of one screen (widgets with coordinates) plus the doc style and viewport.", inputSchema: { screen: IdSchema, doc: IdSchema.optional() } },
    async ({ screen, doc }) => {
      try {
        const d = (await readDocRaw(root, await docOf(doc))) as UiDoc;
        const s = d.screens?.[screen];
        if (!s) return err(`No screen "${screen}" (have: ${Object.keys(d.screens ?? {}).join(", ")})`);
        return text({ screen, style: s.style ?? d.style, viewport: d.viewport, def: s });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "write_screen",
    {
      title: "Write screen",
      description: `Add or replace a screen in a UI doc (creates the doc when it does not exist, with style + 480×270 viewport). Validates before saving: refuses on errors (path + message), returns layout warnings (off-screen widgets, unknown icons). dryRun only validates.\n${WIDGET_CHEATSHEET}`,
      inputSchema: {
        screen: IdSchema,
        doc: IdSchema.optional(),
        def: z.record(z.string(), z.unknown()).describe("Screen object {title?, background?, dim?, style?, widgets: []}"),
        style: z.enum(STYLES).optional().describe("Doc style when creating a new doc"),
        dryRun: z.boolean().optional(),
      },
    },
    async ({ screen, doc, def, style, dryRun }) => {
      try {
        const id = await docOf(doc);
        let raw: UiDoc;
        try {
          raw = (await readDocRaw(root, id)) as UiDoc;
        } catch {
          raw = { format: "easyui/1", name: id, style: style ?? "teak", viewport: { width: 480, height: 270 }, screens: {} };
        }
        raw.screens = { ...(raw.screens ?? {}), [screen]: def as unknown as Screen };
        const res = await saveDoc(root, id, raw, { dryRun });
        return text({ saved: res.saved, file: res.file, errors: res.errors, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "render_screen",
    {
      title: "Render screen",
      description: "Render a screen to exports/renders/<doc>-<screen>.png and return the PNG image plus widget boxes (for checking layout).",
      inputSchema: { screen: IdSchema, doc: IdSchema.optional(), scale: z.number().int().min(1).max(4).optional(), style: z.enum(STYLES).optional() },
    },
    async ({ screen, doc, scale, style }) => {
      try {
        const id = await docOf(doc);
        const v = validateDoc(await readDocRaw(root, id));
        if (!v.doc) return text({ errors: v.errors });
        const r = await renderScreenPng(root, v.doc, screen, { scale: scale ?? 2, style });
        const out = path.join(dirs(root).exports, "renders", `${id}-${screen}.png`);
        await mkdir(path.dirname(out), { recursive: true });
        await writeFile(out, r.png);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify({ file: out, width: r.width, height: r.height, widgets: r.hits }, null, 2) },
            { type: "image" as const, data: r.png.toString("base64"), mimeType: "image/png" },
          ],
        };
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  server.registerTool(
    "list_icons",
    { title: "List icons", description: "The procedural 16×16 item icons (Thai + English names) and workspace backgrounds; includes the icon sheet as an image.", inputSchema: { image: z.boolean().optional().describe("Include the icon sheet PNG (default true)") } },
    async ({ image }) => {
      const data = { icons: Object.fromEntries(ICON_NAMES.map((n) => [n, { th: ICONS[n]!.th, en: ICONS[n]!.en }])), backgrounds: await listBackgrounds(root) };
      if (image === false) return text(data);
      return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }, { type: "image" as const, data: iconSheetPng().toString("base64"), mimeType: "image/png" }] };
    },
  );

  server.registerTool(
    "export_ui",
    { title: "Export UI", description: "Export a UI doc: godot (Godot 4.3+ project: Theme .tres per style with StyleBoxTexture nine-slices, Kanit, one .tscn per screen), pixi (PixiJS v8 atlas + easyui-pixi.js components + demo), png (screen renders, icon/style sheets, loose parts), json, or all.", inputSchema: { doc: IdSchema.optional(), preset: z.enum(EXPORT_PRESETS).optional(), out: z.string().optional().describe("Workspace-relative output folder") } },
    async ({ doc, preset, out }) => {
      try {
        const res = await exportUi(root, { doc: await docOf(doc), preset, out });
        return text({ dirs: res.dirs, files: res.files.length, warnings: res.warnings });
      } catch (e) {
        return err(msg(e));
      }
    },
  );

  return server;
}

async function startMcp(opts: ReturnType<typeof parseArgs>) {
  const workspace = resolveWorkspace(opts.workspace);
  if (opts.http) return startHttp(workspace, opts.host, opts.port);
  await createEasyUiMcp(workspace).connect(new StdioServerTransport());
}

async function startHttp(workspace: string, host: string, port: number) {
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const sessions = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
  const token = resolveToken(host);
  if (token) console.error(`Non-loopback host: send "Authorization: Bearer <token>" — token printed once: ${token}`);
  const httpServer = createServer(async (req, res) => {
    const auth = req.headers.authorization;
    const denied = checkRequest(
      { bindHost: host, token },
      { method: req.method ?? "GET", host: req.headers.host, origin: req.headers.origin, token: auth?.startsWith("Bearer ") ? auth.slice(7) : (req.headers["x-easyui-token"] as string | undefined) },
    );
    if (denied) {
      res.writeHead(denied.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: denied.error }));
      return;
    }
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    if (url.pathname !== "/mcp") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ name: "easyui", transport: "streamable-http", endpoint: `http://${host}:${port}/mcp`, workspace }));
      return;
    }
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    try {
      if (req.method === "POST") {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          const mcp = createEasyUiMcp(workspace);
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => crypto.randomUUID(),
            onsessioninitialized: (id: string) => {
              sessions.set(id, transport!);
            },
          });
          transport.onclose = () => {
            const id = transport!.sessionId;
            if (id) sessions.delete(id);
          };
          await mcp.connect(transport);
        }
        await transport.handleRequest(req, res);
        return;
      }
      if (req.method === "GET" || req.method === "DELETE") {
        const transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid or missing mcp-session-id" }));
          return;
        }
        await transport.handleRequest(req, res);
        return;
      }
      res.writeHead(405).end();
    } catch (e) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: msg(e) }));
      }
    }
  });
  httpServer.listen(port, host, () => {
    console.error(`Easy UI MCP (HTTP) http://${host}:${port}/mcp`);
    console.error(`Workspace ${workspace}`);
  });
}

function entryIndex(): number {
  return process.argv.findIndex((arg) => /(?:^|[/\\])mcp[/\\]server\.(?:ts|js|mjs)$/i.test(arg));
}

if (entryIndex() >= 0) {
  await startMcp(parseArgs(process.argv.slice(entryIndex() + 1)));
}
