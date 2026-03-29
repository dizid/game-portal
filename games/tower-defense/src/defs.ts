// Tower and enemy definitions

import type { EnemyDef, EnemyType, TowerDef, TowerType } from './types.js'

export const TOWER_DEFS: Record<TowerType, TowerDef> = {
  arrow: {
    type: 'arrow',
    cost: 50,
    range: 3,
    damage: 15,
    fireRate: 2.0,
    color: '#a0c040',
    label: 'Arrow',
    aoe: false,
    slow: false,
  },
  cannon: {
    type: 'cannon',
    cost: 100,
    range: 2.5,
    damage: 60,
    fireRate: 0.6,
    color: '#808080',
    label: 'Cannon',
    aoe: true,
    slow: false,
  },
  ice: {
    type: 'ice',
    cost: 75,
    range: 2.8,
    damage: 8,
    fireRate: 1.2,
    color: '#60c8ff',
    label: 'Ice',
    aoe: false,
    slow: true,
  },
  laser: {
    type: 'laser',
    cost: 150,
    range: 4,
    damage: 35,
    fireRate: 3.0,
    color: '#ff4080',
    label: 'Laser',
    aoe: false,
    slow: false,
  },
}

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  basic: {
    type: 'basic',
    maxHp: 100,
    speed: 60,
    reward: 10,
    color: '#e06020',
    radius: 10,
  },
  fast: {
    type: 'fast',
    maxHp: 60,
    speed: 130,
    reward: 15,
    color: '#e0d020',
    radius: 8,
  },
  tank: {
    type: 'tank',
    maxHp: 300,
    speed: 35,
    reward: 30,
    color: '#6080e0',
    radius: 14,
  },
  boss: {
    type: 'boss',
    maxHp: 1000,
    speed: 25,
    reward: 150,
    color: '#cc30cc',
    radius: 20,
  },
}

// Build the enemy spawn list for a given wave number (1-based)
export function buildWaveEnemies(wave: number): EnemyType[] {
  const list: EnemyType[] = []

  const count = 8 + wave * 3

  for (let i = 0; i < count; i++) {
    if (wave >= 5 && i % 15 === 14) {
      list.push('boss')
    } else if (wave >= 3 && i % 5 === 4) {
      list.push('tank')
    } else if (wave >= 2 && i % 3 === 2) {
      list.push('fast')
    } else {
      list.push('basic')
    }
  }

  // Boss every 5 waves: ensure at least one boss in addition to the above
  if (wave % 5 === 0) {
    list.push('boss')
  }

  return list
}
