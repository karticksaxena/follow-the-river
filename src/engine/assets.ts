/** URL of a file in `public/assets/`, correct even if the site is served from a sub-path. */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}assets/${path}`;
}
