import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = String(body?.token ?? '');
  const password = String(body?.password ?? '');
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password needs at least 8 characters.' }, { status: 400 });
  }
  const row = await db.passwordResetToken.findUnique({ where: { token } });
  if (!row || row.expiresAt < new Date()) {
    return NextResponse.json({ error: 'That reset link expired. Request a new one.' }, { status: 400 });
  }
  await db.$transaction([
    db.user.update({ where: { id: row.userId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.passwordResetToken.delete({ where: { token } }),
  ]);
  return NextResponse.json({ ok: true });
}
