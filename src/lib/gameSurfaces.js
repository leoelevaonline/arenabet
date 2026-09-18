// Render once into each game's cached background. The seeded grain never
// flickers between frames and needs no image downloads.
export function drawSurface(ctx, x, y, width, height, material) {
  let seed = 19471;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  const count = Math.ceil(width * height / (material === 'grass' ? 16 : 22));
  for (let i = 0; i < count; i += 1) {
    const px = x + random() * width;
    const py = y + random() * height;
    const light = random() > 0.5;
    ctx.strokeStyle = light ? 'rgba(255,242,208,0.13)' : 'rgba(12,22,12,0.16)';
    ctx.fillStyle = ctx.strokeStyle;
    if (material === 'clay') {
      const radius = 0.25 + random() * 1.2;
      ctx.beginPath();
      ctx.ellipse(px, py, radius * 1.6, radius, random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.lineWidth = material === 'felt' ? 0.45 : 0.7;
      const length = material === 'felt' ? 1.4 : 2 + random() * 4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (random() - 0.5) * 2, py - length);
      ctx.stroke();
    }
  }
  if (material === 'clay') {
    ctx.strokeStyle = 'rgba(77,39,23,0.08)';
    ctx.lineWidth = 0.7;
    for (let row = 0; row < height; row += 3.7) {
      ctx.beginPath();
      ctx.moveTo(x, y + row);
      ctx.bezierCurveTo(x + width * 0.3, y + row + 4, x + width * 0.7, y + row - 4, x + width, y + row);
      ctx.stroke();
    }
  }
  // Overhead light falls off toward the cushions instead of a flat color wash.
  const light = ctx.createRadialGradient(x + width * 0.42, y + height * 0.35, 0, x + width / 2, y + height / 2, width * 0.65);
  light.addColorStop(0, 'rgba(255,244,215,0.07)');
  light.addColorStop(0.55, 'rgba(0,0,0,0)');
  light.addColorStop(1, 'rgba(0,8,5,0.3)');
  ctx.fillStyle = light;
  ctx.fillRect(x, y, width, height);
  for (const [sx, sy, ex, ey] of [[x, y, x, y + 18], [x, y + height, x, y + height - 18], [x, y, x + 18, y], [x + width, y, x + width - 18, y]]) {
    const shadow = ctx.createLinearGradient(sx, sy, ex, ey);
    shadow.addColorStop(0, 'rgba(0,0,0,0.24)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadow;
    if (sx === ex) ctx.fillRect(x, Math.min(sy, ey), width, 18);
    else ctx.fillRect(Math.min(sx, ex), y, 18, height);
  }
  ctx.restore();
}
