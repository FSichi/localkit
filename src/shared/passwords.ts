// Password generator. Uses the system CSPRNG and avoids modulo bias.

export interface PasswordOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
  excludeAmbiguous: boolean;
}

export type PasswordStrength = 'weak' | 'fair' | 'strong' | 'veryStrong';

const AMBIGUOUS = /[Il1O0o|`'"]/g;
const GUESSES_PER_SECOND = 1e12;
const SECONDS_PER_YEAR = 31536000;

const CHARACTER_SETS: [keyof PasswordOptions, string][] = [
  ['lowercase', 'abcdefghijklmnopqrstuvwxyz'],
  ['uppercase', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
  ['digits', '0123456789'],
  ['symbols', '!@#$%^&*()_+-=[]{}|;:,.<>?/~'],
];

function enabledSets(options: PasswordOptions): string[] {
  return CHARACTER_SETS.filter(([key]) => options[key]).map(([, characters]) =>
    options.excludeAmbiguous ? characters.replace(AMBIGUOUS, '') : characters,
  );
}

/** Uniform integer in [0, bound). Discards the values that would bias the modulo. */
function randomBelow(bound: number): number {
  const limit = Math.floor(0x100000000 / bound) * bound;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % bound;
}

export function generatePassword(options: PasswordOptions): string {
  const sets = enabledSets(options);
  if (!sets.length) return '';
  const alphabet = sets.join('');
  // One of each selected kind, the rest at random, then shuffled so they don't stay at the start.
  const characters = sets.slice(0, options.length).map((set) => set[randomBelow(set.length)]);
  while (characters.length < options.length) characters.push(alphabet[randomBelow(alphabet.length)]);
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join('');
}

export function entropyBits(options: PasswordOptions): number {
  const alphabetSize = enabledSets(options).join('').length;
  return alphabetSize ? Math.floor(options.length * Math.log2(alphabetSize)) : 0;
}

export function strengthOf(bits: number): PasswordStrength {
  if (bits < 50) return 'weak';
  if (bits < 72) return 'fair';
  if (bits < 110) return 'strong';
  return 'veryStrong';
}

/** Average seconds to guess it offline, at a trillion attempts per second. */
export function secondsToCrack(bits: number): number {
  return 2 ** (bits - 1) / GUESSES_PER_SECOND;
}

export const yearsFromSeconds = (seconds: number) => seconds / SECONDS_PER_YEAR;
