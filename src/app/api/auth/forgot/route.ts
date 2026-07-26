import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';

/**
 * MVP: no email provider is wired up (that's a paid decision). The reset link
 * is logged to the server console; in production, plug in a provider here.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = String(body?.email ?? '').trim().toLowerCase();
  if (email) {
    const user = await db.user.findUnique({ where: { email } });
    if (user) {
      const token = crypto.randomBytes(24).toString('hex');
      await db.passwordResetToken.create({
        data: { token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      const link = `${process.env.APP_URL || 'http://localhost:3000'}/reset?token=${token}`;
      console.log(`[password-reset] ${email} → ${link}`);
    }
  }
  // always the same answer — don't leak which emails have accounts
  return NextResponse.json({ ok: true, message: 'If that email has an account, a reset link is on its way.' });
}
