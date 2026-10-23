export interface DeterministicZipEntry {
  path: string;
  bytes: Uint8Array | ArrayBuffer | string;
}

export interface DeterministicZipReadEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly crc32: number;
}

export declare function crc32(bytes: Uint8Array | ArrayBuffer | string): number;
export declare function createDeterministicZip(entries: DeterministicZipEntry[]): Uint8Array;
export declare function readDeterministicZip(bytes: Uint8Array | ArrayBuffer): readonly DeterministicZipReadEntry[];
export declare const DETERMINISTIC_ZIP_LIMITS: Readonly<{
  max_archive_bytes: number;
  max_entry_count: number;
  compression_method: "store";
  symlinks_allowed: false;
}>;
