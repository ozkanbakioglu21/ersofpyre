export interface Piece {
  id: string;
  cellsW: number;
  cellsH: number;
  cut: boolean;
  grouted?: boolean;
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
  { name: "Teras", gridRows: 7, gridCols: 7 },
  { name: "Bahçe Yolu", gridRows: 7, gridCols: 14 },
  { name: "Veranda", gridRows: 14, gridCols: 7 },
  { name: "Avlu", gridRows: 14, gridCols: 14 },
  { name: "Merdiven Yolu", gridRows: 7, gridCols: 21 },
  { name: "Balkon Zemini", gridRows: 14, gridCols: 21 },
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
  grout: string;
  seam: string;
  accent: string;
  text: string;
  shadow: string;
}

export const PALETTES: Palette[] = [
  {
    id: "beyaz",
    name: "Beyaz Mermer",
    bg1: "#f4f4f0",
    bg2: "#ecebe4",
    empty: "#deddd5",
    grid: "rgba(120,120,120,0.16)",
    tileA: "#f8f7f3",
    tileB: "#eae8dd",
    grout: "#dfddd4",
    seam: "rgba(100,100,100,0.32)",
    accent: "#8ea4ab",
    text: "#39424a",
    shadow: "rgba(60,80,90,0.22)",
  },
  {
    id: "tozmavi",
    name: "Toz Mavi Taş",
    bg1: "#edf2f3",
    bg2: "#e3eaec",
    empty: "#d5dfe2",
    grid: "rgba(110,140,150,0.18)",
    tileA: "#d3e2e4",
    tileB: "#bfd2d6",
    grout: "#e2e9eb",
    seam: "rgba(90,120,130,0.34)",
    accent: "#7f9aa0",
    text: "#2f3b40",
    shadow: "rgba(50,80,90,0.22)",
  },
  {
    id: "fildisi",
    name: "Fildişi Traverten",
    bg1: "#f5efe7",
    bg2: "#ede3d5",
    empty: "#e0d6c6",
    grid: "rgba(150,120,80,0.18)",
    tileA: "#f1e4c8",
    tileB: "#e2d0a9",
    grout: "#ece4d3",
    seam: "rgba(120,95,55,0.34)",
    accent: "#c19a5b",
    text: "#463d2e",
    shadow: "rgba(110,85,50,0.22)",
  },
  {
    id: "adacayi",
    name: "Adaçayı Bazalt",
    bg1: "#eaf0e5",
    bg2: "#e0e9d8",
    empty: "#d8e2cf",
    grid: "rgba(100,120,90,0.16)",
    tileA: "#9caf88",
    tileB: "#7e9270",
    grout: "#dfe7d6",
    seam: "rgba(70,90,60,0.34)",
    accent: "#6d825f",
    text: "#37422f",
    shadow: "rgba(55,75,45,0.22)",
  },
  {
    id: "terra",
    name: "Terracotta Tuğla",
    bg1: "#f2e6da",
    bg2: "#ebd9c8",
    empty: "#e3d0bc",
    grid: "rgba(140,90,60,0.16)",
    tileA: "#c96f4a",
    tileB: "#b25e3e",
    grout: "#eee2d4",
    seam: "rgba(100,55,30,0.34)",
    accent: "#a55336",
    text: "#3f2a20",
    shadow: "rgba(92,50,25,0.22)",
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
    return { id: `T${this.idc++}`, cellsW: 7, cellsH: 1, cut: false, grouted: false };
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

    this.pieces[idx] = { id: `${p.id}A`, cellsW: w1, cellsH: h1, cut: true, grouted: false };
    this.pieces.push({ id: `${p.id}B`, cellsW: w2, cellsH: h2, cut: true, grouted: false });
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

  groutAll(): boolean {
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.placements[i] !== null && this.pieces[i]) {
        this.pieces[i].grouted = true;
      }
    }
    return true;
  }

  groutPiece(idx: number): boolean {
    const p = this.pieces[idx];
    if (!p) return false;
    if (this.placements[idx] === null) return false;
    p.grouted = true;
    return true;
  }

  get groutedCells(): number {
    let n = 0;
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.placements[i] !== null && this.pieces[i].grouted) {
        n += this.pieces[i].cellsW * this.pieces[i].cellsH;
      }
    }
    return n;
  }

  get groutedAll(): boolean {
    for (let i = 0; i < this.pieces.length; i++) {
      if (this.placements[i] !== null && !this.pieces[i].grouted) return false;
    }
    return true;
  }

  get groutPercent(): number {
    return this.totalCells > 0 ? Math.round((this.groutedCells / this.totalCells) * 100) : 0;
  }

  get recyclePercent(): number {
    return Math.min(100, Math.round((this.recycleCells / 35) * 100));
  }
}