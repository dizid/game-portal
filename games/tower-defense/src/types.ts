// Tower Defense type definitions

export type TowerType = 'arrow' | 'cannon' | 'ice' | 'laser'

export interface TowerDef {
  type: TowerType
  cost: number
  range: number      // in grid cells
  damage: number
  fireRate: number   // shots per second
  color: string
  label: string
  aoe: boolean       // area-of-effect (cannon)
  slow: boolean      // applies slow (ice)
}

export interface Tower {
  id: number
  type: TowerType
  row: number
  col: number
  cooldown: number   // frames until next shot
}

export type EnemyType = 'basic' | 'fast' | 'tank' | 'boss'

export interface EnemyDef {
  type: EnemyType
  maxHp: number
  speed: number      // pixels per second
  reward: number     // gold on kill
  color: string
  radius: number
}

export interface Enemy {
  id: number
  type: EnemyType
  hp: number
  maxHp: number
  speed: number      // current speed (can be slowed)
  baseSpeed: number
  slowTimer: number  // frames of slow remaining
  reward: number
  color: string
  radius: number
  // Position along the path
  pathIndex: number  // current path segment index
  t: number          // progress along that segment [0,1]
  // World-pixel position (derived, used for rendering/collision)
  x: number
  y: number
}

export interface Projectile {
  id: number
  x: number
  y: number
  targetId: number
  damage: number
  speed: number
  color: string
  aoe: boolean
  aoeRadius: number
}

export interface FloatText {
  id: number
  x: number
  y: number
  text: string
  life: number   // frames remaining
  color: string
}
