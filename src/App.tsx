import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ZenEngine, ROOMS, PALETTES } from "./game";
import type { Palette, Piece } from "./game";
import { ZenAudio } from "./audio";

const CELL = 30;

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; t: number; size: number; color: string;
}

interface Furn {
  kind: string; row: number; col: number; t: number;
}

interface BoardHandle {
  celebrate: () => void;
  refill: () => void;
  reset: () => void;
  groutSweep: () => void;
  burst: (col: number, row: number, wCells: number, hCells: number) => void;
  getCanvas: () => HTMLCanvasElement | null;
}

interface DragState {
  idx: number;
  row: number;
  col: number;
  valid: boolean;
}

const FURNITURE_KINDS = ["plant", "rug", "lamp", "chair", "table"];

function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function drawFurniture(ctx: CanvasRenderingContext2D, kind: string, cx: number, cy: number, s: number, c: string) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineJoin = "round";
  switch (kind) {
    case "plant":
      ctx.fillStyle = "#7c8a5a";
      ctx.beginPath();
      ctx.ellipse(0, -26, 20, 32, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#5d6b42";
      ctx.beginPath();
      ctx.ellipse(-8, -12, 8, 20, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.roundRect(-14, 8, 28, 22, 6);
      ctx.fill();
      ctx.fillStyle = "#d9c08a";
      ctx.fillRect(-12, 12, 24, 4);
      break;
    case "rug":
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.roundRect(-30, -20, 60, 40, 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.roundRect(-22, -13, 44, 26, 7);
      ctx.stroke();
      ctx.save();
      ctx.translate(0, -30);
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 10);
      ctx.moveTo(0, 0);
      ctx.lineTo(-14, -6);
      ctx.stroke();
      ctx.restore();
      break;
    case "lamp":
      ctx.beginPath();
      ctx.moveTo(-4, 28);
      ctx.lineTo(4, 28);
      ctx.lineTo(2, -22);
      ctx.lineTo(-2, -22);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.fillStyle = "#e8c98a";
      ctx.shadowColor = "rgba(255,220,150,0.7)";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(-16, -22);
      ctx.lineTo(16, -22);
      ctx.lineTo(8, -42);
      ctx.lineTo(-8, -42);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    case "chair":
      ctx.strokeStyle = c;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.roundRect(-22, 2, 28, 18, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(-24, -6, 32, 10, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-22, 20);
      ctx.lineTo(-26, 34);
      ctx.moveTo(6, 20);
      ctx.lineTo(10, 34);
      ctx.moveTo(8, -6);
      ctx.lineTo(14, -22);
      ctx.stroke();
      break;
    case "table":
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.roundRect(-34, -14, 68, 10, 3);
      ctx.fill();
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.moveTo(-24, -4);
      ctx.lineTo(-24, 24);
      ctx.moveTo(24, -4);
      ctx.lineTo(24, 24);
      ctx.moveTo(-8, -4);
      ctx.lineTo(-2, 26);
      ctx.stroke();
      ctx.fillStyle = "#e8c98a";
      ctx.shadowColor = "rgba(255,220,150,0.5)";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(-10, -22, 20, 8, 3);
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
  }
  ctx.restore();
}

const BoardCanvas = forwardRef<BoardHandle, {
  engine: ZenEngine;
  palette: Palette;
  selectedIdx: number | null;
  onPlace: () => void;
  drag: DragState | null;
}>(({ engine, palette, selectedIdx, onPlace, drag }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const selRef = useRef(selectedIdx);
  const palRef = useRef(palette);
  const onPlaceRef = useRef(onPlace);
  const engRef = useRef(engine);
  const dragRef = useRef<DragState | null>(null);
  selRef.current = selectedIdx;
  palRef.current = palette;
  onPlaceRef.current = onPlace;
  engRef.current = engine;
  dragRef.current = drag;

  const partsRef = useRef<Particle[]>([]);
  const motesRef = useRef<Particle[]>([]);
  const furnRef = useRef<Furn[]>([]);
  const sheenRef = useRef<{ t: number; sparkles: { x: number; y: number; d: number }[] } | null>(null);
  const refillPulseRef = useRef<number>(0);
  const hoverRef = useRef<{ row: number; col: number } | null>(null);
  const sweepRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    celebrate() {
      const e = engRef.current;
      const spots: { kind: string; row: number; col: number }[] = [];
      const kinds = [...FURNITURE_KINDS].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
      for (const kind of kinds) {
        for (let i = 0; i < 40; i++) {
          const row = Math.floor(Math.random() * e.room.gridRows);
          const col = Math.floor(Math.random() * e.room.gridCols);
          if (row + 3 <= e.room.gridRows && col + 3 <= e.room.gridCols) {
            spots.push({ kind, row, col });
            break;
          }
        }
      }
      furnRef.current = spots.map((s, i) => ({ ...s, t: -0.6 - i * 0.18 }));
      sheenRef.current = { t: 0, sparkles: Array.from({ length: 16 }, () => ({ x: Math.random(), y: Math.random(), d: Math.random() })) };
    },
    refill() {
      refillPulseRef.current = 1;
    },
    reset() {
      partsRef.current = [];
      furnRef.current = [];
      sheenRef.current = null;
      refillPulseRef.current = 0;
      hoverRef.current = null;
      sweepRef.current = null;
    },
    groutSweep() {
      sweepRef.current = 0;
    },
    burst(col: number, row: number, wCells: number, hCells: number) {
      const pal = palRef.current;
      const cx = (col + wCells / 2) * CELL;
      const cy = (row + hCells / 2) * CELL;
      for (let i = 0; i < 10; i++) {
        partsRef.current.push({
          x: cx + (Math.random() - 0.5) * wCells * CELL * 0.6,
          y: cy + (Math.random() - 0.5) * hCells * CELL * 0.6,
          vx: (Math.random() - 0.5) * 26,
          vy: -Math.random() * 22 - 4,
          life: 0.45 + Math.random() * 0.3,
          t: 0,
          size: 1.2 + Math.random() * 2,
          color: Math.random() < 0.5 ? pal.tileA : pal.tileB,
        });
      }
    },
    getCanvas() {
      return canvasRef.current;
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (motesRef.current.length === 0) {
      motesRef.current = Array.from({ length: 14 }, () => ({
        x: Math.random(), y: Math.random(),
        vx: (Math.random() - 0.5) * 0.01, vy: -(Math.random() * 0.005 + 0.002),
        life: 1, t: 0, size: Math.random() * 1.6 + 0.8,
        color: "rgba(255,255,255,0.35)",
      }));
    }

    let raf = 0;
    let last = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const eng = engRef.current;
      const pal = palRef.current;
      const sel = selRef.current;
      const R = eng.room;

      const W = R.gridCols * CELL;
      const H = R.gridRows * CELL;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, pal.bg1);
      g.addColorStop(1, pal.bg2);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      for (let r = 0; r < R.gridRows; r++) {
        for (let c = 0; c < R.gridCols; c++) {
          const x = c * CELL;
          const y = r * CELL;
          if (eng.grid[r][c] === -1) {
            ctx.fillStyle = pal.empty;
            ctx.fillRect(x, y, CELL, CELL);
            ctx.strokeStyle = pal.grid;
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1);
          }
        }
      }

      ctx.save();
      ctx.shadowColor = pal.shadow;
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      for (let i = 0; i < eng.pieces.length; i++) {
        const pl = eng.placements[i];
        if (!pl) continue;
        const p = eng.pieces[i];
        const drawW = p.cellsW;
        const drawH = p.cellsH;
        const x = pl.col * CELL;
        const y = pl.row * CELL;
        const w = drawW * CELL;
        const h = drawH * CELL;
        const horizontal = drawW >= drawH;
        const seamC = eng.grouted ? pal.grout : "rgba(60,60,60,0.28)";
        const glossOn = eng.grouted;
        const gr = ctx.createLinearGradient(horizontal ? 0 : 0, horizontal ? 0 : 0, horizontal ? w : 0, horizontal ? 0 : h);
        gr.addColorStop(0, pal.tileA);
        gr.addColorStop(0.5, pal.tileB);
        gr.addColorStop(1, pal.tileA);
        ctx.fillStyle = gr;
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

        ctx.fillStyle = seamC;
        ctx.fillRect(x, y, w, 2);
        ctx.fillRect(x, y + h - 2, w, 2);
        ctx.fillRect(x, y, 2, h);
        ctx.fillRect(x + w - 2, y, 2, h);

        if (glossOn) {
          const band = Math.min(w, h);
          const gl = ctx.createLinearGradient(0, y, 0, y + band * 0.9);
          gl.addColorStop(0, "rgba(255,255,255,0.35)");
          gl.addColorStop(0.4, "rgba(255,255,255,0.06)");
          gl.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = gl;
          ctx.fillRect(x + 3, y + 3, Math.max(2, w - 6), band * 0.5);

          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(x + 6, y + 4, Math.max(6, w - 12), 1.5);

          ctx.fillStyle = "rgba(255,255,255,0.22)";
          ctx.fillRect(x + 3, y + h - 4, Math.max(2, w - 6), 1);
        }
      }
      ctx.restore();

      const dg = dragRef.current;
      if (dg) {
        const p = eng.pieces[dg.idx];
        if (p) {
          const gw = p.cellsW * CELL;
          const gh = p.cellsH * CELL;
          const gx = dg.col * CELL;
          const gy = dg.row * CELL;
          ctx.save();
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 0.9;
          const gg = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh);
          gg.addColorStop(0, pal.tileA);
          gg.addColorStop(0.5, pal.tileB);
          gg.addColorStop(1, pal.tileA);
          ctx.fillStyle = dg.valid ? gg : "rgba(214,98,98,0.88)";
          ctx.fillRect(gx + 1, gy + 1, gw - 2, gh - 2);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = dg.valid ? pal.accent : "#c25b5b";
          ctx.lineWidth = 2;
          ctx.strokeRect(gx + 1, gy + 1, gw - 2, gh - 2);
          ctx.restore();
        }
      }

      if (sweepRef.current !== null) {
        sweepRef.current += dt;
        const st = sweepRef.current;
        if (st > 1.6) {
          sweepRef.current = null;
        } else {
          const k = Math.min(1, st / 1.6);
          const sy = k * H;
          const band = ctx.createLinearGradient(0, sy - 44, 0, sy);
          band.addColorStop(0, "rgba(240,231,214,0)");
          band.addColorStop(1, "rgba(240,231,214,0.6)");
          ctx.fillStyle = band;
          ctx.fillRect(0, sy - 44, W, 44);
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(0, sy, W, 2);
        }
      }

      if (sheenRef.current) {
        const s = sheenRef.current;
        s.t += dt;
        const k = Math.min(1, s.t / 1.8);
        const gx = (k * 2 - 0.4) * W;
        const gr = ctx.createLinearGradient(gx - W * 0.5, 0, gx + W * 0.5, 0);
        gr.addColorStop(0, "rgba(255,255,255,0)");
        gr.addColorStop(0.5, `rgba(255,255,255,${0.32 * (1 - k * 0.5)})`);
        gr.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, W, H);

        for (const sp of s.sparkles) {
          ctx.fillStyle = `rgba(255,250,220,${0.8 * Math.max(0, 1 - (s.t - sp.d) / 0.8)})`;
          ctx.beginPath();
          ctx.arc(sp.x * W, sp.y * H, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      const fcount = furnRef.current.length;
      for (let i = 0; i < fcount; i++) {
        const f = furnRef.current[i];
        f.t += dt;
        if (f.t <= 0) continue;
        const k = Math.min(1, f.t / 0.7);
        const sc = easeOutBack(k) * (CELL / 34);
        const cx = (f.col + 1.5) * CELL;
        const cy = (f.row + 1.7) * CELL;
        drawFurniture(ctx, f.kind, cx, cy, sc, pal.accent);
      }

      if (refillPulseRef.current > 0) {
        refillPulseRef.current = Math.max(0, refillPulseRef.current - dt * 1.4);
      }

      for (const m of motesRef.current) {
        m.y += m.vy * dt * 10;
        m.x += m.vx * dt * 10;
        if (m.y < 0) m.y = 1;
        if (m.y > 1) m.y = 0;
        if (m.x > 1) m.x = 0;
        if (m.x < 0) m.x = 1;
        const a = 0.15 + 0.2 * Math.abs(Math.sin(now * 0.001 + m.x * 40));
        ctx.fillStyle = m.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(m.x * W, m.y * H, m.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      for (const p of partsRef.current) {
        p.vy += 160 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.t += dt;
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
      ctx.globalAlpha = 1;
      partsRef.current = partsRef.current.filter((p) => p.t < p.life);

      if (sel !== null) {
        const p = eng.pieces[sel];
        const hov = hoverRef.current;
        if (p && hov && eng.canPlace(sel, hov.row, hov.col)) {
          ctx.fillStyle = "rgba(255,255,255,0.18)";
          ctx.fillRect(hov.col * CELL, hov.row * CELL, p.cellsW * CELL, p.cellsH * CELL);
          ctx.strokeStyle = pal.accent;
          ctx.lineWidth = 2.5;
          ctx.strokeRect(hov.col * CELL + 1, hov.row * CELL + 1, p.cellsW * CELL - 2, p.cellsH * CELL - 2);
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const cellAt = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL);
    const row = Math.floor((e.clientY - rect.top) / CELL);
    const eng = engRef.current;
    if (row < 0 || row >= eng.room.gridRows || col < 0 || col >= eng.room.gridCols) return null;
    return { row, col };
  };

  const placeAt = (row: number, col: number) => {
    const eng = engRef.current;
    const sel = selRef.current;
    if (sel === null) return;
    const p = eng.pieces[sel];
    if (!p || !eng.canPlace(sel, row, col)) return;
    eng.place(sel, row, col);
    const pal = palRef.current;
    const cx = (col + p.cellsW / 2) * CELL;
    const cy = (row + p.cellsH / 2) * CELL;
    for (let i = 0; i < 10; i++) {
      partsRef.current.push({
        x: cx + (Math.random() - 0.5) * p.cellsW * CELL * 0.6,
        y: cy + (Math.random() - 0.5) * p.cellsH * CELL * 0.6,
        vx: (Math.random() - 0.5) * 26,
        vy: -Math.random() * 22 - 4,
        life: 0.45 + Math.random() * 0.3,
        t: 0,
        size: 1.2 + Math.random() * 2,
        color: Math.random() < 0.5 ? pal.tileA : pal.tileB,
      });
    }
    onPlaceRef.current();
  };

  return (
    <canvas
      ref={canvasRef}
      className="block rounded-xl"
      style={{ boxShadow: "0 14px 40px rgba(0,0,0,0.18)" }}
      onPointerDown={(e) => {
        const c = cellAt(e);
        if (c) placeAt(c.row, c.col);
      }}
      onPointerMove={(e) => {
        const c = cellAt(e);
        hoverRef.current = c;
      }}
      onPointerLeave={() => {
        hoverRef.current = null;
      }}
    />
  );
});
BoardCanvas.displayName = "BoardCanvas";

function PiecePill({ p, pal, selected, cutPct, onPointerDown }: {
  p: Piece;
  pal: Palette;
  selected: boolean;
  cutPct: number | null;
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const w = Math.max(p.cellsW * 18, 30);
  const h = Math.max(p.cellsH * 18, 30);
  const horizontal = p.cellsW >= p.cellsH;
  const gr = `linear-gradient(${horizontal ? 90 : 180}deg, ${pal.tileA}, ${pal.tileB}, ${pal.tileA})`;

  return (
    <div
      className="relative shrink-0 rounded-md cursor-grab transition-transform duration-150"
      style={{
        width: w,
        height: h,
        background: gr,
        touchAction: "none",
        boxShadow: selected
          ? `0 0 0 2px ${pal.accent}, 0 4px 10px ${pal.shadow}`
          : `0 2px 6px ${pal.shadow}`,
        transform: selected ? "translateY(-3px)" : undefined,
      }}
      onPointerDown={(e) => onPointerDown(e)}
      title={`${p.cellsW * 5}×${p.cellsH * 5}`}
    >
      {selected && cutPct !== null && !p.cut ? (
        <>
          <div
            className="absolute inset-0 rounded-md opacity-80"
            style={{
              background: `linear-gradient(${horizontal ? 90 : 180}deg, rgba(0,0,0,0) ${cutPct - 2}%, ${pal.accent} ${cutPct}%, rgba(0,0,0,0) ${cutPct + 2}%)`,
            }}
          />
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 text-[9px] font-semibold rounded-full px-1.5 py-px"
            style={{ background: pal.accent, color: "#fff", opacity: 0.9 }}>
            kes
          </span>
        </>
      ) : null}
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono"
        style={{ color: "rgba(255,255,255,0.75)", textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
        {p.cellsW * 5}×{p.cellsH * 5}
      </span>
      {p.cut ? (
        <span className="absolute bottom-1 right-1 text-[8px] opacity-70">✂</span>
      ) : null}
    </div>
  );
}

function RecycleBin({ pal, fill, onDrop }: { pal: Palette; fill: number; onDrop: () => void }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1 px-2" title="Geri dönüştür (35 cm = yeni taş)">
      <div className="relative w-16 h-16 flex items-center justify-center rounded-xl border"
        style={{ borderColor: pal.seam, background: "rgba(255,255,255,0.35)" }}
        onClick={onDrop}>
        <svg viewBox="0 0 64 64" className="w-6 h-6" style={{ color: pal.accent }}>
          <path fill="currentColor" d="M26 6h12v6h14a4 4 0 0 1 0 8h-2l-2 38a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4l-2-38h-2a4 4 0 0 1 0-8h14V6zM22 24l1.5 28h3l-1.5-28h-3zm9 0v28h3V24h-3zm9 0l3 28h3l-1.5-28h-4.5z" />
        </svg>
        <svg viewBox="0 0 64 64" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke={pal.seam} strokeWidth="4" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={pal.accent} strokeWidth="4"
            strokeDasharray={circ} strokeDashoffset={circ - (fill / 100) * circ} strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: pal.accent }}>
        {fill}%
      </span>
    </div>
  );
}

function GroutBin({ pal, fill, ready, onGrout }: { pal: Palette; fill: number; ready: boolean; onGrout: () => void }) {
  const r = 26;
  const circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1 px-2" title={ready ? "Harçla!" : "Harç"} onClick={() => { if (ready) onGrout(); }}>
      <div className={`relative w-16 h-16 flex items-center justify-center rounded-xl border ${ready ? "animate-pulse" : ""}`}
        style={{ borderColor: ready ? pal.accent : pal.seam, background: "rgba(255,255,255,0.35)" }}>
        <span className="text-2xl">🪣</span>
        <svg viewBox="0 0 64 64" className="absolute inset-0 w-full h-full -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke={pal.seam} strokeWidth="4" />
          <circle cx="32" cy="32" r={r} fill="none" stroke={pal.accent} strokeWidth="4"
            strokeDasharray={circ} strokeDashoffset={circ - (fill / 100) * circ} strokeLinecap="round" />
        </svg>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: pal.accent }}>
        Harç {fill}%
      </span>
    </div>
  );
}

export default function App() {
  const [roomIdx, setRoomIdx] = useState(0);
  const engRef = useRef(new ZenEngine(ROOMS[0]));
  const [, force] = useState(0);
  const tick = useCallback(() => force((n) => n + 1), []);

  const [selected, setSelected] = useState<number | null>(null);
  const [cutPct, setCutPct] = useState<number | null>(null);
  const [cutCm, setCutCm] = useState(15);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [paletteIdx, setPaletteIdx] = useState(0);
  const [musicOn, setMusicOn] = useState(false);
  const [toast, setToast] = useState<{ msg: string; next: boolean; grout?: boolean } | null>(null);

  const dragRef = useRef<{ idx: number; sx: number; sy: number; sxr: number; syr: number; w: number; h: number; wasSel: boolean } | null>(null);
  const cutPctRef = useRef<number | null>(null);
  cutPctRef.current = cutPct;

  const audioRef = useRef(new ZenAudio());
  const boardRef = useRef<BoardHandle>(null);
  const doneRef = useRef(false);
  const pavedRef = useRef(false);

  const engine = engRef.current;
  const pal = PALETTES[paletteIdx];

  const startRoom = (idx: number) => {
    setRoomIdx(idx);
    engRef.current = new ZenEngine(ROOMS[idx]);
    setSelected(null);
    setCutPct(null);
    setCutCm(15);
    setDrag(null);
    dragRef.current = null;
    setToast(null);
    doneRef.current = false;
    pavedRef.current = false;
    boardRef.current?.reset();
    tick();
  };

  const onPlaced = useCallback(() => {
    audioRef.current.place();
    setSelected(null);
    setCutPct(null);
    setDrag(null);
    tick();
    const e = engRef.current;
    if (e.percent === 100 && !e.grouted && !pavedRef.current) {
      pavedRef.current = true;
      setToast({ msg: "Zemin tamamen döşendi — harçla! 🪣", next: false, grout: true });
    }
  }, [tick]);

  const handlePieceDown = (e: React.PointerEvent, idx: number) => {
    e.stopPropagation();
    audioRef.current.unlock();
    const eng = engRef.current;
    if (eng.placements[idx] !== null) return;
    setSelected(idx);
    const p = eng.pieces[idx];
    setCutPct(p && !p.cut ? 50 : null);
    setCutCm(15);
    setDrag(null);
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    dragRef.current = {
      idx,
      sx: e.clientX,
      sy: e.clientY,
      sxr: r.left,
      syr: r.top,
      w: r.width,
      h: r.height,
      wasSel: selected === idx,
    };
  };

  const dropCell = useCallback((e: { clientX: number; clientY: number }, idx: number): DragState | null => {
    const canvas = boardRef.current?.getCanvas();
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL);
    const row = Math.floor((e.clientY - rect.top) / CELL);
    const eng = engRef.current;
    if (row < 0 || row >= eng.room.gridRows || col < 0 || col >= eng.room.gridCols) return null;
    return { idx, row, col, valid: eng.canPlace(idx, row, col) };
  }, []);

  const placeFromDrop = useCallback((idx: number, row: number, col: number) => {
    const eng = engRef.current;
    if (!eng.canPlace(idx, row, col)) return;
    const p = eng.pieces[idx];
    eng.place(idx, row, col);
    boardRef.current?.burst(col, row, p.cellsW, p.cellsH);
    onPlaced();
  }, [onPlaced]);

  useEffect(() => {
    const inPill = (d: NonNullable<typeof dragRef.current>, x: number, y: number) =>
      x >= d.sxr - 10 && x <= d.sxr + d.w + 10 && y >= d.syr - 10 && y <= d.syr + d.h + 10;

    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const eng = engRef.current;
      const p = eng.pieces[d.idx];
      if (!p) return;
      if (inPill(d, e.clientX, e.clientY)) {
        setDrag(null);
        if (!p.cut) {
          const horizontal = p.cellsW >= p.cellsH;
          const pct = horizontal
            ? ((e.clientX - d.sxr) / d.w) * 100
            : ((e.clientY - d.syr) / d.h) * 100;
          setCutPct(Math.max(8, Math.min(92, pct)));
        }
      } else {
        setDrag(dropCell(e, d.idx));
      }
    };

    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      const eng = engRef.current;
      const p = eng.pieces[d.idx];
      if (!p) return;
      if (inPill(d, e.clientX, e.clientY)) {
        const moved = Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 6;
        if (!p.cut && (d.wasSel || moved)) {
          const pct = cutPctRef.current ?? 50;
          const cells = Math.round((pct / 100) * eng.cutRange(d.idx));
          if (eng.cutPiece(d.idx, cells)) {
            audioRef.current.cut();
            setCutPct(null);
            setSelected(null);
            setDrag(null);
            tick();
          }
        }
      } else {
        const c = dropCell(e, d.idx);
        if (c && c.valid) {
          placeFromDrop(d.idx, c.row, c.col);
        } else {
          setDrag(null);
        }
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dropCell, placeFromDrop]);

  const handleRotate = () => {
    if (selected === null) return;
    engine.rotate(selected);
    tick();
  };

  const handleCutBtn = () => {
    if (selected === null) return;
    const eng = engRef.current;
    const p = eng.pieces[selected];
    if (!p || p.cut) return;
    const maxCells = Math.max(p.cellsW, p.cellsH);
    const cells = Math.max(1, Math.min(maxCells - 1, Math.round(cutCm / 5)));
    if (eng.cutPiece(selected, cells)) {
      audioRef.current.cut();
      setCutPct(null);
      setCutCm(15);
      setSelected(null);
      setDrag(null);
      tick();
    }
  };

  const handleRecycle = () => {
    if (selected === null) return;
    if (engine.placements[selected] !== null) return;
    engine.recycle(selected);
    audioRef.current.recycle();
    setSelected(null);
    tick();
    if (engine.collectNewTile()) {
      audioRef.current.refill();
      boardRef.current?.refill();
      tick();
    }
  };

  const handleGrout = () => {
    const eng = engRef.current;
    if (eng.percent !== 100 || eng.grouted || doneRef.current) return;
    eng.groutAll();
    audioRef.current.grout();
    boardRef.current?.groutSweep();
    setToast(null);
    setSelected(null);
    setCutPct(null);
    setDrag(null);
    tick();
    setTimeout(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        audioRef.current.complete();
        boardRef.current?.celebrate();
        setToast({ msg: `${eng.room.name} hazır! 🌿`, next: roomIdx < ROOMS.length - 1 });
      }
    }, 1600);
  };

  const flipPalette = () => {
    setPaletteIdx((i) => (i + 1) % PALETTES.length);
  };

  const flipMusic = () => {
    audioRef.current.unlock();
    setMusicOn(audioRef.current.toggleMusic());
  };

  const pct = engine.percent;

  const selPiece = selected !== null ? engine.pieces[selected] : null;
  const selMaxCells = selPiece ? Math.max(selPiece.cellsW, selPiece.cellsH) : 7;
  const selMaxCm = Math.max(5, Math.min(30, (selMaxCells - 1) * 5));
  const sliderCm = Math.min(cutCm, selMaxCm);

  return (
    <div className="h-full flex flex-col transition-colors duration-500"
      style={{ background: `${pal.bg1}`, color: pal.text }}>
      <header className="flex items-center justify-between px-4 py-3 gap-2"
        style={{ borderBottom: `1px solid ${pal.seam}` }}>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-wide truncate">
            {engine.room.name}
          </h1>
          <p className="text-[11px] opacity-60">Zen Paving — Kafa Dağıtma &amp; Taş Döşeme</p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-[10px] uppercase tracking-widest opacity-50">Tamamlandı</span>
            <span className="text-lg font-bold tabular-nums" style={{ color: pal.accent }}>{pct}%</span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={flipMusic}
              className="w-9 h-9 rounded-full text-sm font-bold transition-colors border"
              style={{ borderColor: pal.seam, color: musicOn ? pal.accent : pal.text, background: musicOn ? "rgba(255,255,255,0.35)" : "transparent" }}
              title="Lo-Fi müzik">
              {musicOn ? "♪" : "♪̶"}
            </button>
            <button onClick={flipPalette}
              className="w-9 h-9 rounded-full text-sm transition-colors border"
              style={{ borderColor: pal.seam }}
              title="Renk paleti">
              🎨
            </button>
            <button onClick={() => startRoom(roomIdx)}
              className="w-9 h-9 rounded-full text-sm transition-colors border"
              style={{ borderColor: pal.seam }}
              title="Yeniden başlat">
              ↺
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto flex items-center justify-center p-5">
        {toast ? (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2 px-5 py-4 rounded-2xl shadow-2xl pop-in"
            style={{ background: pal.bg2, border: `1px solid ${pal.seam}` }}>
            <span className="text-sm font-semibold">{toast.msg} 🌿</span>
            <div className="flex gap-2">
              {toast.grout && (
                <button
                  className="px-4 py-1.5 rounded-full text-sm font-semibold transition-transform active:scale-95"
                  style={{ background: "#a16a33", color: "#fff" }}
                  onClick={handleGrout}>
                  Harçla 🪣
                </button>
              )}
              {toast.next && (
                <button
                  className="px-4 py-1.5 rounded-full text-sm font-semibold transition-transform active:scale-95"
                  style={{ background: pal.accent, color: "#fff" }}
                  onClick={() => startRoom(roomIdx + 1)}>
                  Sonraki Oda →
                </button>
              )}
              <button
                className="px-4 py-1.5 rounded-full text-sm font-semibold border transition-transform active:scale-95"
                style={{ borderColor: pal.seam }}
                onClick={() => setToast(null)}>
                Kapat
              </button>
            </div>
          </div>
        ) : null}

        <BoardCanvas ref={boardRef} engine={engine} palette={pal} selectedIdx={selected} onPlace={onPlaced} drag={drag} />
      </main>

      <footer className="px-4 pb-4 pt-2 flex flex-col gap-2"
        style={{ borderTop: `1px solid ${pal.seam}` }}>
        <div className="flex justify-between items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest opacity-50">Envanter</span>
          {selected !== null ? (
            <div className="flex items-center gap-2.5 text-[11px] flex-wrap justify-end"
              style={{ color: pal.accent }}>
              {!selPiece?.cut ? (
                <div className="flex items-center gap-2 bg-white/40 rounded-full px-3 py-1 border"
                  style={{ borderColor: pal.seam }}>
                  <span className="text-[10px] font-semibold opacity-70">Kırma Boyutu:</span>
                  <input
                    type="range"
                    min={5}
                    max={selMaxCm}
                    step={5}
                    value={sliderCm}
                    onChange={(e) => setCutCm(Number(e.target.value))}
                    className="accent-stone-600 cursor-pointer"
                    style={{ width: 110 }}
                  />
                  <span className="text-[10px] font-mono font-bold">{sliderCm} cm</span>
                  <button onClick={handleCutBtn}
                    className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-amber-700 hover:bg-amber-800 text-white transition">
                    KIR (ÇIT!)
                  </button>
                </div>
              ) : (
                <span>kesilmiş parça</span>
              )}
              {!selPiece?.cut && (
                <button onClick={handleRotate}
                  className="px-2.5 py-1 rounded-full text-[10px] font-semibold border"
                  style={{ borderColor: pal.seam }}>
                  ↻ Döndür
                </button>
              )}
              <button onClick={handleRecycle}
                className="px-2.5 py-1 rounded-full text-[10px] font-semibold border"
                style={{ borderColor: pal.seam }}>
                Geri Dönüşüm
              </button>
            </div>
          ) : (
            <span className="text-[11px] opacity-40">taşı tut, tahtaya sürükle &amp; bırak · kırma için Kırma Boyutu + KIR</span>
          )}
        </div>
        <div className="flex gap-2 items-end overflow-x-auto pb-1" style={{ maxHeight: 150 }}>
          <div className="flex gap-2 items-end pr-2">
            {engine.pieces.map((p, idx) => (
              <PiecePill
                key={p.id}
                p={p}
                pal={pal}
                selected={selected === idx}
                cutPct={selected === idx ? cutPct : null}
                onPointerDown={(e) => handlePieceDown(e, idx)}
              />
            ))}
          </div>
          <RecycleBin pal={pal} fill={engine.recyclePercent} onDrop={handleRecycle} />
          <GroutBin
            pal={pal}
            fill={engine.grouted ? 100 : engine.percent}
            ready={engine.percent === 100 && !engine.grouted}
            onGrout={handleGrout}
          />
        </div>
        <p className="text-[10px] opacity-40 italic text-center">
          hiçbir parça israf olmaz — sevmediklerini geri dönüştür, taş tozu birleşir, yeni taş doğar.
        </p>
      </footer>
    </div>
  );
}