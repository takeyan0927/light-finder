'use client';

import { useState, useEffect, useRef } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

interface Spot {
  name: string;
  lat: number;
  lng: number;
  bearing: number;
}

interface SearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

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
  let altDesc: string;
  if (altitude < 0)       altDesc = '太陽は地平線の下';
  else if (altitude < 6)  altDesc = '太陽が沈みかけている';
  else if (altitude < 20) altDesc = '地平線に近い柔らかい光';
  else if (altitude < 45) altDesc = '斜めから差し込む光';
  else                    altDesc = '真上に近い強い光';

  let dirDesc: string;
  if (altitude < 0)          dirDesc = '';
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
  if (illumination <= 5)       { phase = '🌑 新月';         moonDesc = '月明かりなし';                     stars = 5; starColor = '#6c5ce7'; starLabel = '最高によく見える'; }
  else if (illumination <= 30) { phase = '🌒 細い月';       moonDesc = `月明かり：弱い（${illumination}%）`;       stars = 4; starColor = '#0984e3'; starLabel = 'よく見える'; }
  else if (illumination <= 55) { phase = '🌓 半月';         moonDesc = `月明かり：やや強い（${illumination}%）`;   stars = 3; starColor = '#00b894'; starLabel = 'まあまあ見える'; }
  else if (illumination <= 80) { phase = '🌔 満月に近い月'; moonDesc = `月明かり：強い（${illumination}%）`;       stars = 2; starColor = '#d4a017'; starLabel = 'やや見えにくい'; }
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
  const [spot, setSpot] = useState<Spot | null>(null);
  const [showNight, setShowNight] = useState(false);
  const [weather, setWeather] = useState<{ cloudcover: number; weathercode: number; temperature: number } | null>(null);

  // 検索
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [step, setStep] = useState<'search' | 'bearing' | 'result'>('search');
  const [pendingSpot, setPendingSpot] = useState<{ name: string; lat: number; lng: number } | null>(null);

  // コンパス
  const [compass, setCompass] = useState<number | null>(null);
  const [manualBearing, setManualBearing] = useState(0);
  const [compassError, setCompassError] = useState('');

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const arrowRef = useRef<any>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!spot) return;
    setWeather(null);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&current=temperature_2m,weathercode,cloudcover&timezone=Asia%2FTokyo`)
      .then(r => r.json())
      .then(d => setWeather({ cloudcover: d.current.cloudcover, weathercode: d.current.weathercode, temperature: Math.round(d.current.temperature_2m) }))
      .catch(() => setWeather(null));
  }, [spot]);

  // 検索
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearching(true);
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ja&countrycodes=jp`)
        .then(r => r.json())
        .then(d => { setResults(d); setSearching(false); })
        .catch(() => setSearching(false));
    }, 500);
  }, [query]);

  // 地図初期化
  useEffect(() => {
    if (step !== 'bearing' || !pendingSpot || !mapRef.current) return;
    if (leafletMap.current) return;

    const L = (window as any).L;
    if (!L) return;

    const map = L.map(mapRef.current).setView([pendingSpot.lat, pendingSpot.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap'
    }).addTo(map);

    const marker = L.marker([pendingSpot.lat, pendingSpot.lng]).addTo(map);
    markerRef.current = marker;
    leafletMap.current = map;
  }, [step, pendingSpot]);

  // コンパス取得
  const startCompass = async () => {
    setCompassError('');
    try {
      // iPhone用
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== 'granted') {
          setCompassError('コンパスの許可が必要です');
          return;
        }
      }
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.addEventListener('deviceorientation', handleOrientation as any, true);
    } catch {
      setCompassError('このデバイスはコンパス非対応です。手動で入力してください。');
    }
  };

  const handleOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    let heading: number | null = null;
    if (e.webkitCompassHeading != null) {
      heading = e.webkitCompassHeading;
    } else if (e.absolute && e.alpha != null) {
      heading = 360 - e.alpha;
    }
    if (heading != null) {
      const h = Math.round(heading);
      setCompass(h);
      setManualBearing(h);
    }
  };

  const handleSelectResult = (r: SearchResult) => {
    const name = r.display_name.split('、')[0].split(',')[0];
    setPendingSpot({ name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setQuery(name);
    setResults([]);
    leafletMap.current = null;
    setStep('bearing');
  };

  const handleConfirmBearing = () => {
    if (!pendingSpot) return;
    setSpot({ ...pendingSpot, bearing: manualBearing });
    setStep('result');
    window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.removeEventListener('deviceorientation', handleOrientation as any, true);
  };

  if (!now) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' }}>計算中...</div>;

  const sunPos = spot ? getSunPosition(now, spot.lat, spot.lng) : null;
  const result = spot && sunPos ? analyzeLighting(sunPos, spot.bearing) : null;
  const scene = sunPos && result ? getScene(sunPos.altitude, result.angleDiff) : null;
  const sunDesc = sunPos && result ? getSunDesc(sunPos.altitude, result.angleDiff) : null;
  const moon = getMoon(now);
  const wd = weather ? getWeather(weather.cloudcover, weather.weathercode) : null;

  const hourlyList = spot ? Array.from({ length: 16 }, (_, i) => {
    const h = i + 5;
    const d = new Date(now); d.setHours(h, 0, 0, 0);
    const sp = getSunPosition(d, spot.lat, spot.lng);
    const an = analyzeLighting(sp, spot.bearing);
    return { h, sc: getScene(sp.altitude, an.angleDiff), isNow: now.getHours() === h };
  }) : [];
  const visibleList = showNight ? hourlyList : hourlyList.filter(({ sc, isNow }) => !sc.isNight || isNow);

  const bearingLabel = (b: number) => {
    if (b <= 22 || b > 337) return '北';
    if (b <= 67)  return '北東';
    if (b <= 112) return '東';
    if (b <= 157) return '南東';
    if (b <= 202) return '南';
    if (b <= 247) return '南西';
    if (b <= 292) return '西';
    return '北西';
  };

  return (
    <>
      {/* Leaflet CSS/JS */}
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async />

      <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>

        {/* ヘッダー */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.7rem' }}>
              <span style={{ fontSize: '1.3rem' }}>🌞</span>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: '700', letterSpacing: '-0.5px' }}>Light Finder</div>
                <div style={{ fontSize: '0.72rem', color: '#888', marginTop: '1px' }}>シャッターを押す前に、確認を。</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#888' }}>
                {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
              </span>
            </div>

            {/* 検索ボックス */}
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={query}
                onChange={e => { setQuery(e.target.value); if (step === 'result') { setStep('search'); setSpot(null); } }}
                placeholder="📍 スポット名を入力（例：与那覇前浜）"
                style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #e5e5e7', fontSize: '0.95rem', background: '#f5f5f7', boxSizing: 'border-box' }}
              />
              {searching && <div style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: '0.8rem' }}>検索中...</div>}
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e5e5e7', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 20, marginTop: '4px' }}>
                  {results.map((r, i) => (
                    <div key={i} onClick={() => handleSelectResult(r)} style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f5f5f7', cursor: 'pointer', fontSize: '0.85rem' }}>
                      📍 {r.display_name.split('、')[0].split(',')[0]}
                      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>{r.display_name}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1rem 1.2rem 2rem' }}>

          {/* STEP: 撮影方向 */}
          {step === 'bearing' && pendingSpot && (
            <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* 地図 */}
              <div ref={mapRef} style={{ height: '220px', background: '#e0e0e0' }} />

              <div style={{ padding: '1.2rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.5rem' }}>📐 カメラを向ける方向</div>

                {/* コンパスボタン */}
                <button
                  onClick={startCompass}
                  style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', background: compass != null ? '#00b894' : '#0984e3', color: '#fff', border: 'none', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', marginBottom: '0.8rem' }}
                >
                  {compass != null ? `🧭 コンパス取得中： ${compass}°（${bearingLabel(compass)}）` : '🧭 コンパスで自動取得'}
                </button>

                {compassError && <div style={{ fontSize: '0.8rem', color: '#e17055', marginBottom: '0.8rem' }}>{compassError}</div>}

                {/* 手動入力 */}
                <div style={{ fontSize: '0.8rem', color: '#888', marginBottom: '0.5rem' }}>または手動で入力：</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.8rem' }}>
                  <input
                    type="number" min={0} max={360}
                    value={manualBearing}
                    onChange={e => setManualBearing(Number(e.target.value))}
                    style={{ width: '80px', padding: '0.5rem', borderRadius: '8px', border: '1.5px solid #e5e5e7', fontSize: '1.1rem', textAlign: 'center' }}
                  />
                  <span style={{ color: '#888' }}>°</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: '600', color: '#333' }}>{bearingLabel(manualBearing)}</span>
                </div>
                <input type="range" min={0} max={360} value={manualBearing} onChange={e => setManualBearing(Number(e.target.value))} style={{ width: '100%', marginBottom: '1rem' }} />

                <button
                  onClick={handleConfirmBearing}
                  style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }}
                >
                  この方向で計算する →
                </button>
              </div>
            </div>
          )}

          {/* STEP: 結果表示 */}
          {step === 'result' && spot && scene && sunPos && result && sunDesc && (
            <>
              <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '1rem' }}>
                📍 {spot.name}　撮影方向 {spot.bearing}°（{bearingLabel(spot.bearing)}）
                <span onClick={() => { setStep('search'); setQuery(''); setSpot(null); }} style={{ marginLeft: '12px', color: '#0984e3', cursor: 'pointer', fontSize: '0.8rem' }}>変更</span>
              </div>

              {/* メインカード */}
              <div style={{ background: scene.grad, borderRadius: '20px', padding: '2rem 1.8rem', color: scene.text, marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '7rem', opacity: 0.15 }}>{scene.emoji}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.8, marginBottom: '0.4rem', letterSpacing: '1px', textTransform: 'uppercase' }}>現在の撮影コンディション</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem', letterSpacing: '-0.5px' }}>
                  {scene.emoji} {scene.label}
                </div>
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
                <div style={{ display: 'flex', gap: '0.8rem', opacity: 0.7 }}>
                  <div style={{ fontSize: '0.75rem' }}>高度 {Math.round(sunPos.altitude)}°</div>
                  <div style={{ fontSize: '0.75rem' }}>方位 {Math.round(sunPos.azimuth)}°</div>
                  <div style={{ fontSize: '0.75rem' }}>角度差 {Math.round(result.angleDiff)}°</div>
                </div>
              </div>

              {/* 天気・月齢 */}
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
            </>
          )}

          {/* 初期状態 */}
          {step === 'search' && !spot && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#aaa' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#888', marginBottom: '0.5rem' }}>スポットを検索してください</div>
              <div style={{ fontSize: '0.85rem' }}>場所名を入力すると候補が表示されます</div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}