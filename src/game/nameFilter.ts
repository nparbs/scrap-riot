// Names are shown to other players. This catches the plain cases and common disguises, not a determined
// person, and it errs toward letting a name through, so that Nigel, Hancock and Therapist all stay fine.

/** Bad wherever they turn up in a name, even run together with other words. */
const ANYWHERE = ['fuck', 'shit', 'nigger', 'nigga', 'faggot', 'retard', 'hitler', 'whore', 'bitch', 'asshole', 'porn', 'wank', 'vagina', 'kkk', 'siegheil'];
/** Only bad as a word of their own, because they're also part of ordinary words. */
const WHOLE_WORD = ['ass', 'cunt', 'cunts', 'cock', 'dick', 'pussy', 'tits', 'slut', 'cum', 'fag', 'rape', 'rapist', 'nazi', 'pedo', 'spic', 'chink', 'kike', 'coon', 'tranny', 'dyke', 'penis'];

const LOOKALIKES: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', $: 's', '!': 'i' };

/** Each letter may repeat, so that "fuuuck" still counts. */
const stretchy = (word: string) => [...word].map((letter) => `${letter}+`).join('');
const ANYWHERE_PATTERN = new RegExp(ANYWHERE.map(stretchy).join('|'));
const WHOLE_PATTERN = new RegExp(`^(?:${WHOLE_WORD.map(stretchy).join('|')})$`);

export function isNameAllowed(name: string): boolean {
  const plain = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[0134578@$!]/g, (c) => LOOKALIKES[c]);
  const words = plain.split(/[^a-z]+/).filter(Boolean);
  const joined = words.join('');
  return !ANYWHERE_PATTERN.test(joined) && !WHOLE_PATTERN.test(joined) && !words.some((word) => WHOLE_PATTERN.test(word));
}
