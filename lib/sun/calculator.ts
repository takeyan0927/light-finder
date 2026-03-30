import SunCalc from 'suncalc';
import type { LightType } from './types';

function toNorthClockwise(radAzimuth: number): number {
  return ((radAzimuth * 180) / Math.PI + 180 + 360) % 360;
}

function bearingDiff(a: number, b: number): number {
  return ((a - b + 540) % 360) - 180;
}

export function getSunPosition(date: Date, lat: number, lng: number) {
  const pos = SunCalc.getPosition(date, lat, lng);
  return {
    azimuth:   toNorthClockwise(pos.azimuth),
    altitude:  (pos.altitude * 180) / Math.PI,
    timestamp: date,
  };
}

export function analyzeLighting(
  sunPos: ReturnType<typeof getSunPosition>,
  shoreBearing: number
) {
  const diff    = bearingDiff(sunPos.azimuth, shoreBearing);
  const absDiff = Math.abs(diff);

  let lightType: Exclude<LightType, 'below_horizon'>;
  if      (absDiff <= 30) lightType = 'frontlit';
  else if (absDiff <= 80) lightType = 'sidelit';
  else                    lightType = 'backlit';

  const matchScore   = calcMatchScore(sunPos, absDiff);
  const goldenWindow = sunPos.altitude >= 5 && sunPos.altitude <= 25;

  return { lightType, angleDiff: absDiff, matchScore, goldenWindow };
}

function calcMatchScore(
  sunPos: ReturnType<typeof getSunPosition>,
  azimuthDiff: number
): number {
  if (sunPos.altitude < 0) return 0;

  const azimuthScore  = Math.max(0, 1 - (azimuthDiff / 30) ** 1.5);
  const IDEAL_ALT     = 55;
  const altitudeDiff  = sunPos.altitude - IDEAL_ALT;
  const altitudeScore = Math.exp(-(altitudeDiff ** 2) / (2 * 20 ** 2));
  const hour          = sunPos.timestamp.getHours() + sunPos.timestamp.getMinutes() / 60;
  const timeBonus     = hour >= 10 && hour <= 12 ? 0.1 : 0;

  return Math.min(100, Math.round((azimuthScore * 0.6 + altitudeScore * 0.3 + timeBonus) * 100));
}