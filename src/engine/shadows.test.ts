import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import * as THREE from 'three/webgpu';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  attachKeyShadows,
  detachKeyShadows,
  KEY_SHADOWS,
  needsShadowChange,
  syncKeyShadows,
  withoutShadowUpdates,
} from './shadows';

type Listen = (type: string, fn: () => void) => void;
const add = vi.fn<Listen>();
const remove = vi.fn<Listen>();
beforeEach(() => {
  add.mockClear();
  remove.mockClear();
  vi.stubGlobal('addEventListener', add);
  vi.stubGlobal('removeEventListener', remove);
});
afterEach(() => vi.unstubAllGlobals());

const cascades = (light: THREE.DirectionalLight): number | null =>
  light.shadow.shadowNode instanceof CSMShadowNode ? light.shadow.shadowNode.cascades : null;

describe('needsShadowChange', () => {
  it('is a pure function of the tier', () => {
    expect(needsShadowChange(null, 'high')).toBe(true);
    expect(needsShadowChange('high', 'high')).toBe(false);
    expect(needsShadowChange('high', 'medium')).toBe(true);
    expect(needsShadowChange('medium', 'low')).toBe(true);
    expect(needsShadowChange(null, 'low')).toBe(false);
  });

  it('gives High 3 cascades at 2048, Medium 1 at 1024, Low none', () => {
    expect(KEY_SHADOWS.high).toEqual({ cascades: 3, mapSize: 2048 });
    expect(KEY_SHADOWS.medium).toEqual({ cascades: 1, mapSize: 1024 });
    expect(KEY_SHADOWS.low).toBeNull();
  });
});

describe('attachKeyShadows', () => {
  it('removes its resize listener and disposes the CSM when detached', () => {
    const light = new THREE.DirectionalLight();
    attachKeyShadows(light, 'high');
    const csm = light.shadow.shadowNode;
    if (!(csm instanceof CSMShadowNode)) throw new Error('expected a CSM');
    const dispose = vi.spyOn(csm, 'dispose');
    expect(add).toHaveBeenCalledTimes(1);
    detachKeyShadows(light);
    expect(remove).toHaveBeenCalledWith('resize', add.mock.calls[0]?.[1]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect([light.castShadow, light.shadow.shadowNode]).toEqual([false, undefined]);
  });
});

describe('the first frame', () => {
  it('starts with the strength the light already had (0 = no shadow passes)', () => {
    const light = new THREE.DirectionalLight();
    light.shadow.intensity = 0;
    attachKeyShadows(light, 'high');
    expect([light.shadow.intensity, light.shadow.autoUpdate]).toEqual([0, false]);
  });
});

describe('syncKeyShadows', () => {
  it('rebuilds the cascades when the tier changes, and drops them on Low', () => {
    const light = new THREE.DirectionalLight();
    attachKeyShadows(light, 'high');
    expect([cascades(light), light.shadow.mapSize.x]).toEqual([3, 2048]);
    syncKeyShadows(light, 'medium');
    expect([cascades(light), light.shadow.mapSize.x]).toEqual([1, 1024]);
    expect(remove).toHaveBeenCalledTimes(1); // the High one's listener went
    syncKeyShadows(light, 'medium');
    expect(add).toHaveBeenCalledTimes(2); // no rebuild when nothing changed
    syncKeyShadows(light, 'low');
    expect([cascades(light), light.castShadow]).toEqual([null, false]);
  });
});

describe('withoutShadowUpdates', () => {
  // oxlint-disable-next-line unicorn/consistent-function-scoping
  const frame = (id: number): THREE.NodeFrame =>
    ({
      renderer: { _isPreCompiling: false },
      camera: new THREE.PerspectiveCamera(),
      frameId: id,
    }) as never; // oxlint-disable-line typescript/no-unsafe-type-assertion

  it('stops shadow maps being redrawn inside the callback only', () => {
    const light = new THREE.DirectionalLight();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const node = new THREE.ShadowNode(light, light.shadow) as THREE.ShadowNode & {
      updateShadow(): void; // in three's source, missing from its typings
    };
    const draw = vi.spyOn(node, 'updateShadow').mockImplementation(() => undefined);
    const run = (id: number): void => {
      try {
        node.updateBefore(frame(id));
      } catch {
        // the stubbed pass has no depth texture to read back
      }
    };
    withoutShadowUpdates(() => run(1));
    expect(draw).not.toHaveBeenCalled();
    run(2);
    expect(draw).toHaveBeenCalledOnce();
    expect(() =>
      withoutShadowUpdates(() => {
        throw new Error('x');
      }),
    ).toThrow('x');
    run(3);
    expect(draw).toHaveBeenCalledTimes(2); // restored even after a throw
  });
});
