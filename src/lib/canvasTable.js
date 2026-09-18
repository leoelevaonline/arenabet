export function tablePoint(rect, clientX, clientY, width, height) {
  const x = (clientX - rect.left) / Math.max(1, rect.width);
  const y = (clientY - rect.top) / Math.max(1, rect.height);
  return rect.height > rect.width
    ? { x: (1 - y) * width, y: x * height }
    : { x: x * width, y: y * height };
}

export function tableTransform(ctx, canvas, width, height) {
  if (canvas.height > canvas.width) {
    ctx.setTransform(0, -canvas.height / width, canvas.width / height, 0, 0, canvas.height);
  } else {
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
  }
}
