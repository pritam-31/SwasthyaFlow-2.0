/**
 * Bundled common-password denylist (P1-12).
 *
 * A representative slice of well-known breached/weak passwords, checked with no
 * network access. The set is intentionally a curated sample rather than the full
 * 10k list to keep the prototype self-contained; the interface accepts an
 * extension file when a larger list is mounted. Comparisons are case-folded.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set(
  [
    'password', 'password1', 'password123', 'password1234', 'password12345',
    'passw0rd', 'passw0rd123', 'password!', 'password@123', 'password#1',
    '123456', '123456789', '12345678', '1234567', '1234567890', '1234567890',
    '12345678910', '1234567890', '123456789012', '1234512345',
    'qwerty', 'qwerty123', 'qwerty1234', 'qwertyuiop', 'qwertyuiop123',
    'qwertyuiopasdfghjkl', 'qwerty123!', 'qwertyuiop123!',
    'letmein', 'welcome', 'welcome1', 'welcome123', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'superman', 'batman',
  'iloveyou', 'admin', 'admin123', 'administrator', 'password1!', 'passw0rd!',
  'abc123456', 'abcd1234', '12345678a', 'a1234567890', 'qwertyuiop1',
  'letmein123', 'welcome1', 'welcome123', 'admin1234', 'root1234', 'test1234',
  'passwordpassword', '1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'qazwsxedc',
  'qwerty12345', 'iloveyou1', 'monkey123', 'dragon123', 'sunshine1',
  'princess1', 'football1', 'baseball1', 'superman1', 'batman1', 'trustno1',
  'qwerty123456', 'password1!', 'passw0rd123', 'password1234', 'changeme',
  'changeme123', 'letmein!', 'welcome@123', 'admin@123', 'root@123',
  'toor', 'password12345', 'qwerty1234', 'asdfghjkl', 'zxcvbnm',
  '121212121', 'samsung', 'google', 'access', 'flower', 'whatever',
  'shadow', 'michael', 'jennifer', 'jordan', 'harley', 'ranger',
  'hunter', 'buster', 'soccer', 'hockey', 'killer', 'george',
  'sexy', 'andrew', 'charlie', 'superman', 'asshole', 'fuckyou',
  'dallas', 'jessica', 'panther', 'pepper', 'klaster', 'mustang',
  'master', 'maggie', 'summer', 'ginger', 'diamond', 'chelsea',
  'amanda', 'nicole', 'matrix', 'sabrina', 'black', 'passw0rd1',
  'passw0rd12', 'passw0rd1234', 'p@ssw0rd', 'p@ssword', 'p@ssw0rd123',
  'passwording', 'passwords', 'adminadmin', 'administrator1', 'letmein12',
])

const COMMON_SET = new Set([...COMMON_PASSWORDS].map((value) => value.toLowerCase()))

/** Case-folded membership check against the bundled denylist. */
export function isCommonPasswordValue(password: string): boolean {
  return COMMON_SET.has(password.toLowerCase())
}
