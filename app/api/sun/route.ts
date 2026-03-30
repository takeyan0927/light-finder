import { NextRequest, NextResponse } from 'next/server';
import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';
import type { SunApiPayload, LightType } from '@/lib/sun/types';

export const runtime = 'edge';

function parseAndValidate(req: NextRequest) {
  const p = new URL(req.url).searchParams;
  const lat      = parseFloat(p.get('lat')     ?? '');
  const lng      = parseFloat(p.get('lng')     ?? '');
  const bearing  = parseFloat(p.get('bearing') ?? '');
  const datetime = p.get('datetime') ?? new Date().toISOString();

  if (isNaN(lat) || isNaN(lng) || isNaN(bearing)) return null;
  if (lat < -90   || lat > 90)                    return null;
  if (lng < -180  || lng > 180)                   return null;
  if (bearing < 0 || bearing > 360)               return null;
  if (isNaN(Date.parse(datetime)))                return null;

  return { lat, lng, bearing, datetime };
}

export async function GET(req: NextRequest): Promise<NextResponse<SunApiPayload>> {
  try {
    const params = parseAndValidate(req);
    if (!params) {
      return NextResponse.json(
        { ok: false, error: 'lat/lng/bearingは必須です', code: 'INVALID_PARAMS' },
        { status: 400 }
      );
    }

    const date   = new Date(params.datetime);
    const sunPos = getSunPosition(date, params.lat, params.lng);
    const result = analyzeLighting(sunPos, params.bearing);

    const lightType: LightType =
      sunPos.altitude < 0 ? 'below_horizon' : result.lightType;

    return NextResponse.json({
      ok: true,
      result: {
        azimuth:        Math.round(sunPos.azimuth  * 10) / 10,
        altitude:       Math.round(sunPos.altitude * 10) / 10,
        lightType,
        angleDiff:      Math.round(result.angleDiff * 10) / 10,
        matchScore:     result.matchScore,
        isGoldenHour:   result.goldenWindow,
        isBelowHorizon: sunPos.altitude < 0,
        inputDatetime:  date.toISOString(),
      },
      meta: { computedAt: new Date().toISOString(), version: '1.0.0' },
    });

  } catch (err) {
    console.error('[/api/sun]', err);
    return NextResponse.json(
      { ok: false, error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}