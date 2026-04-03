import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // 背景
  ctx.fillStyle = '#e17055';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, size * 0.2);
  ctx.fill();

  // 絵文字
  ctx.font = `${size * 0.55}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🌞', size / 2, size / 2);

  return canvas.toBuffer('image/png');
}

function createOGP() {
  const w = 1200, h = 630;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // 背景グラデーション
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#1a1a2e');
  grad.addColorStop(1, '#e17055');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // アイコン
  ctx.font = '120px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🌞', w / 2, 220);

  // タイトル
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 80px sans-serif';
  ctx.fillText('絶景ファインダー', w / 2, 360);

  // サブタイトル
  ctx.font = '36px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('今この場所で、どんな写真が撮れるか。', w / 2, 450);
  ctx.fillText('シャッターを押す前に確認できる撮影サポートアプリ', w / 2, 510);

  return canvas.toBuffer('image/png');
}

writeFileSync('public/icon-192.png', createIcon(192));
writeFileSync('public/icon-512.png', createIcon(512));
writeFileSync('public/og-image.png', createOGP());

console.log('画像生成完了！');