// Word bank organised by category — 200+ words total

export interface WordEntry {
  word: string
  category: string
}

const ANIMALS: string[] = [
  'elephant', 'giraffe', 'penguin', 'dolphin', 'cheetah',
  'crocodile', 'flamingo', 'gorilla', 'leopard', 'platypus',
  'chameleon', 'armadillo', 'wolverine', 'narwhal', 'pangolin',
  'albatross', 'capybara', 'manatee', 'mongoose', 'porcupine',
  'salamander', 'hedgehog', 'meerkat', 'jaguar', 'toucan',
  'koala', 'wombat', 'vulture', 'ostrich', 'baboon',
  'hamster', 'pelican', 'walrus', 'buffalo', 'lynx',
]

const FOOD: string[] = [
  'spaghetti', 'avocado', 'burrito', 'croissant', 'eggplant',
  'hummus', 'kimchi', 'lasagna', 'marzipan', 'noodles',
  'pancake', 'quinoa', 'risotto', 'sausage', 'tempura',
  'waffle', 'yoghurt', 'zucchini', 'pretzel', 'dumpling',
  'broccoli', 'cinnamon', 'cucumber', 'focaccia', 'guacamole',
  'jalapeno', 'macaroon', 'paprika', 'tiramisu', 'tortilla',
  'anchovies', 'blueberry', 'caramel', 'espresso', 'falafel',
  'granola', 'mozzarella', 'okra', 'pineapple', 'ravioli',
]

const COUNTRIES: string[] = [
  'australia', 'brazil', 'cambodia', 'denmark', 'ethiopia',
  'finland', 'guatemala', 'honduras', 'indonesia', 'jamaica',
  'kazakhstan', 'lithuania', 'madagascar', 'nicaragua', 'oman',
  'portugal', 'qatar', 'romania', 'slovakia', 'thailand',
  'ukraine', 'venezuela', 'zimbabwe', 'argentina', 'belgium',
  'colombia', 'dominican', 'ecuador', 'finland', 'georgia',
  'hungary', 'iceland', 'jordan', 'kenya', 'laos',
  'malaysia', 'nepal', 'panama', 'peru', 'senegal',
]

const SPORTS: string[] = [
  'badminton', 'basketball', 'bobsled', 'cricket', 'cycling',
  'fencing', 'gymnastics', 'handball', 'hockey', 'javelin',
  'judo', 'lacrosse', 'marathon', 'polo', 'rowing',
  'skateboard', 'snowboard', 'softball', 'surfing', 'swimming',
  'taekwondo', 'tennis', 'triathlon', 'volleyball', 'wrestling',
  'archery', 'biathlon', 'curling', 'decathlon', 'equestrian',
]

const SCIENCE: string[] = [
  'algorithm', 'asteroid', 'biology', 'chemistry', 'chromosome',
  'combustion', 'electron', 'evolution', 'friction', 'gravity',
  'hypothesis', 'isotope', 'kinetics', 'molecule', 'neutron',
  'osmosis', 'photon', 'quantum', 'radiation', 'satellite',
  'telescope', 'uranium', 'velocity', 'wavelength', 'xenon',
  'atmosphere', 'catalyst', 'diffusion', 'electrode', 'fermentation',
]

const MUSIC: string[] = [
  'accordion', 'bassoon', 'clarinet', 'clavichord', 'dulcimer',
  'flute', 'harmonica', 'harpsichord', 'mandolin', 'oboe',
  'saxophone', 'sitar', 'trombone', 'trumpet', 'ukulele',
  'balalaika', 'banjo', 'cello', 'didgeridoo', 'euphonium',
  'fiddle', 'guitar', 'kazoo', 'lute', 'marimba',
]

function buildPool(): WordEntry[] {
  const pool: WordEntry[] = []
  const add = (words: string[], category: string) => {
    for (const word of words) {
      pool.push({ word: word.toLowerCase(), category })
    }
  }
  add(ANIMALS, 'Animals')
  add(FOOD, 'Food')
  add(COUNTRIES, 'Countries')
  add(SPORTS, 'Sports')
  add(SCIENCE, 'Science')
  add(MUSIC, 'Music')
  return pool
}

const POOL: WordEntry[] = buildPool()

/** Return a random word entry that is not the current word. */
export function pickWord(currentWord?: string): WordEntry {
  const filtered = currentWord
    ? POOL.filter((e) => e.word !== currentWord)
    : POOL
  return filtered[Math.floor(Math.random() * filtered.length)]
}
