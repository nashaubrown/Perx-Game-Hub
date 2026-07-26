// 6-character join codes from an unambiguous charset — no 0/O, 1/I/L.
const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

export function normalizeJoinCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
}
