import { randomInt } from 'node:crypto';

/**
 * Generates a temporary password for a newly created account.
 *
 * `randomInt` from `node:crypto`, not `Math.random`. `Math.random` is not a
 * cryptographic source and its output is predictable from prior values, so passwords
 * built from it can be guessed.
 *
 * The alphabet omits characters that are easy to confuse when a password is read aloud
 * or copied off a screen — `0`/`O`, `1`/`l`/`I` — because these are handed over by a
 * person to a person.
 */
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '@#$%&*';

const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

function pick(source: string): string {
  return source[randomInt(source.length)]!;
}

export function generateTemporaryPassword(length = 14): string {
  // One character from each class first, so the result always satisfies the password
  // rules rather than satisfying them by luck.
  const required = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];

  const rest = Array.from({ length: length - required.length }, () => pick(ALPHABET));
  const characters = [...required, ...rest];

  // Fisher-Yates, so the guaranteed characters are not always in the first four
  // positions — which would otherwise leak the pattern to anyone who saw two passwords.
  for (let i = characters.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [characters[i], characters[j]] = [characters[j]!, characters[i]!];
  }

  return characters.join('');
}
