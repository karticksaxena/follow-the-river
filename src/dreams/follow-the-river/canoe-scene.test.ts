/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of big interfaces */
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from '../../engine/dispose';
import { buildCanoeScene } from './canoe-scene';

vi.mock('../../engine/dispose', () => ({ disposeScene: vi.fn() }));
vi.mock('../../engine/models', () => ({
  loadModel: vi.fn(() => Promise.reject(new Error('no model'))),
  loadSkinned: vi.fn(() => Promise.reject(new Error('no model'))),
}));

vi.mock('../../engine/surfaces', () => ({
  surfaceMaterial: vi.fn(() => new MeshBasicNodeMaterial()),
  texturesReady: vi.fn(() => Promise.resolve()),
}));

describe('buildCanoeScene', () => {
  it('frees the half-built scene and rethrows when a load fails', async () => {
    const stage = { tier: 'low', camera: {} } as never;
    await expect(buildCanoeScene(100, stage)).rejects.toThrow('no model');
    expect(disposeScene).toHaveBeenCalledTimes(1);
  });
});
