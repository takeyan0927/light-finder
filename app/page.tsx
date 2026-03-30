import { getSunPosition, analyzeLighting } from '@/lib/sun/calculator';

const YONAHA = { lat: 24.7371, lng: 125.2642, bearing: 235 };

const LIGHT_LABEL: Record<string, string> = {
  frontlit:      '✅ 順光（最高！）',
  sidelit:       '🔆 サイドライト',
  backlit:       '🌅 逆光',
  below_horizon: '🌙 太陽なし',
};

export default function Page() {
  const testDate = new Date('2025-06-15T02:00:00Z');
  const sunPos   = getSunPosition(testDate, YONAHA.lat, YONAHA.lng);
  const result   = analyzeLighting(sunPos, YONAHA.bearing);
  const lightType = sunPos.altitude < 0 ? 'below_horizon' : result.lightType;

  return (
    <main style={{ padding: '2rem', fontFamily: 'monospace' }}>
      <h1>🌞 Light Finder — 与那覇前浜ビーチ</h1>
      <p>テスト日時：{testDate.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      <hr />
      <table style={{ borderCollapse: 'collapse', marginTop: '1rem' }}>
        <tbody>
          {[
            ['方位角',       `${Math.round(sunPos.azimuth  * 10) / 10}°`],
            ['高度角',       `${Math.round(sunPos.altitude * 10) / 10}°`],
            ['方位差分',     `${Math.round(result.angleDiff * 10) / 10}°`],
            ['ライティング', LIGHT_LABEL[lightType]],
            ['マッチ度',     `${result.matchScore} %`],
            ['ゴールデンアワー', result.goldenWindow ? '✨ Yes' : 'No'],
          ].map(([label, value]) => (
            <tr key={label}>
              <td style={{ padding: '6px 16px 6px 0', color: '#888' }}>{label}</td>
              <td style={{ padding: '6px 0', fontWeight: 'bold', fontSize: '1.1rem' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <hr style={{ marginTop: '2rem' }} />
      <p style={{ color: '#888', fontSize: '0.85rem' }}>
        APIでも確認：
        <code>/api/sun?lat=24.7371&amp;lng=125.2642&amp;bearing=235&amp;datetime=2025-06-15T02:00:00Z</code>
      </p>
    </main>
  );
}