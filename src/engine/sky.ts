import * as THREE from 'three/webgpu';

/**
 * A huge inside-out sphere shaded from `top` to `horizon`, so there is never an empty
 * background edge. Fog is off so the sky keeps its colour; geometry fog hides the ground's end.
 */
export function createSkyDome(top: number, horizon: number, radius = 180): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 24, 12);
  const colors: number[] = [];
  const position = geometry.getAttribute('position');
  const a = new THREE.Color(horizon);
  const b = new THREE.Color(top);
  const mixed = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const height = Math.max(0, position.getY(i) / radius);
    mixed.lerpColors(a, b, Math.sqrt(height));
    colors.push(mixed.r, mixed.g, mixed.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
    fog: false,
    depthWrite: false,
  });
  const dome = new THREE.Mesh(geometry, material);
  dome.renderOrder = -1;
  return dome;
}
