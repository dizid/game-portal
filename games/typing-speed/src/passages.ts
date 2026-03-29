// Typing passages — 20+ varied texts of moderate length

export const PASSAGES: string[] = [
  'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.',

  'To be or not to be that is the question whether tis nobler in the mind to suffer the slings and arrows of outrageous fortune.',

  'The only way to do great work is to love what you do. If you have not found it yet keep looking. Do not settle.',

  'In the beginning God created the heavens and the earth. The earth was without form and void and darkness was over the face of the deep.',

  'It was the best of times it was the worst of times it was the age of wisdom it was the age of foolishness.',

  'Space the final frontier. These are the voyages of the starship Enterprise. Its five year mission to explore strange new worlds.',

  'All happy families are alike each unhappy family is unhappy in its own way. Everything was in confusion in the Oblonskys house.',

  'Call me Ishmael. Some years ago never mind how long precisely having little or no money in my purse I thought I would sail about a little.',

  'It is a truth universally acknowledged that a single man in possession of a good fortune must be in want of a wife.',

  'Two roads diverged in a yellow wood and sorry I could not travel both. And be one traveler long I stood and looked down one as far as I could.',

  'Ask not what your country can do for you ask what you can do for your country. The torch has been passed to a new generation of Americans.',

  'We choose to go to the moon in this decade and do the other things not because they are easy but because they are hard.',

  'The greatest glory in living lies not in never falling but in rising every time we fall.',

  'Spread love everywhere you go. Let no one ever come to you without leaving happier than they came.',

  'When you reach the end of your rope tie a knot in it and hang on. Always bear in mind that your own resolution to succeed is more important.',

  'Do not go gentle into that good night. Old age should burn and rave at close of day. Rage rage against the dying of the light.',

  'I have a dream that my four little children will one day live in a nation where they will not be judged by the color of their skin.',

  'The mind is everything. What you think you become. Health is the greatest gift contentment the greatest wealth faithfulness the best relationship.',

  'You miss one hundred percent of the shots you do not take. Ninety nine percent of the failures come from people who have the habit of making excuses.',

  'Success is not final failure is not fatal it is the courage to continue that counts. Every day is a new opportunity to change your life.',

  'The secret of getting ahead is getting started. The secret of getting started is breaking your complex overwhelming tasks into small manageable tasks.',

  'Life is what happens when you are busy making other plans. In the end it is not the years in your life that count it is the life in your years.',

  'Technology is best when it brings people together. The science of today is the technology of tomorrow. Innovation distinguishes a leader from a follower.',

  'To live is the rarest thing in the world. Most people exist that is all. Be yourself everyone else is already taken.',

  'Not all those who wander are lost. All that is gold does not glitter. The old that is strong does not wither. Deep roots are not reached by the frost.',
]

/** Return a random passage that is not the current one. */
export function pickPassage(currentPassage?: string): string {
  const pool = currentPassage
    ? PASSAGES.filter((p) => p !== currentPassage)
    : PASSAGES
  return pool[Math.floor(Math.random() * pool.length)]
}
