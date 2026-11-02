/**
 * Universal Asset URL resolver for NIGHTSHIFT.
 * Seamlessly resolves asset paths whether running under HTTP(S) in web browsers
 * or under file:// protocol inside packaged Electron desktop apps.
 */
export function getAssetUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    try {
      return new URL(`./${cleanPath}`, window.location.href).href;
    } catch {
      return `./${cleanPath}`;
    }
  }

  return `/${cleanPath}`;
}
