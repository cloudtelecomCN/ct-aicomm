import type { KeyObject } from "node:crypto";

export const REGISTRY_ENTRY_INTEGRITY_VERSION: "1.0.0";

export interface RegistryProtocolSnapshot {
  id: string;
  name: string;
  version: string;
  category: string;
  summary: string;
  specification_urls: string[];
  implementation_urls: string[];
  interoperability_tags: string[];
}

export interface RegistryArtifact {
  path: string;
  media_type: string;
  sha256: `sha256:${string}`;
}

export interface RegistryEntry {
  schema_version: "1.0.0";
  entry_id: string;
  entry_version: string;
  sequence: number;
  status: "published" | "deprecated";
  published_at: string;
  source_contribution: { id: string; digest: `sha256:${string}` };
  review_receipt_digest: `sha256:${string}`;
  previous_version_digest: `sha256:${string}` | null;
  protocol: RegistryProtocolSnapshot;
  artifacts: RegistryArtifact[];
}

export interface RegistryEntryRecord {
  entry: RegistryEntry;
  integrity: { canonicalization: "ct-aicomm-json-v1"; entry_digest: `sha256:${string}` };
  signature: {
    schema_version: "1.0.0";
    algorithm: "Ed25519";
    key_id: string;
    signed_at: string;
    value: `base64:${string}`;
  };
}

export function canonicalizeRegistryValue(value: unknown): string;
export function digestRegistryArtifact(bytes: string | Uint8Array): `sha256:${string}`;
export function createRegistryEntryRecord(entry: RegistryEntry, options: { privateKey: string | Buffer | KeyObject; keyId: string }): RegistryEntryRecord;
export function verifyRegistryEntryRecord(record: RegistryEntryRecord, options: {
  publicKeys: Map<string, string | Buffer | KeyObject> | Record<string, string | Buffer | KeyObject>;
  artifactBytesByPath?: Map<string, string | Uint8Array> | Record<string, string | Uint8Array>;
  requireArtifacts?: boolean;
}): { entry_digest: string; key_id: string; artifacts_verified: boolean };
export function verifyRegistryEntryHistory(records: RegistryEntryRecord[], options: Parameters<typeof verifyRegistryEntryRecord>[1]): {
  entry_id: string;
  versions: string[];
  latest_digest: string;
  key_ids: string[];
  artifacts_verified: boolean;
};
