import * as THREE from 'three/webgpu';

const WIDTH = 256;
const HEIGHT = 192;
/** Seconds between redraws (the scan noise): ~10 per second, not every frame. */
const REDRAW_EVERY = 0.1;
const TICKER = 'UNKNOWN INFECTION SPREADING · STAY INDOORS · HOSPITALS OVERWHELMED · ';
const TICKER_SPEED = 45; // px per second
const SCAN_LINES = 36;

function drawStudio(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#10151c';
  g.fillRect(0, 0, WIDTH, HEIGHT);
  g.fillStyle = '#2a2d31'; // the anchor: a grey silhouette behind the desk
  g.beginPath();
  g.arc(WIDTH / 2, 78, 22, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(WIDTH / 2 - 62, HEIGHT - 40);
  g.quadraticCurveTo(WIDTH / 2 - 56, 108, WIDTH / 2, 106);
  g.quadraticCurveTo(WIDTH / 2 + 56, 108, WIDTH / 2 + 62, HEIGHT - 40);
  g.fill();
}

function drawBanner(g: CanvasRenderingContext2D, time: number): void {
  g.fillStyle = '#5a0f12';
  g.fillRect(0, 12, WIDTH, 26);
  g.fillStyle = '#d8d0d0';
  g.font = 'bold 20px sans-serif';
  g.textBaseline = 'middle';
  g.fillText('BREAKING NEWS', 12, 26);
  g.fillStyle = '#16181c';
  g.fillRect(0, HEIGHT - 28, WIDTH, 28);
  g.fillStyle = '#c8c8c8';
  g.font = 'bold 14px sans-serif';
  const width = g.measureText(TICKER).width;
  const shift = (time * TICKER_SPEED) % width;
  for (let x = -shift; x < WIDTH; x += width) g.fillText(TICKER, x, HEIGHT - 14);
}

function drawNoise(g: CanvasRenderingContext2D, time: number): void {
  for (let i = 0; i < SCAN_LINES; i++) {
    g.fillStyle = `rgba(255,255,255,${(Math.random() * 0.08).toFixed(3)})`;
    g.fillRect(0, Math.random() * HEIGHT, WIDTH, 1 + Math.random() * 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.18)'; // the slow dark bar rolling down the picture
  g.fillRect(0, (time * 30) % (HEIGHT + 20), WIDTH, 12);
}

/** A flickering "BREAKING NEWS" screen drawn on a canvas; `update(t)` redraws the scan noise. */
export function createNewsScreen(): {
  texture: THREE.CanvasTexture;
  update(time: number): void;
  dispose(): void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false; // the Screen mesh uses glTF UVs (v down)
  let last = -Infinity;
  const draw = (time: number): void => {
    last = time;
    drawStudio(g);
    drawBanner(g, time);
    drawNoise(g, time);
    texture.needsUpdate = true;
  };
  draw(0);
  return {
    texture,
    update(time) {
      if (time - last >= REDRAW_EVERY) draw(time);
    },
    dispose() {
      texture.dispose();
    },
  };
}
