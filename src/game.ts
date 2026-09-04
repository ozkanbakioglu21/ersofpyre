export interface Piece {
  id: string;
  cellsW: number;
  cellsH: number;
  type: "uncut" | "cut";
  originalId?: string;
}

export interface PlacedPiece {
  row: number;
  col: number;
}

export interface Level {
  name: string;
  description: string;
  gridRows: number;
  gridCols: number;
  startingTiles: { w: number; h: number }[];
}

export const LEVELS: Level[] = [
  {
    name: "Tek Sıra",
    description: "Tek bir parkeyi yerleştir",
    gridRows: 1,
    gridCols: 7,
    startingTiles: [{ w: 7, h: 1 }],
  },
  {
    name: "Çift Sıra",
    description: "İki sırayı doldur",
    gridRows: 2,
    gridCols: 7,
    startingTiles: [{ w: 7, h: 1 }, { w: 7, h: 1 }],
  },
  {
    name: "Geniş Oda",
    description: "Geniş odada derz kuralına dikkat",
    gridRows: 2,
    gridCols: 14,
    startingTiles: [
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
    ],
  },
  {
    name: "Üçlü Sıra",
    description: "Üç sırayı kuralına göre doldur",
    gridRows: 3,
    gridCols: 14,
    startingTiles: [
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
      { w: 7, h: 1 },
    ],
  },
  {
    name: "Kare Oda",
    description: "Kare odada stratejik yerleştirme",
    gridRows: 7,
    gridCols: 7,
    startingTiles: [
      { w: 7, h: 1 }, { w: 7, h: 1 }, { w: 7, h: 1 },
      { w: 7, h: 1 }, { w: 7, h: 1 }, { w: 7, h: 1 },
      { w: 7, h: 1 },
    ],
  },
];

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export class GameEngine {
  grid: number[][];
  pieces: Piece[];
  placements: (PlacedPiece | null)[];
  level: Level;

  constructor(level: Level) {
    this.level = level;
    this.grid = Array.from({ length: level.gridRows }, () =>
      new Array<number>(level.gridCols).fill(-1)
    );
    this.pieces = level.startingTiles.map((t, i) => ({
      id: `tile-${i}`,
      cellsW: t.w,
      cellsH: t.h,
      type: "uncut" as const,
    }));
    this.placements = new Array<PlacedPiece | null>(this.pieces.length).fill(null);
  }

  selectPiece(_idx: number): void {}

  rotatePiece(idx: number): boolean {
    const p = this.pieces[idx];
    if (!p) return false;
    if (this.placements[idx] !== null) return false;
    const tmp = p.cellsW;
    p.cellsW = p.cellsH;
    p.cellsH = tmp;
    return true;
  }

  cutPiece(idx: number, cutPos: number): boolean {
    const p = this.pieces[idx];
    if (!p || p.type !== "uncut") return false;
    if (this.placements[idx] !== null) return false;

    const isH = p.cellsW >= p.cellsH;
    let w1: number, h1: number, w2: number, h2: number;
    if (isH) {
      if (cutPos < 1 || cutPos >= p.cellsW) return false;
      w1 = cutPos; h1 = p.cellsH;
      w2 = p.cellsW - cutPos; h2 = p.cellsH;
    } else {
      if (cutPos < 1 || cutPos >= p.cellsH) return false;
      w1 = p.cellsW; h1 = cutPos;
      w2 = p.cellsW; h2 = p.cellsH - cutPos;
    }

    this.pieces[idx] = {
      id: `${p.id}-L`,
      cellsW: w1,
      cellsH: h1,
      type: "cut",
      originalId: p.id,
    };
    this.placements[idx] = null;

    this.pieces.push({
      id: `${p.id}-R`,
      cellsW: w2,
      cellsH: h2,
      type: "cut",
      originalId: p.id,
    });
    this.placements.push(null);

    return true;
  }

  canPlace(pieceIdx: number, row: number, col: number): ValidationResult {
    const p = this.pieces[pieceIdx];
    if (!p) return { ok: false, reason: "Parça bulunamadı" };
    if (this.placements[pieceIdx] !== null) return { ok: false, reason: "Parça zaten yerleştirilmiş" };

    if (row < 0 || col < 0)
      return { ok: false, reason: "Geçersiz konum" };
    if (row + p.cellsH > this.level.gridRows)
      return { ok: false, reason: "Odanın dışına taşıyor" };
    if (col + p.cellsW > this.level.gridCols)
      return { ok: false, reason: "Odanın dışına taşıyor" };

    for (let r = row; r < row + p.cellsH; r++) {
      for (let c = col; c < col + p.cellsW; c++) {
        if (this.grid[r][c] !== -1)
          return { ok: false, reason: "Başka bir parçayla çakışıyor" };
      }
    }

    if (!this.checkJointForPlacement(pieceIdx, row, col))
      return { ok: false, reason: "Derz kuralı ihlali! Komşu sıralarda aynı hizada dikiş var" };

    return { ok: true };
  }

  placePiece(pieceIdx: number, row: number, col: number): void {
    const p = this.pieces[pieceIdx];
    if (!p) return;

    for (let r = row; r < row + p.cellsH; r++) {
      for (let c = col; c < col + p.cellsW; c++) {
        this.grid[r][c] = pieceIdx;
      }
    }
    this.placements[pieceIdx] = { row, col };
  }

  removePiece(pieceIdx: number): void {
    for (let r = 0; r < this.level.gridRows; r++) {
      for (let c = 0; c < this.level.gridCols; c++) {
        if (this.grid[r][c] === pieceIdx) {
          this.grid[r][c] = -1;
        }
      }
    }
    this.placements[pieceIdx] = null;
  }

  getJointsInRow(row: number, grid?: number[][]): Set<number> {
    const g = grid ?? this.grid;
    const joints = new Set<number>();
    for (let c = 0; c < this.level.gridCols - 1; c++) {
      if (g[row][c] !== -1 && g[row][c + 1] !== -1 && g[row][c] !== g[row][c + 1]) {
        joints.add(c + 1);
      }
    }
    return joints;
  }

  checkJointRule(): boolean {
    for (let row = 0; row < this.level.gridRows - 1; row++) {
      const j1 = this.getJointsInRow(row);
      const j2 = this.getJointsInRow(row + 1);
      for (const j of j1) {
        if (j2.has(j)) return false;
      }
    }
    return true;
  }

  private checkJointForPlacement(pieceIdx: number, row: number, col: number): boolean {
    const p = this.pieces[pieceIdx];
    const temp = this.grid.map((r) => [...r]);
    for (let r = row; r < row + p.cellsH; r++) {
      for (let c = col; c < col + p.cellsW; c++) {
        temp[r][c] = pieceIdx;
      }
    }

    const rows = new Set<number>();
    for (let r = row; r < row + p.cellsH; r++) {
      rows.add(r);
      if (r > 0) rows.add(r - 1);
      if (r < this.level.gridRows - 1) rows.add(r + 1);
    }

    for (const r of rows) {
      if (r < 0 || r >= this.level.gridRows) continue;
      for (let rr = r; rr < this.level.gridRows - 1; rr++) {
        if (!rows.has(rr) && !rows.has(rr + 1)) continue;
        const j1 = this.getJointsInRow(rr, temp);
        const j2 = this.getJointsInRow(rr + 1, temp);
        for (const j of j1) {
          if (j2.has(j)) return false;
        }
      }
    }
    return true;
  }

  checkVictory(): ValidationResult {
    for (let r = 0; r < this.level.gridRows; r++) {
      for (let c = 0; c < this.level.gridCols; c++) {
        if (this.grid[r][c] === -1)
          return { ok: false, reason: "Tüm hücreler dolmadı" };
      }
    }
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.placements[i] === null)
        return { ok: false, reason: "Envanterde parça kaldı" };
    }
    if (!this.checkJointRule())
      return { ok: false, reason: "Derz kuralı ihlali" };
    return { ok: true };
  }

  getUnplacedCount(): number {
    return this.placements.filter((p) => p === null).length;
  }

  getTotalCells(): number {
    return this.level.gridRows * this.level.gridCols;
  }

  getFilledCells(): number {
    let count = 0;
    for (let r = 0; r < this.level.gridRows; r++) {
      for (let c = 0; c < this.level.gridCols; c++) {
        if (this.grid[r][c] !== -1) count++;
      }
    }
    return count;
  }

  getViolationRows(): number[] {
    const violations: number[] = [];
    for (let row = 0; row < this.level.gridRows - 1; row++) {
      const j1 = this.getJointsInRow(row);
      const j2 = this.getJointsInRow(row + 1);
      for (const j of j1) {
        if (j2.has(j)) {
          violations.push(row);
          violations.push(row + 1);
        }
      }
    }
    return [...new Set(violations)];
  }
}