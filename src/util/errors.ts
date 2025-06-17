export class ReplicateHashMismatchError extends Error {
  mayIgnore: boolean = false;
  affectedFiles: string[];
  constructor(affectedFiles: string[]) {
    super('Replicate install mode can only work if the checksums of the installed files match those in the archive. Please try to reinstall the mod or use binary patching instead.');
    this.name = 'ReplicateHashMismatchError';
    this.mayIgnore = false;
    this.affectedFiles = affectedFiles;
  }

  toString(): string {
    return `${this.name}: ${this.message} (affected files: ${this.affectedFiles.join(', ')})`;
  }
}