# Easy UI MCP server

```bash
npm run mcp            # stdio
npm run mcp:http       # Streamable HTTP → http://127.0.0.1:8839/mcp
EASYUI_WORKSPACE=/path/to/workspace npx tsx src/mcp/server.ts
```

Cursor / Claude config:

```json
{ "mcpServers": { "easyui": { "command": "npx", "args": ["tsx", "/path/to/easyui/src/mcp/server.ts", "--workspace", "/path/to/workspace"] } } }
```

| Tool | What it does |
| --- | --- |
| `workspace_info` | docs, the default doc's screens, backgrounds, styles, widget types, icon names and a screen-format cheat sheet — call first |
| `list_screens` | screens of a doc (style, widget count, widget types) + validation warnings |
| `get_screen` | full JSON of one screen plus the doc style and viewport |
| `write_screen` | add/replace a screen (creates the doc if needed); refuses to save with errors (JSON path + message), returns layout warnings; `dryRun` validates only |
| `render_screen` | PNG to `exports/renders/<doc>-<screen>.png`, returned as an image with every widget's box |
| `list_icons` | the 30 icons (th/en) and workspace backgrounds, with the icon sheet as an image |
| `export_ui` | `godot`, `pixi`, `png`, `json` or `all` |

A typical loop: `workspace_info` → `write_screen` (dryRun) → fix warnings → `write_screen` → `render_screen`
to look at it → `export_ui`.

All paths stay inside the workspace (plus `EASYUI_ALLOWED_DIRS`). Off-loopback HTTP needs the bearer token
printed at startup (or `EASYUI_TOKEN`). Nothing calls a network or paid API.
