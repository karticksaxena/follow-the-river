/* oxlint-disable vitest/require-mock-type-parameters, typescript/no-unsafe-type-assertion -- partial fakes of the renderer and render targets */
import * as THREE from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import { initEnvironment, refreshEnvironment } from './environment';

describe('refreshEnvironment', () => {
  it('re-renders into the same target, so scene.environment stays the same texture (no recompile)', () => {
    const made: { texture: THREE.Texture; dispose: () => void }[] = [];
    const fromScene = vi
      .spyOn(THREE.PMREMGenerator.prototype, 'fromScene')
      .mockImplementation((_s, _sigma, _near, _far, options?: { renderTarget?: unknown }) => {
        if (options?.renderTarget) return options.renderTarget as THREE.RenderTarget;
        const target = { texture: new THREE.Texture(), dispose: vi.fn() };
        made.push(target);
        return target as unknown as THREE.RenderTarget;
      });
    initEnvironment({} as THREE.WebGPURenderer);
    const scene = new THREE.Scene();
    const look = { skyTop: 0x101418, skyHorizon: 0x202830, environment: 0.2 };
    refreshEnvironment(scene, look);
    const first = scene.environment;
    refreshEnvironment(scene, { ...look, skyTop: 0x303840 });
    refreshEnvironment(scene, { ...look, environment: 0.4 });
    expect(scene.environment).toBe(first); // the same texture object every time
    expect(made).toHaveLength(1); // one target, re-rendered
    expect(scene.environmentIntensity).toBe(0.4);
    fromScene.mockRestore();
  });
});
