const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#1f6feb"/><path fill="#fff" d="M9 9h7l2 2h5v13H9V9zm7 2v2h4.2L16 11zm-5 7h12v1.5H11V18zm0 3.5h9v1.5h-9V21.5z"/><circle cx="12" cy="14" r="1.2" fill="#fff" opacity=".85"/><circle cx="16" cy="14" r="1.2" fill="#fff" opacity=".85"/><circle cx="20" cy="14" r="1.2" fill="#fff" opacity=".85"/></svg>`;

export function faviconLink(): string {
  return `<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(FAVICON_SVG)}" />`;
}
