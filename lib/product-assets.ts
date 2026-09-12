export const PRINT_FILE_EXTENSIONS = new Set([
  'stl',
  '3mf',
  'obj',
  'zip',
  'gcode',
  'gco',
  'bgcode',
  'step',
  'stp',
]);

export function assetExtension(value: string) {
  return value.split('.').pop()?.toLocaleLowerCase('en') || '';
}

export function isSupportedPrintFile(filename: string) {
  return PRINT_FILE_EXTENSIONS.has(assetExtension(filename));
}

export function safeAssetFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-140) || 'datei';
}
