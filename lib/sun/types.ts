export type LightType = 'frontlit' | 'sidelit' | 'backlit' | 'below_horizon';

export interface SunQueryParams {
  lat: number;
  lng: number;
  bearing: number;
  datetime?: string;
}

export interface SunResult {
  azimuth:        number;
  altitude:       number;
  lightType:      LightType;
  angleDiff:      number;
  matchScore:     number;
  isGoldenHour:   boolean;
  isBelowHorizon: boolean;
  inputDatetime:  string;
}

export interface SunApiResponse {
  ok: true;
  result: SunResult;
  meta: { computedAt: string; version: string };
}

export interface SunApiError {
  ok: false;
  error: string;
  code: 'INVALID_PARAMS' | 'OUT_OF_RANGE' | 'INTERNAL_ERROR';
}

export type SunApiPayload = SunApiResponse | SunApiError;
