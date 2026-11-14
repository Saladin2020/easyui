import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { docSummary, validateDoc } from "../../src/shared/doc";
import { drawScreen, widgetBox, type Ctx, type HitRect } from "../../src/shared/draw";
import { STYLE_LABELS } from "../../src/shared/frames";
import { ICONS, ICON_NAMES } from "../../src/shared/icons";
import { BAR_KINDS, BUTTON_STATES, STYLES, WIDGET_TYPES, type Screen, type UiDoc, type UiStyle, type Widget, type WidgetType } from "../../src/shared/types";
import { exportDoc, fetchDoc, fetchWorkspace, saveDoc, type WorkspaceSummary } from "./api";
import { browserProvider, iconCanvas, loadFonts } from "./provider";

const S = 3;

const EXPORTS = [
  { id: "godot", label: "Godot 4.3+", hint: "Theme .tres · nine-slice · .tscn" },
  { id: "pixi", label: "PixiJS v8", hint: "atlas + components + demo" },
  { id: "png", label: "PNG", hint: "screens · icons · parts" },
  { id: "all", label: "All", hint: "json · png · pixi · godot" },
] as const;

/** New widget with sensible defaults, centred-ish in the viewport. */
function newWidget(type: WidgetType, vw: number, vh: number, n: number): Widget {
  const x = Math.round(vw / 2 - 50);
  const y = Math.round(vh / 2 - 20);
  const id = `${type}_${n}`;
  switch (type) {
    case "panel": return { id, type, x: x - 40, y: y - 40, w: 180, h: 110, title: "หน้าต่าง" };
    case "label": return { id, type, x, y, text: "ข้อความ", size: 10 };
    case "button": return { id, type, x, y, w: 100, text: "ปุ่ม" };
    case "menu": return { id, type, x, y: y - 30, w: 100, items: ["เริ่ม", "ตั้งค่า", "ออก"], selected: 0 };
    case "bar": return { id, type, x, y, w: 80, kind: "hp", value: 70, max: 100, label: "HP", showText: true };
    case "inventory": return { id, type, x: x - 20, y: y - 30, cols: 5, rows: 3, items: [{ icon: "mango", count: 3 }, { icon: "rice_bowl" }, null, { icon: "key" }] };
    case "hotbar": return { id, type, x: Math.round(vw / 2 - 95), y: vh - 30, slots: 8, items: [{ icon: "rice_bowl", count: 2 }, { icon: "lantern" }], selected: 0 };
    case "icon": return { id, type, x, y, icon: "lantern", scale: 2 };
    case "toggle": return { id, type, x, y, text: "เปิดเสียง", on: true };
    case "slider": return { id, type, x, y, w: 160, text: "เสียง", value: 0.6 };
    case "tabs": return { id, type, x, y, w: 160, tabs: ["หนึ่ง", "สอง", "สาม"], selected: 0 };
    case "tooltip": return { id, type, x, y, w: 150, title: "มะม่วง", text: "หวานหอม ฟื้นพลัง 20 HP", icon: "mango" };
    case "cursor": return { id, type, x, y, kind: "hand" };
    case "image": return { id, type, x, y, src: "backgrounds/thai_village_street.png", w: 96, h: 54 };
  }
}

function IconChip({ name }: { name: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const src = iconCanvas(name);
    if (!c || !src) return;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 32, 32);
    g.drawImage(src, 0, 0, 32, 32);
  }, [name]);
  return <canvas ref={ref} width={32} height={32} />;
}

function Num({ label, value, onChange, step = 1 }: { label: string; value: number | undefined; onChange: (v: number) => void; step?: number }) {
  return (
    <label>
      {label}
      <input type="number" step={step} value={value ?? ""} onChange={(e) => e.target.value !== "" && onChange(Number(e.target.value))} />
    </label>
  );
}

export function App() {
  const [ws, setWs] = useState<WorkspaceSummary | null>(null);
  const [docId, setDocId] = useState("");
  const [doc, setDoc] = useState<UiDoc | null>(null);
  const [saved, setSaved] = useState("");
  const [loadErr, setLoadErr] = useState("");
  const [screenId, setScreenId] = useState("");
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState<{ kind: "ok" | "err" | ""; text: string }>({ kind: "", text: "" });
  const [exportRes, setExportRes] = useState<{ dirs: string[]; files: number; warnings: string[] } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [tick, setTick] = useState(0);
  const [jsonText, setJsonText] = useState("");
  const [jsonBad, setJsonBad] = useState(false);
  const [newScreen, setNewScreen] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitRect[]>([]);
  const drag = useRef<{ index: number; dx: number; dy: number; moved: boolean } | null>(null);
  const provider = useMemo(() => browserProvider(() => setTick((t) => t + 1)), []);

  useEffect(() => {
    loadFonts()
      .then(() => setFontsReady(true))
      .catch(() => setFontsReady(true));
    fetchWorkspace()
      .then(async (w) => {
        setWs(w);
        const id = w.config.doc;
        const d = await fetchDoc(id);
        setDocId(id);
        setDoc(d.doc);
        setSaved(JSON.stringify(d.doc));
        setScreenId(Object.keys(d.doc.screens)[0] ?? "");
      })
      .catch((e: Error) => setLoadErr(e.message));
  }, []);

  const screen: Screen | undefined = doc?.screens[screenId];
  const widget = sel !== null ? screen?.widgets[sel] : undefined;
  const dirty = !!doc && JSON.stringify(doc) !== saved;
  const validation = useMemo(() => (doc ? validateDoc(doc) : null), [doc]);
  const flash = (kind: "ok" | "err", text: string) => setStatus({ kind, text });

  useEffect(() => {
    setJsonText(widget ? JSON.stringify(widget, null, 2) : "");
    setJsonBad(false);
  }, [widget]);

  // draw the stage
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !doc || !screen || !fontsReady) return;
    c.width = doc.viewport.width * S;
    c.height = doc.viewport.height * S;
    hitsRef.current = drawScreen(c.getContext("2d") as unknown as Ctx, doc, screen, provider, { scale: S, selected: sel ?? undefined });
  }, [doc, screen, sel, provider, tick, fontsReady]);

  const updateScreen = useCallback(
    (patch: Partial<Screen>) => {
      if (!doc || !screen) return;
      setDoc({ ...doc, screens: { ...doc.screens, [screenId]: { ...screen, ...patch } } });
    },
    [doc, screen, screenId],
  );
  const setWidgets = (widgets: Widget[]) => updateScreen({ widgets });
  const updateWidget = (patch: Record<string, unknown>) => {
    if (!screen || sel === null) return;
    const next = screen.widgets.slice();
    next[sel] = { ...next[sel]!, ...patch } as Widget;
    setWidgets(next);
  };

  const toViewport = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * (doc?.viewport.width ?? 480), y: ((e.clientY - r.top) / r.height) * (doc?.viewport.height ?? 270) };
  };
  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!screen) return;
    const p = toViewport(e);
    const hits = hitsRef.current;
    let pick: HitRect | undefined;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i]!;
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) {
        pick = h;
        break;
      }
    }
    setSel(pick ? pick.index : null);
    if (pick) {
      const w = screen.widgets[pick.index]!;
      drag.current = { index: pick.index, dx: p.x - w.x, dy: p.y - w.y, moved: false };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || !screen) return;
    const p = toViewport(e);
    const x = Math.round(p.x - d.dx);
    const y = Math.round(p.y - d.dy);
    const w = screen.widgets[d.index]!;
    if (x === w.x && y === w.y) return;
    d.moved = true;
    const next = screen.widgets.slice();
    next[d.index] = { ...w, x, y } as Widget;
    setWidgets(next);
  };
  const onUp = () => {
    drag.current = null;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        void onSave();
        return;
      }
      if (typing || sel === null || !screen) return;
      const step = e.shiftKey ? 8 : 1;
      const mv: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (mv[e.key]) {
        e.preventDefault();
        const w = screen.widgets[sel]!;
        updateWidget({ x: w.x + mv[e.key]![0], y: w.y + mv[e.key]![1] });
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setWidgets(screen.widgets.filter((_, i) => i !== sel));
        setSel(null);
      } else if (e.key === "Escape") setSel(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function onSave() {
    if (!doc) return;
    setBusy("save");
    try {
      const r = await saveDoc(docId, doc);
      if (r.ok) {
        setSaved(JSON.stringify(doc));
        flash("ok", `Saved screens/${docId}.easyui.json${r.warnings.length ? ` · ${r.warnings.length} warnings` : ""}`);
      } else flash("err", `Not saved: ${r.errors[0]?.path}: ${r.errors[0]?.message}`);
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function onExport(preset: string) {
    if (dirty) await onSave();
    setBusy(`export-${preset}`);
    try {
      const r = await exportDoc(docId, preset);
      setExportRes(r);
      flash("ok", `Exported ${r.files} files`);
    } catch (e) {
      flash("err", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  function addWidget(type: WidgetType) {
    if (!doc || !screen) return;
    const w = newWidget(type, doc.viewport.width, doc.viewport.height, screen.widgets.length + 1);
    setWidgets([...screen.widgets, w]);
    setSel(screen.widgets.length);
  }
  function moveWidget(d: -1 | 1) {
    if (!screen || sel === null) return;
    const j = sel + d;
    if (j < 0 || j >= screen.widgets.length) return;
    const next = screen.widgets.slice();
    [next[sel], next[j]] = [next[j]!, next[sel]!];
    setWidgets(next);
    setSel(j);
  }
  function addScreen() {
    if (!doc) return;
    const id = (newScreen.trim() || "screen").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    let sid = id;
    for (let n = 2; doc.screens[sid]; n++) sid = `${id}_${n}`;
    setDoc({ ...doc, screens: { ...doc.screens, [sid]: { title: sid, widgets: [{ id: "frame", type: "panel", x: 140, y: 60, w: 200, h: 150, title: sid }] } } });
    setScreenId(sid);
    setSel(null);
    setNewScreen("");
  }

  if (loadErr) {
    return (
      <div className="splash">
        <div className="splash-card">
          <h1 className="brand">
            Easy <span>UI</span>
          </h1>
          <p className="hint err">{loadErr}</p>
          <p className="hint">Start the API with <code>npx easyui serve</code> (or <code>npm run dev</code>).</p>
        </div>
      </div>
    );
  }
  if (!doc || !screen) return <div className="splash"><div className="splash-card"><p className="splash-msg">Loading UI…</p></div></div>;

  const summary = docSummary(doc);
  const style: UiStyle = screen.style ?? doc.style;
  const iconField = widget && (widget.type === "icon" || widget.type === "button" || widget.type === "tooltip") ? "icon" : null;
  const hasW = widget && "w" in widget;
  const hasH = widget && (widget.type === "panel" || widget.type === "button" || widget.type === "bar" || widget.type === "image");
  const box = widget ? widgetBox(widget) : null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark brand-mark-ui" aria-hidden />
          <div>
            <h1 className="brand">
              Easy <span>UI</span>
            </h1>
            <p className="brand-th">ชุด UI พิกเซล · ไม้สัก โคมแดง กระดาษสา ตลาดกลางคืน</p>
            <div className="sub">
              <span className="tag tag-sky">easyui/1</span>
              <span className="tag">{summary.screens.length} screens</span>
              <span className="tag">{ICON_NAMES.length} icons</span>
              <span className="tag tag-leaf">Godot · PixiJS</span>
            </div>
          </div>
        </div>
        <div className="toolbar">
          <div className="tool-group">
            <label className="field-label" htmlFor="doc-pick">UI doc</label>
            <div className="row nowrap">
              <select
                id="doc-pick"
                value={docId}
                onChange={async (e) => {
                  const d = await fetchDoc(e.target.value);
                  setDocId(e.target.value);
                  setDoc(d.doc);
                  setSaved(JSON.stringify(d.doc));
                  setScreenId(Object.keys(d.doc.screens)[0] ?? "");
                  setSel(null);
                }}
              >
                {ws?.docs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.id})
                  </option>
                ))}
              </select>
              <button type="button" className={`save-btn${dirty ? " is-dirty" : ""}`} disabled={busy === "save"} title="Save (Ctrl/⌘+S)" onClick={() => void onSave()}>
                <span className="dot" aria-hidden />
                {busy === "save" ? "Saving…" : dirty ? "Save" : "Saved"}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="layout-ui">
        <section className="panel panel-list">
          <h2>
            <span className="step">1</span> Screens <small>{summary.screens.length}</small>
          </h2>
          <ul className="item-list">
            {summary.screens.map((x) => (
              <li key={x.id}>
                <button type="button" className={`item-btn${x.id === screenId ? " is-active" : ""}`} onClick={() => { setScreenId(x.id); setSel(null); }}>
                  <b>{x.title}</b>
                  <small>
                    {x.id} · {x.style} · {x.widgets} widgets
                  </small>
                </button>
              </li>
            ))}
          </ul>
          <div className="row nowrap section">
            <input value={newScreen} placeholder="new screen id" onChange={(e) => setNewScreen(e.target.value)} />
            <button type="button" onClick={addScreen}>+ Screen</button>
          </div>
          <h2 className="sub-h2">
            <span className="step step-leaf">▦</span> Widgets <small>{screen.widgets.length}</small>
          </h2>
          <ul className="item-list">
            {screen.widgets.map((w, i) => (
              <li key={i}>
                <button type="button" className={`item-btn is-widget${i === sel ? " is-active" : ""}`} onClick={() => setSel(i)}>
                  <b>{w.type}</b>
                  <small>{w.id ?? ("text" in w ? w.text : "title" in w && w.title ? w.title : `#${i}`)}</small>
                </button>
              </li>
            ))}
          </ul>
          <div className="field section">
            <span className="field-label">Add widget</span>
            <div className="add-grid">
              {WIDGET_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => addWidget(t)}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </section>

        <div className="col-main">
          <section className="panel panel-stage">
            <h2>
              <span className="step">2</span> {screen.title ?? screenId} <small>{doc.viewport.width}×{doc.viewport.height} · {STYLE_LABELS[style]}</small>
              {dirty && <span className="badge-dirty">unsaved</span>}
            </h2>
            <div className="stage-wrap">
              <canvas ref={canvasRef} className={`stage-canvas${drag.current?.moved ? " is-dragging" : ""}`} width={doc.viewport.width * S} height={doc.viewport.height * S} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
            </div>
            <div className="stage-bar">
              <div className="segmented" role="radiogroup" aria-label="Style">
                {STYLES.map((s) => (
                  <button key={s} type="button" className={style === s ? "active" : ""} title={STYLE_LABELS[s]} onClick={() => updateScreen({ style: s === doc.style ? undefined : s })}>
                    {s}
                  </button>
                ))}
              </div>
              <label className="tool-group inline">
                <span className="field-label">Background</span>
                <select value={screen.background ?? ""} onChange={(e) => updateScreen({ background: e.target.value || undefined })}>
                  <option value="">doc default</option>
                  <option value="none">none</option>
                  {ws?.backgrounds.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                  <option value="#2a1d13">#2a1d13 (teak)</option>
                  <option value="#0e1426">#0e1426 (night)</option>
                </select>
              </label>
              <label className="tool-group inline">
                <span className="field-label">Dim {Math.round((screen.dim ?? 0) * 100)}%</span>
                <input type="range" min={0} max={0.9} step={0.05} value={screen.dim ?? 0} onChange={(e) => updateScreen({ dim: Number(e.target.value) || undefined })} />
              </label>
              <label className="tool-group inline">
                <span className="field-label">Title</span>
                <input value={screen.title ?? ""} onChange={(e) => updateScreen({ title: e.target.value || undefined })} />
              </label>
            </div>
            <p className="hint">Click a widget to select · drag to move · arrows nudge (Shift = 8px) · Delete removes · Ctrl/⌘+S saves. The preview uses the same renderer as the CLI PNGs and matches the Godot / Pixi exports.</p>
          </section>
        </div>

        <section className="panel panel-inspect">
          <h2>
            <span className="step">3</span> {widget ? widget.type : "Inspector"} <small>{widget?.id ?? (sel !== null ? `#${sel}` : "select a widget")}</small>
          </h2>
          {widget && (
            <>
              <div className="prop-xy">
                <Num label="x" value={widget.x} onChange={(v) => updateWidget({ x: v })} />
                <Num label="y" value={widget.y} onChange={(v) => updateWidget({ y: v })} />
                {hasW && <Num label="w" value={(widget as { w?: number }).w} onChange={(v) => updateWidget({ w: v })} />}
                {hasH && <Num label="h" value={(widget as { h?: number }).h} onChange={(v) => updateWidget({ h: v })} />}
              </div>
              <div className="prop-grid">
                <span>id</span>
                <input value={widget.id ?? ""} onChange={(e) => updateWidget({ id: e.target.value || undefined })} />
                {"text" in widget && (
                  <>
                    <span>text</span>
                    <input value={widget.text} onChange={(e) => updateWidget({ text: e.target.value })} />
                  </>
                )}
                {"title" in widget && widget.type !== "tooltip" && (
                  <>
                    <span>title</span>
                    <input value={widget.title ?? ""} onChange={(e) => updateWidget({ title: e.target.value || undefined })} />
                  </>
                )}
                {widget.type === "tooltip" && (
                  <>
                    <span>title</span>
                    <input value={widget.title} onChange={(e) => updateWidget({ title: e.target.value })} />
                  </>
                )}
                {widget.type === "label" && (
                  <>
                    <span>size</span>
                    <input type="number" value={widget.size ?? 10} onChange={(e) => updateWidget({ size: Number(e.target.value) })} />
                    <span>align</span>
                    <select value={widget.align ?? "left"} onChange={(e) => updateWidget({ align: e.target.value })}>
                      <option>left</option>
                      <option>center</option>
                      <option>right</option>
                    </select>
                    <span>font</span>
                    <select value={widget.font ?? "body"} onChange={(e) => updateWidget({ font: e.target.value })}>
                      <option>body</option>
                      <option>title</option>
                    </select>
                  </>
                )}
                {widget.type === "button" && (
                  <>
                    <span>state</span>
                    <select value={widget.state ?? "normal"} onChange={(e) => updateWidget({ state: e.target.value })}>
                      {BUTTON_STATES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </>
                )}
                {widget.type === "bar" && (
                  <>
                    <span>kind</span>
                    <select value={widget.kind} onChange={(e) => updateWidget({ kind: e.target.value })}>
                      {BAR_KINDS.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <span>value</span>
                    <input type="range" min={0} max={widget.max} value={widget.value} onChange={(e) => updateWidget({ value: Number(e.target.value) })} />
                    <span>max</span>
                    <input type="number" value={widget.max} onChange={(e) => updateWidget({ max: Number(e.target.value) })} />
                  </>
                )}
                {widget.type === "slider" && (
                  <>
                    <span>value</span>
                    <input type="range" min={0} max={1} step={0.01} value={widget.value} onChange={(e) => updateWidget({ value: Number(e.target.value) })} />
                  </>
                )}
                {widget.type === "toggle" && (
                  <>
                    <span>on</span>
                    <input type="checkbox" checked={widget.on} onChange={(e) => updateWidget({ on: e.target.checked })} />
                  </>
                )}
                {widget.type === "menu" && (
                  <>
                    <span>items</span>
                    <input value={widget.items.join(" | ")} onChange={(e) => updateWidget({ items: e.target.value.split("|").map((s) => s.trim()).filter(Boolean) })} />
                    <span>selected</span>
                    <input type="number" min={0} max={widget.items.length - 1} value={widget.selected ?? 0} onChange={(e) => updateWidget({ selected: Number(e.target.value) })} />
                  </>
                )}
                {(widget.type === "inventory" || widget.type === "hotbar") && (
                  <>
                    <span>selected</span>
                    <input type="number" min={-1} value={widget.selected ?? -1} onChange={(e) => updateWidget({ selected: Number(e.target.value) < 0 ? undefined : Number(e.target.value) })} />
                  </>
                )}
              </div>
              {iconField && (
                <div className="icon-picker" role="listbox" aria-label="Icon">
                  {widget.type !== "icon" && (
                    <button type="button" title="none" className={!(widget as { icon?: string }).icon ? "is-active" : ""} onClick={() => updateWidget({ icon: undefined })}>
                      ∅
                    </button>
                  )}
                  {ICON_NAMES.map((n) => (
                    <button key={n} type="button" title={`${ICONS[n]!.th} · ${n}`} className={(widget as { icon?: string }).icon === n ? "is-active" : ""} onClick={() => updateWidget({ icon: n })}>
                      <IconChip name={n} />
                    </button>
                  ))}
                </div>
              )}
              <h3 className="sub-head">JSON</h3>
              <textarea
                className={`json-edit${jsonBad ? " is-bad" : ""}`}
                value={jsonText}
                spellCheck={false}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  try {
                    const v = JSON.parse(e.target.value) as Widget;
                    if (!v || typeof v !== "object" || !WIDGET_TYPES.includes(v.type)) throw new Error("bad");
                    setJsonBad(false);
                    if (screen && sel !== null) {
                      const next = screen.widgets.slice();
                      next[sel] = v;
                      setWidgets(next);
                    }
                  } catch {
                    setJsonBad(true);
                  }
                }}
              />
              <div className="row section">
                <button type="button" onClick={() => moveWidget(-1)} title="Draw earlier (behind)">↑ back</button>
                <button type="button" onClick={() => moveWidget(1)} title="Draw later (in front)">↓ front</button>
                <button type="button" onClick={() => { setWidgets([...screen.widgets, { ...widget, id: widget.id ? `${widget.id}_copy` : undefined, x: widget.x + 8, y: widget.y + 8 } as Widget]); setSel(screen.widgets.length); }}>⧉ Duplicate</button>
                <button type="button" onClick={() => { setWidgets(screen.widgets.filter((_, i) => i !== sel)); setSel(null); }}>✕ Delete</button>
              </div>
              {box && <p className="hint mono">box {Math.round(box.x)},{Math.round(box.y)} · {Math.round(box.w)}×{Math.round(box.h)}</p>}
            </>
          )}
          <h3 className="sub-head">Export</h3>
          <div className="export-grid">
            {EXPORTS.map((p) => (
              <button key={p.id} type="button" className={p.id === "all" ? "primary" : ""} disabled={!!busy} onClick={() => void onExport(p.id)}>
                <span>{busy === `export-${p.id}` ? "Exporting…" : p.label}</span>
                <small>{p.hint}</small>
              </button>
            ))}
          </div>
          {exportRes && (
            <ul className="export-list">
              {exportRes.dirs.map((d) => (
                <li key={d} className="mono">
                  {d}
                </li>
              ))}
              {exportRes.warnings.map((w) => (
                <li key={w} className="hint err">
                  {w}
                </li>
              ))}
            </ul>
          )}
          <h3 className="sub-head">Validation</h3>
          {validation && validation.errors.length + validation.warnings.length === 0 ? (
            <p className="hint ok">✓ doc is clean</p>
          ) : (
            <ul className="diag-list">
              {[...(validation?.errors ?? []), ...(validation?.warnings ?? [])].map((d, i) => (
                <li key={i} className={`diag-${d.severity}`}>
                  <span className="mono">{d.path}</span> <span>{d.message}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <footer className={`statusbar ${status.kind}`}>{status.text || `Workspace ${ws?.root ?? ""}`}</footer>
    </div>
  );
}
