'use client';

import { useState, useEffect, useRef } from 'react';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';
import SunCalc from 'suncalc';

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

interface HourlyWeather {
  hour: number;
  cloudcover: number;
  weathercode: number;
}

function getScene(altitude: number, angleDiff: number, isMorning: boolean, cloudcover?: number, weathercode?: number) {
  const isBad = weathercode != null && weathercode >= 51;
  const isCloudy = cloudcover != null && cloudcover > 80;

  if (altitude < 0) return { label: '夜・星空撮影', emoji: '🌙', color: '#0f0c29', grad: 'linear-gradient(135deg,#0f0c29,#302b63)', text: '#e8e0ff', isNight: true };

  if (isBad) return { label: '雨・撮影注意', emoji: '🌧️', color: '#636e72', grad: 'linear-gradient(135deg,#636e72,#b2bec3)', text: '#fff', isNight: false };
  if (isCloudy) return { label: '曇り・光の判断困難', emoji: '☁️', color: '#b2bec3', grad: 'linear-gradient(135deg,#b2bec3,#dfe6e9)', text: '#2d3436', isNight: false };

  if (altitude < 6)     return { label: isMorning ? '朝のマジックアワー' : '夕方のマジックアワー', emoji: isMorning ? '🌄' : '🌇', color: '#c0392b', grad: 'linear-gradient(135deg,#c0392b,#f39c12)', text: '#fff', isNight: false };
  if (altitude < 20)    return { label: isMorning ? '朝のゴールデンアワー' : '夕方のゴールデンアワー', emoji: '✨', color: '#e67e22', grad: 'linear-gradient(135deg,#e67e22,#f1c40f)', text: '#3d2200', isNight: false };
  if (angleDiff <= 30)  return { label: '順光・海の透明感', emoji: '🌊', color: '#0984e3', grad: 'linear-gradient(135deg,#0984e3,#00cec9)', text: '#fff', isNight: false };
  if (angleDiff <= 80)  return { label: 'サイドライト', emoji: '💎', color: '#00b894', grad: 'linear-gradient(135deg,#00b894,#55efc4)', text: '#003d30', isNight: false };
  if (angleDiff <= 130) return { label: '半逆光・キラメキ', emoji: '🌟', color: '#d4a017', grad: 'linear-gradient(135deg,#d4a017,#f9ca24)', text: '#3d2a00', isNight: false };
  return { label: '逆光・シルエット', emoji: '🎭', color: '#e17055', grad: 'linear-gradient(135deg,#e17055,#d63031)', text: '#fff', isNight: false };
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

function getMoon(date: Date, cloudcover?: number) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const elapsed = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const age = ((elapsed % lunarCycle) + lunarCycle) % lunarCycle;
  const illumination = Math.round((1 - Math.cos((age / lunarCycle) * 2 * Math.PI)) / 2 * 100);

  // 月明かりスコア（0-5）
  let moonScore: number;
  if (illumination <= 5)       moonScore = 5;
  else if (illumination <= 30) moonScore = 4;
  else if (illumination <= 55) moonScore = 3;
  else if (illumination <= 80) moonScore = 2;
  else                         moonScore = 1;

  // 雲量で補正
  const cloudScore = cloudcover != null
    ? cloudcover <= 20 ? 0 : cloudcover <= 50 ? -1 : cloudcover <= 80 ? -2 : -3
    : 0;

  const finalScore = Math.max(1, Math.min(5, moonScore + cloudScore));

  let phase: string;
  if (illumination <= 5)       phase = '🌑 新月';
  else if (illumination <= 30) phase = '🌒 細い月';
  else if (illumination <= 55) phase = '🌓 半月';
  else if (illumination <= 80) phase = '🌔 満月に近い月';
  else                         phase = '🌕 満月';

  let moonDesc: string;
  if (illumination <= 5)       moonDesc = '月明かりなし';
  else if (illumination <= 30) moonDesc = `月明かり：弱い（${illumination}%）`;
  else if (illumination <= 55) moonDesc = `月明かり：やや強い（${illumination}%）`;
  else if (illumination <= 80) moonDesc = `月明かり：強い（${illumination}%）`;
  else                         moonDesc = `月明かり：とても強い（${illumination}%）`;

  const starLabels = ['見えにくい', 'やや見えにくい', 'まあまあ見える', 'よく見える', '最高によく見える'];
  const starColors = ['#e17055', '#d4a017', '#00b894', '#0984e3', '#6c5ce7'];

  return {
    phase, moonDesc,
    starStr: '★'.repeat(finalScore) + '☆'.repeat(5 - finalScore),
    starColor: starColors[finalScore - 1],
    starLabel: starLabels[finalScore - 1],
  };
}

function getWeatherLabel(cloudcover: number, weathercode: number) {
  if (weathercode >= 61) return { label: '🌧️ 雨',    badge: '撮影困難', badgeColor: '#e17055' };
  if (weathercode >= 51) return { label: '🌦️ 小雨',  badge: '撮影注意', badgeColor: '#fdcb6e' };
  if (weathercode >= 45) return { label: '🌫️ 霧',    badge: '撮影注意', badgeColor: '#fdcb6e' };
  if (cloudcover <= 20)  return { label: '☀️ 快晴',  badge: '撮影最適', badgeColor: '#00b894' };
  if (cloudcover <= 50)  return { label: '🌤️ 晴れ',  badge: '撮影良好', badgeColor: '#0984e3' };
  if (cloudcover <= 80)  return { label: '⛅ 曇り',  badge: '撮影可能', badgeColor: '#636e72' };
  return                        { label: '☁️ 厚曇り', badge: '撮影困難', badgeColor: '#e17055' };
}

const HISTORY_KEY = 'zekkei-finder-history';
function loadHistory(): { name: string; lat: number; lng: number }[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(item: { name: string; lat: number; lng: number }) {
  const history = loadHistory().filter(h => h.name !== item.name);
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

export default function Page() {
  const [now, setNow] = useState<Date | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [showNight, setShowNight] = useState(false);
  const [weather, setWeather] = useState<{ cloudcover: number; weathercode: number; temperature: number } | null>(null);
  const [hourlyWeather, setHourlyWeather] = useState<HourlyWeather[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [step, setStep] = useState<'top' | 'search' | 'bearing' | 'result'>('top');
  const [pendingSpot, setPendingSpot] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [compass, setCompass] = useState<number | null>(null);
  const [manualBearing, setManualBearing] = useState(0);
  const [compassError, setCompassError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [history, setHistory] = useState<{ name: string; lat: number; lng: number }[]>([]);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const arrowLayer = useRef<any>(null);

  useEffect(() => {
    setNow(new Date());
    setHistory(loadHistory());
    const t = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!spot) return;
    setWeather(null);
    setHourlyWeather([]);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&current=temperature_2m,weathercode,cloudcover&hourly=cloudcover,weathercode&timezone=Asia%2FTokyo&forecast_days=1`)
      .then(r => r.json())
      .then(d => {
        setWeather({ cloudcover: d.current.cloudcover, weathercode: d.current.weathercode, temperature: Math.round(d.current.temperature_2m) });
        const hourly: HourlyWeather[] = d.hourly.time.map((t: string, i: number) => ({
          hour: new Date(t).getHours(),
          cloudcover: d.hourly.cloudcover[i],
          weathercode: d.hourly.weathercode[i],
        }));
        setHourlyWeather(hourly);
      })
      .catch(() => setWeather(null));
  }, [spot]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&accept-language=ja&countrycodes=jp`)
        .then(r => r.json())
        .then(d => setResults(d))
        .catch(() => {});
    }, 500);
  }, [query]);

  useEffect(() => {
    if (step !== 'bearing' || !pendingSpot || !mapRef.current) return;
    if (leafletMap.current) return;
    const L = (window as any).L;
    if (!L) return;
    const map = L.map(mapRef.current).setView([pendingSpot.lat, pendingSpot.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    L.marker([pendingSpot.lat, pendingSpot.lng]).addTo(map);
    leafletMap.current = map;
  }, [step, pendingSpot]);

  useEffect(() => {
    if (!leafletMap.current || !pendingSpot) return;
    const L = (window as any).L;
    if (!L) return;
    if (arrowLayer.current) leafletMap.current.removeLayer(arrowLayer.current);
    const rad = (manualBearing * Math.PI) / 180;
    const dist = 0.003;
    const endLat = pendingSpot.lat + dist * Math.cos(rad);
    const endLng = pendingSpot.lng + dist * Math.sin(rad);
    const arrow = L.polyline([[pendingSpot.lat, pendingSpot.lng], [endLat, endLng]], { color: '#e17055', weight: 4, opacity: 0.9 }).addTo(leafletMap.current);
    const arrowHead = L.circleMarker([endLat, endLng], { radius: 8, color: '#e17055', fillColor: '#e17055', fillOpacity: 1, weight: 0 }).addTo(leafletMap.current);
    arrowLayer.current = L.layerGroup([arrow, arrowHead]);
    arrowLayer.current.addTo(leafletMap.current);
  }, [manualBearing, pendingSpot]);

  const handleLocate = () => {
    setLocating(true);
    setLocateError('');
    if (!navigator.geolocation) {
      setLocateError('このブラウザは現在地取得に対応していません');
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ja`);
          const data = await res.json();
          const name = data.address?.city ?? data.address?.town ?? data.address?.village ?? data.address?.suburb ?? '現在地';
          setPendingSpot({ name, lat: latitude, lng: longitude });
          setQuery(name);
          setResults([]);
          leafletMap.current = null;
          setStep('bearing');
        } catch {
          setPendingSpot({ name: '現在地', lat: latitude, lng: longitude });
          setQuery('現在地');
          leafletMap.current = null;
          setStep('bearing');
        }
        setLocating(false);
      },
      (err) => {
        if (err.code === 1) setLocateError('位置情報の許可が必要です。ブラウザの設定を確認してください。');
        else if (err.code === 2) setLocateError('現在地を取得できませんでした。');
        else setLocateError('現在地の取得がタイムアウトしました。');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const startCompass = async () => {
    setCompassError('');
    try {
      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        const permission = await (DeviceOrientationEvent as any).requestPermission();
        if (permission !== 'granted') { setCompassError('コンパスの許可が必要です'); return; }
      }
      window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
      window.addEventListener('deviceorientation', handleOrientation as any, true);
    } catch {
      setCompassError('このデバイスはコンパス非対応です。手動で入力してください。');
    }
  };

  const handleOrientation = (e: DeviceOrientationEvent & { webkitCompassHeading?: number }) => {
    let heading: number | null = null;
    if (e.webkitCompassHeading != null) heading = e.webkitCompassHeading;
    else if (e.absolute && e.alpha != null) heading = 360 - e.alpha;
    if (heading != null) { const h = Math.round(heading); setCompass(h); setManualBearing(h); }
  };

  const handleSelectResult = (r: SearchResult) => {
    const name = r.display_name.split('、')[0].split(',')[0];
    setPendingSpot({ name, lat: parseFloat(r.lat), lng: parseFloat(r.lon) });
    setQuery(name);
    setResults([]);
    leafletMap.current = null;
    setStep('bearing');
  };

  const handleSelectHistory = (h: { name: string; lat: number; lng: number }) => {
    setPendingSpot(h);
    setQuery(h.name);
    setResults([]);
    leafletMap.current = null;
    setStep('bearing');
  };

  const handleConfirmBearing = () => {
    if (!pendingSpot) return;
    setSpot({ ...pendingSpot, bearing: manualBearing });
    saveHistory({ name: pendingSpot.name, lat: pendingSpot.lat, lng: pendingSpot.lng });
    setHistory(loadHistory());
    setStep('result');
    window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.removeEventListener('deviceorientation', handleOrientation as any, true);
  };

  if (!now) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' }}>計算中...</div>;

  const sunPos = spot ? getSunPosition(now, spot.lat, spot.lng) : null;
  const result = spot && sunPos ? analyzeLighting(sunPos, spot.bearing) : null;
  const sunTimes = spot ? SunCalc.getTimes(now, spot.lat, spot.lng) : null;
  const sunrise = sunTimes?.sunrise;
  const sunset = sunTimes?.sunset;
  const sunriseHour = sunrise ? sunrise.getHours() + sunrise.getMinutes() / 60 : 6;
  const sunsetHour = sunset ? sunset.getHours() + sunset.getMinutes() / 60 : 18;
  const solarNoon = (sunriseHour + sunsetHour) / 2;
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isMorning = currentHour < solarNoon;
  const scene = sunPos && result ? getScene(sunPos.altitude, result.angleDiff, isMorning, weather?.cloudcover, weather?.weathercode) : null;
  const sunDesc = sunPos && result ? getSunDesc(sunPos.altitude, result.angleDiff) : null;
  const moon = getMoon(now, weather?.cloudcover);
  const wd = weather ? getWeatherLabel(weather.cloudcover, weather.weathercode) : null;

  const hourlyList = spot ? Array.from({ length: 28 }, (_, i) => {
    const h = Math.floor(i / 2) + 5;
    const m = i % 2 === 0 ? 0 : 30;
    const d = new Date(now); d.setHours(h, m, 0, 0);
    const sp = getSunPosition(d, spot.lat, spot.lng);
    const an = analyzeLighting(sp, spot.bearing);
    const hHour = h + m / 60;
    const isMorn = hHour < solarNoon;
    const hw = hourlyWeather.find(w => w.hour === h);
    const sc = getScene(sp.altitude, an.angleDiff, isMorn, hw?.cloudcover, hw?.weathercode);
    const isNow = now.getHours() === h && (m === 0 ? now.getMinutes() < 30 : now.getMinutes() >= 30);
    return { h, m, sc, isNow };
  }) : [];

  const sceneMap = new Map<string, { hours: string[]; sc: ReturnType<typeof getScene> }>();
  hourlyList.forEach(({ h, m, sc }) => {
    if (sc.isNight) return;
    if (!sceneMap.has(sc.label)) sceneMap.set(sc.label, { hours: [], sc });
    sceneMap.get(sc.label)!.hours.push(`${h}:${String(m).padStart(2, '0')}`);
  });

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

  // トップページ
  if (step === 'top') {
    return (
      <main style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#e17055 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: '400px' }}>
          <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>🌞</div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', letterSpacing: '-1px', marginBottom: '0.5rem' }}>絶景ファインダー</h1>
          <p style={{ fontSize: '1rem', opacity: 0.85, marginBottom: '0.5rem', lineHeight: 1.6 }}>
            今この場所で、どんな写真が撮れるか。
          </p>
          <p style={{ fontSize: '0.85rem', opacity: 0.65, marginBottom: '3rem', lineHeight: 1.6 }}>
            シャッターを押す前に確認できる撮影サポートアプリ
          </p>

          <button
            onClick={() => setStep('search')}
            style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', marginBottom: '1rem' }}
          >
            📍 スポットを検索する
          </button>
          <button
            onClick={() => { setStep('search'); setTimeout(handleLocate, 100); }}
            style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer' }}
          >
            📡 現在地から探す
          </button>

          {history.length > 0 && (
            <div style={{ marginTop: '2rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem', fontWeight: '600' }}>最近のスポット</div>
              {history.map((h, i) => (
                <div key={i} onClick={() => { setPendingSpot(h); setQuery(h.name); leafletMap.current = null; setStep('bearing'); }} style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', marginBottom: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>
                  🕐 {h.name}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async />

      <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.7rem' }}>
              <span style={{ fontSize: '1.3rem', cursor: 'pointer' }} onClick={() => setStep('top')}>🌞</span>
              <div>
                <div style={{ fontSize: '1.1rem', fontWeight: '700', letterSpacing: '-0.5px', color: '#333', cursor: 'pointer' }} onClick={() => setStep('top')}>絶景ファインダー</div>
                <div style={{ fontSize: '0.72rem', color: '#666', marginTop: '1px' }}>シャッターを押す前に、確認を。</div>
              </div>
              <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: '#555' }}>
                {now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
              </span>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="text" value={query}
                  onChange={e => { setQuery(e.target.value); if (step === 'result') { setStep('search'); setSpot(null); } }}
                  placeholder="📍 スポット名を入力"
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #ccc', fontSize: '0.95rem', background: '#f0f0f0', color: '#333' }}
                />
                <button onClick={handleLocate} disabled={locating} style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1.5px solid #ccc', background: '#f0f0f0', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', fontWeight: '600', color: '#333' }}>
                  {locating ? '📡...' : '📍現在地'}
                </button>
              </div>
              {locateError && <div style={{ fontSize: '0.8rem', color: '#e17055', marginBottom: '6px' }}>{locateError}</div>}
              {results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', borderRadius: '10px', border: '1px solid #e5e5e7', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 20, marginTop: '4px' }}>
                  {results.map((r, i) => (
                    <div key={i} onClick={() => handleSelectResult(r)} style={{ padding: '0.7rem 1rem', borderBottom: '1px solid #f5f5f7', cursor: 'pointer', fontSize: '0.85rem', color: '#333' }}>
                      📍 {r.display_name.split('、')[0].split(',')[0]}
                      <div style={{ fontSize: '0.75rem', color: '#888', marginTop: '2px' }}>{r.display_name}</div>
                    </div>
                  ))}
                </div>
              )}
              {step === 'search' && !query && history.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '10px', border: '1px solid #e5e5e7', padding: '0.5rem 0' }}>
                  <div style={{ fontSize: '0.72rem', color: '#aaa', padding: '0.3rem 1rem', fontWeight: '600' }}>最近のスポット</div>
                  {history.map((h, i) => (
                    <div key={i} onClick={() => handleSelectHistory(h)} style={{ padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.85rem', borderTop: '1px solid #f5f5f7', display: 'flex', alignItems: 'center', gap: '8px', color: '#333' }}>
                      <span style={{ color: '#aaa' }}>🕐</span><span>{h.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1rem 1.2rem 2rem' }}>

          {step === 'bearing' && pendingSpot && (
            <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div ref={mapRef} style={{ height: '240px', background: '#e0e0e0' }} />
              <div style={{ padding: '0.8rem 1rem', background: '#fff8f0', borderBottom: '1px solid #f0f0f0', fontSize: '0.8rem', color: '#e17055', fontWeight: '600' }}>
                🎯 赤い矢印がカメラの向きです。スライダーで調整してください。
              </div>
              <div style={{ padding: '1.2rem' }}>
                <div style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.8rem', color: '#333' }}>📐 カメラを向ける方向</div>
                <button onClick={startCompass} style={{ width: '100%', padding: '0.7rem', borderRadius: '10px', background: compass != null ? '#00b894' : '#0984e3', color: '#fff', border: 'none', fontSize: '0.95rem', fontWeight: '600', cursor: 'pointer', marginBottom: '0.8rem' }}>
                  {compass != null ? `🧭 ${compass}°（${bearingLabel(compass)}）取得中` : '🧭 コンパスで自動取得'}
                </button>
                {compassError && <div style={{ fontSize: '0.8rem', color: '#e17055', marginBottom: '0.8rem' }}>{compassError}</div>}
                <input type="range" min={0} max={360} value={manualBearing} onChange={e => setManualBearing(Number(e.target.value))} style={{ width: '100%', marginBottom: '0.5rem' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: '#666' }}>手動調整</span>
                  <span style={{ fontSize: '1.2rem', fontWeight: '700', color: '#e17055' }}>{manualBearing}°（{bearingLabel(manualBearing)}）</span>
                </div>
                <button onClick={handleConfirmBearing} style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }}>
                  この方向で計算する →
                </button>
              </div>
            </div>
          )}

          {step === 'result' && spot && scene && sunPos && result && sunDesc && (
            <>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem' }}>
                📍 {spot.name}　{spot.bearing}°（{bearingLabel(spot.bearing)}）
                <span onClick={() => { setStep('search'); setQuery(''); setSpot(null); }} style={{ marginLeft: '12px', color: '#0984e3', cursor: 'pointer', fontSize: '0.8rem' }}>変更</span>
              </div>

              {sunrise && sunset && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                  <div style={{ background: 'linear-gradient(135deg,#f39c12,#f7b731)', borderRadius: '12px', padding: '0.8rem 1rem', color: '#3d2200' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '2px' }}>🌅 日の出</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800' }}>{formatTime(sunrise)}</div>
                    <div style={{ fontSize: '0.72rem', marginTop: '2px', opacity: 0.8 }}>
                      マジックアワー {formatTime(new Date(sunrise.getTime() - 30 * 60000))}〜
                    </div>
                  </div>
                  <div style={{ background: 'linear-gradient(135deg,#c0392b,#e74c3c)', borderRadius: '12px', padding: '0.8rem 1rem', color: '#fff' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '2px' }}>🌇 日の入り</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: '800' }}>{formatTime(sunset)}</div>
                    <div style={{ fontSize: '0.72rem', marginTop: '2px', opacity: 0.8 }}>
                      マジックアワー 〜{formatTime(new Date(sunset.getTime() + 30 * 60000))}
                    </div>
                  </div>
                </div>
              )}

              <div style={{ background: scene.grad, borderRadius: '20px', padding: '2rem 1.8rem', color: scene.text, marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '7rem', opacity: 0.15 }}>{scene.emoji}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.8, marginBottom: '0.4rem', letterSpacing: '1px', textTransform: 'uppercase' }}>現在の撮影コンディション</div>
                <div style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem', letterSpacing: '-0.5px' }}>{scene.emoji} {scene.label}</div>
                {sunPos.altitude >= 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '1rem' }}>
                    <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>☀️ {sunDesc.altDesc}</div>
                    {sunDesc.dirDesc && <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>📐 {sunDesc.dirDesc}</div>}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.8rem', opacity: 0.7 }}>
                  <div style={{ fontSize: '0.75rem' }}>高度 {Math.round(sunPos.altitude)}°</div>
                  <div style={{ fontSize: '0.75rem' }}>方位 {Math.round(sunPos.azimuth)}°</div>
                  <div style={{ fontSize: '0.75rem' }}>角度差 {Math.round(result.angleDiff)}°</div>
                </div>
              </div>

              {sceneMap.size > 0 && (
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333', marginBottom: '0.8rem' }}>📅 今日撮れるシーン</div>
                  {Array.from(sceneMap.entries()).map(([label, { hours, sc }]) => (
                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0.4rem 0', borderBottom: '1px solid #f5f5f7' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: sc.color, flexShrink: 0 }} />
                      <span style={{ fontSize: '0.85rem', fontWeight: '600', flex: 1, color: '#333' }}>{sc.emoji} {label}</span>
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>{hours[0]}{hours.length > 1 ? `〜${hours[hours.length - 1]}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>天気</div>
                  {wd && weather ? (
                    <>
                      <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{wd.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#444' }}>雲量 {weather.cloudcover}%</div>
                      <div style={{ fontSize: '0.75rem', color: '#444' }}>気温 {weather.temperature}℃</div>
                      <div style={{ marginTop: '8px', display: 'inline-block', padding: '2px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: '700', background: wd.badgeColor + '22', color: wd.badgeColor }}>{wd.badge}</div>
                    </>
                  ) : <div style={{ color: '#aaa', fontSize: '0.85rem' }}>取得中...</div>}
                </div>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>月・星空</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '4px', color: '#333' }}>{moon.phase}</div>
                  <div style={{ fontSize: '0.75rem', color: '#444', marginBottom: '2px' }}>{moon.moonDesc}</div>
                  <div style={{ fontSize: '0.75rem', color: '#444', marginBottom: '6px' }}>星空：{moon.starLabel}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: moon.starColor }}>{moon.starStr}</div>
                </div>
              </div>

              <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.2rem 0.6rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333' }}>今日のタイムライン</div>
                  <button onClick={() => setShowNight(!showNight)} style={{ fontSize: '0.72rem', color: '#666', background: 'none', border: '1px solid #e5e5e7', borderRadius: '20px', padding: '3px 10px', cursor: 'pointer' }}>
                    {showNight ? '夜を隠す' : '夜も表示'}
                  </button>
                </div>
                {visibleList.map(({ h, m, sc, isNow }) => (
                  <div key={`${h}-${m}`} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 1rem', background: isNow ? '#fff8f0' : '#fff', borderTop: '1px solid #f5f5f7' }}>
                    <span style={{ width: '48px', fontSize: '0.82rem', fontWeight: isNow ? '700' : '400', color: isNow ? '#e17055' : '#999', flexShrink: 0 }}>{h}:{String(m).padStart(2,'0')}</span>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sc.color, marginRight: '0.6rem', flexShrink: 0 }} />
                    <span style={{ fontSize: '0.82rem', color: isNow ? '#333' : '#555', fontWeight: isNow ? '600' : '400' }}>{sc.emoji} {sc.label}</span>
                    {isNow && <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#e17055', fontWeight: '700', flexShrink: 0 }}>← 今</span>}
                  </div>
                ))}
              </div>
              <p style={{ color: '#bbb', fontSize: '0.72rem', textAlign: 'center', marginTop: '1.2rem' }}>1分ごとに自動更新</p>
            </>
          )}

          {step === 'search' && !query && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#aaa' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📍</div>
              <div style={{ fontSize: '1rem', fontWeight: '600', color: '#888', marginBottom: '0.5rem' }}>スポットを検索してください</div>
              <div style={{ fontSize: '0.85rem', color: '#aaa' }}>場所名を入力するか、現在地ボタンを使ってください</div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}