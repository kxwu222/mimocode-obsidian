import type { ExternalContextFile } from './externalContextScanner';

export type ExternalPathScanner = (roots: string[]) => ExternalContextFile[];

let scanner: ExternalPathScanner = () => [];

/** Tests may install a scanner. Production keeps the no-op so Node fs stays out of the bundle. */
export function setExternalPathScanner(next: ExternalPathScanner): void {
  scanner = next;
}

export function scanExternalPaths(roots: string[]): ExternalContextFile[] {
  return scanner(roots);
}
