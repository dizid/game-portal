// Text RPG — DOM-based text adventure with stats, combat, and multiple paths

import { gameSDK } from '@game-portal/game-sdk'
import { audio } from './audio.js'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Choice {
  text: string
  nextId: string
  statCheck?: { stat: 'hp' | 'gold' | 'attack' | 'defense'; min: number }
  reward?: { gold?: number; hp?: number; attack?: number; defense?: number; item?: string }
  cost?: { gold?: number; hp?: number }
  danger?: boolean
}

interface StoryNode {
  id: string
  text: string
  choices: Choice[]
  isEnd?: boolean
  isVictory?: boolean
}

interface PlayerStats {
  hp: number
  maxHp: number
  gold: number
  attack: number
  defense: number
  items: string[]
  dragonDefeated: boolean
}

// ── Story nodes ───────────────────────────────────────────────────────────────

const STORY: Record<string, StoryNode> = {
  start: {
    id: 'start',
    text: 'You stand at the gates of Ironhold village. The villagers look worried — strange creatures have been terrorizing the forest road to the east. An old blacksmith calls out to you.',
    choices: [
      { text: 'Speak with the blacksmith', nextId: 'blacksmith' },
      { text: 'Head straight into the forest', nextId: 'forest_enter', danger: true },
      { text: 'Check the village market first', nextId: 'market' },
      { text: 'Rest at the inn (heal 20 HP, free)', nextId: 'inn_free', reward: { hp: 20 } },
    ],
  },

  blacksmith: {
    id: 'blacksmith',
    text: 'The old blacksmith greets you gruffly. "Adventurer! The forest wolf pack has grown bold. Here — take this iron sword. It\'s not much, but it\'ll help." He hands you a blade and 5 gold coins.',
    choices: [
      { text: 'Accept the sword (+3 ATK, +5g)', nextId: 'village_plaza', reward: { attack: 3, gold: 5, item: 'Iron Sword' } },
      { text: 'Decline and head to the market', nextId: 'market' },
    ],
  },

  market: {
    id: 'market',
    text: 'The village market is bustling despite the danger. A merchant eyes you hopefully.\n\n"I sell quality equipment, adventurer!"\n\n• Sword: +3 ATK (20g)\n• Shield: +3 DEF (15g)\n• Potion: +30 HP (10g)',
    choices: [
      { text: 'Buy Sword (+3 ATK)', nextId: 'market', cost: { gold: 20 }, reward: { attack: 3, item: 'Steel Sword' } },
      { text: 'Buy Shield (+3 DEF)', nextId: 'market', cost: { gold: 15 }, reward: { defense: 3, item: 'Wooden Shield' } },
      { text: 'Buy Potion (+30 HP)', nextId: 'market', cost: { gold: 10 }, reward: { hp: 30, item: 'Health Potion' } },
      { text: 'Leave for the forest road', nextId: 'forest_enter' },
    ],
  },

  inn_free: {
    id: 'inn_free',
    text: 'The innkeeper, a kind woman, sees your travel-worn face and lets you rest for free. "The village needs brave souls right now," she says.\n\nYou sleep soundly and wake refreshed.',
    choices: [
      { text: 'Head to the village plaza', nextId: 'village_plaza' },
      { text: 'Check the market before leaving', nextId: 'market' },
    ],
  },

  village_plaza: {
    id: 'village_plaza',
    text: 'The village elder finds you in the plaza. "The forest has three threats: wolves on the road, a bandit camp in the ravine, and deep in the cave — a mountain troll guards the path to the mountain pass."\n\n"But beware the cave, young one. The dragon on the peak is the true evil."',
    choices: [
      { text: 'Enter the forest road', nextId: 'forest_enter' },
      { text: 'Buy supplies at the market', nextId: 'market' },
    ],
  },

  forest_enter: {
    id: 'forest_enter',
    text: 'You step onto the shadowed forest road. Tall pines close in around you. A twig snaps somewhere in the darkness to your left.\n\nSomething is watching you.',
    choices: [
      { text: 'Draw your weapon and wait', nextId: 'wolf_encounter' },
      { text: 'Call out a challenge', nextId: 'bandit_ambush', danger: true },
      { text: 'Move quickly toward the ravine path', nextId: 'forest_path' },
      { text: 'Investigate the sound', nextId: 'merchant_encounter', reward: { gold: 15 } },
    ],
  },

  wolf_encounter: {
    id: 'wolf_encounter',
    text: 'Three wolves emerge from the trees — grey, scarred, and hungry. They circle you slowly, looking for an opening.\n\nYou grip your weapon tightly.',
    choices: [
      { text: 'Fight the wolves!', nextId: 'wolf_combat' },
      { text: 'Try to scare them off (loud shout)', nextId: 'wolf_scared' },
      { text: 'Back away slowly toward a tree', nextId: 'wolf_escape' },
    ],
  },

  wolf_combat: {
    id: 'wolf_combat',
    text: '',  // filled by combat engine
    choices: [],
  },

  wolf_scared: {
    id: 'wolf_scared',
    text: 'You let out a fierce war cry, waving your arms. Two wolves scatter immediately. The alpha hesitates, then follows. You exhale shakily.\n\nYou find a pouch the wolves guarded — 8 gold inside.',
    choices: [
      { text: 'Continue deeper into the forest', nextId: 'forest_path', reward: { gold: 8 } },
    ],
  },

  wolf_escape: {
    id: 'wolf_escape',
    text: 'You back against a thick oak. The wolves lose interest and disappear into the dark. Safe... for now. But one nipped your ankle as you ran.',
    choices: [
      { text: 'Press on to the forest path (lose 8 HP)', nextId: 'forest_path', cost: { hp: 8 } },
    ],
  },

  merchant_encounter: {
    id: 'merchant_encounter',
    text: 'You find a traveling merchant hiding behind a mossy log, trembling. "Thank the gods! Wolves scattered my guards. If you escort me to the village, I\'ll pay handsomely."\n\nYou escort the merchant safely. He gives you 15 gold.',
    choices: [
      { text: 'Return to the forest road', nextId: 'forest_path' },
    ],
  },

  bandit_ambush: {
    id: 'bandit_ambush',
    text: 'A hooded bandit drops from a tree with a blade at your throat. "Your gold or your life, traveler."\n\nHis two companions emerge from the shadows.',
    choices: [
      { text: 'Fight the bandits!', nextId: 'bandit_combat' },
      { text: 'Pay them off (15 gold)', nextId: 'bandit_paid', cost: { gold: 15 } },
      { text: 'Grab the blade and twist free', nextId: 'bandit_escape', danger: true, statCheck: { stat: 'attack', min: 6 } },
    ],
  },

  bandit_paid: {
    id: 'bandit_paid',
    text: 'You toss your coin pouch. The bandits snatch it greedily and melt back into the forest, laughing. Bruised pride, lighter pockets — but alive.',
    choices: [
      { text: 'Continue to the forest path', nextId: 'forest_path' },
    ],
  },

  bandit_escape: {
    id: 'bandit_escape',
    text: 'You grab the blade and twist sharply, disarming the leader in one fluid motion. The other bandits freeze, then run. You pocket the leader\'s 20 gold before he flees.',
    choices: [
      { text: 'Continue to the forest path', nextId: 'forest_path', reward: { gold: 20 } },
    ],
  },

  bandit_combat: {
    id: 'bandit_combat',
    text: '',
    choices: [],
  },

  forest_path: {
    id: 'forest_path',
    text: 'You emerge from the tangled undergrowth onto a wider path. Ahead, the path forks:\n\n• Left: A dark ravine with smoke rising from a camp.\n• Right: A rocky trail leading to a cave mouth.\n• Straight: The mountain road is visible in the distance.',
    choices: [
      { text: 'Go left toward the ravine camp', nextId: 'ravine_camp' },
      { text: 'Go right toward the cave', nextId: 'cave_entrance' },
      { text: 'Take the mountain road directly', nextId: 'mountain_road' },
    ],
  },

  ravine_camp: {
    id: 'ravine_camp',
    text: 'The ravine camp reeks of old campfires and unwashed bandits. A chest sits unguarded by the largest tent, padlocked but clearly valuable.\n\nA lookout spots you and raises the alarm!',
    choices: [
      { text: 'Grab the chest and run (30g if you have speed)', nextId: 'ravine_chest', reward: { gold: 30 } },
      { text: 'Fight your way through', nextId: 'ravine_combat' },
      { text: 'Retreat back to the path', nextId: 'forest_path', cost: { hp: 5 } },
    ],
  },

  ravine_chest: {
    id: 'ravine_chest',
    text: 'You snatch the chest and sprint. Arrows clatter on rocks behind you. You make it out breathless but grinning — 30 gold inside!',
    choices: [
      { text: 'Head to the cave', nextId: 'cave_entrance' },
      { text: 'Take the mountain road', nextId: 'mountain_road' },
    ],
  },

  ravine_combat: {
    id: 'ravine_combat',
    text: '',
    choices: [],
  },

  cave_entrance: {
    id: 'cave_entrance',
    text: 'The cave yawns open before you — damp, dark, smelling of sulfur. A deep rumbling snore echoes from within. Bones litter the entrance.\n\n"The mountain troll," you whisper.',
    choices: [
      { text: 'Creep past while the troll sleeps', nextId: 'troll_sneak' },
      { text: 'Challenge the troll in combat!', nextId: 'troll_combat' },
      { text: 'Look for another way around (takes time)', nextId: 'cave_side_path' },
    ],
  },

  troll_sneak: {
    id: 'troll_sneak',
    text: 'You hold your breath and edge along the cave wall, stepping around scattered bones. The troll\'s snores shake the stalactites. You\'re almost through...\n\nOne bone crunches underfoot.',
    choices: [
      { text: 'Freeze and hope it sleeps on', nextId: 'troll_half_awake' },
      { text: 'Sprint for the exit!', nextId: 'cave_exit', cost: { hp: 10 } },
    ],
  },

  troll_half_awake: {
    id: 'troll_half_awake',
    text: 'The troll grunts, rolls over, and falls back into a deep snore. You exhale slowly and creep to the cave exit unharmed.',
    choices: [
      { text: 'Exit the cave and head to the mountain', nextId: 'mountain_road' },
    ],
  },

  cave_side_path: {
    id: 'cave_side_path',
    text: 'You find a narrow passage through the rocks that loops around the main cave. It takes an hour and costs you energy, but you avoid the troll entirely.',
    choices: [
      { text: 'Emerge onto the mountain road (lose 15 HP)', nextId: 'mountain_road', cost: { hp: 15 } },
    ],
  },

  cave_exit: {
    id: 'cave_exit',
    text: 'You burst out the cave exit, the troll\'s confused roar echoing behind you. You\'re battered from a claw swipe, but free.',
    choices: [
      { text: 'Head up the mountain road', nextId: 'mountain_road' },
    ],
  },

  troll_combat: {
    id: 'troll_combat',
    text: '',
    choices: [],
  },

  mountain_road: {
    id: 'mountain_road',
    text: 'The mountain road winds steeply upward. The air grows thin and cold. Halfway up, you find a small shrine to the gods of fortune — a glowing chest sits open, undisturbed.',
    choices: [
      { text: 'Take the gold from the shrine (25g)', nextId: 'mountain_shrine', reward: { gold: 25 } },
      { text: 'Leave an offering and pray (+10 HP)', nextId: 'mountain_pray', cost: { gold: 5 }, reward: { hp: 10 } },
      { text: 'Ignore it and press on to the peak', nextId: 'mountain_peak' },
    ],
  },

  mountain_shrine: {
    id: 'mountain_shrine',
    text: 'You pocket the 25 gold. As you turn to leave, a thunderclap sounds overhead — but you suspect it\'s just the weather.',
    choices: [
      { text: 'Continue to the mountain peak', nextId: 'mountain_peak' },
    ],
  },

  mountain_pray: {
    id: 'mountain_pray',
    text: 'You leave 5 gold at the shrine and bow your head. A warm sensation flows through you — wounds close, energy returns.',
    choices: [
      { text: 'Continue to the mountain peak', nextId: 'mountain_peak' },
    ],
  },

  mountain_peak: {
    id: 'mountain_peak',
    text: 'You reach the mountain peak as storm clouds gather. The dragon — black as midnight, wingspan blotting out the sky — coils atop a pile of gold.\n\nIts yellow eyes fix on you. It speaks in a voice like grinding stone:\n\n"A hero comes to die. How... delightful."',
    choices: [
      { text: 'Challenge the dragon to combat!', nextId: 'dragon_combat' },
      { text: 'Try to negotiate (need 50+ gold)', nextId: 'dragon_negotiate', statCheck: { stat: 'gold', min: 50 } },
      { text: 'Flee back down the mountain', nextId: 'mountain_flee' },
    ],
  },

  dragon_negotiate: {
    id: 'dragon_negotiate',
    text: 'You offer the dragon a tribute of 50 gold. It regards the coins with amusement, then to your shock — laughs.\n\n"Bold. And wise enough to know when to bargain. Very well. Your village is safe. But I keep the gold."\n\nThe dragon departs. You have saved Ironhold.',
    choices: [
      { text: 'Return victorious to Ironhold', nextId: 'victory_negotiate', cost: { gold: 50 } },
    ],
  },

  mountain_flee: {
    id: 'mountain_flee',
    text: 'You run. The dragon gives a bored puff of smoke and watches you tumble down the path. You survive, but the quest remains unfinished.\n\nIronhold will have to find another hero.',
    choices: [
      { text: 'Return to the village (game over)', nextId: 'end_retreat' },
    ],
  },

  dragon_combat: {
    id: 'dragon_combat',
    text: '',
    choices: [],
  },

  end_retreat: {
    id: 'end_retreat',
    text: 'You return to Ironhold, battered and without glory. The villagers look away. Sometimes survival is its own reward.',
    choices: [],
    isEnd: true,
  },

  victory_negotiate: {
    id: 'victory_negotiate',
    text: 'Ironhold erupts in celebration as you return. The elder grips your hand with tears in his eyes. "You saved us all!" Feasting and song last through the night.',
    choices: [],
    isEnd: true,
    isVictory: true,
  },

  victory_combat: {
    id: 'victory_combat',
    text: 'The dragon crashes to the earth with a final roar that shakes the mountain. You stand over the beast, breathless.\n\nIronhold is saved. Your legend begins here.',
    choices: [],
    isEnd: true,
    isVictory: true,
  },
}

// ── Enemy templates ───────────────────────────────────────────────────────────

interface Enemy {
  name: string
  hp: number
  attack: number
  defense: number
  gold: number
  victoryNode: string
}

const ENEMIES: Record<string, Enemy> = {
  wolf_combat:    { name: 'Wolf Pack',       hp: 25,  attack: 6,  defense: 1,  gold: 12, victoryNode: 'forest_path' },
  bandit_combat:  { name: 'Bandit Gang',     hp: 35,  attack: 7,  defense: 2,  gold: 25, victoryNode: 'forest_path' },
  ravine_combat:  { name: 'Bandit Captain',  hp: 45,  attack: 9,  defense: 3,  gold: 35, victoryNode: 'cave_entrance' },
  troll_combat:   { name: 'Mountain Troll',  hp: 80,  attack: 12, defense: 5,  gold: 50, victoryNode: 'mountain_road' },
  dragon_combat:  { name: 'The Black Dragon', hp: 150, attack: 18, defense: 8, gold: 200, victoryNode: 'victory_combat' },
}

// ── Player state ──────────────────────────────────────────────────────────────

let player: PlayerStats = {
  hp: 100, maxHp: 100,
  gold: 0, attack: 5, defense: 3,
  items: [], dragonDefeated: false,
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const storyText = document.getElementById('story-text') as HTMLDivElement
const choicesEl = document.getElementById('choices') as HTMLDivElement
const combatLog = document.getElementById('combat-log') as HTMLDivElement
const hpDisplay = document.getElementById('hp-display') as HTMLSpanElement
const goldDisplay = document.getElementById('gold-display') as HTMLSpanElement
const atkDisplay = document.getElementById('atk-display') as HTMLSpanElement
const defDisplay = document.getElementById('def-display') as HTMLSpanElement
const itemsDisplay = document.getElementById('items-display') as HTMLDivElement
const endScreen = document.getElementById('end-screen') as HTMLDivElement
const endTitle = document.getElementById('end-title') as HTMLDivElement
const endScoreEl = document.getElementById('end-score') as HTMLDivElement
const endSubtitle = document.getElementById('end-subtitle') as HTMLDivElement
const btnRestart = document.getElementById('btn-restart') as HTMLButtonElement
const muteBtn = document.getElementById('mute-btn') as HTMLButtonElement

// ── Typewriter ────────────────────────────────────────────────────────────────

let typewriterTimer: ReturnType<typeof setTimeout> | null = null

function typewrite(text: string, onDone?: () => void): void {
  if (typewriterTimer !== null) clearTimeout(typewriterTimer)
  storyText.textContent = ''
  let i = 0

  // Add blinking cursor element
  const cursor = document.createElement('span')
  cursor.className = 'cursor'
  storyText.appendChild(cursor)

  function step(): void {
    if (i < text.length) {
      cursor.before(text[i])
      i++
      typewriterTimer = setTimeout(step, 30)
    } else {
      cursor.remove()
      typewriterTimer = null
      if (onDone) onDone()
    }
  }
  step()
}

// ── Stats update ──────────────────────────────────────────────────────────────

function updateStats(): void {
  hpDisplay.textContent = `${player.hp}/${player.maxHp}`
  goldDisplay.textContent = String(player.gold)
  atkDisplay.textContent = String(player.attack)
  defDisplay.textContent = String(player.defense)
  itemsDisplay.textContent = player.items.length > 0 ? player.items.join(', ') : 'No items'
}

// ── Navigate to node ──────────────────────────────────────────────────────────

function goto(nodeId: string, pendingReward?: Choice['reward'], pendingCost?: Choice['cost']): void {
  // Apply pending reward/cost from the choice that led here
  if (pendingCost?.hp) {
    player.hp = Math.max(1, player.hp - pendingCost.hp)
  }
  if (pendingCost?.gold) {
    player.gold = Math.max(0, player.gold - pendingCost.gold)
  }
  if (pendingReward?.hp) {
    player.hp = Math.min(player.maxHp, player.hp + pendingReward.hp)
  }
  if (pendingReward?.gold) {
    player.gold += pendingReward.gold
    audio.score()
  }
  if (pendingReward?.attack) {
    player.attack += pendingReward.attack
    audio.powerup()
  }
  if (pendingReward?.defense) {
    player.defense += pendingReward.defense
    audio.powerup()
  }
  if (pendingReward?.item) {
    player.items.push(pendingReward.item)
  }

  if (player.hp <= 0) {
    player.hp = 0
    updateStats()
    showEndScreen(false)
    return
  }

  updateStats()

  // Handle combat nodes
  if (nodeId in ENEMIES) {
    startCombat(nodeId)
    return
  }

  const node = STORY[nodeId]
  if (!node) {
    console.warn('Unknown node:', nodeId)
    return
  }

  combatLog.textContent = ''

  if (node.isEnd) {
    typewrite(node.text, () => {
      updateStats()
      showEndScreen(node.isVictory ?? false)
    })
    choicesEl.textContent = ''
    return
  }

  typewrite(node.text, () => renderChoices(node))
  choicesEl.textContent = ''
}

// ── Render choices ────────────────────────────────────────────────────────────

function renderChoices(node: StoryNode): void {
  choicesEl.textContent = ''

  for (const choice of node.choices) {
    const btn = document.createElement('button')
    btn.className = 'choice-btn'
    if (choice.danger) btn.classList.add('danger')
    if (choice.reward) btn.classList.add('reward')

    let label = choice.text
    if (choice.cost?.gold) label += ` [costs ${choice.cost.gold}g]`
    if (choice.cost?.hp) label += ` [costs ${choice.cost.hp} HP]`
    btn.textContent = label

    // Disable if stat check fails
    let disabled = false
    if (choice.statCheck) {
      const val = choice.statCheck.stat === 'hp' ? player.hp
        : choice.statCheck.stat === 'gold' ? player.gold
        : choice.statCheck.stat === 'attack' ? player.attack
        : player.defense
      if (val < choice.statCheck.min) disabled = true
    }
    if (choice.cost?.gold && player.gold < (choice.cost.gold ?? 0)) disabled = true
    if (choice.cost?.hp && player.hp <= (choice.cost.hp ?? 0)) disabled = true

    btn.disabled = disabled
    if (!disabled) {
      btn.addEventListener('click', () => {
        audio.click()
        goto(choice.nextId, choice.reward, choice.cost)
      })
    }

    choicesEl.appendChild(btn)
  }

  // Scroll choices into view
  choicesEl.scrollTop = 0
}

// ── Combat engine ─────────────────────────────────────────────────────────────

interface CombatState {
  enemy: Enemy
  enemyHp: number
  nodeId: string
}

let activeCombat: CombatState | null = null

function startCombat(nodeId: string): void {
  const enemyTemplate = ENEMIES[nodeId]
  activeCombat = {
    enemy: { ...enemyTemplate },
    enemyHp: enemyTemplate.hp,
    nodeId,
  }

  combatLog.textContent = ''
  const intro = `You face the ${enemyTemplate.name}!\nEnemy HP: ${enemyTemplate.hp} | ATK: ${enemyTemplate.attack} | DEF: ${enemyTemplate.defense}`
  typewrite(intro, () => renderCombatChoices())
}

function renderCombatChoices(): void {
  if (!activeCombat) return
  choicesEl.textContent = ''

  const attackBtn = document.createElement('button')
  attackBtn.className = 'choice-btn danger'
  attackBtn.textContent = `Attack (deal ~${Math.max(1, player.attack - activeCombat.enemy.defense)} dmg)`
  attackBtn.addEventListener('click', () => { audio.click(); doCombatRound('attack') })

  const fleeBtn = document.createElement('button')
  fleeBtn.className = 'choice-btn'
  fleeBtn.textContent = 'Flee (lose 15 HP, escape combat)'
  fleeBtn.addEventListener('click', () => {
    audio.click()
    audio.death()
    player.hp = Math.max(1, player.hp - 15)
    updateStats()
    activeCombat = null
    combatLog.textContent = 'You fled the battle!'
    goto('forest_path')
  })

  choicesEl.appendChild(attackBtn)
  choicesEl.appendChild(fleeBtn)
}

function doCombatRound(action: 'attack'): void {
  if (!activeCombat) return
  const enemy = activeCombat.enemy

  // Player attacks enemy
  const playerDmg = Math.max(1, Math.floor(player.attack * (0.8 + Math.random() * 0.4)) - enemy.defense)
  activeCombat.enemyHp -= playerDmg

  let log = `You deal ${playerDmg} damage to ${enemy.name}.`

  if (activeCombat.enemyHp <= 0) {
    // Victory
    log += ` ${enemy.name} defeated! +${enemy.gold} gold.`
    player.gold += enemy.gold
    audio.levelUp()
    if (action === 'attack') {
      // Dragon special case
      if (activeCombat.nodeId === 'dragon_combat') player.dragonDefeated = true
    }
    combatLog.textContent = log
    choicesEl.textContent = ''
    activeCombat = null
    updateStats()
    gameSDK.reportScore(calcScore())
    const victoryNode = ENEMIES[activeCombat?.nodeId ?? '']?.victoryNode
    setTimeout(() => goto(ENEMIES[Object.keys(ENEMIES).find(k => ENEMIES[k].name === enemy.name) ?? '']?.victoryNode ?? 'forest_path'), 1200)
    return
  }

  // Enemy attacks player
  const enemyDmg = Math.max(1, Math.floor(enemy.attack * (0.8 + Math.random() * 0.4)) - player.defense)
  player.hp -= enemyDmg
  log += ` ${enemy.name} hits you for ${enemyDmg}. (Enemy HP: ${activeCombat.enemyHp}/${enemy.hp}) (Your HP: ${player.hp})`

  audio.blip()
  combatLog.textContent = log
  combatLog.scrollTop = combatLog.scrollHeight
  updateStats()

  if (player.hp <= 0) {
    player.hp = 0
    updateStats()
    audio.death()
    activeCombat = null
    showEndScreen(false)
    return
  }

  renderCombatChoices()
}

// ── Score ─────────────────────────────────────────────────────────────────────

function calcScore(): number {
  return player.gold + (player.dragonDefeated ? 100 : 0)
}

// ── End screen ────────────────────────────────────────────────────────────────

function showEndScreen(victory: boolean): void {
  const score = calcScore()
  gameSDK.gameOver(score)

  endTitle.textContent = victory ? 'Victory!' : 'You Have Fallen'
  endTitle.className = `end-title ${victory ? 'win' : 'lose'}`
  endScoreEl.textContent = String(score)
  endSubtitle.textContent = victory
    ? (player.dragonDefeated ? 'Dragon Slayer!' : 'Savior of Ironhold!')
    : 'Ironhold mourns your sacrifice.'
  endScreen.classList.add('visible')
  choicesEl.textContent = ''
}

// ── Restart ───────────────────────────────────────────────────────────────────

function restartGame(): void {
  audio.start()
  player = { hp: 100, maxHp: 100, gold: 0, attack: 5, defense: 3, items: [], dragonDefeated: false }
  activeCombat = null
  endScreen.classList.remove('visible')
  combatLog.textContent = ''
  updateStats()
  goto('start')
}

// ── Patch combat nodes with dynamic text ─────────────────────────────────────
// (combat node text is generated at runtime — this fixes the empty stubs)

const COMBAT_INTROS: Record<string, string> = {
  wolf_combat: 'The wolves lunge! Fangs flash in the darkness. Your heart pounds as you raise your weapon.',
  bandit_combat: 'The bandits draw steel! Three against one — you\'ll need to fight smart.',
  ravine_combat: 'The bandit captain charges — bigger and meaner than the others, twin blades gleaming.',
  troll_combat: 'The mountain troll ROARS awake, swiping its massive fist toward your head!',
  dragon_combat: 'THE DRAGON ATTACKS! Fire erupts from its jaws — you dive aside and charge!',
}

for (const [id, intro] of Object.entries(COMBAT_INTROS)) {
  if (STORY[id]) STORY[id].text = intro
}

// ── Fix victory combat node reference ────────────────────────────────────────

function resolveVictoryNode(combatNodeId: string): string {
  return ENEMIES[combatNodeId]?.victoryNode ?? 'forest_path'
}

// Patch combat so victory gotos work
const origGoto = goto
function doCombatRoundFixed(action: 'attack'): void {
  if (!activeCombat) return
  const combatNodeId = activeCombat.nodeId
  const enemy = activeCombat.enemy

  const playerDmg = Math.max(1, Math.floor(player.attack * (0.8 + Math.random() * 0.4)) - enemy.defense)
  activeCombat.enemyHp -= playerDmg

  let log = `You deal ${playerDmg} damage to ${enemy.name}.`

  if (activeCombat.enemyHp <= 0) {
    log += ` ${enemy.name} defeated! +${enemy.gold} gold.`
    player.gold += enemy.gold
    if (combatNodeId === 'dragon_combat') player.dragonDefeated = true
    audio.levelUp()
    combatLog.textContent = log
    choicesEl.textContent = ''
    activeCombat = null
    updateStats()
    gameSDK.reportScore(calcScore())
    setTimeout(() => origGoto(resolveVictoryNode(combatNodeId)), 1200)
    return
  }

  const enemyDmg = Math.max(1, Math.floor(enemy.attack * (0.8 + Math.random() * 0.4)) - player.defense)
  player.hp -= enemyDmg
  log += ` ${enemy.name} hits you for ${enemyDmg}. (Enemy HP: ${activeCombat.enemyHp}/${enemy.hp}) (Your HP: ${Math.max(0, player.hp)})`

  audio.blip()
  combatLog.textContent = log
  combatLog.scrollTop = combatLog.scrollHeight
  updateStats()

  if (player.hp <= 0) {
    player.hp = 0
    updateStats()
    audio.death()
    activeCombat = null
    showEndScreen(false)
    return
  }

  renderCombatChoicesFixed()
}

function renderCombatChoicesFixed(): void {
  if (!activeCombat) return
  choicesEl.textContent = ''

  const attackBtn = document.createElement('button')
  attackBtn.className = 'choice-btn danger'
  attackBtn.textContent = `Attack (deal ~${Math.max(1, player.attack - activeCombat.enemy.defense)} dmg)`
  attackBtn.addEventListener('click', () => { audio.click(); doCombatRoundFixed('attack') })

  const fleeBtn = document.createElement('button')
  fleeBtn.className = 'choice-btn'
  fleeBtn.textContent = 'Flee (lose 15 HP, escape combat)'
  fleeBtn.addEventListener('click', () => {
    audio.click()
    audio.death()
    player.hp = Math.max(1, player.hp - 15)
    updateStats()
    activeCombat = null
    combatLog.textContent = 'You fled the battle!'
    origGoto('forest_path')
  })

  choicesEl.appendChild(attackBtn)
  choicesEl.appendChild(fleeBtn)
}

// Override startCombat to use fixed versions
function startCombatFixed(nodeId: string): void {
  const enemyTemplate = ENEMIES[nodeId]
  activeCombat = {
    enemy: { ...enemyTemplate },
    enemyHp: enemyTemplate.hp,
    nodeId,
  }

  combatLog.textContent = ''
  const intro = `You face the ${enemyTemplate.name}!\nEnemy HP: ${enemyTemplate.hp} | ATK: ${enemyTemplate.attack} | DEF: ${enemyTemplate.defense}`
  typewrite(intro, () => renderCombatChoicesFixed())
}

// ── Patch goto to use fixed combat ───────────────────────────────────────────
// Re-define goto to call the fixed combat starter

function gotoFixed(nodeId: string, pendingReward?: Choice['reward'], pendingCost?: Choice['cost']): void {
  if (pendingCost?.hp) player.hp = Math.max(1, player.hp - pendingCost.hp)
  if (pendingCost?.gold) player.gold = Math.max(0, player.gold - pendingCost.gold)
  if (pendingReward?.hp) player.hp = Math.min(player.maxHp, player.hp + pendingReward.hp)
  if (pendingReward?.gold) { player.gold += pendingReward.gold; audio.score() }
  if (pendingReward?.attack) { player.attack += pendingReward.attack; audio.powerup() }
  if (pendingReward?.defense) { player.defense += pendingReward.defense; audio.powerup() }
  if (pendingReward?.item) player.items.push(pendingReward.item)

  if (player.hp <= 0) { player.hp = 0; updateStats(); showEndScreen(false); return }

  updateStats()

  if (nodeId in ENEMIES) { startCombatFixed(nodeId); return }

  const node = STORY[nodeId]
  if (!node) { console.warn('Unknown node:', nodeId); return }

  combatLog.textContent = ''

  if (node.isEnd) {
    typewrite(node.text, () => { updateStats(); showEndScreen(node.isVictory ?? false) })
    choicesEl.textContent = ''
    return
  }

  typewrite(node.text, () => renderChoicesFixed(node))
  choicesEl.textContent = ''
}

function renderChoicesFixed(node: StoryNode): void {
  choicesEl.textContent = ''
  for (const choice of node.choices) {
    const btn = document.createElement('button')
    btn.className = 'choice-btn'
    if (choice.danger) btn.classList.add('danger')
    if (choice.reward) btn.classList.add('reward')
    let label = choice.text
    if (choice.cost?.gold) label += ` [costs ${choice.cost.gold}g]`
    if (choice.cost?.hp) label += ` [costs ${choice.cost.hp} HP]`
    btn.textContent = label

    let disabled = false
    if (choice.statCheck) {
      const val = choice.statCheck.stat === 'hp' ? player.hp
        : choice.statCheck.stat === 'gold' ? player.gold
        : choice.statCheck.stat === 'attack' ? player.attack
        : player.defense
      if (val < choice.statCheck.min) disabled = true
    }
    if (choice.cost?.gold && player.gold < (choice.cost.gold ?? 0)) disabled = true
    if (choice.cost?.hp && player.hp <= (choice.cost.hp ?? 0)) disabled = true

    btn.disabled = disabled
    if (!disabled) {
      btn.addEventListener('click', () => { audio.click(); gotoFixed(choice.nextId, choice.reward, choice.cost) })
    }
    choicesEl.appendChild(btn)
  }
  choicesEl.scrollTop = 0
}

// ── Event listeners ───────────────────────────────────────────────────────────

btnRestart.addEventListener('click', () => {
  audio.start()
  player = { hp: 100, maxHp: 100, gold: 0, attack: 5, defense: 3, items: [], dragonDefeated: false }
  activeCombat = null
  endScreen.classList.remove('visible')
  combatLog.textContent = ''
  updateStats()
  gotoFixed('start')
})

muteBtn.addEventListener('click', () => {
  const muted = audio.toggleMute()
  muteBtn.textContent = muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'
})

// ── Boot ──────────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  try {
    await gameSDK.init({ gameId: 'text-rpg', gameSlug: 'text-rpg' })
    await gameSDK.showAd('preroll')
  } catch (err) {
    console.warn('SDK init failed, running standalone:', err)
  }

  audio.start()
  updateStats()
  gotoFixed('start')
}

void boot()
