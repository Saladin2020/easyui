/** Easy UI shared types — the `easyui/1` screen format. Pure data, usable in Node and the browser. */

export const FORMAT = "easyui/1";
export const STYLES = ["teak", "lantern", "paper", "night", "raya"] as const;
export type UiStyle = (typeof STYLES)[number];

export const BUTTON_STATES = ["normal", "hover", "pressed", "disabled", "focus"] as const;
export type ButtonState = (typeof BUTTON_STATES)[number];

export const BAR_KINDS = ["hp", "mp", "xp", "stamina"] as const;
export type BarKind = (typeof BAR_KINDS)[number];

export interface ItemRef {
  icon: string;
  count?: number;
  name?: string;
}

interface Base {
  id?: string;
  x: number;
  y: number;
}

export interface PanelW extends Base { type: "panel"; w: number; h: number; title?: string; small?: boolean }
export interface LabelW extends Base { type: "label"; text: string; size?: number; color?: string; align?: "left" | "center" | "right"; w?: number; shadow?: boolean; font?: "body" | "title" }
export interface ButtonW extends Base { type: "button"; w: number; h?: number; text: string; state?: ButtonState; icon?: string }
export interface MenuW extends Base { type: "menu"; w: number; items: string[]; selected?: number; disabled?: number[]; itemH?: number; gap?: number; panel?: boolean; title?: string }
export interface BarW extends Base { type: "bar"; w: number; h?: number; kind: BarKind; value: number; max: number; label?: string; showText?: boolean }
export interface InventoryW extends Base { type: "inventory"; cols: number; rows: number; slot?: number; gap?: number; items: (ItemRef | null)[]; selected?: number; title?: string }
export interface HotbarW extends Base { type: "hotbar"; slots: number; slot?: number; items: (ItemRef | null)[]; selected?: number; keys?: boolean }
export interface IconW extends Base { type: "icon"; icon: string; scale?: number }
export interface ToggleW extends Base { type: "toggle"; text: string; on: boolean; w?: number; focus?: boolean }
export interface SliderW extends Base { type: "slider"; w: number; text: string; value: number; focus?: boolean }
export interface TabsW extends Base { type: "tabs"; w: number; tabs: string[]; selected?: number }
export interface TooltipW extends Base { type: "tooltip"; w: number; title: string; text: string; icon?: string }
export interface CursorW extends Base { type: "cursor"; kind?: "hand" | "arrow" }
export interface ImageW extends Base { type: "image"; src: string; w?: number; h?: number }

export type Widget = PanelW | LabelW | ButtonW | MenuW | BarW | InventoryW | HotbarW | IconW | ToggleW | SliderW | TabsW | TooltipW | CursorW | ImageW;
export type WidgetType = Widget["type"];
export const WIDGET_TYPES: WidgetType[] = ["panel", "label", "button", "menu", "bar", "inventory", "hotbar", "icon", "toggle", "slider", "tabs", "tooltip", "cursor", "image"];

export interface Screen {
  title?: string;
  /** Workspace-relative PNG, a colour (#hex) or "none". Defaults to the doc background. */
  background?: string;
  /** Darken the background 0..1. */
  dim?: number;
  style?: UiStyle;
  widgets: Widget[];
}

export interface UiDoc {
  format: typeof FORMAT;
  name: string;
  style: UiStyle;
  viewport: { width: number; height: number };
  background?: string;
  screens: Record<string, Screen>;
}

export interface Diagnostic {
  path: string;
  message: string;
  severity: "error" | "warning";
}
