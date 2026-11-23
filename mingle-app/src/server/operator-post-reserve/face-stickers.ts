/**
 * Stickers people put over their friends' faces before posting (staff
 * 2026-11-23: friends' faces showed in every group photo; tests with a sticker
 * line looked right). 100 subjects x 8 styles = 800 stickers, so the same
 * smiley and heart do not repeat across an account's photos.
 */
type Random = () => number

export const STICKER_SUBJECTS: readonly string[] = [
  // faces
  'a yellow smiley face', 'a laughing face with tears of joy', 'a winking face', 'a face blowing a kiss', 'a face with heart eyes',
  'a sunglasses cool face', 'a sleepy face with a snot bubble', 'a shy blushing face', 'a surprised face with an open mouth', 'a grinning face with big teeth',
  'a ghost', 'an alien head', 'a smiling cloud', 'a smiling sun', 'a sleepy crescent moon',
  'a smiling star', 'a smiling peach', 'a round red tomato face', 'a cute skull', 'a robot head',
  // animals
  'a bunny face', 'a bear face', 'a cat face', 'a puppy face', 'a panda face',
  'a frog face', 'a hamster face', 'a fox face', 'a koala face', 'a penguin face',
  'a chick', 'a duck', 'a pig face', 'a tiger face', 'a lion face',
  'a monkey covering its eyes', 'a seal', 'a sheep face', 'a cow face', 'a capybara face',
  'a shiba inu face', 'a red panda face', 'an otter face', 'a hedgehog', 'a little dinosaur',
  // food and drink
  'a strawberry', 'a peach', 'a slice of watermelon', 'a cherry pair', 'a pink donut with sprinkles',
  'a cupcake', 'a slice of cake', 'a soft-serve ice cream cone', 'a bubble tea cup', 'an onigiri rice ball',
  'a fried egg', 'a slice of pizza', 'a croissant', 'a macaron', 'a lemon slice',
  'a bunch of grapes', 'a green apple', 'a mandarin orange', 'a dumpling', 'a cup of coffee with latte art',
  // shapes and symbols
  'a pink heart', 'a red heart', 'a purple heart', 'a broken-apart heart pair', 'a sparkly gold star',
  'a four-leaf clover', 'a rainbow', 'a lightning bolt', 'a flower with round petals', 'a sunflower',
  'a cherry blossom flower', 'a tulip', 'a butterfly', 'a crown', 'a ribbon bow',
  'a music note pair', 'a speech bubble with three dots', 'a question mark bubble', 'a fire flame', 'a snowflake',
  // objects
  'a disco ball', 'a balloon', 'a gift box', 'a camera', 'a game controller',
  'a cassette tape', 'a cherry-red lipstick mark', 'a pair of sunglasses', 'a paper airplane', 'a planet with a ring',
  'a soccer ball', 'a basketball', 'a little cactus in a pot', 'a beer mug', 'a teddy bear',
]

export const STICKER_STYLES: readonly string[] = [
  'flat emoji style',
  'glossy 3D emoji style',
  'cute kawaii doodle style with a thick white die-cut border',
  'pixel art style',
  'glitter sticker style',
  'hand-drawn crayon doodle style',
  'pastel watercolor sticker style',
  'bold cartoon sticker style with a black outline',
]

export const STICKER_COUNT = STICKER_SUBJECTS.length * STICKER_STYLES.length

/** `count` different stickers (subject and style both differ), for one photo. */
export function pickFaceStickers(random: Random, count: number): string[] {
  const subjects = [...STICKER_SUBJECTS]
  const picked: string[] = []
  for (let i = 0; i < count && subjects.length; i += 1) {
    const subject = subjects.splice(Math.floor(random() * subjects.length), 1)[0]
    const style = STICKER_STYLES[Math.floor(random() * STICKER_STYLES.length)]
    picked.push(`${subject} in ${style}`)
  }
  return picked
}

/** The prompt line that covers each friend's face with its own sticker (the poster's face stays). */
export function faceStickerLine(random: Random): string {
  const stickers = pickFaceStickers(random, 3)
  return `Like many people do before posting, each friend's face is hidden under a flat digital sticker added on top of the photo afterwards (the kind a phone's photo editor or Instagram adds), slightly tilted, fully covering that face: the first friend gets ${stickers[0]}, the second ${stickers[1]}, a third (if any) ${stickers[2]}. Different stickers for different friends. The poster's own face is NOT covered and stays clearly visible. No other stickers or text.`
}
