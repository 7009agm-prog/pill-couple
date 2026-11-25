Set-Content -Path app/api/poke/route.ts -Encoding utf8 -Value @'
import { NextResponse } from 'next/server';
import { createRequire } from 'module';
import { supabase } from '@/lib/supabase';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

export async function POST(req: Request) {
  try {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;

    if (!publicKey || !privateKey) {
      return NextResponse.json(
        { error: '서버 VAPID 키 환경변수가 설정되지 않았어요.' },
        { status: 500 }
      );
    }

    webpush.setVapidDetails('mailto:couple@example.com', publicKey, privateKey);

    const { targetRole, senderName, slot } = await req.json();

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('user_role', targetRole)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: '상대방이 아직 아이폰 알림 허용을 하지 않았어요.' },
        { status: 404 }
      );
    }

    const payload = JSON.stringify({
      title: '👉 ' + senderName + '님이 콕 찔렀어요!',
      body: '오늘 ' + slot + '회차 약 아직 안 먹었죠? 얼른 먹고 인증샷 보내주세요 💊',
    });

    await webpush.sendNotification(data.subscription, payload);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: '알림 전송 실패' }, { status: 500 });
  }
}
