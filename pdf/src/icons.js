const paths = {
  logo: '<path d="M12 3.2c4.86 0 8.8 3.94 8.8 8.8s-3.94 8.8-8.8 8.8S3.2 16.86 3.2 12 7.14 3.2 12 3.2Z"/><path d="M12 7.1v9.8M7.75 9.55l8.5 4.9m0-4.9-8.5 4.9"/>',
  merge: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3M8 12h8m-3-3 3 3-3 3"/>',
  split: '<path d="M12 3v18M8 7H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h3m8-10h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-3"/>',
  compress: '<path d="m8 3 4 4 4-4M12 7V2m-4 19 4-4 4 4m-4-4v5M3 8l4 4-4 4m4-4H2m19-4-4 4 4 4m-4-4h5"/>',
  office: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8m-8 4h6"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  imageToPdf: '<path d="M4 16.5 9 11l4 4 2-2 5 5M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 3v4h4"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z"/><path d="m9 12 2 2 4-4"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M5 20h14"/>',
  close: '<path d="m18 6-12 12M6 6l12 12"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
  trash: '<path d="M3 6h18m-2 0-1 14H6L5 6m3 0V3h8v3m-6 4v6m4-6v6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 21h14"/>',
  lock: '<rect width="16" height="12" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3.3-.4 6.8-1.6 6.8-7A5.4 5.4 0 0 0 19.4 4 5 5 0 0 0 19.3.5S18.2.1 15 1.8a13.4 13.4 0 0 0-7 0C4.8.1 3.7.5 3.7.5A5 5 0 0 0 3.6 4a5.4 5.4 0 0 0-1.4 3.7c0 5.4 3.5 6.6 6.8 7A4.8 4.8 0 0 0 8 18v4m-3 0c.5-1.5.5-3 0-4.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66L20 8.68M20 4v4.68h-4.68"/>',
};

export function icon(name, size = 24, className = '') {
  return `<svg class="icon ${className}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
}
