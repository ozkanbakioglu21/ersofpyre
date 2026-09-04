import { useState, useRef, useCallback, useEffect } from "react";
import { GameEngine, LEVELS } from "./game";
import type { Piece } from "./game";

const CELL = 32;

function PieceBlock({ p, idx, selected, onClick, onCut }: {
  p: Piece;
  idx: number;
  selected: boolean;
  onClick: () => void;
  onCut: () => void;
}) {
  const w = p.cellsW * CELL;
  const h = p.cellsH * CELL;
  const placed = false;
  return (
    <div
      className={`relative flex-shrink-0 rounded-lg border-2 cursor-pointer transition-all duration-150
        ${selected
          ? "border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.5)] scale-105"
          : "border-amber-900/60 hover:border-amber-600/80 hover:shadow-lg"
        }`}
      style={{
        width: Math.max(w, 36),
        height: Math.max(h, 36),
        background: selected
          ? "linear-gradient(135deg, #92400e, #78350f)"
          : "linear-gradient(135deg, #78350f, #451a03)",
      }}
      onClick={onClick}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[10px] font-mono text-amber-200/80 leading-tight text-center">
          {p.cellsW * 5}×{p.cellsH * 5}
        </span>
      </div>
      {p.type === "uncut" && (
        <button
          className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-emerald-600 text-white text-[10px] font-bold flex items-center justify-center hover:bg-emerald-500 z-10 shadow"
          onClick={(e) => { e.stopPropagation(); onCut(); }}
          title="Kes"
        >
          ✂
        </button>
      )}
    </div>
  );
}

function CutModal({ piece, onCut, onCancel }: {
  piece: Piece;
  onCut: (pos: number) => void;
  onCancel: () => void;
}) {
  const isH = piece.cellsW >= piece.cellsH;
  const maxCut = isH ? piece.cellsW - 1 : piece.cellsH - 1;
  const [pos, setPos] = useState(Math.floor(maxCut / 2) + 1);

  const w1 = isH ? pos : piece.cellsW;
  const h1 = isH ? piece.cellsH : pos;
  const w2 = isH ? piece.cellsW - pos : piece.cellsW;
  const h2 = isH ? piece.cellsH : piece.cellsH - pos;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div
        className="bg-[#2a1f14] border border-amber-900/50 rounded-2xl p-6 w-[340px] shadow-2xl pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-amber-200 mb-4 text-center">Kesme Paneli</h3>

        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center">
            <div className="text-xs text-amber-400/70 mb-1">Sol</div>
            <div
              className="rounded border border-amber-700/50 mx-auto"
              style={{
                width: Math.max(w1 * 12, 24),
                height: Math.max(h1 * 12, 24),
                background: "linear-gradient(135deg, #92400e, #78350f)",
              }}
            />
            <div className="text-xs text-amber-300 mt-1 font-mono">{w1 * 5}×{h1 * 5}</div>
          </div>

          <div className="text-2xl text-amber-500/50">+</div>

          <div className="text-center">
            <div className="text-xs text-amber-400/70 mb-1">Sağ</div>
            <div
              className="rounded border border-amber-700/50 mx-auto"
              style={{
                width: Math.max(w2 * 12, 24),
                height: Math.max(h2 * 12, 24),
                background: "linear-gradient(135deg, #78350f, #451a03)",
              }}
            />
            <div className="text-xs text-amber-300 mt-1 font-mono">{w2 * 5}×{h2 * 5}</div>
          </div>
        </div>

        <input
          type="range"
          min={1}
          max={maxCut}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          className="w-full accent-amber-500 mb-4"
        />
        <div className="text-center text-xs text-amber-400/60 mb-4">
          Konum: {pos} hücre ({pos * 5} birim)
        </div>

        <div className="flex gap-3">
          <button
            className="flex-1 py-2 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-sm font-medium hover:bg-amber-700/50 transition"
            onClick={onCancel}
          >
            İptal
          </button>
          <button
            className="flex-1 py-2 rounded-lg bg-amber-600 text-[#1a1410] text-sm font-bold hover:bg-amber-500 transition"
            onClick={() => onCut(pos)}
          >
            Kes
          </button>
        </div>
      </div>
    </div>
  );
}

function VictoryModal({ levelName, onNext, onReset }: {
  levelName: string;
  onNext: () => void;
  onReset: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#2a1f14] border border-amber-700/50 rounded-2xl p-8 w-[320px] shadow-2xl text-center pop-in">
        <div className="text-4xl mb-3">🎉</div>
        <h2 className="text-xl font-bold text-amber-200 mb-1">Tebrikler!</h2>
        <p className="text-amber-400/70 text-sm mb-6">"{levelName}" tamamlandı</p>
        <div className="flex gap-3">
          <button
            className="flex-1 py-2.5 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-sm hover:bg-amber-700/50 transition"
            onClick={onReset}
          >
            Tekrar Oyna
          </button>
          <button
            className="flex-1 py-2.5 rounded-lg bg-amber-600 text-[#1a1410] text-sm font-bold hover:bg-amber-500 transition"
            onClick={onNext}
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [levelIdx, setLevelIdx] = useState(0);
  const [engine, setEngine] = useState(() => new GameEngine(LEVELS[0]));
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [cutModalIdx, setCutModalIdx] = useState<number | null>(null);
  const [victory, setVictory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const restart = useCallback(() => {
    setEngine(new GameEngine(LEVELS[levelIdx]));
    setSelectedIdx(null);
    setHoverCell(null);
    setVictory(false);
    setError(null);
  }, [levelIdx]);

  const nextLevel = useCallback(() => {
    const next = Math.min(levelIdx + 1, LEVELS.length - 1);
    setLevelIdx(next);
    setEngine(new GameEngine(LEVELS[next]));
    setSelectedIdx(null);
    setHoverCell(null);
    setVictory(false);
    setError(null);
  }, [levelIdx]);

  const handlePieceClick = useCallback((idx: number) => {
    if (victory) return;
    if (engine.placements[idx] !== null) return;
    setSelectedIdx((prev) => (prev === idx ? null : idx));
    setError(null);
  }, [engine, victory]);

  const handleCut = useCallback((idx: number) => {
    setCutModalIdx(idx);
  }, []);

  const handleCutConfirm = useCallback((pos: number) => {
    if (cutModalIdx === null) return;
    engine.cutPiece(cutModalIdx, pos);
    setEngine(new GameEngine(engine.level));
    setCutModalIdx(null);
    setSelectedIdx(null);
  }, [cutModalIdx, engine]);

  const handleRotate = useCallback(() => {
    if (selectedIdx === null) return;
    engine.rotatePiece(selectedIdx);
    setEngine(new GameEngine(engine.level));
  }, [selectedIdx, engine]);

  const handleRemovePiece = useCallback(() => {
    if (selectedIdx === null) return;
    if (engine.placements[selectedIdx] === null) return;
    engine.removePiece(selectedIdx);
    setEngine(new GameEngine(engine.level));
    setSelectedIdx(null);
    setError(null);
  }, [selectedIdx, engine]);

  const handleCanvasClick = useCallback(() => {
    if (selectedIdx === null || !hoverCell) return;
    const result = engine.canPlace(selectedIdx, hoverCell.row, hoverCell.col);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    engine.placePiece(selectedIdx, hoverCell.row, hoverCell.col);
    setEngine(new GameEngine(engine.level));
    setSelectedIdx(null);
    setError(null);

    const victoryResult = engine.checkVictory();
    if (victoryResult.ok) {
      setVictory(true);
    }
  }, [selectedIdx, hoverCell, engine]);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const col = Math.floor(x / CELL);
    const row = Math.floor(y / CELL);
    if (row >= 0 && row < engine.level.gridRows && col >= 0 && col < engine.level.gridCols) {
      setHoverCell({ row, col });
    } else {
      setHoverCell(null);
    }
  }, [engine]);

  const handleCanvasLeave = useCallback(() => {
    setHoverCell(null);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = engine.level.gridCols * CELL;
    const H = engine.level.gridRows * CELL;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#1a1410";
    ctx.fillRect(0, 0, W, H);

    for (let r = 0; r < engine.level.gridRows; r++) {
      for (let c = 0; c < engine.level.gridCols; c++) {
        const x = c * CELL;
        const y = r * CELL;
        const pieceIdx = engine.grid[r][c];

        if (pieceIdx === -1) {
          ctx.fillStyle = "#2a2018";
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        } else {
          const hue = (pieceIdx * 37) % 360;
          ctx.fillStyle = `hsl(${30 + (pieceIdx % 5) * 3}, ${50 + (pieceIdx % 3) * 10}%, ${28 + (pieceIdx % 4) * 4}%)`;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = "rgba(180,130,60,0.3)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        }

        ctx.strokeStyle = "rgba(120,90,50,0.15)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL, CELL);
      }
    }

    const violations = engine.getViolationRows();
    for (const vr of violations) {
      ctx.fillStyle = "rgba(239,68,68,0.12)";
      ctx.fillRect(0, vr * CELL, W, CELL);
    }

    if (selectedIdx !== null && hoverCell) {
      const p = engine.pieces[selectedIdx];
      const canP = engine.canPlace(selectedIdx, hoverCell.row, hoverCell.col);
      const hx = hoverCell.col * CELL;
      const hy = hoverCell.row * CELL;
      const pw = p.cellsW * CELL;
      const ph = p.cellsH * CELL;

      ctx.fillStyle = canP.ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
      ctx.fillRect(hx, hy, pw, ph);
      ctx.strokeStyle = canP.ok ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(hx + 1, hy + 1, pw - 2, ph - 2);
    }

    if (selectedIdx !== null && engine.placements[selectedIdx] !== null) {
      const pl = engine.placements[selectedIdx]!;
      const p = engine.pieces[selectedIdx];
      ctx.strokeStyle = "rgba(245,158,11,0.8)";
      ctx.lineWidth = 3;
      ctx.strokeRect(pl.col * CELL + 1, pl.row * CELL + 1, p.cellsW * CELL - 2, p.cellsH * CELL - 2);
    }
  }, [engine, selectedIdx, hoverCell]);

  const filled = engine.getFilledCells();
  const total = engine.getTotalCells();
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const unplaced = engine.getUnplacedCount();

  return (
    <div className="h-full flex flex-col wood-bg">
      <header className="flex items-center justify-between px-4 py-3 border-b border-amber-900/30">
        <div>
          <h1 className="text-base font-bold text-amber-200 tracking-wide">Sıfır Fire</h1>
          <p className="text-[10px] text-amber-500/60 tracking-widest uppercase">Parke Ustası</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <div className="text-[10px] text-amber-500/60 uppercase tracking-wider">Seviye</div>
            <div className="text-sm font-bold text-amber-200">{levelIdx + 1}/{LEVELS.length}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-amber-500/60 uppercase tracking-wider">Doluluk</div>
            <div className={`text-sm font-bold ${pct === 100 ? "text-emerald-400" : "text-amber-200"}`}>{pct}%</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-amber-500/60 uppercase tracking-wider">Fire</div>
            <div className={`text-sm font-bold ${unplaced === 0 ? "text-emerald-400" : "text-amber-200"}`}>{unplaced}</div>
          </div>
          <button
            className="px-3 py-1.5 rounded-lg bg-amber-900/30 border border-amber-800/40 text-amber-300 text-xs hover:bg-amber-800/40 transition"
            onClick={restart}
          >
            Sıfırla
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 overflow-auto">
        <div className="text-xs text-amber-400/50 text-center">{LEVELS[levelIdx].name} — {LEVELS[levelIdx].description}</div>

        <div ref={containerRef} className="relative rounded-xl border border-amber-900/30 overflow-hidden shadow-2xl" style={{ background: "#1a1410" }}>
          <canvas
            ref={canvasRef}
            className="block cursor-crosshair"
            onMouseMove={handleCanvasMove}
            onMouseLeave={handleCanvasLeave}
            onClick={handleCanvasClick}
          />
        </div>

        {error && (
          <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-1.5 pop-in">
            {error}
          </div>
        )}

        {selectedIdx !== null && (
          <div className="flex gap-2">
            <button
              className="px-3 py-1.5 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-xs hover:bg-amber-700/50 transition"
              onClick={handleRotate}
            >
              ↻ Döndür
            </button>
            {engine.placements[selectedIdx] !== null && (
              <button
                className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-xs hover:bg-red-800/50 transition"
                onClick={handleRemovePiece}
              >
                ↩ Kaldır
              </button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-amber-900/30 px-4 py-3">
        <div className="text-[10px] text-amber-500/50 uppercase tracking-wider mb-2">Envanter</div>
        <div className="flex gap-2 flex-wrap items-end min-h-[52px]">
          {engine.pieces.map((p, idx) => (
            <PieceBlock
              key={p.id}
              p={p}
              idx={idx}
              selected={selectedIdx === idx}
              onClick={() => handlePieceClick(idx)}
              onCut={() => handleCut(idx)}
            />
          ))}
          {engine.pieces.length === 0 && (
            <span className="text-xs text-amber-600/40 italic">Parça yok</span>
          )}
        </div>
      </div>

      {cutModalIdx !== null && (
        <CutModal
          piece={engine.pieces[cutModalIdx]}
          onCut={handleCutConfirm}
          onCancel={() => setCutModalIdx(null)}
        />
      )}

      {victory && (
        <VictoryModal
          levelName={LEVELS[levelIdx].name}
          onNext={nextLevel}
          onReset={restart}
        />
      )}
    </div>
  );
}