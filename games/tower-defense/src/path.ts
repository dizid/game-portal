// Hardcoded winding path for 20x15 grid
// Each entry is [col, row] — the path goes left→right roughly with turns

export interface PathPoint {
  col: number
  row: number
}

// Path winds across the 20x15 grid
// Enemies enter from the left and exit on the right
export const PATH_POINTS: PathPoint[] = [
  { col: 0,  row: 2  },
  { col: 4,  row: 2  },
  { col: 4,  row: 6  },
  { col: 1,  row: 6  },
  { col: 1,  row: 11 },
  { col: 6,  row: 11 },
  { col: 6,  row: 8  },
  { col: 10, row: 8  },
  { col: 10, row: 3  },
  { col: 14, row: 3  },
  { col: 14, row: 10 },
  { col: 17, row: 10 },
  { col: 17, row: 6  },
  { col: 19, row: 6  },
]

// Build a Set of all cells that are part of the path (blocked from tower placement)
export function buildPathCells(cellSize: number): Set<string> {
  const cells = new Set<string>()

  for (let i = 0; i + 1 < PATH_POINTS.length; i++) {
    const a = PATH_POINTS[i]
    const b = PATH_POINTS[i + 1]

    if (a.col === b.col) {
      // Vertical segment
      const minR = Math.min(a.row, b.row)
      const maxR = Math.max(a.row, b.row)
      for (let r = minR; r <= maxR; r++) {
        cells.add(`${r},${a.col}`)
      }
    } else {
      // Horizontal segment
      const minC = Math.min(a.col, b.col)
      const maxC = Math.max(a.col, b.col)
      for (let c = minC; c <= maxC; c++) {
        cells.add(`${a.row},${c}`)
      }
    }
  }

  return cells
}

// Convert path points to world-pixel coordinates (center of each cell)
export function pathToPixels(cellSize: number): Array<{ x: number; y: number }> {
  return PATH_POINTS.map(p => ({
    x: p.col * cellSize + cellSize / 2,
    y: p.row * cellSize + cellSize / 2,
  }))
}
