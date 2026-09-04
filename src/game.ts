export interface Piece {
  id: string;
  cellsW: number;
  cellsH: number;
  cut: boolean;
}

export interface Placed {
  row: number;
  col: number;
}

export interface Room {
  name: string;
  gridRows: number;
  gridCols: number;
}

export const ROOMS: Room[] = [
  { name: "Cozy Reading Nook", gridRows: 7, gridCols: 7 },
  { name: "Morning Coffee Corner", gridRows: 7, gridCols: 14 },
  { name: "Warm Hallway", gridRows: 14, gridCols: 7 },
  { name: "Sunlit Studio", gridRows: 14, gridCols: 14 },
  { name: "Quiet Bedroom", gridRows: 7, gridCols: 21 },
  { name: "Serenity Garden", gridRows: 14, gridCols: 21 },
];

export interface Palette {
  id: string;
  name: string;
  bg1: string;
  bg2: string;
  empty: string;
  grid: string;
  tileA: string;
  tileB: string;
  seam: string;
  accent: string;
  text: string;
  shadow: string;
}

export const PALETTES: Palette[] = [
  {
    id: "nordic",
    name: "Nordik",
    bg1: "#f6f2ea",
    bg2: "#efe7d7",
    empty: "#e8e1d1",
    grid: "rgba(120,100,70,0.14)",
    tileA: "#dcc19b",
    tileB: "#cfa97b",
    seam: "rgba(110,82,54,0.45)",
    accent: "#b98a5e",
    text: "#4a4438",
    shadow: "rgba(90,60,30,0.28)",
  },
  {
    id: "japandi",
    name: "Japandi",
    bg1: "#efe9df",
    bg2: "#e6ddcd",
    empty: "#dfd6c3",
    grid: "rgba(110,95,70,0.15)",
    tileA: "#c9a66b",
    tileB: "#a8864e",
    seam: "rgba(90,66,30,0.5)",
    accent: "#8a6a3d",
    text: "#3e392f",
    shadow: "rgba(70,50,20,0.3)",
  },
  {
    id: "terracotta",
    name: "Terracotta",
    bg1: "#f2e6da",
    bg2: "#ebd9c8",
    empty: "#e3d0bc",
    grid: "rgba(140,90,60,0.15)",
    tileA: "#c96f4a",
    tileB: "#b25e3e",
    seam: "rgba(100,55,30,0.5)",
    accent: "#a55336",
    text: "#3f2a20",
    shadow: "rgba(92,50,25,0.3)",
  },
  {
    id: "sage",
    name: "Adaçayı",
    bg1: "#eaf0e5",
    bg2: "#e0e9d8",
    empty: "#d8e2cf",
    grid: "rgba(100,120,90,0.16)",
    tileA: "#9caf88",
    tileB: "#7e9270",
    seam: "rgba(70,90,60,0.5)",
    accent: "#6d825f",
    text: "#37422f",
    shadow: "rgba(55,75,45,0.3)",
  },
];

export class ZenEngine {
  grid: number[][];
  pieces: Piece[];
  placements: (Placed | null)[];
  room: Room;
  recycleCells = 0;
  private idc = 0;

  constructor(room: Room) {
    this.room = room;
    this.grid = Array.from({ length: room.gridRows }, () =>
      new Array<number>(room.gridCols).fill(-1)
    );
    this.pieces = [];
    this.placements = [];
    this.fillFresh();
  }

  private newPiece(): Piece {
    return { id: `T${this.idc++}`, cellsW: 7, cellsH: 1, cut: false };
  }

  private fillFresh(): void {
    while (this.pieces.filter((p) => !p.cut).length < 2) {
      this.pieces.push(this.newPiece());
      this.placements.push(null);
    }
  }

  rotate(idx: number): boolean {
    const p = this.pieces[idx];
    if (!p || this.placements[idx] !== null) return false;
    const t = p.cellsW;
    p.cellsW = p.cellsH;
    p.cellsH = t;
    return true;
  }

  cutRange(idx: number): number {
    const p = this.pieces[idx];
    if (!p) return 0;
    return Math.max(p.cellsW, p.cellsH) - 1;
  }

  cutPiece(idx: number, cells: number): boolean {
    const p = this.pieces[idx];
    if (!p || p.cut || this.placements[idx] !== null) return false;
    const max = Math.max(p.cellsW, p.cellsH);
    if (cells < 1 || cells >= max) return false;

    const horizontal = p.cellsW >= p.cellsH;
    let w1 = p.cellsW, h1 = p.cellsH, w2 = p.cellsW, h2 = p.cellsH;
    if (horizontal) { w1 = cells; w2 = p.cellsW - cells; }
    else { h1 = cells; h2 = p.cellsH - cells; }

    this.pieces[idx] = { id: `${p.id}A`, cellsW: w1, cellsH: h1, cut: true };
    this.pieces.push({ id: `${p.id}B`, cellsW: w2, cellsH: h2, cut: true });
    this.placements.push(null);

    this.fillFresh();
    return true;
  }

  canPlace(idx: number, row: number, col: number): boolean {
    const p = this.pieces[idx];
    if (!p || this.placements[idx] !== null) return false;
    if (row < 0 || col < 0) return false;
    if (row + p.cellsH > this.room.gridRows) return false;
    if (col + p.cellsW > this.room.gridCols) return false;
    for (let r = row; r < row + p.cellsH; r++) {
      for (let c = col; c < col + p.cellsW; c++) {
        if (this.grid[r][c] !== -1) return false;
      }
    }
    return true;
  }

  place(idx: number, row: number, col: number): boolean {
    if (!this.canPlace(idx, row, col)) return false;
    const p = this.pieces[idx];
    for (let r = row; r < row + p.cellsH; r++) {
      for (let c = col; c < col + p.cellsW; c++) {
        this.grid[r][c] = idx;
      }
    }
    this.placements[idx] = { row, col };
    this.fillFresh();
    return true;
  }

  matrixOf(idx: number): Placed | null {
    return this.placements[idx];
  }

  recycle(idx: number): boolean {
    const p = this.pieces[idx];
    if (!p) return false;
    if (this.placements[idx] !== null) return false;
    const cells = p.cellsW * p.cellsH;
    this.pieces.splice(idx, 1);
    this.placements.splice(idx, 1);
    this.recycleCells += cells;
    this.fillFresh();
    return true;
  }

  collectNewTile(): boolean {
    if (this.recycleCells >= 35) {
      this.recycleCells -= 35;
      this.pieces.push(this.newPiece());
      this.placements.push(null);
      return true;
    }
    return false;
  }

  get filledCells(): number {
    let n = 0;
    for (let r = 0; r < this.room.gridRows; r++) {
      for (let c = 0; c < this.room.gridCols; c++) {
        if (this.grid[r][c] !== -1) n++;
      }
    }
    return n;
  }

  get totalCells(): number {
    return this.room.gridRows * this.room.gridCols;
  }

  get percent(): number {
    return this.totalCells > 0 ? Math.round((this.filledCells / this.totalCells) * 100) : 0;
  }

  get recyclePercent(): number {
    return Math.min(100, Math.round((this.recycleCells / 35) * 100));
  }
}