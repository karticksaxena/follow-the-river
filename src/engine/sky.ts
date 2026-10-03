import * as THREE from 'three/webgpu';

const horizonColor = new THREE.Color();
const topColor = new THREE.Color();
const mixed = new THREE.Color();

/** Repaints the dome's vertex colours from `top` to `horizon` (on a lighting change, not per frame). */
export function paintSkyDome(dome: THREE.Mesh, top: number, horizon: number): void {
  const geometry = dome.geometry;
  const position = geometry.getAttribute('position');
  let color = geometry.getAttribute('color');
  if (!color) {
    color = new THREE.Float32BufferAttribute(position.count * 3, 3);
    geometry.setAttribute('color', color);
  }
  horizonColor.set(horizon);
  topColor.set(top);
  let radius = 1e-6;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, position.getY(i));
  for (let i = 0; i < position.count; i++) {
    const height = Math.max(0, position.getY(i) / radius);
    mixed.lerpColors(horizonColor, topColor, Math.sqrt(height));
    color.setXYZ(i, mixed.r, mixed.g, mixed.b);
  }
  color.needsUpdate = true;
}

/**
 * A huge inside-out sphere shaded from `top` to `horizon`, so there is never an empty
 * background edge. Fog is off so the sky keeps its colour; geometry fog hides the ground's end.
 */
export function createSkyDome(top: number, horizon: number, radius = 180): THREE.Mesh {
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 12),
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false,
    }),
  );
  paintSkyDome(dome, top, horizon);
  dome.renderOrder = -1;
  return dome;
}
