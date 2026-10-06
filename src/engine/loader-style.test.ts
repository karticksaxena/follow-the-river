import { beforeAll, describe, expect, it } from 'vitest';

let css = '';
/** The stylesheet text, read with Node's fs found at run time (the project has no Node typings; vitest blanks CSS imports). */
beforeAll(async () => {
  const specifier = 'node:fs';
  const fs: unknown = await import(/* @vite-ignore */ specifier);
  if (typeof fs !== 'object' || fs === null || !('readFileSync' in fs)) throw new Error('no fs');
  const read = fs.readFileSync;
  if (typeof read !== 'function') throw new Error('no readFileSync');
  // oxlint-disable-next-line typescript/no-unsafe-call, typescript/no-unsafe-type-assertion
  css = (read as (p: string, enc: string) => string)('src/style.css', 'utf8');
});

const block = (name: string): string => {
  const at = css.indexOf(name);
  return css.slice(at, css.indexOf('\n}\n', at));
};

describe('loader styles', () => {
  it('the ring turns forever on the compositor (transform only)', () => {
    expect(block('.loader-ring {')).toMatch(/animation: loader-spin [\d.]+s linear infinite/);
    expect(block('@keyframes loader-spin')).toMatch(/transform: rotate/);
    expect(block('@keyframes loader-spin')).not.toMatch(/width|left|top|margin/);
  });

  it('the label breathes in opacity only', () => {
    expect(block('.loader p {')).toContain('loader-breathe');
    expect(block('@keyframes loader-breathe')).toMatch(/opacity/);
  });

  it('reduced motion slows the loader but never stops it', () => {
    const media = css.slice(css.indexOf('prefers-reduced-motion'));
    expect(media).toMatch(/\.loader-ring \{\s*animation-duration/);
    expect(media.slice(0, 300)).not.toMatch(/animation: none/);
  });
});
