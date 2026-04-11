import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  WhiteboardElement, ViewState, ToolType, Point,
  generateId, clampZoom, screenToCanvas, hitTest,
  getElementBounds, formatElementLabel, COLORS,
} from './core';

/* ════════════════════════════════════════
   SKETCHIE — Collaborative Whiteboard MVP
   ════════════════════════════════════════ */

interface DrawState {
  drawing: boolean;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  dragElementId?: string;
  dragOffsetX?: number;
  dragOffsetY?: number;
  freehandPoints?: Point[];
}

const DEFAULT_VIEW: ViewState = { zoom: 1, panX: 0, panY: 0 };

export default function App() {
  const [elements, setElements] = useState<WhiteboardElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<ToolType>('rectangle');
  const [strokeColor, setStrokeColor] = useState('#6366f1');
  const [fillColor, setFillColor] = useState('transparent');
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [nextZIndex, setNextZIndex] = useState(1);
  const [drawState, setDrawState] = useState<DrawState>({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  const [textInput, setTextInput] = useState<{ x: number; y: number; canvasX: number; canvasY: number } | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const nextZRef = useRef(1);

  /* ── Coordinate helpers ── */
  const toCanvas = useCallback((clientX: number, clientY: number): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return screenToCanvas(clientX, clientY, view, rect);
  }, [view]);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (textInput) return;
      const key = e.key.toLowerCase();
      if (key === 'v') setActiveTool('select');
      else if (key === 'r') setActiveTool('rectangle');
      else if (key === 'o') setActiveTool('ellipse');
      else if (key === 'l') setActiveTool('line');
      else if (key === 'p') setActiveTool('freehand');
      else if (key === 't') setActiveTool('text');
      else if (key === 'h' || key === ' ') { e.preventDefault(); setActiveTool('pan'); }
      else if ((key === 'delete' || key === 'backspace') && selectedIds.length > 0) {
        setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
        setSelectedIds([]);
      }
      else if (key === 'escape') {
        setSelectedIds([]);
        setTextInput(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, textInput]);

  /* ── Zoom with Ctrl+Scroll ── */
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setView(v => ({ ...v, zoom: clampZoom(v.zoom * delta) }));
    } else {
      setView(v => ({
        ...v,
        panX: v.panX - e.deltaX,
        panY: v.panY - e.deltaY,
      }));
    }
  }, []);

  /* ── Mouse Handlers ── */
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && activeTool === 'pan')) {
      setPanning(true);
      setDrawState({ drawing: false, startX: e.clientX, startY: e.clientY, currentX: e.clientX, currentY: e.clientY });
      return;
    }
    if (e.button !== 0) return;

    const pt = toCanvas(e.clientX, e.clientY);

    if (activeTool === 'select') {
      // Hit test in reverse order (top-most first)
      let hit: WhiteboardElement | null = null;
      for (let i = elements.length - 1; i >= 0; i--) {
        if (hitTest(pt.x, pt.y, elements[i])) {
          hit = elements[i];
          break;
        }
      }
      if (hit) {
        if (e.shiftKey) {
          setSelectedIds(prev => prev.includes(hit!.id) ? prev.filter(id => id !== hit!.id) : [...prev, hit!.id]);
        } else if (!selectedIds.includes(hit.id)) {
          setSelectedIds([hit.id]);
        }
        // Start drag
        const bounds = getElementBounds(hit);
        setDrawState({
          drawing: true,
          startX: pt.x,
          startY: pt.y,
          currentX: pt.x,
          currentY: pt.y,
          dragElementId: hit.id,
          dragOffsetX: pt.x - bounds.x,
          dragOffsetY: pt.y - bounds.y,
        });
      } else {
        // Start marquee
        setSelectedIds([]);
        setMarquee({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
        setDrawState({ drawing: true, startX: pt.x, startY: pt.y, currentX: pt.x, currentY: pt.y });
      }
      return;
    }

    if (activeTool === 'text') {
      setTextInput({
        x: e.clientX - (containerRef.current?.getBoundingClientRect().left || 0),
        y: e.clientY - (containerRef.current?.getBoundingClientRect().top || 0),
        canvasX: pt.x,
        canvasY: pt.y,
      });
      return;
    }

    if (activeTool === 'freehand') {
      setDrawState({
        drawing: true,
        startX: pt.x,
        startY: pt.y,
        currentX: pt.x,
        currentY: pt.y,
        freehandPoints: [{ x: pt.x, y: pt.y }],
      });
      return;
    }

    // Shape tools
    setDrawState({
      drawing: true,
      startX: pt.x,
      startY: pt.y,
      currentX: pt.x,
      currentY: pt.y,
    });
  }, [activeTool, elements, selectedIds, toCanvas]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (panning) {
      const dx = e.clientX - drawState.startX;
      const dy = e.clientY - drawState.startY;
      setView(v => ({ ...v, panX: v.panX + dx, panY: v.panY + dy }));
      setDrawState(ds => ({ ...ds, startX: e.clientX, startY: e.clientY }));
      return;
    }

    if (!drawState.drawing) return;
    const pt = toCanvas(e.clientX, e.clientY);

    if (activeTool === 'select' && drawState.dragElementId) {
      // Move element(s)
      const dx = pt.x - drawState.currentX;
      const dy = pt.y - drawState.currentY;
      setElements(prev => prev.map(el => {
        if (!selectedIds.includes(el.id) && el.id !== drawState.dragElementId) return el;
        if (el.type === 'line') return { ...el, x: el.x + dx, y: el.y + dy, x2: el.x2 + dx, y2: el.y2 + dy };
        if (el.type === 'freehand') return { ...el, x: el.x + dx, y: el.y + dy, points: el.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
        return { ...el, x: el.x + dx, y: el.y + dy };
      }));
      setDrawState(ds => ({ ...ds, currentX: pt.x, currentY: pt.y }));
      return;
    }

    if (activeTool === 'select' && marquee) {
      setMarquee(m => m ? { ...m, x2: pt.x, y2: pt.y } : null);
      return;
    }

    if (activeTool === 'freehand') {
      setDrawState(ds => ({
        ...ds,
        currentX: pt.x,
        currentY: pt.y,
        freehandPoints: [...(ds.freehandPoints || []), { x: pt.x, y: pt.y }],
      }));
      return;
    }

    setDrawState(ds => ({ ...ds, currentX: pt.x, currentY: pt.y }));
  }, [panning, drawState, activeTool, toCanvas, selectedIds, marquee]);

  const handleMouseUp = useCallback(() => {
    if (panning) {
      setPanning(false);
      setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      return;
    }

    if (!drawState.drawing) return;

    if (activeTool === 'select' && marquee) {
      // Select elements inside marquee
      const mx1 = Math.min(marquee.x1, marquee.x2);
      const my1 = Math.min(marquee.y1, marquee.y2);
      const mx2 = Math.max(marquee.x1, marquee.x2);
      const my2 = Math.max(marquee.y1, marquee.y2);
      const ids = elements.filter(el => {
        const b = getElementBounds(el);
        return b.x >= mx1 && b.y >= my1 && (b.x + b.width) <= mx2 && (b.y + b.height) <= my2;
      }).map(el => el.id);
      setSelectedIds(ids);
      setMarquee(null);
      setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      return;
    }

    if (activeTool === 'select') {
      setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
      return;
    }

    const { startX, startY, currentX, currentY, freehandPoints } = drawState;
    const z = nextZRef.current++;

    let newEl: WhiteboardElement | null = null;

    if (activeTool === 'freehand' && freehandPoints && freehandPoints.length > 2) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of freehandPoints) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      newEl = {
        id: generateId(), type: 'freehand',
        x: minX, y: minY, width: maxX - minX, height: maxY - minY,
        stroke: strokeColor, fill: 'transparent', strokeWidth,
        opacity: 1, locked: false, label: '', zIndex: z,
        points: freehandPoints,
      };
    } else if (activeTool === 'line') {
      newEl = {
        id: generateId(), type: 'line',
        x: startX, y: startY, width: Math.abs(currentX - startX), height: Math.abs(currentY - startY),
        x2: currentX, y2: currentY,
        stroke: strokeColor, fill: 'transparent', strokeWidth,
        opacity: 1, locked: false, label: '', zIndex: z,
      };
    } else if (activeTool === 'rectangle' || activeTool === 'ellipse') {
      const x = Math.min(startX, currentX);
      const y = Math.min(startY, currentY);
      const w = Math.abs(currentX - startX);
      const h = Math.abs(currentY - startY);
      if (w > 2 || h > 2) {
        if (activeTool === 'rectangle') {
          newEl = {
            id: generateId(), type: 'rectangle',
            x, y, width: w, height: h,
            stroke: strokeColor, fill: fillColor, strokeWidth,
            opacity: 1, locked: false, label: '', zIndex: z, rx: 4,
          };
        } else {
          newEl = {
            id: generateId(), type: 'ellipse',
            x, y, width: w, height: h,
            stroke: strokeColor, fill: fillColor, strokeWidth,
            opacity: 1, locked: false, label: '', zIndex: z,
          };
        }
      }
    }

    if (newEl) {
      setElements(prev => [...prev, newEl!]);
      setSelectedIds([newEl.id]);
      setNextZIndex(z + 1);
    }

    setDrawState({ drawing: false, startX: 0, startY: 0, currentX: 0, currentY: 0 });
  }, [panning, drawState, activeTool, strokeColor, fillColor, strokeWidth, marquee, elements]);

  /* ── Text Commit ── */
  const commitText = useCallback((text: string) => {
    if (!textInput || !text.trim()) {
      setTextInput(null);
      return;
    }
    const z = nextZRef.current++;
    const newEl: WhiteboardElement = {
      id: generateId(), type: 'text',
      x: textInput.canvasX, y: textInput.canvasY,
      width: text.length * 10, height: 24,
      stroke: strokeColor, fill: 'transparent', strokeWidth: 1,
      opacity: 1, locked: false, label: '', zIndex: z,
      text, fontSize: 16,
    };
    setElements(prev => [...prev, newEl]);
    setSelectedIds([newEl.id]);
    setNextZIndex(z + 1);
    setTextInput(null);
  }, [textInput, strokeColor]);

  useEffect(() => {
    if (textInput && textRef.current) textRef.current.focus();
  }, [textInput]);

  /* ── Zoom controls ── */
  const zoomIn = () => setView(v => ({ ...v, zoom: clampZoom(v.zoom * 1.2) }));
  const zoomOut = () => setView(v => ({ ...v, zoom: clampZoom(v.zoom / 1.2) }));
  const zoomReset = () => setView(DEFAULT_VIEW);

  /* ── Delete element ── */
  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    setSelectedIds(prev => prev.filter(sid => sid !== id));
  };

  /* ── Cursor class ── */
  const cursorClass = activeTool === 'pan' || panning ? 'panning'
    : activeTool === 'select' ? 'tool-select'
    : activeTool === 'text' ? 'tool-text' : '';

  /* ── Render preview shape while drawing ── */
  const renderPreview = () => {
    if (!drawState.drawing || activeTool === 'select' || activeTool === 'freehand') return null;
    const { startX, startY, currentX, currentY } = drawState;
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);
    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    if (activeTool === 'rectangle') {
      return <rect x={x} y={y} width={w} height={h} rx={4}
        stroke={strokeColor} fill={fillColor === 'transparent' ? 'none' : fillColor}
        strokeWidth={strokeWidth} opacity={0.6} />;
    }
    if (activeTool === 'ellipse') {
      return <ellipse cx={x + w/2} cy={y + h/2} rx={w/2} ry={h/2}
        stroke={strokeColor} fill={fillColor === 'transparent' ? 'none' : fillColor}
        strokeWidth={strokeWidth} opacity={0.6} />;
    }
    if (activeTool === 'line') {
      return <line x1={startX} y1={startY} x2={currentX} y2={currentY}
        stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.6} />;
    }
    return null;
  };

  /* ── Render freehand preview ── */
  const renderFreehandPreview = () => {
    if (!drawState.drawing || activeTool !== 'freehand' || !drawState.freehandPoints) return null;
    const pts = drawState.freehandPoints;
    if (pts.length < 2) return null;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${pts[i].y}`;
    }
    return <path d={d} stroke={strokeColor} fill="none" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" opacity={0.6} />;
  };

  /* ── Render elements ── */
  const renderElement = (el: WhiteboardElement) => {
    const isSelected = selectedIds.includes(el.id);
    const bounds = getElementBounds(el);
    const selPad = 4;

    const commonProps = {
      className: 'element-group',
      onClick: (e: React.MouseEvent) => {
        if (activeTool !== 'select') return;
        e.stopPropagation();
        if (e.shiftKey) {
          setSelectedIds(prev => prev.includes(el.id) ? prev.filter(id => id !== el.id) : [...prev, el.id]);
        } else {
          setSelectedIds([el.id]);
        }
      },
    };

    let shape: React.ReactNode = null;
    if (el.type === 'rectangle') {
      shape = <rect x={el.x} y={el.y} width={el.width} height={el.height}
        rx={el.rx} stroke={el.stroke} fill={el.fill === 'transparent' ? 'none' : el.fill}
        strokeWidth={el.strokeWidth} opacity={el.opacity} />;
    } else if (el.type === 'ellipse') {
      shape = <ellipse cx={el.x + el.width/2} cy={el.y + el.height/2}
        rx={el.width/2} ry={el.height/2} stroke={el.stroke}
        fill={el.fill === 'transparent' ? 'none' : el.fill}
        strokeWidth={el.strokeWidth} opacity={el.opacity} />;
    } else if (el.type === 'line') {
      shape = <line x1={el.x} y1={el.y} x2={el.x2} y2={el.y2}
        stroke={el.stroke} strokeWidth={el.strokeWidth}
        strokeLinecap="round" opacity={el.opacity} />;
    } else if (el.type === 'freehand') {
      let d = '';
      if (el.points.length > 0) {
        d = `M ${el.points[0].x} ${el.points[0].y}`;
        for (let i = 1; i < el.points.length; i++) {
          d += ` L ${el.points[i].x} ${el.points[i].y}`;
        }
      }
      shape = <path d={d} stroke={el.stroke} fill="none"
        strokeWidth={el.strokeWidth} strokeLinecap="round" strokeLinejoin="round"
        opacity={el.opacity} />;
    } else if (el.type === 'text') {
      shape = <text x={el.x} y={el.y + (el as any).fontSize} fill={el.stroke}
        fontSize={(el as any).fontSize} fontFamily="'Inter', sans-serif" opacity={el.opacity}>
        {(el as any).text}
      </text>;
    }

    return (
      <g key={el.id} {...commonProps} data-element-id={el.id}>
        {shape}
        {isSelected && (
          <>
            <rect className="selection-outline"
              x={bounds.x - selPad} y={bounds.y - selPad}
              width={bounds.width + selPad * 2} height={bounds.height + selPad * 2}
              rx={2} />
            {/* Resize handles */}
            <rect className="resize-handle" x={bounds.x + bounds.width + selPad - 4} y={bounds.y + bounds.height + selPad - 4} width={8} height={8} rx={2} />
          </>
        )}
      </g>
    );
  };

  /* ── Grid ── */
  const gridSpacing = 24;
  const gridDots: React.ReactNode[] = [];
  const gridSize = 3000;
  for (let gx = -gridSize; gx <= gridSize; gx += gridSpacing) {
    for (let gy = -gridSize; gy <= gridSize; gy += gridSpacing) {
      gridDots.push(<circle key={`${gx},${gy}`} cx={gx} cy={gy} r={0.8} className="grid-dot" />);
    }
  }

  /* ── Marquee ── */
  const renderMarquee = () => {
    if (!marquee) return null;
    const x = Math.min(marquee.x1, marquee.x2);
    const y = Math.min(marquee.y1, marquee.y2);
    const w = Math.abs(marquee.x2 - marquee.x1);
    const h = Math.abs(marquee.y2 - marquee.y1);
    return <rect className="selection-marquee" x={x} y={y} width={w} height={h} />;
  };

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="sketchie-header">
        <div className="header-left">
          <svg className="logo-icon" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#6366f1"/>
                <stop offset="100%" stopColor="#ec4899"/>
              </linearGradient>
            </defs>
            <rect width="100" height="100" rx="20" fill="#1e1b4b"/>
            <path d="M25 70 L40 30 L55 55 L70 35 L85 70" stroke="url(#logo-grad)"
              strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="30" cy="25" r="5" fill="#fbbf24"/>
          </svg>
          <span className="logo-text">Sketchie</span>
        </div>

        <div className="header-center">
          <button className={`toolbar-btn ${activeTool === 'select' ? 'active' : ''}`}
            onClick={() => setActiveTool('select')} title="Select (V)">⊹</button>
          <button className={`toolbar-btn ${activeTool === 'rectangle' ? 'active' : ''}`}
            onClick={() => setActiveTool('rectangle')} title="Rectangle (R)">▢</button>
          <button className={`toolbar-btn ${activeTool === 'ellipse' ? 'active' : ''}`}
            onClick={() => setActiveTool('ellipse')} title="Ellipse (O)">◯</button>
          <button className={`toolbar-btn ${activeTool === 'line' ? 'active' : ''}`}
            onClick={() => setActiveTool('line')} title="Line (L)">╱</button>
          <button className={`toolbar-btn ${activeTool === 'freehand' ? 'active' : ''}`}
            onClick={() => setActiveTool('freehand')} title="Pen (P)">✎</button>
          <button className={`toolbar-btn ${activeTool === 'text' ? 'active' : ''}`}
            onClick={() => setActiveTool('text')} title="Text (T)">T</button>
          <div className="toolbar-divider" />
          <button className={`toolbar-btn ${activeTool === 'pan' ? 'active' : ''}`}
            onClick={() => setActiveTool('pan')} title="Pan (H/Space)">✥</button>
          <div className="toolbar-divider" />
          <button className="toolbar-btn" onClick={() => setShowPanel(p => !p)}
            title="Toggle Panel">☰</button>
        </div>

        <div className="header-right">
          <button className="zoom-btn" onClick={zoomOut} title="Zoom Out">−</button>
          <span className="zoom-display" onDoubleClick={zoomReset}>{Math.round(view.zoom * 100)}%</span>
          <button className="zoom-btn" onClick={zoomIn} title="Zoom In">+</button>
          <button className="share-btn">Share</button>
        </div>
      </header>

      {/* ── Canvas ── */}
      <div ref={containerRef}
        className={`canvas-container ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      >
        <svg className="canvas-svg">
          <g transform={`translate(${view.panX}, ${view.panY}) scale(${view.zoom})`}>
            {/* Grid */}
            <g>{gridDots}</g>

            {/* Elements */}
            {elements.sort((a, b) => a.zIndex - b.zIndex).map(renderElement)}

            {/* Drawing preview */}
            {renderPreview()}
            {renderFreehandPreview()}

            {/* Marquee */}
            {renderMarquee()}
          </g>
        </svg>

        {/* Text Input */}
        {textInput && (
          <div className="text-input-overlay" style={{ left: textInput.x, top: textInput.y }}>
            <textarea ref={textRef} rows={1} placeholder="Type here..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitText((e.target as HTMLTextAreaElement).value);
                }
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={(e) => commitText(e.target.value)}
            />
          </div>
        )}

        {/* Coords */}
        <div className="coords-display">
          {Math.round(drawState.currentX)}, {Math.round(drawState.currentY)}
        </div>

        {/* Minimap */}
        <div className="minimap">
          <svg viewBox={`-1500 -1500 3000 3000`}>
            {elements.map(el => {
              const b = getElementBounds(el);
              if (el.type === 'rectangle') {
                return <rect key={el.id} className="minimap-element" x={b.x} y={b.y}
                  width={b.width} height={b.height} stroke={el.stroke} fill="none" strokeWidth={20} />;
              }
              if (el.type === 'ellipse') {
                return <ellipse key={el.id} className="minimap-element"
                  cx={b.x + b.width/2} cy={b.y + b.height/2}
                  rx={b.width/2} ry={b.height/2} stroke={el.stroke} fill="none" strokeWidth={20} />;
              }
              return null;
            })}
            <rect className="minimap-viewport"
              x={-view.panX / view.zoom}
              y={-view.panY / view.zoom}
              width={(containerRef.current?.clientWidth || 800) / view.zoom}
              height={(containerRef.current?.clientHeight || 600) / view.zoom}
            />
          </svg>
        </div>

        {/* Right Panel */}
        {showPanel && (
          <div className="right-panel">
            {/* Colors */}
            <div className="panel-section">
              <div className="panel-section-title">Stroke Color</div>
              <div className="color-palette">
                {COLORS.map(c => (
                  <div key={c} className={`color-swatch ${strokeColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setStrokeColor(c)} />
                ))}
              </div>
            </div>

            <div className="panel-section">
              <div className="panel-section-title">Fill Color</div>
              <div className="color-palette">
                <div className={`color-swatch ${fillColor === 'transparent' ? 'active' : ''}`}
                  style={{ background: 'repeating-conic-gradient(rgba(255,255,255,0.1) 0% 25%, transparent 0% 50%) 50% / 10px 10px' }}
                  onClick={() => setFillColor('transparent')} />
                {COLORS.map(c => (
                  <div key={c} className={`color-swatch ${fillColor === c ? 'active' : ''}`}
                    style={{ background: c }}
                    onClick={() => setFillColor(c)} />
                ))}
              </div>
            </div>

            {/* Stroke Width */}
            <div className="panel-section">
              <div className="panel-section-title">Stroke Width</div>
              <div className="stroke-options">
                {[1, 2, 4, 8].map(w => (
                  <div key={w} className={`stroke-option ${strokeWidth === w ? 'active' : ''}`}
                    onClick={() => setStrokeWidth(w)}>
                    <div className="stroke-preview" style={{ height: `${Math.max(w, 2)}px` }} />
                  </div>
                ))}
              </div>
            </div>

            {/* Elements */}
            <div className="panel-section">
              <div className="panel-section-title">Elements ({elements.length})</div>
              <div className="element-list">
                {elements.slice().reverse().map(el => (
                  <div key={el.id}
                    className={`element-item ${selectedIds.includes(el.id) ? 'selected' : ''}`}
                    onClick={() => setSelectedIds([el.id])}>
                    <span className="element-item-icon">
                      {el.type === 'rectangle' ? '▢' : el.type === 'ellipse' ? '◯' : el.type === 'line' ? '╱' : el.type === 'freehand' ? '✎' : 'T'}
                    </span>
                    <span className="element-item-name">{formatElementLabel(el)}</span>
                    <button className="element-item-delete" onClick={(e) => { e.stopPropagation(); deleteElement(el.id); }}>✕</button>
                  </div>
                ))}
                {elements.length === 0 && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', padding: '4px 0' }}>
                    No elements yet. Draw something!
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
