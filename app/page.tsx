'use client';

import { useState, useEffect } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

const YONAHA = { lat: 24.7371, lng: 125.2642, bearing: 235 };

function getSceneDescription(altitude: number, angleDiff: number) {
  if (altitude < 0) return { scene: '🌙 夜・星空撮影', color: '#1a1a2e' };
  if (altitude < 6)  return { scene: '🌅 マジックアワー', color: '#ff6b35' };
  if (altitude < 20) return { scene: '✨ ゴールデンアワー', color: '#f7b731' };
  if (angleDiff <= 30)  return { scene: '🌊 順光・海の透明感', color: '#0984e3' };
  if (angleDiff <= 80)  return { scene: '💎 サイドライト', color: '#00b894' };
  if (angleDiff <= 130) return { scene: '🌟 半逆光・キラメキ', color: '#fdcb6e' };
  return { scene: '🎭 逆光・シルエット', color: '#e17055' };
}

export default function Page() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <p style={{ padding: '2rem' }}>計算中...</p>;

  const sunPos = getSunPosition(now, YONAHA.lat, YONAHA.lng);
  const result = analyzeLighting(sunPos, YONAHA.bearing);
  const scene = getSceneDescription(sunPos.altitude, result.angleDiff);

  // 今日の時間帯一覧（5時〜20時、1時間ごと）
  const hourlyList = Array.from({ length: 16 }, (_, i) => {
    const h = i + 5;
    const d = new Date(now);
    d.setHours(h, 0, 0, 0);
    const sp = getSunPosition(d, YONAHA.lat, YONAHA.lng);
    const an = analyzeLighting(sp, YONAHA.bearing);
    const sc = getSceneDescription(sp.altitude, an.angleDiff);
    const isNow = now.getHours() === h;
    return { h, sc, isNow };
  });

  return (
    <main style={{ padding: '1.5rem', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.2rem', color: '#555', marginBottom: '0.2rem' }}>🌞 Light Finder</h1>
      <h2 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '0.3rem' }}>与那覇前浜ビーチ</h2>
      <p style={{ color: '#888', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
        {now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
      </p>

      {/* 現在のシーン */}
      <div style={{
        background: scene.color,
        borderRadius: '16px',
        padding: '1.5rem',
        color: '#fff',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{scene.scene}</div>
        <div style={{ fontSize: '0.85rem', marginTop: '0.3rem', opacity: 0.9 }}>
          太陽高度 {Math.round(sunPos.altitude)}° ／ 光の角度差 {Math.round(result.angleDiff)}°
        </div>
      </div>

      {/* 時間帯一覧 */}
      <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#555', marginBottom: '0.5rem' }}>
        今日のタイムライン
      </div>
      <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
        {hourlyList.map(({ h, sc, isNow }) => (
          <div key={h} style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.6rem 1rem',
            background: isNow ? '#fffbf0' : '#fff',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: isNow ? 'bold' : 'normal',
          }}>
            <span style={{
              width: '44px',
              color: isNow ? '#e17055' : '#888',
              fontSize: '0.9rem',
            }}>
              {h}:00
            </span>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: sc.color,
              marginRight: '0.7rem',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: '0.9rem' }}>{sc.scene}</span>
            {isNow && <span style={{ marginLeft: 'auto', color: '#e17055', fontSize: '0.8rem' }}>← 今</span>}
          </div>
        ))}
      </div>

      <p style={{ color: '#aaa', fontSize: '0.75rem', textAlign: 'center', marginTop: '1rem' }}>
        1分ごとに自動更新
      </p>
    </main>
  );
}