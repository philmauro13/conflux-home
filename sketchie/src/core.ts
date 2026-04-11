export type ToolType = 'select' | 'rectangle' | 'ellipse' | 'line' | 'freehand' | 'text' | 'pan';

export interface Point {
  x: number;
  y: number;
}

export interface BaseElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stroke: string;
  fill: string;
  strokeWidth: number;
  opacity: number;
  locked: boolean;
  label: string;
  zIndex: number;
}

export interface RectElement extends BaseElement {
  type: 'rectangle';
  rx: number;
}

export interface EllipseElement extends BaseElement {
  type: 'ellipse';
}

export interface LineElement extends BaseElement {
  type: 'line';
  x2: number;
  y2: number;
}

export interface FreehandElement extends BaseElement {
  type: 'freehand';
  points: Point[];
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontSize: number;
}

export type WhiteboardElement =
  | RectElement
  | EllipseElement
  | LineElement
  | FreehandElement
  | TextElement;

export interface ViewState {
  zoom: number;
  panX: number;
  panY: number;
}

export interface WhiteboardState {
  elements: WhiteboardElement[];
  selectedIds: string[];
  activeTool: ToolType;
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  view: ViewState;
  nextZIndex: number;
}

export const COLORS = [
  '#ef4444', '#f97316', '#fbbf24', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
  '#ffffff', '#94a3b8', '#475569', '#1e293b',
];

export const DEFAULT_STATE: WhiteboardState = {
  elements: [],
  selectedIds: [],
  activeTool: 'rectangle',
  strokeColor: '#6366f1',
  fillColor: 'transparent',
  strokeWidth: 2,
  view: { zoom: 1, panX: 0, panY: 0 },
  nextZIndex: 1,
};

export function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function clampZoom(zoom: number): number {
  return Math.max(0.1, Math.min(5, zoom));
}

export function screenToCanvas(
  sx: number,
  sy: number,
  view: ViewState,
  containerRect: DOMRect
): Point {
  return {
    x: (sx - containerRect.left - view.panX) / view.zoom,
    y: (sy - containerRect.top - view.panY) / view.zoom,
  };
}

export function getElementBounds(el: WhiteboardElement) {
  if (el.type === 'line') {
    const x = Math.min(el.x, el.x2);
    const y = Math.min(el.y, el.y2);
    return {
      x,
      y,
      width: Math.abs(el.x2 - el.x),
      height: Math.abs(el.y2 - el.y),
    };
  }
  if (el.type === 'freehand' && el.points.length > 0) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of el.points) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }
  return { x: el.x, y: el.y, width: el.width, height: el.height };
}

export function hitTest(
  px: number,
  py: number,
  el: WhiteboardElement
): boolean {
  const b = getElementBounds(el);
  const pad = 4;
  return (
    px >= b.x - pad &&
    px <= b.x + b.width + pad &&
    py >= b.y - pad &&
    py <= b.y + b.height + pad
  );
}

export function formatElementLabel(el: WhiteboardElement): string {
  const icons: Record<string, string> = {
    rectangle: '▢',
    ellipse: '◯',
    line: '╱',
    freehand: '✎',
    text: 'T',
  };
  if (el.label) return el.label;
  return `${icons[el.type] || '?'} ${el.type.charAt(0).toUpperCase() + el.type.slice(1)}`;
}
