import { useState, useRef, useCallback, useEffect } from "react";
import { GameEngine, LEVELS } from "./game";
import type { Piece } from "./game";

const CELL = 32;

function PieceBlock({ p, idx, selected, onClick, onCut }: {
  p: Piece; idx: number; selected: boolean; onClick: () => void; onCut: () => void;
}) {
  const w = p.cellsW * CELL;
  const h = p.cellsH * CELL;
  return (
    <div
      className={`relative flex-shrink-0 rounded-lg border-2 cursor-pointer transition-all duration-150
        ${selected ? "border-amber-400 shadow-[0_0_16px_rgba(245,158,11,0.5)] scale-105"
          : "border-amber-900/60 hover:border-amber-600/80 hover:shadow-lg"}`}
      style={{
        width: Math.max(w, 36), height: Math.max(h, 36),
        background: selected ? "linear-gradient(135deg, #92400e, #78350f)"
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
        >✂</button>
      )}
    </div>
  );
}

function CutModal({ piece, onCut, onCancel }: {
  piece: Piece; onCut: (pos: number) => void; onCancel: () => void;
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
      <div className="bg-[#2a1f14] border border-amber-900/50 rounded-2xl p-6 w-[340px] shadow-2xl pop-in" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-amber-200 mb-4 text-center">Kesme Paneli</h3>
        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="text-center">
            <div className="text-[10px] text-amber-400/70 mb-1">Sol</div>
            <div className="rounded border border-amber-700/50 mx-auto"
              style={{ width: Math.max(w1 * 12, 24), height: Math.max(h1 * 12, 24), background: "linear-gradient(135deg, #92400e, #78350f)" }} />
            <div className="text-xs text-amber-300 mt-1 font-mono">{w1 * 5}×{h1 * 5}</div>
          </div>
          <div className="text-2xl text-amber-500/50">+</div>
          <div className="text-center">
            <div className="text-[10px] text-amber-400/70 mb-1">Sağ</div>
            <div className="rounded border border-amber-700/50 mx-auto"
              style={{ width: Math.max(w2 * 12, 24), height: Math.max(h2 * 12, 24), background: "linear-gradient(135deg, #78350f, #451a03)" }} />
            <div className="text-xs text-amber-300 mt-1 font-mono">{w2 * 5}×{h2 * 5}</div>
          </div>
        </div>
        <input type="range" min={1} max={maxCut} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="w-full accent-amber-500 mb-4" />
        <div className="text-center text-xs text-amber-400/60 mb-4">Konum: {pos} hücre ({pos * 5} birim)</div>
        <div className="flex gap-3">
          <button className="flex-1 py-2 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-sm font-medium hover:bg-amber-700/50 transition" onClick={onCancel}>İptal</button>
          <button className="flex-1 py-2 rounded-lg bg-amber-600 text-[#1a1410] text-sm font-bold hover:bg-amber-500 transition" onClick={() => onCut(pos)}>Kes</button>
        </div>
      </div>
    </div>
  );
}

function VictoryModal({ levelName, onNext, onReset }: { levelName: string; onNext: () => void; onReset: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#2a1f14] border border-amber-700/50 rounded-2xl p-8 w-[320px] shadow-2xl text-center pop-in">
        <div className="text-4xl mb-3">🎉</div>
        <h2 className="text-xl font-bold text-amber-200 mb-1">Tebrikler!</h2>
        <p className="text-amber-400/70 text-sm mb-6">"{levelName}" tamamlandı</p>
        <div className="flex gap-3">
          <button className="flex-1 py-2.5 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-sm hover:bg-amber-700/50 transition" onClick={onReset}>Tekrar Oyna</button>
          <button className="flex-1 py-2.5 rounded-lg bg-amber-600 text-[#1a1410] text-sm font-bold hover:bg-amber-500 transition" onClick={onNext}>Sonraki</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [levelIdx, setLevelIdx] = useState(0);
  const engineRef = useRef(new GameEngine(LEVELS[0]));
  const [, forceRender] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [cutModalIdx, setCutModalIdx] = useState<number | null>(null);
  const [victory, setVictory] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const tick = useCallback(() => forceRender((n) => n + 1), []);

  const restart = useCallback(() => {
    engineRef.current = new GameEngine(LEVELS[levelIdx]);
    setSelectedIdx(null);
    setHoverCell(null);
    setVictory(false);
    setError(null);
    tick();
  }, [levelIdx, tick]);

  const nextLevel = useCallback(() => {
    const next = Math.min(levelIdx + 1, LEVELS.length - 1);
    setLevelIdx(next);
    engineRef.current = new GameEngine(LEVELS[next]);
    setSelectedIdx(null);
    setHoverCell(null);
    setVictory(false);
    setError(null);
    tick();
  }, [levelIdx, tick]);

  const engine = engineRef.current;

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
    setCutModalIdx(null);
    setSelectedIdx(null);
    tick();
  }, [cutModalIdx, engine, tick]);

  const handleRotate = useCallback(() => {
    if (selectedIdx === null) return;
    engine.rotatePiece(selectedIdx);
    tick();
  }, [selectedIdx, engine, tick]);

  const handleRemovePiece = useCallback(() => {
    if (selectedIdx === null) return;
    if (engine.placements[selectedIdx] === null) return;
    engine.removePiece(selectedIdx);
    setSelectedIdx(null);
    setError(null);
    tick();
  }, [selectedIdx, engine, tick]);

  const handleCanvasClick = useCallback(() => {
    if (selectedIdx === null || !hoverCell) return;
    const result = engine.canPlace(selectedIdx, hoverCell.row, hoverCell.col);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    engine.placePiece(selectedIdx, hoverCell.row, hoverCell.col);
    setSelectedIdx(null);
    setError(null);
    tick();

    const v = engine.checkVictory();
    if (v.ok) setVictory(true);
  }, [selectedIdx, hoverCell, engine, tick]);

  const handleCanvasMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor((e.clientX - rect.left) / CELL);
    const row = Math.floor((e.clientY - rect.top) / CELL);
    if (row >= 0 && row < engine.level.gridRows && col >= 0 && col < engine.level.gridCols) {
      setHoverCell({ row, col });
    } else {
      setHoverCell(null);
    }
  }, [engine]);

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

    const violations = engine.getViolationRows();

    for (let r = 0; r < engine.level.gridRows; r++) {
      for (let c = 0; c < engine.level.gridCols; c++) {
        const x = c * CELL;
        const y = r * CELL;
        const pi = engine.grid[r][c];

        if (violations.includes(r)) {
          ctx.fillStyle = "rgba(239,68,68,0.1)";
          ctx.fillRect(x, y, CELL, CELL);
        }

        if (pi === -1) {
          ctx.fillStyle = "#2a2018";
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
        } else {
          const shade = 28 + ((pi * 7) % 12);
          ctx.fillStyle = `hsl(${28 + ((pi * 13) % 16)}, ${48 + ((pi * 11) % 14)}%, ${shade}%)`;
          ctx.fillRect(x + 1, y + 1, CELL - 2, CELL - 2);
          ctx.strokeStyle = "rgba(180,130,60,0.25)";
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
        }
        ctx.strokeStyle = "rgba(120,90,50,0.12)";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, CELL, CELL);
      }
    }

    if (selectedIdx !== null && hoverCell) {
      const p = engine.pieces[selectedIdx];
      if (p) {
        const ok = engine.canPlace(selectedIdx, hoverCell.row, hoverCell.col).ok;
        ctx.fillStyle = ok ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)";
        ctx.fillRect(hoverCell.col * CELL, hoverCell.row * CELL, p.cellsW * CELL, p.cellsH * CELL);
        ctx.strokeStyle = ok ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(hoverCell.col * CELL + 1, hoverCell.row * CELL + 1, p.cellsW * CELL - 2, p.cellsH * CELL - 2);
      }
    }

    if (selectedIdx !== null && engine.placements[selectedIdx]) {
      const pl = engine.placements[selectedIdx]!;
      const p = engine.pieces[selectedIdx];
      if (p) {
        ctx.strokeStyle = "rgba(245,158,11,0.8)";
        ctx.lineWidth = 3;
        ctx.strokeRect(pl.col * CELL + 1, pl.row * CELL + 1, p.cellsW * CELL - 2, p.cellsH * CELL - 2);
      }
    }
  }, [engine, selectedIdx, hoverCell]);

  const filled = engine.getFilledCells();
  const total = engine.getTotalCells();
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const unplaced = engine.getUnplacedCount();
  const hasViolations = !engine.checkJointRule() && filled > 0;

  return (
    <div className="h-full flex flex-col" style={{ background: "linear-gradient(180deg, #1a1410, #120e0a)" }}>
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
            <div className={`text-sm font-bold ${unplaced === 0 && filled === total ? "text-emerald-400" : unplaced > 0 ? "text-amber-200" : "text-amber-200"}`}>{unplaced}</div>
          </div>
          {hasViolations && (
            <div className="px-2 py-1 rounded bg-red-900/40 border border-red-700/40 text-red-300 text-[10px] font-bold animate-pulse">
              DERZ HATASI
            </div>
          )}
          <button className="px-3 py-1.5 rounded-lg bg-amber-900/30 border border-amber-800/40 text-amber-300 text-xs hover:bg-amber-800/40 transition" onClick={restart}>Sıfırla</button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 overflow-auto">
        <div className="text-xs text-amber-400/50 text-center">{LEVELS[levelIdx].name} — {LEVELS[levelIdx].description}</div>
        <div className="rounded-xl border border-amber-900/30 overflow-hidden shadow-2xl" style={{ background: "#1a1410" }}>
          <canvas ref={canvasRef} className="block cursor-crosshair" onMouseMove={handleCanvasMove} onMouseLeave={() => setHoverCell(null)} onClick={handleCanvasClick} />
        </div>
        {error && <div className="text-xs text-red-400 bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-1.5 pop-in">{error}</div>}
        {selectedIdx !== null && (
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-amber-700/30 border border-amber-700/50 text-amber-200 text-xs hover:bg-amber-700/50 transition" onClick={handleRotate}>↻ Döndür</button>
            {engine.placements[selectedIdx] !== null && (
              <button className="px-3 py-1.5 rounded-lg bg-red-900/30 border border-red-800/50 text-red-300 text-xs hover:bg-red-800/50 transition" onClick={handleRemovePiece}>↩ Kaldır</button>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-amber-900/30 px-4 py-3">
        <div className="text-[10px] text-amber-500/50 uppercase tracking-wider mb-2">Envanter</div>
        <div className="flex gap-2 flex-wrap items-end min-h-[52px]">
          {engine.pieces.map((p, idx) => (
            <PieceBlock key={p.id} p={p} idx={idx} selected={selectedIdx === idx}
              onClick={() => handlePieceClick(idx)} onCut={() => handleCut(idx)} />
          ))}
          {engine.pieces.length === 0 && <span className="text-xs text-amber-600/40 italic">Parça yok</span>}
        </div>
      </div>

      {cutModalIdx !== null && (
        <CutModal piece={engine.pieces[cutModalIdx]} onCut={handleCutConfirm} onCancel={() => setCutModalIdx(null)} />
      )}
      {victory && (
        <VictoryModal levelName={LEVELS[levelIdx].name} onNext={nextLevel} onReset={restart} />
      )}
    </div>
  );
}