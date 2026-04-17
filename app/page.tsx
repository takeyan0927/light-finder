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
  timeStr: string;
}

interface FavoriteSpot {
  name: string;
  lat: number;
  lng: number;
  bearing: number;
}

interface Memo {
  spotName: string;
  text: string;
  date: string;
}

// ─────────────────────────────────────────────
// 撮影レシピマップ（シーン別 露出補正・WB・撮影モード・ヒント）
// ─────────────────────────────────────────────
const RECIPE_MAP: Record<string, { ev: string; wb: string; mode: string; tip: string }> = {
  '朝のマジックアワー':    { ev: '-0.7〜-1.0EV', wb: '曇天（6000K）',        mode: 'AV優先 f/8',          tip: 'RAW必須。色変化が速いので30秒ごとに連写' },
  '夕方のマジックアワー':  { ev: '-0.7〜-1.0EV', wb: '曇天（6000K）',        mode: 'AV優先 f/8',          tip: '日没後10分が最も赤い。三脚推奨' },
  '朝のゴールデンアワー':  { ev: '-0.3〜-0.7EV', wb: '晴天（5500K）',        mode: 'AV優先 f/8',          tip: '影を積極的に使う。長い影が奥行きを作る' },
  '夕方のゴールデンアワー':{ ev: '-0.3〜-0.7EV', wb: '晴天（5500K）',        mode: 'AV優先 f/8',          tip: '逆光気味なら+0.3補正。ハイライト注意' },
  '順光・透明感MAX':       { ev: '±0〜-0.3EV',  wb: '太陽光（5200K）',      mode: 'AV優先 f/11',         tip: 'PLフィルター効果大。青空・水面の透明感UP' },
  '斜光・立体感あり':      { ev: '±0EV',         wb: '太陽光（5200K）',      mode: 'AV優先 f/8',          tip: '影方向に注意。建物・山の陰影が際立つ' },
  '半逆光・キラメキ':      { ev: '+0.3〜+0.7EV', wb: '太陽光（5200K）',      mode: 'AV優先 f/5.6',        tip: 'フレア覚悟で太陽端に構図。スポット測光推奨' },
  '逆光・シルエット':      { ev: '-1.0〜-2.0EV', wb: 'オート',               mode: 'AV優先 f/11',         tip: 'シルエット狙いは被写体を完全に黒く落とす' },
  '夜・星空撮影':          { ev: 'ISO3200 SS20秒',wb: 'オート or 3800K',     mode: 'M完全マニュアル f/2.8',tip: '赤道儀なしなら20秒以内。ピントは無限遠手前' },
  '曇り・光の判断困難':    { ev: '+0.3〜+0.7EV', wb: '曇天（6500K）',        mode: 'AV優先 f/5.6',        tip: '柔らかい均一光。人物・花のポートレートに最適' },
  '雨・撮影注意':          { ev: '+0.7EV',        wb: '曇天（6500K）',        mode: 'SS優先 1/500',        tip: '雨粒を流すならSS遅め。防塵防滴必須' },
  '夜・曇り':              { ev: 'ISO1600 SS4秒', wb: '蛍光灯（4000K）',      mode: 'M完全マニュアル f/4', tip: '街灯・建物光を活かす。白飛び注意' },
  '夜・雨':                { ev: 'ISO800 SS1秒',  wb: '蛍光灯（4000K）',      mode: 'M完全マニュアル f/5.6',tip: '路面の光の反射が主役。三脚必須' },
};

function getRecipe(sceneLabel: string) {
  return RECIPE_MAP[sceneLabel] ?? null;
}

// ─────────────────────────────────────────────
// 既存ユーティリティ関数群
// ─────────────────────────────────────────────
function getScene(altitude: number, angleDiff: number, isMorning: boolean, cloudcover?: number, weathercode?: number) {
  const isBad = weathercode != null && weathercode >= 51;
  const isCloudy = cloudcover != null && cloudcover > 80;
  if (altitude < 0 && isBad)    return { label: '夜・雨', emoji: '🌧️', color: '#636e72', grad: 'linear-gradient(135deg,#636e72,#b2bec3)', text: '#fff', isNight: true };
  if (altitude < 0 && isCloudy) return { label: '夜・曇り', emoji: '☁️', color: '#4a4a6a', grad: 'linear-gradient(135deg,#4a4a6a,#6a6a8a)', text: '#e8e0ff', isNight: true };
  if (altitude < 0)             return { label: '夜・星空撮影', emoji: '🌙', color: '#0f0c29', grad: 'linear-gradient(135deg,#0f0c29,#302b63)', text: '#e8e0ff', isNight: true };
  if (isBad)    return { label: '雨・撮影注意', emoji: '🌧️', color: '#636e72', grad: 'linear-gradient(135deg,#636e72,#b2bec3)', text: '#fff', isNight: false };
  if (isCloudy) return { label: '曇り・光の判断困難', emoji: '☁️', color: '#b2bec3', grad: 'linear-gradient(135deg,#b2bec3,#dfe6e9)', text: '#2d3436', isNight: false };
  if (altitude < 6)     return { label: isMorning ? '朝のマジックアワー' : '夕方のマジックアワー', emoji: isMorning ? '🌄' : '🌇', color: '#c0392b', grad: 'linear-gradient(135deg,#c0392b,#f39c12)', text: '#fff', isNight: false };
  if (altitude < 20)    return { label: isMorning ? '朝のゴールデンアワー' : '夕方のゴールデンアワー', emoji: '✨', color: '#e67e22', grad: 'linear-gradient(135deg,#e67e22,#f1c40f)', text: '#3d2200', isNight: false };
  if (angleDiff <= 30)  return { label: '順光・透明感MAX', emoji: '🌊', color: '#0984e3', grad: 'linear-gradient(135deg,#0984e3,#00cec9)', text: '#fff', isNight: false };
  if (angleDiff <= 80)  return { label: '斜光・立体感あり', emoji: '💎', color: '#00b894', grad: 'linear-gradient(135deg,#00b894,#55efc4)', text: '#003d30', isNight: false };
  if (angleDiff <= 130) return { label: '半逆光・キラメキ', emoji: '🌟', color: '#d4a017', grad: 'linear-gradient(135deg,#d4a017,#f9ca24)', text: '#3d2a00', isNight: false };
  return { label: '逆光・シルエット', emoji: '🎭', color: '#e17055', grad: 'linear-gradient(135deg,#e17055,#d63031)', text: '#fff', isNight: false };
}

function getSceneDesc(label: string): string {
  if (label.includes('マジックアワー')) return '日の出・日の入り直前。空の色が刻々と変わる魔法の時間';
  if (label.includes('ゴールデンアワー')) return '柔らかな斜光で被写体に温かみと立体感が出る時間';
  if (label === '順光・透明感MAX') return '太陽が背後から当たり、被写体の色と透明感が最大になる';
  if (label === '斜光・立体感あり') return '横から光が当たり、奥行きと立体感が生まれる時間';
  if (label === '半逆光・キラメキ') return '斜め前から光が当たり、水面や木の葉がキラキラ輝く';
  if (label === '逆光・シルエット') return '被写体が影になり、シルエットや光のフレアを狙える';
  if (label.includes('曇り')) return '光が散乱して柔らかくなるが、色の鮮明さは落ちる';
  if (label.includes('雨')) return '雨天のため通常の撮影には不向き';
  return '';
}

function getSunDesc(altitude: number, angleDiff: number) {
  const altDesc = altitude < 0 ? '太陽は地平線の下' : altitude < 6 ? '太陽が沈みかけている' : altitude < 20 ? '地平線に近い柔らかい光' : altitude < 45 ? '斜めから差し込む光' : '真上に近い強い光';
  const dirDesc = altitude < 0 ? '' : angleDiff <= 30 ? '背後から光が当たっている' : angleDiff <= 80 ? '横から光が当たっている' : angleDiff <= 130 ? '斜め前から光が当たっている' : '正面から光が当たっている';
  return { altDesc, dirDesc };
}

// ─────────────────────────────────────────────
// 月の出・月の入り時刻を取得
// ─────────────────────────────────────────────
function getMoonTimes(date: Date, lat: number, lng: number) {
  const times = SunCalc.getMoonTimes(date, lat, lng);
  const fmt = (d: Date) => d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
  const rise = times.rise instanceof Date ? fmt(times.rise) : null;
  const set  = times.set  instanceof Date ? fmt(times.set)  : null;
  const moonPos = SunCalc.getMoonPosition(date, lat, lng);
  const azimuth = Math.round((moonPos.azimuth * 180 / Math.PI + 180 + 360) % 360);
  return { rise, set, azimuth };
}

// ─────────────────────────────────────────────
// 撮影計画カード生成（Canvas API）- クライアント専用
// ─────────────────────────────────────────────
function generateShareCard(params: {
  spotName: string;
  date: string;
  sunrise: string;
  sunriseAzimuth: number;
  sunset: string;
  sunsetAzimuth: number;
  magicStart: string;
  magicEnd: string;
  goldenStart: string;
  goldenEnd: string;
  moonRise: string | null;
  moonSet: string | null;
  moonPhase: string;
  moonIllumination: number;
  sceneLabel: string;
  stars: number;
  ev: string;
  wb: string;
  mode: string;
  tip: string;
}): Promise<string> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createLinearGradient(0, 0, 800, 1000);
    grad.addColorStop(0, '#fff8f0');
    grad.addColorStop(0.5, '#fff3e0');
    grad.addColorStop(1, '#ffecd2');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.rect(0, 0, 800, 1000);
    ctx.fill();

    ctx.fillStyle = '#e67e22';
    ctx.fillRect(40, 40, 120, 3);

    ctx.font = '500 22px sans-serif';
    ctx.fillStyle = '#e67e22';
    ctx.fillText('SHOOTING PLAN · 絶景ファインダー', 40, 80);

    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = '#1a1a1a';
    ctx.fillText(params.spotName.length > 12 ? params.spotName.slice(0, 12) + '…' : params.spotName, 40, 148);

    ctx.font = '400 26px sans-serif';
    ctx.fillStyle = '#999';
    ctx.fillText(params.date, 40, 188);

    ctx.strokeStyle = 'rgba(225,112,85,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(40, 210); ctx.lineTo(760, 210); ctx.stroke();

    const drawCard = (x: number, y: number, w: number, h: number, borderColor: string) => {
      const r = 12;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    drawCard(40, 230, 340, 140, 'rgba(243,156,18,0.4)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#e67e22';
    ctx.fillText('🌅 日の出', 60, 265);
    ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#e67e22';
    ctx.fillText(params.sunrise, 60, 330);
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('方向 ' + params.sunriseAzimuth + '°', 60, 358);

    drawCard(420, 230, 340, 140, 'rgba(108,92,231,0.3)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#6c5ce7';
    ctx.fillText('🌙 月の出', 440, 265);
    ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#6c5ce7';
    ctx.fillText(params.moonRise ?? '--:--', 440, 330);
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText(params.moonPhase + ' ' + params.moonIllumination + '%', 440, 358);

    drawCard(40, 390, 340, 140, 'rgba(225,112,85,0.4)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#e17055';
    ctx.fillText('🌇 日の入り', 60, 425);
    ctx.font = 'bold 56px sans-serif'; ctx.fillStyle = '#e17055';
    ctx.fillText(params.sunset, 60, 490);
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('方向 ' + params.sunsetAzimuth + '°', 60, 518);

    drawCard(420, 390, 340, 140, 'rgba(241,196,15,0.5)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#d4a017';
    ctx.fillText('✨ マジックアワー', 440, 425);
    ctx.font = 'bold 30px sans-serif'; ctx.fillStyle = '#d4a017';
    ctx.fillText(params.magicStart + '〜' + params.magicEnd, 440, 475);
    ctx.font = '400 20px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('ゴールデン ' + params.goldenStart + '〜' + params.goldenEnd, 440, 510);

    drawCard(40, 550, 720, 220, 'rgba(0,0,0,0.08)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('📷 撮影レシピ', 60, 585);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(60, 598); ctx.lineTo(740, 598); ctx.stroke();
    const recipes = [['露出補正', params.ev], ['ホワイトバランス', params.wb], ['撮影モード', params.mode]];
    recipes.forEach(([label, val], i) => {
      ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#333';
      ctx.fillText(label, 60, 632 + i * 38);
      ctx.font = '500 22px sans-serif'; ctx.fillStyle = '#111';
      ctx.textAlign = 'right'; ctx.fillText(val, 740, 632 + i * 38); ctx.textAlign = 'left';
    });
    ctx.font = '400 19px sans-serif'; ctx.fillStyle = '#555';
    ctx.fillText('💡 ' + params.tip, 60, 755);

    drawCard(40, 790, 720, 100, 'rgba(0,0,0,0.07)');
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('現在のシーン', 60, 825);
    ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#e67e22';
    ctx.fillText(params.sceneLabel, 60, 868);
    ctx.textAlign = 'right';
    ctx.font = '400 22px sans-serif'; ctx.fillStyle = '#999';
    ctx.fillText('おすすめ度', 740, 825);
    ctx.font = 'bold 28px sans-serif'; ctx.fillStyle = '#c8a84b';
    ctx.fillText('★'.repeat(params.stars) + '☆'.repeat(5 - params.stars), 740, 868);
    ctx.textAlign = 'left';

    ctx.font = '400 19px sans-serif'; ctx.fillStyle = '#bbb';
    ctx.textAlign = 'center';
    ctx.fillText('zekkei-finder.com  #絶景ファインダー  #風景写真', 400, 930);
    ctx.textAlign = 'left';

    resolve(canvas.toDataURL('image/png'));
  });
}

function getMoonForDate(date: Date, nightCloudcover?: number, nightWeathercode?: number) {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const elapsed = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const age = ((elapsed % lunarCycle) + lunarCycle) % lunarCycle;
  const illumination = Math.round((1 - Math.cos((age / lunarCycle) * 2 * Math.PI)) / 2 * 100);
  let moonScore = illumination <= 5 ? 5 : illumination <= 30 ? 4 : illumination <= 55 ? 3 : illumination <= 80 ? 2 : 1;
  let cloudScore = 0;
  if (nightWeathercode != null && nightWeathercode >= 61) cloudScore = -3;
  else if (nightWeathercode != null && nightWeathercode >= 51) cloudScore = -2;
  else if (nightCloudcover != null) {
    if (nightCloudcover > 80) cloudScore = -2;
    else if (nightCloudcover > 50) cloudScore = -1;
  }
  const finalScore = Math.max(1, Math.min(5, moonScore + cloudScore));
  const phase = illumination <= 5 ? '🌑 新月' : illumination <= 30 ? '🌒 細い月' : illumination <= 55 ? '🌓 半月' : illumination <= 80 ? '🌔 満月に近い月' : '🌕 満月';
  const moonDesc = illumination <= 5 ? '月明かりなし' : illumination <= 30 ? `月明かり：弱い（${illumination}%）` : illumination <= 55 ? `月明かり：やや強い（${illumination}%）` : illumination <= 80 ? `月明かり：強い（${illumination}%）` : `月明かり：とても強い（${illumination}%）`;
  const starLabels = ['見えにくい', 'やや見えにくい', 'まあまあ見える', 'よく見える', '最高によく見える'];
  const starColors = ['#e17055', '#d4a017', '#00b894', '#0984e3', '#6c5ce7'];
  return { phase, moonDesc, starStr: '★'.repeat(finalScore) + '☆'.repeat(5 - finalScore), starColor: starColors[finalScore - 1], starLabel: starLabels[finalScore - 1], illumination };
}

function getNightStarSlots(
  date: Date,
  lat: number,
  lng: number,
  hourlyWeather: { hour: number; cloudcover: number; weathercode: number; timeStr: string }[]
): { hour: number; score: number; moonUp: boolean }[] {
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const elapsed = (date.getTime() - knownNewMoon.getTime()) / (1000 * 60 * 60 * 24);
  const age = ((elapsed % lunarCycle) + lunarCycle) % lunarCycle;
  const illumination = (1 - Math.cos((age / lunarCycle) * 2 * Math.PI)) / 2;
  const moonPenalty = Math.round(illumination * 3);

  const slots: { hour: number; score: number; moonUp: boolean }[] = [];
  for (let i = 0; i < 10; i++) {
    const h = (20 + i) % 24;
    const slotDate = new Date(date);
    if (h < 20) slotDate.setDate(slotDate.getDate() + 1);
    slotDate.setHours(h, 0, 0, 0);

    const moonPos = SunCalc.getMoonPosition(slotDate, lat, lng);
    const moonUp = (moonPos.altitude * 180 / Math.PI) > 0;

    const hw = hourlyWeather.find(w => {
      const wd = new Date(w.timeStr);
      return wd.getHours() === h && wd.getDate() === slotDate.getDate();
    });

    let score = 5;
    if (moonUp) score -= moonPenalty;
    if (hw) {
      if (hw.weathercode >= 61) score -= 3;
      else if (hw.weathercode >= 51) score -= 2;
      else if (hw.cloudcover > 80) score -= 2;
      else if (hw.cloudcover > 50) score -= 1;
    }
    slots.push({ hour: h, score: Math.max(1, Math.min(5, score)), moonUp });
  }
  return slots;
}

function getWeatherLabel(cloudcover: number, weathercode: number) {
  if (weathercode >= 61) return { label: '🌧️ 雨', badge: '×', badgeColor: '#e17055' };
  if (weathercode >= 51) return { label: '🌦️ 小雨', badge: '△', badgeColor: '#fdcb6e' };
  if (weathercode >= 45) return { label: '🌫️ 霧', badge: '△', badgeColor: '#fdcb6e' };
  if (weathercode <= 1)  return { label: '☀️ 快晴', badge: '◎', badgeColor: '#00b894' };
  if (weathercode <= 2)  return { label: '🌤️ 晴れ', badge: '○', badgeColor: '#0984e3' };
  if (cloudcover <= 30)  return { label: '☀️ 快晴', badge: '◎', badgeColor: '#00b894' };
  if (cloudcover <= 60)  return { label: '🌤️ 晴れ', badge: '○', badgeColor: '#0984e3' };
  if (cloudcover <= 85)  return { label: '⛅ 曇り', badge: '△', badgeColor: '#636e72' };
  return { label: '☁️ 厚曇り', badge: '×', badgeColor: '#e17055' };
}

function getSunDirection(date: Date, lat: number, lng: number, type: 'sunrise' | 'sunset') {
  const times = SunCalc.getTimes(date, lat, lng);
  const targetTime = type === 'sunrise' ? times.sunrise : times.sunset;
  const pos = SunCalc.getPosition(targetTime, lat, lng);
  const azimuth = Math.round((pos.azimuth * 180 / Math.PI + 180) % 360);
  return { time: targetTime, azimuth };
}

function bearingLabel(b: number) {
  if (b <= 22 || b > 337) return '北';
  if (b <= 67)  return '北東';
  if (b <= 112) return '東';
  if (b <= 157) return '南東';
  if (b <= 202) return '南';
  if (b <= 247) return '南西';
  if (b <= 292) return '西';
  return '北西';
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' });
}

function toDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

function getLightTypeLabel(angleDiff: number, altitude: number, isMorning: boolean): { label: string; short: string; color: string } {
  if (altitude < 6) return { label: isMorning ? '朝マジック' : '夕マジック', short: isMorning ? '🌄朝' : '🌇夕', color: '#c0392b' };
  if (altitude < 20) return { label: isMorning ? '朝ゴールデン' : '夕ゴールデン', short: isMorning ? '✨朝G' : '✨夕G', color: '#e67e22' };
  if (angleDiff <= 30) return { label: '完全順光', short: '順光◎', color: '#0984e3' };
  if (angleDiff <= 80) return { label: '斜光', short: '斜光', color: '#00b894' };
  if (angleDiff <= 130) return { label: '半逆光', short: '半逆光', color: '#d4a017' };
  return { label: '逆光', short: '逆光', color: '#636e72' };
}

function getTimelineComment(lightLabel: string, altitude: number, angleDiff: number, spotName: string): string {
  const isBeach = /ビーチ|浜|海岸|岬|島|珊瑚|サンゴ|湾/.test(spotName);
  const isMountain = /山|岳|峠|高原|丘|展望台/.test(spotName);
  const isCity = /駅|街|市|公園|橋|タワー|ビル/.test(spotName);
  if (lightLabel === '朝マジック') {
    if (isBeach) return '砂浜が金色に染まる。水面がオレンジに輝く';
    if (isMountain) return '山肌に最初の光が当たる神秘的な瞬間';
    if (isCity) return '街灯と朝焼けが混ざる幻想的な時間';
    return '空が刻々と変わる。色の変化を連写で';
  }
  if (lightLabel === '夕マジック') {
    if (isBeach) return '空と海が赤く染まる。この色は10分で消える';
    if (isMountain) return '稜線が燃えるように赤く染まる';
    if (isCity) return '街の光と夕焼けが重なる時間';
    return '空のグラデーションが最大になる時間';
  }
  if (lightLabel === '朝ゴールデン') {
    if (isBeach) return '柔らかい光が海面を照らす。色温度が最高';
    if (isMountain) return '低角度の光で山の立体感が際立つ';
    return '影が長く伸びて奥行きのある構図が作れる';
  }
  if (lightLabel === '夕ゴールデン') {
    if (isBeach) return '波頭がキラキラと光り始める時間';
    if (isMountain) return '山肌の陰影がドラマチックに深まる';
    return '光が柔らかくなり景色が温かみを帯びる';
  }
  if (lightLabel === '完全順光') {
    if (isBeach) return 'エメラルドグリーンが最も濃く出る。透明感MAX';
    if (isMountain) return '山全体が均一に明るく、細部まで鮮明に';
    if (isCity) return '建物の色が正確に出る。看板も鮮明';
    return '被写体全体が均一に明るく、色が正確に出る';
  }
  if (lightLabel === '斜光') {
    if (isBeach) return '海の青みがしっかり出る。光がやや硬め';
    if (isMountain) return '稜線がくっきり出て、立体感もある';
    return '安定した光で撮りやすい時間帯';
  }
  if (lightLabel === '半逆光') {
    if (isBeach) return '波の陰影が面白く出る。テクスチャーが強調';
    if (isMountain) return '谷の陰影が深まり、地形の迫力が増す';
    return '被写体に立体感が出る。影の使い方がポイント';
  }
  if (isBeach) return '海面がキラキラ輝くシルエット撮影のチャンス';
  if (isMountain) return '山のシルエットが浮かぶ幻想的な構図に';
  return 'シルエット・フレア狙いの上級者向け時間帯';
}

function getStars(matchScore: number, cloudcover?: number, weathercode?: number): number {
  let base = Math.round((matchScore / 100) * 5);
  if (weathercode != null && weathercode >= 61) base = Math.max(0, base - 3);
  else if (weathercode != null && weathercode >= 51) base = Math.max(0, base - 2);
  else if (cloudcover != null && cloudcover > 80) base = Math.max(0, base - 2);
  else if (cloudcover != null && cloudcover > 50) base = Math.max(0, base - 1);
  return Math.max(1, Math.min(5, base));
}

function StarStr(count: number) {
  return '★'.repeat(count) + '☆'.repeat(5 - count);
}

// ─────────────────────────────────────────────
// 扇形オーバーレイ描画（ビジュアル方位計）
// ─────────────────────────────────────────────
function drawFanOverlay(map: any, L: any, lat: number, lng: number, bearing: number, color: string, fovDeg = 60) {
  const R = 0.006; // 扇形の半径（度）
  const steps = 32;
  const halfFov = fovDeg / 2;
  const points: [number, number][] = [[lat, lng]];
  for (let i = 0; i <= steps; i++) {
    const angleDeg = bearing - halfFov + (fovDeg * i) / steps;
    const angleRad = (angleDeg * Math.PI) / 180;
    points.push([lat + R * Math.cos(angleRad), lng + R * Math.sin(angleRad)]);
  }
  points.push([lat, lng]);
  return L.polygon(points, {
    color,
    fillColor: color,
    fillOpacity: 0.18,
    weight: 1.5,
    opacity: 0.7,
  });
}

function drawArrow(map: any, L: any, lat: number, lng: number, azimuth: number, color: string) {
  const dist = 0.008;
  const endLat = lat + dist * Math.cos((azimuth * Math.PI) / 180);
  const endLng = lng + dist * Math.sin((azimuth * Math.PI) / 180);
  const arrow = L.polyline([[lat, lng], [endLat, endLng]], { color, weight: 4, opacity: 0.9 });
  const head = L.circleMarker([endLat, endLng], { radius: 8, color, fillColor: color, fillOpacity: 1, weight: 0 });
  return L.layerGroup([arrow, head]).addTo(map);
}

function CameraLogo({ size = 72 }: { size?: number }) {
  return (
    <svg width={size} height={Math.round(size * 0.75)} viewBox="0 0 120 90" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="18" width="90" height="62" rx="8" fill="#1a1d2e" stroke="#3a3f5c" strokeWidth="1.2"/>
      <rect x="86" y="23" width="22" height="52" rx="6" fill="#141620" stroke="#3a3f5c" strokeWidth="1.2"/>
      <rect x="20" y="12" width="28" height="9" rx="3" fill="#1a1d2e" stroke="#3a3f5c" strokeWidth="1"/>
      <rect x="66" y="10" width="20" height="10" rx="3" fill="#1a1d2e" stroke="#3a3f5c" strokeWidth="1"/>
      <ellipse cx="80" cy="17" rx="7" ry="5" fill="#e8c060"/>
      <ellipse cx="80" cy="16" rx="5" ry="3.5" fill="#f0d070"/>
      <circle cx="52" cy="49" r="30" fill="#141620" stroke="#3a3f5c" strokeWidth="1"/>
      <circle cx="52" cy="49" r="26" fill="#0d0f1a" stroke="#2a2f4a" strokeWidth="0.8"/>
      <circle cx="52" cy="49" r="22" fill="#0a0c14"/>
      {[0, 51.4, 102.8, 154.2, 205.6, 257, 308.6].map((deg, i) => (
        <path key={i} d="M0,-14 C5,-9 6,-2 2,2 C0,5 -3,6 -5,4 C-2,1 1,-5 0,-14Z"
          fill="#c8a84b" opacity={0.88}
          transform={`translate(52,49) rotate(${deg})`} />
      ))}
      <circle cx="52" cy="49" r="7" fill="#050608"/>
      <circle cx="52" cy="49" r="5" fill="#080a10"/>
    </svg>
  );
}

const HISTORY_KEY = 'zekkei-finder-history';
const FAVORITES_KEY = 'zekkei-finder-favorites';
const MEMOS_KEY = 'zekkei-finder-memos';

function loadHistory(): { name: string; lat: number; lng: number }[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function saveHistory(item: { name: string; lat: number; lng: number }) {
  const history = loadHistory().filter(h => h.name !== item.name);
  history.unshift(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
}
function loadFavorites(): FavoriteSpot[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); } catch { return []; }
}
function saveFavorite(item: FavoriteSpot) {
  const favs = loadFavorites().filter(f => f.name !== item.name);
  favs.unshift(item);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}
function removeFavorite(name: string) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(loadFavorites().filter(f => f.name !== name)));
}
function loadMemos(): Memo[] {
  try { return JSON.parse(localStorage.getItem(MEMOS_KEY) ?? '[]'); } catch { return []; }
}
function saveMemo(memo: Memo) {
  const memos = loadMemos().filter(m => !(m.spotName === memo.spotName && m.date === memo.date));
  memos.unshift(memo);
  localStorage.setItem(MEMOS_KEY, JSON.stringify(memos.slice(0, 50)));
}

// ─────────────────────────────────────────────
// メインコンポーネント
// ─────────────────────────────────────────────
export default function Page() {
  const [now, setNow] = useState<Date | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [showNight, setShowNight] = useState(false);
  const [weather, setWeather] = useState<{ cloudcover: number; weathercode: number; temperature: number } | null>(null);
  const [hourlyWeather, setHourlyWeather] = useState<HourlyWeather[]>([]);
  const [dayForecasts, setDayForecasts] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [step, setStep] = useState<'top' | 'search' | 'bearing' | 'result' | 'guide' | 'request'>('top');
  const [pendingSpot, setPendingSpot] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [compass, setCompass] = useState<number | null>(null);
  const [manualBearing, setManualBearing] = useState(0);
  const [compassError, setCompassError] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState('');
  const [history, setHistory] = useState<{ name: string; lat: number; lng: number }[]>([]);
  const [favorites, setFavorites] = useState<FavoriteSpot[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [mode, setMode] = useState<'A' | 'B'>('A');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedPurpose, setSelectedPurpose] = useState<'sunrise' | 'sunset' | 'star' | null>(null);
  const [suggestionResult, setSuggestionResult] = useState<any>(null);
  const [latInput, setLatInput] = useState('');
  const [lngInput, setLngInput] = useState('');
  const [memoText, setMemoText] = useState('');
  const [memos, setMemos] = useState<Memo[]>([]);
  const [showMemo, setShowMemo] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  // 撮影レシピ表示用
  const [showRecipe, setShowRecipe] = useState(false);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [generatingCard, setGeneratingCard] = useState(false);

  const sunriseMapRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const resultMapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const resultLeafletMap = useRef<any>(null);
  const arrowLayer = useRef<any>(null);
  const fanLayer = useRef<any>(null);

  // ─── 初期化 & URLパラメータ復元 ───
  useEffect(() => {
    setNow(new Date());
    setSelectedDate(toDateString(new Date()));
    setHistory(loadHistory());
    setFavorites(loadFavorites());
    setMemos(loadMemos());
    const t = setInterval(() => setNow(new Date()), 60000);

    // URLパラメータからスポットを復元
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlLat  = params.get('lat');
      const urlLng  = params.get('lng');
      const urlBear = params.get('bearing');
      const urlName = params.get('spotName');
      if (urlLat && urlLng && urlBear && urlName) {
        const lat     = parseFloat(urlLat);
        const lng     = parseFloat(urlLng);
        const bearing = parseInt(urlBear, 10);
        if (!isNaN(lat) && !isNaN(lng) && !isNaN(bearing)) {
          const restored: Spot = { name: decodeURIComponent(urlName), lat, lng, bearing };
          setSpot(restored);
          setQuery(restored.name);
          setManualBearing(bearing);
          setStep('result');
        }
      }
    }

    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!spot) return;
    setWeather(null); setHourlyWeather([]); setDayForecasts([]);
    fetch(`https://api.open-meteo.com/v1/forecast?latitude=${spot.lat}&longitude=${spot.lng}&current=temperature_2m,weathercode,cloudcover&hourly=cloudcover,weathercode&daily=weathercode,cloudcover_mean,sunrise,sunset&timezone=Asia%2FTokyo&forecast_days=3`)
      .then(r => r.json())
      .then(d => {
        setWeather({ cloudcover: d.current.cloudcover, weathercode: d.current.weathercode, temperature: Math.round(d.current.temperature_2m) });
        setHourlyWeather(d.hourly.time.map((t: string, i: number) => ({
          hour: new Date(t).getHours(),
          cloudcover: d.hourly.cloudcover[i],
          weathercode: d.hourly.weathercode[i],
          timeStr: t,
        })));
        const today = new Date();
        setDayForecasts(d.daily.time.map((t: string, i: number) => {
          const date = new Date(t);
          const diffDays = Math.round((date.getTime() - new Date(toDateString(today)).getTime()) / 86400000);
          const label = diffDays === 0 ? '今日' : diffDays === 1 ? '明日' : '明後日';
          const wd = getWeatherLabel(d.daily.cloudcover_mean[i], d.daily.weathercode[i]);
          return { date: t, label, cloudcover: d.daily.cloudcover_mean[i], weathercode: d.daily.weathercode[i], weatherLabel: wd.label, badge: wd.badge, badgeColor: wd.badgeColor };
        }));
      }).catch(() => {});
    setIsFavorite(loadFavorites().some(f => f.name === spot.name));
  }, [spot]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=8&accept-language=ja&countrycodes=jp&addressdetails=1&namedetails=1`)
        .then(r => r.json()).then(d => setResults(d)).catch(() => {});
    }, 500);
  }, [query]);

  // ─── 方位設定マップ（扇形オーバーレイ付き） ───
  useEffect(() => {
    if (step !== 'bearing' || !pendingSpot || !mapRef.current) return;
    const initMap = () => {
      const L = (window as any).L;
      if (!L) return;
      if (leafletMap.current) { leafletMap.current.remove(); leafletMap.current = null; }
      const mapEl = mapRef.current;
      if (!mapEl) return;
      if ((mapEl as any)._leaflet_id) (mapEl as any)._leaflet_id = null;
      const map = L.map(mapEl).setView([pendingSpot.lat, pendingSpot.lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([pendingSpot.lat, pendingSpot.lng]).addTo(map);
      leafletMap.current = map;
      const panes = mapEl.querySelectorAll('.leaflet-pane, .leaflet-control-container');
      panes.forEach((p: any) => { p.style.zIndex = '1'; });
    };
    if ((window as any).L) { initMap(); } else {
      const timer = setInterval(() => { if ((window as any).L) { clearInterval(timer); initMap(); } }, 100);
      return () => clearInterval(timer);
    }
  }, [step, pendingSpot]);

  // ─── 扇形オーバーレイ更新（manualBearing 変化時） ───
  useEffect(() => {
    if (!leafletMap.current || !pendingSpot) return;
    const L = (window as any).L;
    if (!L) return;

    // 既存の矢印・扇形を除去
    if (arrowLayer.current) leafletMap.current.removeLayer(arrowLayer.current);
    if (fanLayer.current) leafletMap.current.removeLayer(fanLayer.current);

    // 扇形オーバーレイ（カメラ画角 60°）
    const fan = drawFanOverlay(leafletMap.current, L, pendingSpot.lat, pendingSpot.lng, manualBearing, '#e17055', 60);
    fan.addTo(leafletMap.current);
    fanLayer.current = fan;

    // 中央の向き矢印
    const dist = 0.005;
    const endLat = pendingSpot.lat + dist * Math.cos((manualBearing * Math.PI) / 180);
    const endLng = pendingSpot.lng + dist * Math.sin((manualBearing * Math.PI) / 180);
    const arrow = L.polyline([[pendingSpot.lat, pendingSpot.lng], [endLat, endLng]], { color: '#e17055', weight: 4, opacity: 0.95 });
    const arrowHead = L.circleMarker([endLat, endLng], { radius: 7, color: '#e17055', fillColor: '#e17055', fillOpacity: 1, weight: 0 });
    arrowLayer.current = L.layerGroup([arrow, arrowHead]);
    arrowLayer.current.addTo(leafletMap.current);
  }, [manualBearing, pendingSpot]);

  useEffect(() => {
    if (!suggestionResult || !resultMapRef.current || !spot) return;
    const initResultMap = () => {
      const L = (window as any).L;
      if (!L) return;
      if (resultLeafletMap.current) { resultLeafletMap.current.remove(); resultLeafletMap.current = null; }
      const mapEl = resultMapRef.current;
      if (!mapEl) return;
      if ((mapEl as any)._leaflet_id) (mapEl as any)._leaflet_id = null;
      const map = L.map(mapEl).setView([spot.lat, spot.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([spot.lat, spot.lng]).addTo(map);
      if (suggestionResult.azimuth != null) {
        drawFanOverlay(map, L, spot.lat, spot.lng, suggestionResult.azimuth, '#f39c12', 60).addTo(map);
        drawArrow(map, L, spot.lat, spot.lng, suggestionResult.azimuth, '#f39c12');
      }
      resultLeafletMap.current = map;
    };
    if ((window as any).L) { initResultMap(); } else {
      const timer = setInterval(() => { if ((window as any).L) { clearInterval(timer); initResultMap(); } }, 100);
      return () => clearInterval(timer);
    }
  }, [suggestionResult, spot]);

  // 日の出・日の入り方角地図（扇形付き）
  useEffect(() => {
    if (!spot || step !== 'result' || !sunriseMapRef.current) return;
    const srAzimuth = getSunDirection(new Date(), spot.lat, spot.lng, 'sunrise').azimuth;
    const ssAzimuth = getSunDirection(new Date(), spot.lat, spot.lng, 'sunset').azimuth;
    const initSunriseMap = () => {
      const L = (window as any).L;
      if (!L) return;
      const mapEl = sunriseMapRef.current;
      if (!mapEl) return;
      if ((mapEl as any)._leaflet_id) (mapEl as any)._leaflet_id = null;
      const map = L.map(mapEl, { zoomControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false }).setView([spot.lat, spot.lng], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
      L.marker([spot.lat, spot.lng]).addTo(map);
      // 日の出・日の入りの扇形
      drawFanOverlay(map, L, spot.lat, spot.lng, srAzimuth, '#f39c12', 30).addTo(map);
      drawFanOverlay(map, L, spot.lat, spot.lng, ssAzimuth, '#e74c3c', 30).addTo(map);
      drawArrow(map, L, spot.lat, spot.lng, srAzimuth, '#f39c12');
      drawArrow(map, L, spot.lat, spot.lng, ssAzimuth, '#e74c3c');
      // 月の方向ベクトル（シルバー）
      const moonPos = SunCalc.getMoonPosition(new Date(), spot.lat, spot.lng);
      const moonAz = Math.round((moonPos.azimuth * 180 / Math.PI + 180 + 360) % 360);
      if ((moonPos.altitude * 180 / Math.PI) > 0) {
        drawFanOverlay(map, L, spot.lat, spot.lng, moonAz, '#a0a0c0', 20).addTo(map);
        drawArrow(map, L, spot.lat, spot.lng, moonAz, '#a0a0c0');
      }
    };
    if ((window as any).L) { initSunriseMap(); } else {
      const timer = setInterval(() => { if ((window as any).L) { clearInterval(timer); initSunriseMap(); } }, 100);
      return () => clearInterval(timer);
    }
  }, [spot, step]);

  const handleLocate = () => {
    setLocating(true); setLocateError('');
    if (!navigator.geolocation) { setLocateError('このブラウザは現在地取得に対応していません'); setLocating(false); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=ja`);
          const data = await res.json();
          const name = data.address?.city ?? data.address?.town ?? data.address?.village ?? data.address?.suburb ?? '現在地';
          setPendingSpot({ name, lat: latitude, lng: longitude });
          setQuery(name); setResults([]); leafletMap.current = null; setStep('bearing');
        } catch {
          setPendingSpot({ name: '現在地', lat: latitude, lng: longitude });
          setQuery('現在地'); leafletMap.current = null; setStep('bearing');
        }
        setLocating(false);
      },
      (err) => {
        if (err.code === 1) setLocateError('位置情報の許可が必要です。');
        else if (err.code === 2) setLocateError('現在地を取得できませんでした。');
        else setLocateError('タイムアウトしました。');
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
    } catch { setCompassError('このデバイスはコンパス非対応です。手動で入力してください。'); }
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
    setQuery(name); setResults([]); leafletMap.current = null; setStep('bearing');
  };

  const handleSelectHistory = (h: { name: string; lat: number; lng: number }) => {
    setPendingSpot(h); setQuery(h.name); setResults([]); leafletMap.current = null; setStep('bearing');
  };

  const handleSelectFavorite = (f: FavoriteSpot) => {
    setSpot(f); saveHistory({ name: f.name, lat: f.lat, lng: f.lng });
    setHistory(loadHistory()); setSuggestionResult(null); setStep('result');
  };

  const handleConfirmBearing = () => {
    if (!pendingSpot) return;
    setSpot({ ...pendingSpot, bearing: manualBearing });
    saveHistory(pendingSpot); setHistory(loadHistory());
    setSuggestionResult(null); setStep('result');
    window.removeEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.removeEventListener('deviceorientation', handleOrientation as any, true);
  };

  const handleSuggest = () => {
    if (!pendingSpot || !selectedDate || !selectedPurpose) return;
    const date = new Date(selectedDate + 'T12:00:00+09:00');
    const times = SunCalc.getTimes(date, pendingSpot.lat, pendingSpot.lng);
    const moon = getMoonForDate(date);
    if (resultLeafletMap.current) { resultLeafletMap.current.remove(); resultLeafletMap.current = null; }
    if (selectedPurpose === 'sunrise') {
      const { azimuth } = getSunDirection(date, pendingSpot.lat, pendingSpot.lng, 'sunrise');
      setSuggestionResult({ type: 'sunrise', azimuth, time: formatTime(times.sunrise), magicStart: formatTime(new Date(times.sunrise.getTime() - 30 * 60000)), goldenEnd: formatTime(new Date(times.sunrise.getTime() + 60 * 60000)), moon });
    } else if (selectedPurpose === 'sunset') {
      const { azimuth } = getSunDirection(date, pendingSpot.lat, pendingSpot.lng, 'sunset');
      setSuggestionResult({ type: 'sunset', azimuth, time: formatTime(times.sunset), magicEnd: formatTime(new Date(times.sunset.getTime() + 30 * 60000)), goldenStart: formatTime(new Date(times.sunset.getTime() - 60 * 60000)), moon });
    } else {
      const starStart = new Date(times.sunset.getTime() + 60 * 60000);
      const starEnd = new Date(times.sunrise.getTime() - 30 * 60000);
      setSuggestionResult({ type: 'star', moon, starStart: formatTime(starStart), starEnd: formatTime(starEnd), sunset: formatTime(times.sunset), sunrise: formatTime(times.sunrise), azimuth: null });
    }
    setSpot({ name: pendingSpot.name, lat: pendingSpot.lat, lng: pendingSpot.lng, bearing: 0 });
    saveHistory(pendingSpot); setHistory(loadHistory()); setStep('result');
  };

  const handleToggleFavorite = () => {
    if (!spot) return;
    if (isFavorite) { removeFavorite(spot.name); setIsFavorite(false); }
    else { saveFavorite(spot); setIsFavorite(true); }
    setFavorites(loadFavorites());
  };

  // ─── URL共有機能 ───
  const handleShare = () => {
    if (!spot) return;
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://zekkei-finder.com';
    const params = new URLSearchParams({
      lat:      spot.lat.toString(),
      lng:      spot.lng.toString(),
      bearing:  spot.bearing.toString(),
      spotName: spot.name,
    });
    const shareUrl = `${base}/?${params.toString()}`;
    // 常にクリップボードにコピー
    navigator.clipboard.writeText(shareUrl).then(() => {
      setShareMsg('URLをコピーしました！');
      setTimeout(() => setShareMsg(''), 2500);
    }).catch(() => {
      // clipboard API非対応の場合はテキストエリアで代替
      const ta = document.createElement('textarea');
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setShareMsg('URLをコピーしました！');
      setTimeout(() => setShareMsg(''), 2500);
    });
  };

  const handleGenerateCard = async () => {
    if (!spot || !scene || !now) return;
    setGeneratingCard(true);
    const todaySr = getSunDirection(now as Date, spot.lat, spot.lng, 'sunrise');
    const todaySs = getSunDirection(now as Date, spot.lat, spot.lng, 'sunset');
    const sunT = SunCalc.getTimes(now, spot.lat, spot.lng);
    const sr = sunT.sunrise;
    const ss = sunT.sunset;
    const moonT = getMoonTimes(now as Date, spot.lat, spot.lng);
    const recipe = getRecipe(scene.label);
    const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const magicStartTime = sr ? formatTime(new Date(sr.getTime() - 30 * 60000)) : '--:--';
    const goldenEndTime   = sr ? formatTime(new Date(sr.getTime() + 60 * 60000)) : '--:--';
    const magicEndTime    = ss ? formatTime(new Date(ss.getTime() + 30 * 60000)) : '--:--';
    const goldenStartTime = ss ? formatTime(new Date(ss.getTime() - 60 * 60000)) : '--:--';
    try {
      const url = await generateShareCard({
        spotName: spot.name,
        date: dateStr,
        sunrise: sr ? formatTime(sr) : '--:--',
        sunriseAzimuth: todaySr.azimuth,
        sunset: ss ? formatTime(ss) : '--:--',
        sunsetAzimuth: todaySs.azimuth,
        magicStart: magicStartTime,
        magicEnd: magicEndTime,
        goldenStart: goldenStartTime,
        goldenEnd: goldenEndTime,
        moonRise: moonT.rise,
        moonSet: moonT.set,
        moonPhase: moon.phase.replace(/🌑|🌒|🌓|🌔|🌕/g, '').trim(),
        moonIllumination: moon.illumination,
        sceneLabel: scene.label,
        stars: nowStars,
        ev: recipe?.ev ?? '−',
        wb: recipe?.wb ?? '−',
        mode: recipe?.mode ?? '−',
        tip: recipe?.tip ?? '',
      });
      setShareCardUrl(url);
    } catch (e) { console.error(e); }
    setGeneratingCard(false);
  };

  const handleDownloadCard = () => {
    if (!shareCardUrl || !spot) return;
    const a = document.createElement('a');
    a.href = shareCardUrl;
    a.download = `zekkei-finder-${spot.name}.png`;
    a.click();
  };

  const handleSaveMemo = () => {
    if (!spot || !memoText.trim()) return;
    const memo: Memo = { spotName: spot.name, text: memoText, date: new Date().toLocaleDateString('ja-JP') };
    saveMemo(memo); setMemos(loadMemos()); setMemoText(''); setShowMemo(false);
  };

  const handleSendRequest = async () => {
    if (!requestName.trim()) return;
    try {
      await fetch(`https://formsubmit.co/hiroki.ykh.1228@gmail.com`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ subject: '絶景ファインダー スポットリクエスト', message: `場所名：${requestName}\n備考：${requestNote}` }),
      });
    } catch {}
    setRequestSent(true);
  };

  const handleBackToBearing = () => {
    setSuggestionResult(null);
    if (resultLeafletMap.current) { resultLeafletMap.current.remove(); resultLeafletMap.current = null; }
    setStep('bearing');
  };

  if (!now) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#888' }}>計算中...</div>;

  const sunPos = spot && now ? getSunPosition(now, spot.lat, spot.lng) : null;
  const result = spot && sunPos ? analyzeLighting(sunPos, spot.bearing) : null;
  const sunTimes = spot && now ? SunCalc.getTimes(now, spot.lat, spot.lng) : null;
  const sunrise = sunTimes?.sunrise;
  const sunset = sunTimes?.sunset;
  const sunriseHour = sunrise ? sunrise.getHours() + sunrise.getMinutes() / 60 : 6;
  const sunsetHour = sunset ? sunset.getHours() + sunset.getMinutes() / 60 : 18;
  const solarNoon = (sunriseHour + sunsetHour) / 2;
  const currentHour = now.getHours() + now.getMinutes() / 60;
  const isMorning = currentHour < solarNoon;
  const scene = sunPos && result ? getScene(sunPos.altitude, result.angleDiff, isMorning, weather?.cloudcover, weather?.weathercode) : null;
  const sunDesc = sunPos && result ? getSunDesc(sunPos.altitude, result.angleDiff) : null;
  const recipe = scene ? getRecipe(scene.label) : null;

  const nightWeather = hourlyWeather.filter(w => {
    const wDate = new Date(w.timeStr);
    const wh = wDate.getHours();
    return wh >= 20 || wh <= 4;
  });
  const nightCloudAvg = nightWeather.length > 0
    ? Math.round(nightWeather.reduce((sum, w) => sum + w.cloudcover, 0) / nightWeather.length)
    : undefined;
  const nightWeathercode = nightWeather.length > 0
    ? Math.max(...nightWeather.map(w => w.weathercode))
    : undefined;
  const moon = getMoonForDate(now ?? new Date(), nightCloudAvg, nightWeathercode);
  const moonTimes = spot && now ? getMoonTimes(now, spot.lat, spot.lng) : null;
  const nightStarSlots = spot && now ? getNightStarSlots(now, spot.lat, spot.lng, hourlyWeather) : [];
  const wd = weather ? getWeatherLabel(weather.cloudcover, weather.weathercode) : null;
  const todaySunrise = spot && now ? getSunDirection(now, spot.lat, spot.lng, 'sunrise') : null;
  const todaySunset = spot && now ? getSunDirection(now, spot.lat, spot.lng, 'sunset') : null;
  const spotMemos = memos.filter(m => m.spotName === spot?.name);

  const hourlyList = spot ? Array.from({ length: 48 }, (_, i) => {
    const h = Math.floor(i / 2);
    const m = i % 2 === 0 ? 0 : 30;
    const d = new Date(now); d.setHours(h, m, 0, 0);
    const sp = getSunPosition(d, spot.lat, spot.lng);
    const an = analyzeLighting(sp, spot.bearing);
    const hHour = h + m / 60;
    const isMorn = hHour < solarNoon;
    const hw = hourlyWeather.find(w => {
      const wDate = new Date(w.timeStr);
      return wDate.getHours() === h && wDate.getDate() === d.getDate();
    }) ?? hourlyWeather.find(w => {
      const wDate = new Date(w.timeStr);
      return wDate.getHours() === (m === 30 ? h : h - 1) && wDate.getDate() === d.getDate();
    });
    const sc = getScene(sp.altitude, an.angleDiff, isMorn, hw?.cloudcover, hw?.weathercode);
    const lt = getLightTypeLabel(an.angleDiff, sp.altitude, isMorn);
    const stars = sc.isNight ? 0 : getStars(an.matchScore, hw?.cloudcover, hw?.weathercode);
    const comment = sc.isNight ? '' : getTimelineComment(lt.label, sp.altitude, an.angleDiff, spot.name);
    const isNow = now.getHours() === h && (m === 0 ? now.getMinutes() < 30 : now.getMinutes() >= 30);
    return { h, m, sc, lt, stars, comment, matchScore: an.matchScore, isNow };
  }) : [];

  const nowEntry = hourlyList.find(e => e.isNow) ?? hourlyList[now.getHours() * 2];
  const nowScore = nowEntry?.matchScore ?? 0;
  const nowStars = nowEntry?.stars ?? 0;
  const nowLt = nowEntry?.lt;
  const nowComment = nowEntry?.comment ?? '';
  const nowIsNight = nowEntry?.sc?.isNight ?? false;
  const nowJudge = nowIsNight ? null :
    nowStars >= 4 ? { level: 'HIGH', label: '今すぐ行く価値あり', color: '#e17055', bg: 'rgba(225,112,85,0.12)', border: 'rgba(225,112,85,0.35)' } :
    nowStars >= 3 ? { level: 'MID', label: '悪くない。行ける距離なら◎', color: '#d4a017', bg: 'rgba(212,160,23,0.12)', border: 'rgba(212,160,23,0.35)' } :
    { level: 'LOW', label: '別の時間帯を狙おう', color: '#b2bec3', bg: 'rgba(178,190,195,0.12)', border: 'rgba(178,190,195,0.35)' };

  type SceneBlock = { label: string; sc: ReturnType<typeof getScene>; start: string; end: string; isBad: boolean };
  const sceneBlocks: SceneBlock[] = [];
  hourlyList.forEach(({ h, m, sc }) => {
    if (sc.isNight) return;
    const timeStr = `${h}:${String(m).padStart(2, '0')}`;
    const isBad = sc.label === '曇り・光の判断困難' || sc.label === '雨・撮影注意';
    const last = sceneBlocks[sceneBlocks.length - 1];
    if (last && last.label === sc.label) {
      last.end = timeStr;
    } else {
      sceneBlocks.push({ label: sc.label, sc, start: timeStr, end: timeStr, isBad });
    }
  });
  sceneBlocks.forEach(block => {
    const [hh, mm] = block.end.split(':').map(Number);
    const nextMm = mm === 30 ? 0 : 30;
    const nextHh = mm === 30 ? hh + 1 : hh;
    block.end = `${nextHh}:${String(nextMm).padStart(2, '0')}`;
  });

  const visibleList = showNight ? hourlyList : hourlyList.filter(({ sc, isNow }) => !sc.isNight || isNow);

  // ─────────────────────────────────────────────
  // ガイドページ
  // ─────────────────────────────────────────────
  if (step === 'guide') {
    return (
      <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setStep('top')} style={{ background: 'none', border: 'none', color: '#0984e3', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}>← 戻る</button>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: '#333' }}>使い方ガイド</span>
          </div>
        </div>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1.2rem' }}>
          {[
            { step: '01', title: 'スポットを検索する', desc: '場所名を入力するか、現在地ボタンでGPSから自動取得。Google Mapsで調べた緯度経度の直接入力も可能です。', emoji: '📍' },
            { step: '02', title: 'カメラを向ける方向を設定', desc: 'スマホのコンパスで自動取得するか、スライダーで手動調整。地図上の赤い扇形がカメラの撮影範囲（画角60°）を示します。', emoji: '📐' },
            { step: '03', title: '撮影コンディションを確認', desc: '現在の光の状態・天気・日の出日の入り時刻を確認。今日撮れるシーン一覧で一日の撮影プランが立てられます。', emoji: '🌞' },
            { step: '04', title: '日付・目的から計画する', desc: '「日付・目的から探す」タブで朝日・夕陽・星空の最適な撮影方向と時間帯を事前にチェックできます。', emoji: '📅' },
            { step: '05', title: 'お気に入り保存・メモ', desc: 'よく行くスポットはお気に入りに保存。撮影メモでその日の設定値や感想を記録できます。', emoji: '⭐' },
          ].map(item => (
            <div key={item.step} style={{ background: '#fff', borderRadius: '16px', padding: '1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
              <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: '#fff8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', flexShrink: 0 }}>{item.emoji}</div>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#e17055', fontWeight: '700', marginBottom: '2px' }}>STEP {item.step}</div>
                <div style={{ fontSize: '0.95rem', fontWeight: '700', color: '#333', marginBottom: '4px' }}>{item.title}</div>
                <div style={{ fontSize: '0.82rem', color: '#666', lineHeight: 1.6 }}>{item.desc}</div>
              </div>
            </div>
          ))}
          <div style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63)', borderRadius: '16px', padding: '1.2rem', color: '#fff', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '700', marginBottom: '0.5rem' }}>💡 プロカメラマンからのヒント</div>
            <div style={{ fontSize: '0.82rem', lineHeight: 1.7, opacity: 0.9 }}>マジックアワーは日の出・日の入りの前後30分。この時間帯は空の色が刻々と変わるため、同じ場所でも全く異なる写真が撮れます。複数枚撮影して光の変化を記録するのがおすすめです。</div>
          </div>
          <button onClick={() => setStep('search')} style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }}>
            さっそく使ってみる →
          </button>
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────
  // スポットリクエストページ
  // ─────────────────────────────────────────────
  if (step === 'request') {
    return (
      <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '480px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setStep('top')} style={{ background: 'none', border: 'none', color: '#0984e3', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600' }}>← 戻る</button>
            <span style={{ fontSize: '1rem', fontWeight: '700', color: '#333' }}>スポット登録リクエスト</span>
          </div>
        </div>
        <div style={{ maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1.2rem' }}>
          {requestSent ? (
            <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#333', marginBottom: '0.5rem' }}>リクエストを送信しました！</div>
              <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '2rem' }}>確認後、順次対応いたします。</div>
              <button onClick={() => { setRequestSent(false); setStep('top'); }} style={{ padding: '0.8rem 2rem', borderRadius: '10px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: 'pointer' }}>トップに戻る</button>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: '16px', padding: '1.2rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '1rem', lineHeight: 1.6 }}>検索で見つからないスポットをリクエストできます。</div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#555', fontWeight: '600', marginBottom: '4px' }}>場所名 *</div>
                <input type="text" value={requestName} onChange={e => setRequestName(e.target.value)} placeholder="例：比嘉ロードパーク"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1.5px solid #e5e5e7', fontSize: '0.95rem', color: '#333', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#555', fontWeight: '600', marginBottom: '4px' }}>備考</div>
                <textarea value={requestNote} onChange={e => setRequestNote(e.target.value)} placeholder="例：沖縄県うるま市与那城比嘉"
                  style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1.5px solid #e5e5e7', fontSize: '0.9rem', color: '#333', boxSizing: 'border-box', height: '100px', resize: 'none' }} />
              </div>
              <button onClick={handleSendRequest} disabled={!requestName.trim()}
                style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: requestName.trim() ? '#e17055' : '#e5e5e7', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: requestName.trim() ? 'pointer' : 'default' }}>
                リクエストを送信する
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────
  // トップページ
  // ─────────────────────────────────────────────
  if (step === 'top') {
    return (
      <main style={{ minHeight: '100vh', background: 'linear-gradient(160deg,#0f0c29 0%,#302b63 50%,#e17055 100%)', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ textAlign: 'center', color: '#fff', maxWidth: '400px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.2rem' }}>
            <CameraLogo size={88} />
          </div>
          <h1 style={{ fontSize: '2.2rem', fontWeight: '800', letterSpacing: '-1px', marginBottom: '0.5rem' }}>絶景ファインダー</h1>
          <p style={{ fontSize: '1rem', opacity: 0.85, marginBottom: '0.5rem', lineHeight: 1.6 }}>今この場所で、どんな写真が撮れるか。</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.65, marginBottom: '2rem', lineHeight: 1.6 }}>シャッターを押す前に確認できる撮影サポートアプリ</p>
          <button onClick={() => setStep('search')} style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: '#e17055', color: '#fff', border: 'none', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', marginBottom: '0.8rem' }}>
            📍 スポットを検索する
          </button>
          <button onClick={() => { setStep('search'); setTimeout(handleLocate, 100); }} style={{ width: '100%', padding: '1rem', borderRadius: '14px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)', fontSize: '1.1rem', fontWeight: '700', cursor: 'pointer', marginBottom: '0.8rem' }}>
            📡 現在地から探す
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
            <button onClick={() => setStep('guide')} style={{ padding: '0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}>📖 使い方ガイド</button>
            <button onClick={() => setStep('request')} style={{ padding: '0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer' }}>📨 スポットをリクエスト</button>
          </div>
          {favorites.length > 0 && (
            <div style={{ marginBottom: '1rem', textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem', fontWeight: '600' }}>⭐ お気に入りスポット</div>
              {favorites.map((f, i) => (
                <div key={i} onClick={() => handleSelectFavorite(f)} style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.15)', borderRadius: '10px', marginBottom: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>⭐ {f.name}</div>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)', marginBottom: '0.5rem', fontWeight: '600' }}>🕐 最近のスポット</div>
              {history.map((h, i) => (
                <div key={i} onClick={() => { setPendingSpot(h); setQuery(h.name); leafletMap.current = null; setStep('bearing'); }} style={{ padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '10px', marginBottom: '0.5rem', cursor: 'pointer', fontSize: '0.9rem', color: '#fff' }}>🕐 {h.name}</div>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  // ─────────────────────────────────────────────
  // メイン画面（検索・方位設定・結果）
  // ─────────────────────────────────────────────
  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" async />
      <main style={{ minHeight: '100vh', background: '#f5f5f7', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
        {/* ── ヘッダー ── */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e5e5e7', padding: '1rem 1.5rem', position: 'sticky', top: 0, zIndex: 100 }}>
          <div style={{ maxWidth: '480px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.7rem' }}>
              <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }} onClick={() => setStep('top')}>
                <CameraLogo size={36} />
              </span>
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
                <input type="text" value={query}
                  onChange={e => { setQuery(e.target.value); if (step === 'result') { setStep('search'); setSpot(null); setSuggestionResult(null); } }}
                  placeholder="📍 スポット名を入力"
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '10px', border: '1.5px solid #ccc', fontSize: '0.95rem', background: '#f0f0f0', color: '#333' }}
                />
                <button onClick={handleLocate} disabled={locating} style={{ padding: '0.6rem 0.8rem', borderRadius: '10px', border: '1.5px solid #ccc', background: '#f0f0f0', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap', fontWeight: '600', color: '#333' }}>
                  {locating ? '📡...' : '📍現在地'}
                </button>
              </div>
              {step === 'search' && (
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginBottom: '4px' }}>📌 緯度経度で直接入力</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input type="text" value={latInput} onChange={e => setLatInput(e.target.value)} placeholder="緯度（例：24.8234）"
                      style={{ flex: 1, padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1.5px solid #ccc', fontSize: '0.85rem', background: '#f0f0f0', color: '#333' }} />
                    <input type="text" value={lngInput} onChange={e => setLngInput(e.target.value)} placeholder="経度（例：125.2891）"
                      style={{ flex: 1, padding: '0.5rem 0.8rem', borderRadius: '8px', border: '1.5px solid #ccc', fontSize: '0.85rem', background: '#f0f0f0', color: '#333' }} />
                    <button onClick={() => {
                      const lat = parseFloat(latInput); const lng = parseFloat(lngInput);
                      if (isNaN(lat) || isNaN(lng)) return;
                      const name = `📌 ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                      setPendingSpot({ name, lat, lng }); setQuery(name); leafletMap.current = null; setStep('bearing');
                    }} style={{ padding: '0.5rem 0.8rem', borderRadius: '8px', background: '#0984e3', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>GO</button>
                  </div>
                </div>
              )}
              {locateError && <div style={{ fontSize: '0.8rem', color: '#e17055', marginBottom: '6px' }}>{locateError}</div>}
              {results.length > 0 && step === 'search' && (
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

          {/* ── 方位設定 ── */}
          {step === 'bearing' && pendingSpot && (
            <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative', zIndex: 0 }}>
              <div ref={mapRef} style={{ height: '220px', background: '#e0e0e0', zIndex: 1, position: 'relative', isolation: 'isolate' }} />
              {/* 扇形の説明バッジ */}
              <div style={{ position: 'absolute', top: '8px', left: '8px', background: 'rgba(225,112,85,0.9)', color: '#fff', fontSize: '0.7rem', fontWeight: '700', padding: '3px 8px', borderRadius: '20px', zIndex: 10 }}>
                📷 赤い扇形 = カメラ画角（60°）
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #f0f0f0' }}>
                <button onClick={() => setMode('A')} style={{ padding: '0.8rem', background: mode === 'A' ? '#fff8f0' : '#f5f5f7', border: 'none', borderBottom: mode === 'A' ? '2px solid #e17055' : '2px solid transparent', cursor: 'pointer', fontSize: '0.85rem', fontWeight: mode === 'A' ? '700' : '400', color: mode === 'A' ? '#e17055' : '#888' }}>
                  📐 方向を指定
                </button>
                <button onClick={() => setMode('B')} style={{ padding: '0.8rem', background: mode === 'B' ? '#fff8f0' : '#f5f5f7', border: 'none', borderBottom: mode === 'B' ? '2px solid #e17055' : '2px solid transparent', cursor: 'pointer', fontSize: '0.85rem', fontWeight: mode === 'B' ? '700' : '400', color: mode === 'B' ? '#e17055' : '#888' }}>
                  📅 日付・目的から探す
                </button>
              </div>
              {mode === 'A' && (
                <div style={{ padding: '1.2rem' }}>
                  <div style={{ padding: '0.6rem 1rem', background: '#fff8f0', borderRadius: '8px', fontSize: '0.8rem', color: '#e17055', fontWeight: '600', marginBottom: '1rem' }}>
                    🎯 赤い扇形がカメラの撮影範囲です。スライダーで調整してください。
                  </div>
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
              )}
              {mode === 'B' && (
                <div style={{ padding: '1.2rem' }}>
                  <div style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '1rem', color: '#333' }}>📅 日付・目的から最適な方向を提案</div>
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.4rem', fontWeight: '600' }}>日付を選択</div>
                    <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #e5e5e7', fontSize: '1rem', color: '#333', boxSizing: 'border-box' }} />
                  </div>
                  {selectedDate && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '0.6rem', fontWeight: '600' }}>撮影目的を選択</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                        {(['sunrise', 'sunset', 'star'] as const).map(p => (
                          <button key={p} onClick={() => setSelectedPurpose(p)}
                            style={{ padding: '0.8rem 0.5rem', borderRadius: '10px', border: '1.5px solid', borderColor: selectedPurpose === p ? '#e17055' : '#e5e5e7', background: selectedPurpose === p ? '#fff8f0' : '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: selectedPurpose === p ? '700' : '400', color: selectedPurpose === p ? '#e17055' : '#555' }}>
                            {p === 'sunrise' ? '🌅 朝日' : p === 'sunset' ? '🌇 夕陽' : '🌙 星空'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <button onClick={handleSuggest} disabled={!selectedDate || !selectedPurpose}
                    style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: selectedDate && selectedPurpose ? '#e17055' : '#e5e5e7', color: '#fff', border: 'none', fontSize: '1rem', fontWeight: '700', cursor: selectedDate && selectedPurpose ? 'pointer' : 'default' }}>
                    この条件で提案を見る →
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── 結果画面 ── */}
          {step === 'result' && spot && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <button onClick={handleBackToBearing} style={{ background: 'none', border: 'none', color: '#0984e3', cursor: 'pointer', fontSize: '0.9rem', fontWeight: '600', padding: 0 }}>← 条件を変更する</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleToggleFavorite} style={{ padding: '6px 12px', borderRadius: '20px', border: '1.5px solid', borderColor: isFavorite ? '#f7b731' : '#e5e5e7', background: isFavorite ? '#fffdf0' : '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: isFavorite ? '#d4a017' : '#888' }}>
                    {isFavorite ? '⭐ 保存済み' : '☆ お気に入り'}
                  </button>
                  <button onClick={handleShare} style={{ padding: '6px 12px', borderRadius: '20px', border: '1.5px solid #e5e5e7', background: '#fff', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600', color: '#555' }}>🔗 URL共有</button>
                </div>
              </div>
              {shareMsg && (
                <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#00b894', marginBottom: '8px', fontWeight: '600', background: '#f0fff8', borderRadius: '8px', padding: '8px' }}>
                  ✅ {shareMsg}
                </div>
              )}
              <div style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.6rem' }}>
                📍 {spot.name}
                <span onClick={() => { setStep('search'); setQuery(''); setSpot(null); setSuggestionResult(null); }} style={{ marginLeft: '12px', color: '#0984e3', cursor: 'pointer', fontSize: '0.8rem' }}>スポットを変更</span>
              </div>
              {/* 絶景タビスト連携ボタン */}
              <a
                href={`https://zekkei-tavist.com/spots.html?q=${encodeURIComponent(spot.name)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '20px', background: 'linear-gradient(135deg,#1a3a2a,#2d5a3d)', color: '#e8c97a', fontSize: '0.75rem', fontWeight: '600', textDecoration: 'none', marginBottom: '1rem' }}
              >
                🌿 絶景タビストで記事を見る
              </a>

              {/* ── 今すぐ撮れるか？カード ── */}
              {!suggestionResult && nowJudge && (
                <div style={{ borderRadius: '18px', background: nowJudge.bg, border: `1.5px solid ${nowJudge.border}`, padding: '1.2rem 1.4rem', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.7rem', fontWeight: '700', color: nowJudge.color, letterSpacing: '2px', marginBottom: '8px' }}>▶ 今すぐ撮れるか？</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div>
                      <div style={{ fontSize: '44px', fontWeight: '700', color: nowJudge.color, lineHeight: 1 }}>{nowScore}</div>
                      <div style={{ fontSize: '11px', color: nowJudge.color, opacity: 0.8, marginTop: '3px' }}>/ 100</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '15px', fontWeight: '700', color: '#333', marginBottom: '3px' }}>{nowLt?.label}</div>
                      <div style={{ fontSize: '12px', color: '#666', lineHeight: 1.5, marginBottom: '6px' }}>{nowComment}</div>
                      <div style={{ fontSize: '13px', color: '#c8a84b' }}>{StarStr(nowStars)}<span style={{ fontSize: '11px', color: '#888', marginLeft: '6px' }}>総合おすすめ度</span></div>
                    </div>
                  </div>
                  <div style={{ marginTop: '12px', display: 'inline-block', background: nowJudge.color, color: '#fff', fontSize: '12px', fontWeight: '700', padding: '7px 18px', borderRadius: '20px' }}>
                    {nowJudge.label}
                  </div>
                </div>
              )}

              {/* ── 撮影レシピカード（新機能） ── */}
              {!suggestionResult && scene && recipe && !scene.isNight && (
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #f0e8d8' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showRecipe ? '0.8rem' : 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333' }}>📷 撮影レシピ <span style={{ fontSize: '0.72rem', color: '#e67e22', fontWeight: '600', background: '#fff8f0', padding: '2px 8px', borderRadius: '20px', marginLeft: '4px' }}>{scene.label}</span></div>
                    <button onClick={() => setShowRecipe(!showRecipe)} style={{ fontSize: '0.8rem', color: '#0984e3', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                      {showRecipe ? '閉じる' : '表示する'}
                    </button>
                  </div>
                  {showRecipe && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div style={{ background: '#fff8f0', borderRadius: '10px', padding: '0.7rem' }}>
                          <div style={{ fontSize: '0.68rem', color: '#e67e22', fontWeight: '700', marginBottom: '3px' }}>露出補正</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#333' }}>{recipe.ev}</div>
                        </div>
                        <div style={{ background: '#f0f8ff', borderRadius: '10px', padding: '0.7rem' }}>
                          <div style={{ fontSize: '0.68rem', color: '#0984e3', fontWeight: '700', marginBottom: '3px' }}>ホワイトバランス</div>
                          <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#333' }}>{recipe.wb}</div>
                        </div>
                      </div>
                      <div style={{ background: '#f5f5f7', borderRadius: '10px', padding: '0.7rem' }}>
                        <div style={{ fontSize: '0.68rem', color: '#666', fontWeight: '700', marginBottom: '3px' }}>撮影モード</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#333' }}>{recipe.mode}</div>
                      </div>
                      <div style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63)', borderRadius: '10px', padding: '0.8rem 1rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.7)', fontWeight: '700', marginBottom: '3px' }}>💡 プロのワンポイント</div>
                        <div style={{ fontSize: '0.85rem', color: '#fff', lineHeight: 1.6 }}>{recipe.tip}</div>
                      </div>
                    </div>
                  )}
                  {!showRecipe && (
                    <div style={{ fontSize: '0.8rem', color: '#aaa', marginTop: '4px' }}>{recipe.tip}</div>
                  )}
                </div>
              )}

              {/* 夜の撮影レシピ */}
              {!suggestionResult && scene && recipe && scene.isNight && (
                <div style={{ background: 'linear-gradient(135deg,#0f0c29,#302b63)', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff', marginBottom: '0.8rem' }}>📷 {scene.label}の撮影レシピ</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem' }}>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>設定</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>{recipe.ev}</div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '8px', padding: '0.6rem' }}>
                      <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)', marginBottom: '2px' }}>WB</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#fff' }}>{recipe.wb}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>💡 {recipe.tip}</div>
                </div>
              )}

              {/* ── 提案結果（モードB） ── */}
              {suggestionResult && (
                <>
                  <div style={{ background: suggestionResult.type === 'sunrise' ? 'linear-gradient(135deg,#f39c12,#f7b731)' : suggestionResult.type === 'sunset' ? 'linear-gradient(135deg,#c0392b,#e74c3c)' : 'linear-gradient(135deg,#0f0c29,#302b63)', borderRadius: '20px', padding: '1.5rem', marginBottom: '1rem', color: suggestionResult.type === 'sunrise' ? '#3d2200' : '#fff' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: '700', opacity: 0.8, marginBottom: '0.8rem' }}>
                      {suggestionResult.type === 'sunrise' ? '🌅 朝日撮影のベスト情報' : suggestionResult.type === 'sunset' ? '🌇 夕陽撮影のベスト情報' : '🌙 星空撮影のベスト情報'}
                    </div>
                    {suggestionResult.type !== 'star' && (
                      <>
                        <div style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '0.8rem' }}>📐 {suggestionResult.azimuth}°（{bearingLabel(suggestionResult.azimuth)}）方向を向く</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.85rem', opacity: 0.9 }}>
                          <div>{suggestionResult.type === 'sunrise' ? `🌅 日の出：${suggestionResult.time}` : `🌇 日の入り：${suggestionResult.time}`}</div>
                          <div>{suggestionResult.type === 'sunrise' ? `✨ マジックアワー ${suggestionResult.magicStart}〜${suggestionResult.time}` : `✨ マジックアワー ${suggestionResult.time}〜${suggestionResult.magicEnd}`}</div>
                          <div>{suggestionResult.type === 'sunrise' ? `🌟 ゴールデンアワー ${suggestionResult.time}〜${suggestionResult.goldenEnd}` : `🌟 ゴールデンアワー ${suggestionResult.goldenStart}〜${suggestionResult.time}`}</div>
                        </div>
                      </>
                    )}
                    {suggestionResult.type === 'star' && (
                      <>
                        <div style={{ fontSize: '1.2rem', fontWeight: '800', marginBottom: '0.5rem' }}>{suggestionResult.moon.phase}</div>
                        <div style={{ fontSize: '0.9rem', marginBottom: '0.3rem' }}>{suggestionResult.moon.moonDesc}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '700', color: suggestionResult.moon.starColor, marginBottom: '0.5rem' }}>{suggestionResult.moon.starStr}　{suggestionResult.moon.starLabel}</div>
                        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: '10px', padding: '0.8rem', marginTop: '0.5rem' }}>
                          <div style={{ fontSize: '0.8rem', fontWeight: '700', marginBottom: '4px' }}>🌙 星空が見やすい時間帯</div>
                          <div style={{ fontSize: '1.1rem', fontWeight: '800' }}>{suggestionResult.starStart}〜{suggestionResult.starEnd}</div>
                          <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>日の入り({suggestionResult.sunset})の1時間後〜日の出({suggestionResult.sunrise})の30分前</div>
                        </div>
                      </>
                    )}
                  </div>
                  {suggestionResult.type !== 'star' && (
                    <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative', zIndex: 0 }}>
                      <div style={{ padding: '0.8rem 1rem', fontSize: '0.8rem', fontWeight: '600', color: '#333', borderBottom: '1px solid #f0f0f0' }}>🗺️ カメラを向ける方向（扇形 = 画角60°）</div>
                      <div ref={resultMapRef} style={{ height: '220px', background: '#e0e0e0', position: 'relative', isolation: 'isolate' }} />
                    </div>
                  )}
                </>
              )}

              {/* ── 現在の撮影コンディション ── */}
              {!suggestionResult && scene && sunPos && result && sunDesc && (
                <>
                  {sunrise && sunset && (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '0.6rem' }}>
                        <div style={{ background: 'linear-gradient(135deg,#f39c12,#f7b731)', borderRadius: '12px', padding: '0.8rem 1rem', color: '#3d2200' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '2px' }}>🌅 日の出</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: '800' }}>{formatTime(sunrise)}</div>
                          <div style={{ fontSize: '0.72rem', marginTop: '2px', opacity: 0.8 }}>方向 {todaySunrise?.azimuth}°（{bearingLabel(todaySunrise?.azimuth ?? 0)}）</div>
                          <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>マジックアワー {formatTime(new Date(sunrise.getTime() - 30 * 60000))}〜</div>
                        </div>
                        <div style={{ background: 'linear-gradient(135deg,#c0392b,#e74c3c)', borderRadius: '12px', padding: '0.8rem 1rem', color: '#fff' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: '700', marginBottom: '2px' }}>🌇 日の入り</div>
                          <div style={{ fontSize: '1.3rem', fontWeight: '800' }}>{formatTime(sunset)}</div>
                          <div style={{ fontSize: '0.72rem', marginTop: '2px', opacity: 0.8 }}>方向 {todaySunset?.azimuth}°（{bearingLabel(todaySunset?.azimuth ?? 0)}）</div>
                          <div style={{ fontSize: '0.72rem', opacity: 0.8 }}>マジックアワー 〜{formatTime(new Date(sunset.getTime() + 30 * 60000))}</div>
                        </div>
                      </div>
                      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative', zIndex: 0 }}>
                        <div style={{ padding: '0.5rem 0.8rem', fontSize: '0.75rem', color: '#555', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                          <span><span style={{ color: '#f39c12', fontWeight: '700' }}>——</span> 日の出方角</span>
                          <span><span style={{ color: '#e74c3c', fontWeight: '700' }}>——</span> 日の入り方角</span>
                          <span><span style={{ color: '#a0a0c0', fontWeight: '700' }}>——</span> 月の方角（地平線上の時のみ）</span>
                        </div>
                        <div ref={sunriseMapRef} style={{ height: '200px', background: '#e0e0e0', position: 'relative', isolation: 'isolate' }} />
                      </div>
                    </>
                  )}
                  <div style={{ background: scene.grad, borderRadius: '20px', padding: '2rem 1.8rem', color: scene.text, marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', right: '-10px', top: '-10px', fontSize: '7rem', opacity: 0.15 }}>{scene.emoji}</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: '600', opacity: 0.8, marginBottom: '0.4rem', letterSpacing: '1px', textTransform: 'uppercase' }}>現在の撮影コンディション</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.8rem', letterSpacing: '-0.5px' }}>{scene.emoji} {scene.label}</div>
                    {sunPos.altitude >= 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>☀️ {sunDesc.altDesc}</div>
                        {sunDesc.dirDesc && <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '8px', padding: '6px 12px', fontSize: '0.85rem', fontWeight: '500' }}>📐 {sunDesc.dirDesc}</div>}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── 今日撮れるシーン ── */}
              {sceneBlocks.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333', marginBottom: '0.8rem' }}>📅 今日撮れるシーン</div>
                  {sceneBlocks.map((block, i) => {
                    const desc = getSceneDesc(block.label);
                    return (
                      <div key={i} style={{ padding: '0.55rem 0', borderBottom: '1px solid #f5f5f7', opacity: block.isBad ? 0.45 : 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: desc ? '2px' : 0 }}>
                          <span style={{ fontSize: '1rem' }}>{block.sc.emoji}</span>
                          <span style={{ fontSize: '0.85rem', fontWeight: '700', flex: 1, color: block.isBad ? '#999' : '#333' }}>{block.label}</span>
                          <span style={{ fontSize: '0.8rem', color: '#999', flexShrink: 0 }}>{block.start}〜{block.end}</span>
                        </div>
                        {desc && <div style={{ fontSize: '0.75rem', color: '#aaa', paddingLeft: '28px', lineHeight: 1.5 }}>{desc}</div>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── 3日間天気予報 ── */}
              {dayForecasts.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333', marginBottom: '4px' }}>📆 3日間の撮影チャンス</div>
                  <div style={{ fontSize: '0.72rem', color: '#aaa', marginBottom: '0.8rem' }}>◎快晴　○晴れ　△曇り・小雨　×雨・厚曇り</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                    {dayForecasts.map((df: any, i: number) => (
                      <div key={i} style={{ background: '#f5f5f7', borderRadius: '12px', padding: '0.8rem 0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#555', marginBottom: '4px' }}>{df.label}</div>
                        <div style={{ fontSize: '1.3rem', marginBottom: '4px' }}>{df.weatherLabel?.split(' ')[0]}</div>
                        <div style={{ fontSize: '1.2rem', fontWeight: '800', color: df.badgeColor }}>{df.badge}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── 天気・月 ── */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1rem' }}>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>天気</div>
                  {wd && weather ? (
                    <>
                      <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{wd.label}</div>
                      <div style={{ fontSize: '0.75rem', color: '#444' }}>雲量 {weather.cloudcover}%</div>
                      <div style={{ fontSize: '0.75rem', color: '#444' }}>気温 {weather.temperature}℃</div>
                      <div style={{ marginTop: '8px', fontSize: '1.2rem', fontWeight: '800', color: wd.badgeColor, marginBottom: '10px' }}>{wd.badge}</div>
                      {hourlyWeather.length > 0 && (() => {
                        const todayStr = now.toISOString().split('T')[0];
                        const todaySlots = hourlyWeather.filter(w => w.timeStr.startsWith(todayStr) && new Date(w.timeStr).getHours() >= now.getHours());
                        const blocks: { label: string; emoji: string; badge: string; badgeColor: string; start: number; end: number }[] = [];
                        todaySlots.forEach(w => {
                          const wl = getWeatherLabel(w.cloudcover, w.weathercode);
                          const h = new Date(w.timeStr).getHours();
                          const last = blocks[blocks.length - 1];
                          if (last && last.label === wl.label) {
                            last.end = h;
                          } else {
                            blocks.push({ label: wl.label, emoji: wl.label.split(' ')[0], badge: wl.badge, badgeColor: wl.badgeColor, start: h, end: h });
                          }
                        });
                        if (blocks.length === 0) return null;
                        return (
                          <div>
                            <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '6px', fontWeight: '600' }}>今日の天気の変化</div>
                            {blocks.map((b, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ fontSize: '13px' }}>{b.emoji}</span>
                                <span style={{ fontSize: '11px', color: '#555', flex: 1 }}>{b.label.split(' ').slice(1).join(' ')}</span>
                                <span style={{ fontSize: '11px', color: '#888' }}>{b.start}時〜{b.end + 1}時</span>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  ) : <div style={{ color: '#aaa', fontSize: '0.85rem' }}>取得中...</div>}
                </div>
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ fontSize: '0.7rem', color: '#555', fontWeight: '600', letterSpacing: '0.5px', marginBottom: '0.5rem' }}>月・星空</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '4px', color: '#333' }}>{moon.phase}</div>
                  <div style={{ fontSize: '0.75rem', color: '#444', marginBottom: '2px' }}>{moon.moonDesc}</div>
                  <div style={{ fontSize: '0.75rem', color: '#444', marginBottom: '8px' }}>星空：{moon.starLabel}</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: moon.starColor, marginBottom: '8px' }}>{moon.starStr}</div>
                  {moonTimes && (moonTimes.rise || moonTimes.set) && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                      <div style={{ flex: 1, background: 'rgba(108,92,231,0.08)', borderRadius: '8px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#6c5ce7', fontWeight: '600', marginBottom: '2px' }}>月の出</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#6c5ce7' }}>{moonTimes.rise ?? '本日なし'}</div>
                      </div>
                      <div style={{ flex: 1, background: 'rgba(108,92,231,0.08)', borderRadius: '8px', padding: '6px 8px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#6c5ce7', fontWeight: '600', marginBottom: '2px' }}>月の入り</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#6c5ce7' }}>{moonTimes.set ?? '本日なし'}</div>
                      </div>
                    </div>
                  )}
                  {nightStarSlots.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '6px', fontWeight: '600' }}>今夜の時間帯別おすすめ度</div>
                      {(() => {
                        const blocks: { score: number; start: number; end: number }[] = [];
                        nightStarSlots.forEach(({ hour, score }) => {
                          const last = blocks[blocks.length - 1];
                          if (last && last.score === score) {
                            last.end = hour;
                          } else {
                            blocks.push({ score, start: hour, end: hour });
                          }
                        });
                        return blocks.map((b, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span style={{ fontSize: '12px', color: '#c8a84b', letterSpacing: '-1px', flexShrink: 0 }}>{'★'.repeat(b.score)}{'☆'.repeat(5 - b.score)}</span>
                            <span style={{ fontSize: '11px', color: '#666' }}>{b.start}時〜{b.end + 1}時</span>
                          </div>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* ── 撮影計画カード生成 ── */}
              {!suggestionResult && (
                <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid rgba(230,126,34,0.2)' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333', marginBottom: '0.8rem' }}>🎴 撮影計画カードを生成</div>
                  <div style={{ fontSize: '0.78rem', color: '#888', marginBottom: '0.8rem', lineHeight: 1.6 }}>日の出・月・撮影レシピを1枚の画像にまとめてSNSにシェアできます</div>
                  {!shareCardUrl ? (
                    <button onClick={handleGenerateCard} disabled={generatingCard}
                      style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: generatingCard ? '#e5e5e7' : 'linear-gradient(135deg,#e67e22,#e17055)', color: '#fff', border: 'none', fontSize: '0.95rem', fontWeight: '700', cursor: generatingCard ? 'default' : 'pointer' }}>
                      {generatingCard ? '生成中...' : '📸 カードを生成する'}
                    </button>
                  ) : (
                    <div>
                      <img src={shareCardUrl} style={{ width: '100%', borderRadius: '12px', marginBottom: '0.8rem', border: '1px solid rgba(0,0,0,0.08)' }} alt="撮影計画カード" />
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        <button onClick={handleDownloadCard}
                          style={{ padding: '0.7rem', borderRadius: '10px', background: '#e67e22', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
                          ⬇️ 保存する
                        </button>
                        <button onClick={() => { if (shareCardUrl && spot) { navigator.share ? navigator.share({ title: `${spot.name}の撮影計画`, text: `#絶景ファインダー\n${spot.name}の撮影計画\nzekkei-finder.com` }) : navigator.clipboard.writeText(`#絶景ファインダー\n${spot.name}の撮影計画\nhttps://zekkei-finder.com`).then(() => setShareMsg('コピーしました！')); }}}
                          style={{ padding: '0.7rem', borderRadius: '10px', background: '#0984e3', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: '700', cursor: 'pointer' }}>
                          📤 シェアする
                        </button>
                      </div>
                      <button onClick={() => setShareCardUrl(null)}
                        style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '8px', background: 'none', border: '1px solid #e5e5e7', color: '#888', fontSize: '0.8rem', cursor: 'pointer' }}>
                        再生成する
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* ── 撮影メモ ── */}
              <div style={{ background: '#fff', borderRadius: '16px', padding: '1rem 1.2rem', marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333' }}>📝 撮影メモ</div>
                  <button onClick={() => setShowMemo(!showMemo)} style={{ fontSize: '0.8rem', color: '#0984e3', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '600' }}>
                    {showMemo ? '閉じる' : '+ メモを追加'}
                  </button>
                </div>
                {showMemo && (
                  <div style={{ marginBottom: '0.8rem' }}>
                    <textarea value={memoText} onChange={e => setMemoText(e.target.value)} placeholder="撮影設定・感想などを記録..."
                      style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1.5px solid #e5e5e7', fontSize: '0.85rem', color: '#333', boxSizing: 'border-box', height: '80px', resize: 'none', marginBottom: '0.5rem' }} />
                    <button onClick={handleSaveMemo} style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', background: '#0984e3', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer' }}>保存する</button>
                  </div>
                )}
                {spotMemos.length > 0 ? spotMemos.map((m, i) => (
                  <div key={i} style={{ padding: '0.6rem 0', borderTop: '1px solid #f5f5f7' }}>
                    <div style={{ fontSize: '0.72rem', color: '#aaa', marginBottom: '2px' }}>{m.date}</div>
                    <div style={{ fontSize: '0.85rem', color: '#555', lineHeight: 1.5 }}>{m.text}</div>
                  </div>
                )) : <div style={{ fontSize: '0.82rem', color: '#bbb' }}>まだメモがありません</div>}
              </div>

              {/* ── 24時間タイムライン ── */}
              <div style={{ background: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.2rem 0.4rem' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '700', color: '#333' }}>今日のタイムライン</div>
                  <button onClick={() => setShowNight(!showNight)} style={{ fontSize: '0.72rem', color: '#666', background: 'none', border: '1px solid #e5e5e7', borderRadius: '20px', padding: '3px 10px', cursor: 'pointer' }}>
                    {showNight ? '夜を隠す' : '夜も表示'}
                  </button>
                </div>
                <div style={{ margin: '0 1.2rem 0.6rem', padding: '8px 12px', background: '#f8f8f8', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '8px', height: '5px', borderRadius: '2px', background: '#ddd' }}/>
                      <div style={{ width: '24px', height: '5px', borderRadius: '2px', background: '#e17055' }}/>
                    </div>
                    <span>バーが長い = 太陽とカメラが正面で一致（順光）</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: '#888' }}>
                    <span style={{ color: '#c8a84b', fontSize: '12px', letterSpacing: '-1px' }}>★☆☆☆☆→★★★★★</span>
                    <span>星が多いほど撮影に適した時間帯</span>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 1rem 6px', borderBottom: '1px solid #f0f0f0' }}>
                  <div style={{ width: '44px', fontSize: '10px', color: '#aaa', flexShrink: 0 }}>時刻</div>
                  <div style={{ width: '52px', fontSize: '10px', color: '#aaa', flexShrink: 0 }}>光の角度</div>
                  <div style={{ width: '48px', fontSize: '10px', color: '#aaa', flexShrink: 0 }}>光の種類</div>
                  <div style={{ flex: 1, fontSize: '10px', color: '#aaa' }}>コメント</div>
                  <div style={{ width: '56px', fontSize: '10px', color: '#aaa', flexShrink: 0, textAlign: 'right' }}>総合</div>
                </div>
                {visibleList.map(({ h, m, sc, lt, stars, comment, matchScore, isNow }) => (
                  <div key={`${h}-${m}`} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 1rem', background: isNow ? '#fff8f0' : '#fff', borderTop: '1px solid #f5f5f7' }}>
                    <span style={{ width: '44px', fontSize: '12px', fontWeight: isNow ? '700' : '400', color: isNow ? '#e17055' : '#999', flexShrink: 0 }}>
                      {h}:{String(m).padStart(2, '0')}
                    </span>
                    <div style={{ width: '52px', flexShrink: 0 }}>
                      {sc.isNight ? (
                        <div style={{ width: '52px', height: '5px', borderRadius: '2px', background: '#f0f0f0' }} />
                      ) : (
                        <div style={{ width: '52px', height: '5px', borderRadius: '2px', background: '#eee' }}>
                          <div style={{ width: `${Math.max(4, matchScore)}%`, height: '100%', borderRadius: '2px', background: lt.color }} />
                        </div>
                      )}
                    </div>
                    <div style={{ width: '48px', fontSize: '11px', fontWeight: '600', color: sc.isNight ? '#aaa' : lt.color, flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
                      {sc.isNight ? sc.emoji : lt.short}
                    </div>
                    <div style={{ flex: 1, fontSize: '11px', color: isNow ? '#444' : '#777', lineHeight: 1.4 }}>
                      {sc.isNight ? sc.label : comment}
                      {isNow && <span style={{ marginLeft: '4px', color: '#e17055', fontWeight: '700', fontSize: '10px' }}>← 今</span>}
                    </div>
                    <div style={{ width: '56px', fontSize: '10px', color: '#c8a84b', flexShrink: 0, textAlign: 'right', letterSpacing: '-1px' }}>
                      {sc.isNight ? '' : StarStr(stars)}
                    </div>
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
