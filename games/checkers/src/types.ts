// Checkers type definitions

export type Color = 'red' | 'black'

export interface Piece {
  color: Color
  isKing: boolean
}

export type Square = Piece | null

export type Board = Square[][]

export interface Position {
  row: number
  col: number
}

export interface Move {
  from: Position
  to: Position
  captures: Position[] // squares of captured pieces
}
