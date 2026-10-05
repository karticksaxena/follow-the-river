import * as THREE from 'three/webgpu';
import { describe, expect, it } from 'vitest';
import { armsNode, giveArms } from './fp-arms';
import { SLOTS } from './weapons';

/** Stands in for the loaded kartik-arms.glb: one mesh node per weapon. */
function source(): THREE.Group {
  const root = new THREE.Group();
  for (const w of SLOTS) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    mesh.name = armsNode(w);
    mesh.castShadow = true;
    root.add(mesh);
  }
  return root;
}

describe('giveArms', () => {
  it('names a node per weapon', () => {
    expect(SLOTS.map(armsNode)).toEqual(['arms_bow', 'arms_pistol', 'arms_shotgun', 'arms_rifle']);
  });

  it("puts the weapon's arms under its viewmodel, and only those", () => {
    const view = new THREE.Group();
    const arms = giveArms(view, source(), 'shotgun');
    expect(arms.parent).toBe(view);
    expect(arms.name).toBe('arms_shotgun');
    expect(view.children).toEqual([arms]);
  });

  it('has no switch of its own: the viewmodel decides whether it shows', () => {
    const view = new THREE.Group();
    const arms = giveArms(view, source(), 'rifle');
    expect(arms.visible).toBe(true);
    view.visible = false;
    expect(arms.visible).toBe(true);
    expect(arms.parent?.visible).toBe(false);
  });

  it("casts no shadow (it is the player's own arms, inches from the lens)", () => {
    const arms = giveArms(new THREE.Group(), source(), 'bow');
    arms.traverse((n) => expect(n.castShadow).toBe(false));
  });

  it("refuses a model that lacks the weapon's arms", () => {
    expect(() => giveArms(new THREE.Group(), new THREE.Group(), 'pistol')).toThrow(/arms_pistol/);
  });
});
