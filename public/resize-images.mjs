import sharp from 'sharp';
import { readdirSync } from 'fs';

const images = [
  'scene-magic',
  'scene-sunny', 
  'scene-cloudy',
  'scene-golden',
  'scene-star',
];

for (const name of images) {
  await sharp(`public/${name}.jpg`)
    .resize(800, 500, { fit: 'cover' })
    .jpeg({ quality: 80 })
    .toFile(`public/${name}-opt.jpg`);
  console.log(`✅ ${name}-opt.jpg 生成完了`);
}