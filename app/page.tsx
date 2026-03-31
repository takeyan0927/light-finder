'use client';

import { useState, useEffect } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

const YONAHA = { lat: 24.7371, lng: 125.2642, bearing: 235 };

function getSceneDescription(altitude: number, angleDiff: number) {
  if (altitude < 0) return {
    scene: '🌙 夜・星空撮影',
    description: '太陽が沈んでいます。満天の星空撮影のチャンスです。',
    color: '#1a1a2e',
  };
  if (altitude < 6) return {
    scene: '🌅 マジックアワー',
    description: '空と海が幻想的なグラデーションに染まります。シルエット撮影に最高の時間帯です。',
    color: '#ff6b35',
  };
  if (altitude < 20) return {
    scene: '✨ ゴールデンアワー',
    description: '柔らかく暖かい光が海面を黄金色に照らします。人物・風景ともに最も美しく撮れる時間帯です。',
    color: '#f7b731',
  };
  if (angleDiff <= 30) return {
    scene: '🌊 順光・海の透明感',
    description: 'エメラルドグリーンの海の透明感が最大限に引き出されます。海底まで鮮明に写ります。',
    color: '#0984e3',
  };
  if (angleDiff <= 80) return {
    scene: '💎 サイドライト・立体感',
    description: '波のキラメキと海面の立体感が美しく表現されます。',
    color: '#00b894',
  };
  if (angleDiff <= 130) return {
    scene: '🌟 半逆光・キラメキ',
    description: '海面に光のキラメキが生まれます。幻想的な一枚が狙えます。',
    color: '#fdcb6e',
  };
  return {
    scene: '🎭 逆光・シルエット',
    description: '人物や木のシルエットが海をバックに浮かび上がります。印象的な写真が撮れます。',
    color: '#e17055',
  };
}

export default function Page() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // 初回
    setNow(new Date());
    // 1分ごとに更新
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <p style={{ padding: '2rem' }}>計算中...</p>;

  const sunPos = getSunPosition(now, YONAHA.lat, YONAHA.lng);
  const result = analyzeLighting(sunPos, YONAHA.bearing);
  const scene = getSceneDescription(sunPos.altitude, result.angleDiff);

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.2rem', color: '#555', marginBottom: '0.2rem' }}>
        🌞 Light Finder
      </h1>
      <h2 style={{ fontSize: '1.5rem', marginTop: 0, marginBottom: '0.5rem' }}>
        与那覇前浜ビーチ
      </h2>
      <p style={{ color: '#888', fontSize: '0.9rem', marginBottom: '2rem' }}>
        現在時刻：{now.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
      </p>

      {/* メインカード */}
      <div style={{
        background: scene.color,
        borderRadius: '16px',
        padding: '2rem',
        color: '#fff',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          {scene.scene}
        </div>
        <div style={{ fontSize: '1rem', lineHeight: '1.6', opacity: 0.95 }}>
          {scene.description}
        </div>
      </div>

      {/* データ詳細 */}
      <div style={{
        background: '#f8f9fa',
        borderRadius: '12px',
        padding: '1.2rem',
        marginBottom: '1rem',
      }}>
        {[
          ['太陽の高さ', `${Math.round(sunPos.altitude)}°`],
          ['太陽の方位', `${Math.round(sunPos.azimuth)}°`],
          ['光の角度差', `${Math.round(result.angleDiff)}°`],
        ].map(([label, value]) => (
          <div key={label} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0.5rem 0',
            borderBottom: '1px solid #eee',
          }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ fontWeight: 'bold' }}>{value}</span>
          </div>
        ))}
      </div>

      <p style={{ color: '#aaa', fontSize: '0.8rem', textAlign: 'center' }}>
        1分ごとに自動更新
      </p>
    </main>
  );
}