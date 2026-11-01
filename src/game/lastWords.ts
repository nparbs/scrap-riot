/** Shown on the black screen while a destroyed robot is being rebuilt. To change the list, just edit it. */
export const LAST_WORDS: readonly string[] = [
  'Nobody plans on leaving a rooftop that way.',
  'Every robot is one bad decision away from scrap.',
  'The desert keeps no receipts.',
  'You can rebuild the chassis. The pride takes longer.',
  'It was a good plan, right up until the hammer.',
  'Somewhere, a mechanic just felt a chill.',
  'Physics was never on your side. It was only waiting.',
  'Bolts remember what pilots forget.',
  'Nobody ever wins an argument with a spinning blade.',
  'Tomorrow they will call it an accident.',
  'A clean getaway requires a getaway.',
  'That was not the loud part. This is the loud part.',
  'Everything you built was on loan from gravity.',
  'They warned you about the edge. You drove anyway.',
  'Nothing personal. Just metal, and a lot of it.',
  'There is no such thing as a small explosion.',
];

export function pickLastWords(previous: string, random: () => number = Math.random): string {
  const choices = LAST_WORDS.filter((line) => line !== previous);
  return choices[Math.floor(random() * choices.length)];
}
