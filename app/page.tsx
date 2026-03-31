'use client';

import { useState, useEffect } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

const SPOTS = [
  { id: 'yonaha',    name: '与那覇前浜ビーチ',         pref: '沖縄県宮古島市',    lat: 24.7371, lng: 125.2642, bearing: 235 },
  { id: 'chirihama', name: '千里浜なぎさドライブウェイ', pref: '石川県羽咋市',      lat: 36.8394, lng: 136.7495, bearing: 270 },
  { id: 'matama',    name: '真玉海岸',                 pref: '大分県豊後高田市',  lat: 33.5677, lng: 131.5234, bearing: 270 },
  { id: 'nabeka',    name: '鍋冠山公園',               pref: '長崎県長崎市',      lat: 32.7280, lng: 129.8680, bearing: 350 },
  { id: 'shukutsu',  name: '祝津パノラマ展望台',        pref: '北海道小樽市',      lat: 43.2380, lng: 140.9920, bearing: 270 },
  { id: 'osaka',     name: '大坂トンネル展望台',        pref: '東京都八丈町',      lat: 33.1050, lng: 139.7890, bearing: 280 },
  { id: 'kamui',     name: '神威岬',                   pref: '北海道積丹郡積丹町', lat: 43.3352, lng: 140.6447, bearing: 285 },
];

function getScene(altitude: number, angleDiff: number) {
  if (altitude < 0)     return { label: '夜・星空撮影',    emoji: '🌙', color: '#0f0c29', grad: 'linear-gradient(135deg,#0f0c29,#302b63)', text: '#e8e0ff', isNight: true };
  if (altitude < 6)     return { label: 'マジックアワー',  emoji: '🌅', color: '#c0392b', grad: 'linear-gradient(135deg,#c0392b,#f39c12)', text: '#fff',    isNight: false };
  if (altitude < 20)    return { label: 'ゴールデンアワー',emoji: '✨', color: '#e67e22', grad: 'linear-gradient(135deg,#e67e22,#f1c40f)', text: '#3d2200', isNight: false };
  if (angleDiff <= 30)  return { label: '順光・海の透明感',emoji: '🌊', color: '#0984e3', grad: 'linear-gradient(135deg,#0984e3,#00cec9)', text: '#fff',    isNight: false };
  if (angleDiff <= 80)  return { label: 'サイドライト',    emoji: '💎', color: '#00b894', grad: 'linear-gradient(135deg,#00b894,#55efc4)', text: '#003d30', isNight: false };
  if (angleDiff <= 130) return { label: '半逆光・キラメキ',emoji: '🌟', color: '#d4a017', grad: 'linear-gradient(135deg,#d4a017,#f9ca24)', text: '#3d2a00', isNight: false };
  return                       { label: '逆光・シルエット',emoji: '🎭', color: '#e17055', grad: 'linear-gradient(135deg,#e17055,#d63031)', text: '#fff',    isNight: false };
}

function getSunDesc(altitude: number, angleDiff: number) {
  // 太陽の高さ
  let altDesc: string;
  if (altitude < 0)       altDesc = '太陽は地平線の下';
  else if (altitude < 6)  altDesc = '太陽が沈みかけている';
  else if (altitude < 20) altDesc = '地平線に近い柔らかい光';
  else if (altitude < 45) altDesc = '斜めから差し込む光';
  else                    altDesc = '真上に近い強い光';

  // 光の方向
  let dirDesc: string;
  if (altitude < 0)        dirDesc = '';
  else if (angleDiff <= 30)  dirDesc = '背後から光が当たっている';
  else if (angleDiff <= 80)  dirDesc = '横から光が当たっている';
  else if (angleDiff <= 130) dirDesc = '斜め前から光が当たっている';
  else                       dirDesc = '正面から光が当たっている';

  return { altDesc, dirDesc };
}

function getMoon(date: Date) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const elapsed = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const age = ((elapsed % lunarCycle) + lunarCycle) % lunarCycle;
  const illumination = Math.round((1 - Math.cos((age / lunarCycle) * 2 * Math.PI)) / 2 * 100);

  let phase: string; let moonDesc: string; let stars: number; let starColor: string; let starLabel: string;
  if (illumination <= 5)       { phase = '🌑 新月';         moonDesc = '月明かりなし';              stars = 5; starColor = '#6c5ce7'; starLabel = '最高によく見える'; }
  else if (illumination <= 30) { phase = '🌒 細い月';       moonDesc = `月明かり：弱い（${illumination}%）`;     stars = 4; starColor = '#0984e3'; starLabel = 'よく見える'; }
  else if (illumination <= 55) { phase = '🌓 半月';         moonDesc = `月明かり：やや強い（${illumination}%）`; stars = 3; starColor = '#00b894'; starLabel = 'まあまあ見える'; }
  else if (illumination <= 80) { phase = '🌔 満月に近い月'; moonDesc = `月明かり：強い（${illumination}%）`;     stars = 2; starColor = '#d4a017'; starLabel = 'やや見えにくい'; }
  else                         { phase = '🌕 満月';         moonDesc = `月明かり：とても強い（${illumination}%）`; stars = 1; starColor = '#e17055'; starLabel = '見えにくい'; }

  return { phase, moonDesc, starStr: '★'.repeat(stars) + '☆'.repeat(5 - stars), starColor, starLabel };
}

function getWeather(cloudcover: number, weathercode: number) {
  if (weathercode >= 61) return { label: '🌧️ 雨',    badge: '撮影困難', badgeColor: '#e17055' };
  if (weathercode >= 51) return { label: '🌦️ 小雨',  badge: '撮影注意', badgeColor: '#fdcb6e' };
  if (weathercode >= 45) return { label: '🌫️ 霧',    badge: '撮影注意', badgeColor: '#fdcb6e' };
  if (cloudcover <= 20)  return { label: '☀️ 快晴',  badge: '撮影最適', badgeColor: '#00b894' };
  if (cloudcover <= 50)  return { label: '🌤️ 晴れ',  badge: '撮影良好', badgeColor: '#0984e3' };
  if (cloudcover <= 80)  return { label: '⛅ 曇り',  badge: '撮影可能', badgeColor: '#636e72' };
  return                        { label: '☁️ 厚曇り', badge: '撮影困難', badgeColor: '#e17055' };
}

export default function Page() {
  const [now, setNow] = useState<Date | null>(null);
  const [spot, setSpot] = useState(SPOTS[0]);
  const [showNight, setShowNight] = useState(false);
  const [weather, setWeather] = useState<{ cloudcover: number; weathercode: number; temperature: number } | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setWeather(null);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&current=temperature_2m,weathercode,cloudcover&timezone=Asia%2FTokyo`)
      .then(r => r.json())
      .then(d => setWeather({ cloudcover: d.current.cloudcover, weathercode: d.current.weathercode, temperature: Math.round(d.current.temperature_2m) }))
      .catch(() => setWeather(null));
  }, [spot]);

  if (!now) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' }}>計算中...</div>;

  const sunPos = getSunPosition(now, spot.lat, spot.lng);
  const result = analyzeLighting(sunPos, spot.bearing);
  const scene = getScene(sunPos.altitude, result.angleDiff);
  const sunDesc = getSunDesc(sunPos.altitude, result.angleDiff);
  const moon = getMoon(now);
  const wd = weather ? getWeather(weather.cloudcover, weather.weathercode) : null;

  const hourlyList = Array.from({ length: 16 }, (_, i) => {
    const h = i + 5;
    const d = new Date(now); d.setHours(h, 0, 0, 0);
    const sp = getSunPosition(d, spot.lat, spot.lng);
    const an = analyzeLighting(sp, spot.bearing);
    return { h, sc: getScene(sp.altitude, an.angleDiff), isNow: now.getHours() === h };
  });
  const visibleList = showNight ? hourlyList : hourlyList.filter(({ sc, isNow }) => !sc.isNight || isNow);

  return (
    <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>

      {/* ヘッダー */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.7rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🌞</span>
            <span style={{ fontSize: '1.1rem', fontWeight: '700', letterSpacing: '-0.5px' }}>Light Finder</span>
            <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#888' }}>
              {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
            </span>
          </div>
          <select
            value={spot.id}
            onChange={e => setSpot(SPOTS.find(s => s.id === e.target.value) ?? SPOTS[0])}
            style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e5e5e7', fontSize: '0.95rem', background: '#f5f5f7', cursor: 'pointer', fontWeight: '500' }}
          >
            {SPOTS.map(s => <option key={s.id} value={s.id}>📍 {s.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1rem 1.2rem 2rem' }}>

        {/* メインカード */}
        <div style={{ background: scene.grad, borderRadius: '20px', padding: '2rem 1.8rem', color: scene.text, marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '7rem', opacity: 0.15 }}>{scene.emoji}</div>
          <div style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.8, marginBottom: '0.4rem', letterSpacing: '1px', textTransform: 'uppercase' }}>現在の撮影コンディション</div>
          <div style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem', letterSpacing: '-0.5px' }}>
            {scene.emoji} {scene.label}
          </div>
          {/* 言葉で説明 */}
          {sunPos.altitude >= 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>
                ☀️ {sunDesc.altDesc}
              </div>
              {sunDesc.dirDesc && (
                <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>
                  📐 {sunDesc.dirDesc}
                </div>
              )}
            </div>
          )}
          {/* 数字は小さく補足 */}
          <div style={{ display: 'flex', gap: '0.8rem', opacity: 0.7 }}>
            <div style={{ fontSize: '0.75rem' }}>高度 {Math.round(sunPos.altitude)}°</div>
            <div style={{ fontSize: '0.75rem' }}>方位 {Math.round(sunPos.azimuth)}°</div>
            <div style={{ fontSize: '0.75rem' }}>角度差 {Math.round(result.angleDiff)}°</div>
          </div>
        </div>

        {/* 天気・月齢 横並び */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
          <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>天気</div>
            {wd && weather ? (
              <>
                <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{wd.label}</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>雲量 {weather.cloudcover}%</div>
                <div style={{ fontSize: '0.75rem', color: '#888' }}>気温 {weather.temperature}℃</div>
                <div style={{ marginTop: '8px', display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', background: wd.badgeColor + '22', color: wd.badgeColor }}>
                  {wd.badge}
                </div>
              </>
            ) : (
              <div style={{ color: '#ccc', fontSize: '0.85rem' }}>取得中...</div>
            )}
          </div>

          <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: '0.7rem', color: '#888', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>月・星空</div>
            <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '4px' }}>{moon.phase}</div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '2px' }}>{moon.moonDesc}</div>
            <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '6px' }}>星空：{moon.starLabel}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '700', color: moon.starColor }}>{moon.starStr}</div>
          </div>
        </div>

        {/* タイムライン */}
        <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.2rem 0.6rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333' }}>今日のタイムライン</div>
            <button onClick={() => setShowNight(!showNight)} style={{ fontSize: '0.72rem', color: '#888', background: 'none', border: '1px solid #e5e5e7', borderRadius: '20px', padding: '3px 10px', cursor: 'pointer' }}>
              {showNight ? '夜を隠す' : '夜も表示'}
            </button>
          </div>
          {visibleList.map(({ h, sc, isNow }) => (
            <div key={h} style={{ display: 'flex', alignItems: 'center', padding: '0.55rem 1.2rem', background: isNow ? '#fff8f0' : '#fff', borderTop: '1px solid #f5f5f7' }}>
              <span style={{ width: '40px', fontSize: '0.85rem', fontWeight: isNow ? '700' : '400', color: isNow ? '#e17055' : '#aaa' }}>{h}:00</span>
              <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: sc.color, marginRight: '0.8rem', flexShrink: 0 }} />
              <span style={{ fontSize: '0.88rem', color: isNow ? '#333' : '#555', fontWeight: isNow ? '600' : '400' }}>{sc.emoji} {sc.label}</span>
              {isNow && <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#e17055', fontWeight: '700' }}>← 今</span>}
            </div>
          ))}
        </div>

        <p style={{ color: '#bbb', fontSize: '0.72rem', textAlign: 'center', marginTop: '1.2rem' }}>1分ごとに自動更新</p>
      </div>
    </main>
  );
}