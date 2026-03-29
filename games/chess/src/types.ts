// Chess type definitions

export type Color = 'white' | 'black'

export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn'

export interface Piece {
  type: PieceType
  color: Color
  hasMoved: boolean
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
  promotion?: PieceType
  isCastle?: boolean
  isEnPassant?: boolean
  capturedPiece?: Piece
}

export type GameStatus =
  | 'ready'
  | 'playing'
  | 'check'
  | 'checkmate'
  | 'stalemate'
  | 'player-won'
  | 'ai-won'
