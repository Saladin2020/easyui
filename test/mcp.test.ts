import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { access } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_TOOL_NAMES, createEasyUiMcp } from "../src/mcp/server.js";
import { createApp } from "../src/server/app.js";
import { tempWorkspace } from "./helpers.js";

let root: string;
let cleanup: () => Promise<void>;
let client: Client;
beforeAll(async () => {
  ({ root, cleanup } = await tempWorkspace());
  const server = createEasyUiMcp(root);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  client = new Client({ name: "test", version: "0.0.1" });
  await client.connect(b);
});
afterAll(async () => {
  await client.close();
  await cleanup();
});

const body = (res: unknown) => JSON.parse(((res as { content: Array<{ text: string }> }).content[0]!).text);

describe("MCP server", () => {
  it("lists the seven tools", async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(tools).toEqual([...MCP_TOOL_NAMES].sort());
    expect(tools).toHaveLength(7);
  });

  it("writes a screen, renders and exports end to end", async () => {
    const info = body(await client.callTool({ name: "workspace_info", arguments: {} }));
    expect(info.current.screens.map((s: { id: string }) => s.id)).toContain("inventory");
    expect(info.screenFormat).toMatch(/BASELINE/);
    expect(info.icons).toContain("sticky_rice");

    const list = body(await client.callTool({ name: "list_screens", arguments: {} }));
    expect(list.screens).toHaveLength(6);
    const got = body(await client.callTool({ name: "get_screen", arguments: { screen: "hud" } }));
    expect(got.def.widgets.some((w: { type: string }) => w.type === "hotbar")).toBe(true);

    const bad = body(await client.callTool({ name: "write_screen", arguments: { screen: "shop2", def: { widgets: [{ type: "bar", x: 0, y: 0, w: 50, kind: "rage", value: 1, max: 1 }] } } }));
    expect(bad.saved).toBe(false);
    expect(bad.errors[0].path).toBe("screens.shop2.widgets[0].kind");

    const good = body(await client.callTool({ name: "write_screen", arguments: { screen: "dialog", def: { style: "night", widgets: [{ type: "panel", x: 100, y: 60, w: 280, h: 120, title: "จดหมาย" }, { type: "icon", x: 120, y: 90, icon: "letter", scale: 2 }, { type: "label", x: 160, y: 104, w: 200, text: "ถึงหลานรัก ยายคิดถึงนะ", size: 9 }, { type: "button", x: 190, y: 150, w: 100, text: "ปิด", state: "focus" }] } } }));
    expect(good.saved).toBe(true);
    expect(good.warnings).toEqual([]);

    const r = await client.callTool({ name: "render_screen", arguments: { screen: "dialog", scale: 1 } });
    const content = r.content as Array<{ type: string; mimeType?: string; text?: string }>;
    expect(content.some((c) => c.type === "image" && c.mimeType === "image/png")).toBe(true);
    const meta = JSON.parse(content[0]!.text!);
    expect([meta.width, meta.height]).toEqual([480, 270]);
    await access(meta.file);

    const icons = await client.callTool({ name: "list_icons", arguments: {} });
    expect((icons.content as Array<{ type: string }>).some((c) => c.type === "image")).toBe(true);

    const exported = body(await client.callTool({ name: "export_ui", arguments: { preset: "godot" } }));
    for (const d of exported.dirs) await access(d);
    const escape = await client.callTool({ name: "export_ui", arguments: { preset: "json", out: "../../outside" } });
    expect((escape as { isError?: boolean }).isError).toBe(true);
  }, 60_000);
});

describe("HTTP API", () => {
  it("serves docs, PNG renders and workspace images; blocks traversal and cross-origin writes", async () => {
    const app = createApp({ workspaceRoot: root, webRoot: "/nonexistent" });
    const h = { host: "127.0.0.1:8838" };
    expect((await app.request("/api/health", { headers: h })).status).toBe(200);
    const d = (await (await app.request("/api/docs/village", { headers: h })).json()) as { errors: unknown[]; summary: { screens: unknown[] } };
    expect(d.errors).toEqual([]);
    expect(d.summary.screens.length).toBeGreaterThanOrEqual(6);
    const png = await app.request("/api/render", { method: "POST", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify({ id: "village", screen: "pause", scale: 1 }) });
    expect(png.headers.get("content-type")).toBe("image/png");
    const bg = await app.request("/api/files/backgrounds/thai_village_street.png", { headers: h });
    expect(bg.status).toBe(200);
    expect((await app.request("/api/files/..%2F..%2Fetc%2Fpasswd.png", { headers: h })).status).toBeGreaterThanOrEqual(400);
    expect((await app.request("/api/files/easyui.config.json", { headers: h })).status).toBe(400);
    expect((await app.request("/api/fonts/Kanit-Regular.ttf", { headers: h })).status).toBe(200);
    expect((await app.request("/api/fonts/..%2Fsecret", { headers: h })).status).toBe(404);
    const cross = await app.request("/api/docs/village", { method: "POST", headers: { ...h, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" });
    expect(cross.status).toBe(403);
    const rebinding = await app.request("/api/docs", { headers: { host: "evil.example:8838" } });
    expect(rebinding.status).toBe(403);
  });
});
