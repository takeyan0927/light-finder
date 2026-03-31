'use client';

import { useState, useEffect } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

const YONAHA = { lat: 24.7371, lng: 125.2642, bearing: 235 };

function getSceneDescription(altitude: number, angleDiff: number) {
  if (altitude < 0) return { scene: '🌙 夜・星空撮影', color: '#1a1a2e', text: '#fff', isNight: true };
  if (altitude < 6)  return { scene: '🌅 マジックアワー', color: '#ff6b35', text: '#fff', isNight: false };
  if (altitude < 20) return { scene: '✨ ゴールデンアワー', color: '#f7b731', text: '#5a3e00', isNight: false };
  if (angleDiff <= 30)  return { scene: '🌊 順光・海の透明感', color: '#0984e3', text: '#fff', isNight: false };
  if (angleDiff <= 80)  return { scene: '💎 サイドライト', color: '#00b894', text: '#fff', isNight: false };
  if (angleDiff <= 130) return { scene: '🌟 半逆光・キラメキ', color: '#e6a817', text: '#fff', isNight: false };
  return { scene: '🎭 逆光・シルエット', color: '#e17055', text: '#fff', isNight: false };
}

function getMoonInfo(date: Date) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const elapsed = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const age = ((elapsed % lunarCycle) + lunarCycle) % lunarCycle;
  const illumination = Math.round((1 - Math.cos((age / lunarCycle) * 2 * Math.PI)) / 2 * 100);

  let phase: string;
  let starIndex: string;
  let starColor: string;

  if (age < 1.5)       { phase = '🌑 新月';     starIndex = '★★★★★ 最高';     starColor = '#6c5ce7'; }
  else if (age < 7.4)  { phase = '🌒 三日月';   starIndex = '★★★★☆ 良好';     starColor = '#0984e3'; }
  else if (age < 10)   { phase = '🌓 上弦の月'; starIndex = '★★★☆☆ 普通';     starColor = '#00b894'; }
  else if (age < 14)   { phase = '🌔 十三夜月'; starIndex = '★★☆☆☆ やや悪い'; starColor = '#e6a817'; }
  else if (age < 16.5) { phase = '🌕 満月';     starIndex = '★☆☆☆☆ 困難';     starColor = '#e17055'; }
  else if (age < 22)   { phase = '🌖 居待月';   starIndex = '★★☆☆☆ やや悪い'; starColor = '#e6a817'; }
  else if (age < 25)   { phase = '🌗 下弦の月'; starIndex = '★★★☆☆ 普通';     starColor = '#00b894'; }
  else if (age < 28)   { phase = '🌘 有明月';   starIndex = '★★★★☆ 良好';     starColor = '#0984e3'; }
  else                 { phase = '🌑 晦日月';   starIndex = '★★★★★ 最高';     starColor = '#6c5ce7'; }

  return { age: Math.floor(age), phase, illumination, starIndex, starColor };
}

export default function Page() {
  const [now, setNow] = useState<Date | null>(null);
  const [showNight, setShowNight] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  if (!now) return <p style={{ padding: '2rem' }}>計算中...</p>;

  const sunPos = getSunPosition(now, YONAHA.lat, YONAHA.lng);
  const result = analyzeLighting(sunPos, YONAHA.bearing);
  const scene = getSceneDescription(sunPos.altitude, result.angleDiff);
  const moon = getMoonInfo(now);

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

  const visibleList = showNight
    ? hourlyList
    : hourlyList.filter(({ sc, isNow }) => !sc.isNight || isNow);

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
        color: scene.text,
        marginBottom: '1rem',
      }}>
        <div style={{ fontSize: '1.6rem', fontWeight: 'bold' }}>{scene.scene}</div>
        <div style={{ fontSize: '0.85rem', marginTop: '0.3rem', opacity: 0.9 }}>
          太陽高度 {Math.round(sunPos.altitude)}° ／ 光の角度差 {Math.round(result.angleDiff)}°
        </div>
      </div>

      {/* 月齢カード */}
      <div style={{
        background: '#f8f9fa',
        borderRadius: '12px',
        padding: '1rem 1.2rem',
        marginBottom: '1.5rem',
      }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', marginBottom: '4px' }}>
          {moon.phase}
        </div>
        <div style={{ fontSize: '0.8rem', color: '#888' }}>
          月齢 {moon.age}日 ／ 輝面比 {moon.illumination}%
        </div>
        <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: moon.starColor, marginTop: '4px' }}>
          星空指数：{moon.starIndex}
        </div>
      </div>

      {/* タイムライン */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#555' }}>今日のタイムライン</div>
        <button
          onClick={() => setShowNight(!showNight)}
          style={{
            fontSize: '0.75rem', color: '#888',
            background: 'none', border: '1px solid #ddd',
            borderRadius: '20px', padding: '2px 10px', cursor: 'pointer',
          }}
        >
          {showNight ? '夜を隠す' : '夜も表示'}
        </button>
      </div>

      <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
        {visibleList.map(({ h, sc, isNow }) => (
          <div key={h} style={{
            display: 'flex', alignItems: 'center',
            padding: '0.6rem 1rem',
            background: isNow ? '#fffbf0' : '#fff',
            borderBottom: '1px solid #f0f0f0',
            fontWeight: isNow ? 'bold' : 'normal',
          }}>
            <span style={{ width: '44px', color: isNow ? '#e17055' : '#888', fontSize: '0.9rem' }}>
              {h}:00
            </span>
            <span style={{
              width: '12px', height: '12px', borderRadius: '50%',
              background: sc.color, marginRight: '0.7rem', flexShrink: 0,
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