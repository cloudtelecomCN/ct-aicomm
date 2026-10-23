const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const MAX_ENTRY_COUNT = 512;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const LOCAL_SIGNATURE = 0x04034b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const END_SIGNATURE = 0x06054b50;
const REGULAR_FILE_MODE = 0o100644;

function fail(code, message) {
  const error = new TypeError(message);
  error.code = code;
  throw error;
}

function toBytes(value, label = "zip entry") {
  if (value instanceof Uint8Array) return Uint8Array.from(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value.slice(0));
  if (typeof value === "string") return new TextEncoder().encode(value);
  fail("zip_bytes_invalid", `${label} must be a string, ArrayBuffer, or Uint8Array`);
}

function safePath(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 256
    || value.startsWith("/") || value.endsWith("/") || value.includes("\\")
    || value.includes("\0") || /^[A-Za-z]:/.test(value)
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    fail("zip_path_invalid", `unsafe ZIP entry path: ${String(value)}`);
  }
  return value;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value += 1) {
    let crc = value;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
    table[value] = crc >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of toBytes(bytes)) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatenate(parts, totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0)) {
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

function header(length) {
  const bytes = new Uint8Array(length);
  return { bytes, view: new DataView(bytes.buffer) };
}

function normalizedEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > MAX_ENTRY_COUNT) {
    fail("zip_entries_invalid", `ZIP must contain between 1 and ${MAX_ENTRY_COUNT} files`);
  }
  const normalized = entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)
      || JSON.stringify(Object.keys(entry).sort()) !== JSON.stringify(["bytes", "path"])) {
      fail("zip_entry_invalid", `ZIP entry ${index} must contain exactly path and bytes`);
    }
    return { path: safePath(entry.path), bytes: toBytes(entry.bytes, entry.path) };
  }).sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (new Set(normalized.map(({ path }) => path)).size !== normalized.length) fail("zip_path_duplicate", "ZIP entry paths must be unique");
  return normalized;
}

export function createDeterministicZip(entries) {
  const normalized = normalizedEntries(entries);
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const entry of normalized) {
    const name = new TextEncoder().encode(entry.path);
    const checksum = crc32(entry.bytes);
    const local = header(30);
    local.view.setUint32(0, LOCAL_SIGNATURE, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, UTF8_FLAG, true);
    local.view.setUint16(8, STORE_METHOD, true);
    local.view.setUint16(10, 0, true);
    local.view.setUint16(12, 0x0021, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, entry.bytes.byteLength, true);
    local.view.setUint32(22, entry.bytes.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    local.view.setUint16(28, 0, true);
    localParts.push(local.bytes, name, entry.bytes);

    const central = header(46);
    central.view.setUint32(0, CENTRAL_SIGNATURE, true);
    central.view.setUint16(4, 0x0314, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, UTF8_FLAG, true);
    central.view.setUint16(10, STORE_METHOD, true);
    central.view.setUint16(12, 0, true);
    central.view.setUint16(14, 0x0021, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, entry.bytes.byteLength, true);
    central.view.setUint32(24, entry.bytes.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, REGULAR_FILE_MODE << 16, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(central.bytes, name);
    localOffset += 30 + name.byteLength + entry.bytes.byteLength;
  }

  const centralBytes = concatenate(centralParts);
  const end = header(22);
  end.view.setUint32(0, END_SIGNATURE, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, normalized.length, true);
  end.view.setUint16(10, normalized.length, true);
  end.view.setUint32(12, centralBytes.byteLength, true);
  end.view.setUint32(16, localOffset, true);
  end.view.setUint16(20, 0, true);
  const archive = concatenate([...localParts, centralBytes, end.bytes]);
  if (archive.byteLength > MAX_ARCHIVE_BYTES) fail("zip_archive_too_large", `ZIP exceeds ${MAX_ARCHIVE_BYTES} bytes`);
  return archive;
}

function ensureRange(bytes, offset, length, code) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.byteLength) {
    fail(code, "ZIP structure points outside the archive");
  }
}

function decodeName(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail("zip_path_utf8_invalid", "ZIP entry path is not valid UTF-8");
  }
}

export function readDeterministicZip(value) {
  const bytes = toBytes(value, "ZIP archive");
  if (bytes.byteLength < 22 || bytes.byteLength > MAX_ARCHIVE_BYTES) fail("zip_archive_size_invalid", "ZIP archive size is unsupported");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = bytes.byteLength - 22;
  if (view.getUint32(endOffset, true) !== END_SIGNATURE || view.getUint16(endOffset + 20, true) !== 0) {
    fail("zip_end_record_invalid", "ZIP must end with one comment-free end record");
  }
  const disk = view.getUint16(endOffset + 4, true);
  const centralDisk = view.getUint16(endOffset + 6, true);
  const entriesOnDisk = view.getUint16(endOffset + 8, true);
  const entryCount = view.getUint16(endOffset + 10, true);
  const centralSize = view.getUint32(endOffset + 12, true);
  const centralOffset = view.getUint32(endOffset + 16, true);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount || entryCount < 1 || entryCount > MAX_ENTRY_COUNT
    || entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff
    || centralOffset + centralSize !== endOffset) {
    fail("zip_end_record_unsupported", "ZIP64, split, empty, or non-canonical archives are unsupported");
  }

  const entries = [];
  const paths = new Set();
  const occupied = [];
  let cursor = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    ensureRange(bytes, cursor, 46, "zip_central_header_truncated");
    if (view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) fail("zip_central_signature_invalid", "Invalid central directory signature");
    const madeBy = view.getUint16(cursor + 4, true);
    const needed = view.getUint16(cursor + 6, true);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const checksum = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localOffset = view.getUint32(cursor + 42, true);
    ensureRange(bytes, cursor + 46, nameLength + extraLength + commentLength, "zip_central_entry_truncated");
    if (needed > 20 || flags !== UTF8_FLAG || method !== STORE_METHOD || compressedSize !== size
      || extraLength !== 0 || commentLength !== 0 || diskStart !== 0) {
      fail("zip_entry_unsupported", "ZIP entries must be UTF-8, stored, comment-free regular files without descriptors or extra fields");
    }
    const host = madeBy >>> 8;
    const mode = externalAttributes >>> 16;
    if (host === 3 && ((mode & 0o170000) === 0o120000 || (mode & 0o170000) === 0o040000)) {
      fail("zip_entry_type_invalid", "ZIP symlinks and directories are rejected");
    }
    const path = safePath(decodeName(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    if (paths.has(path)) fail("zip_path_duplicate", `duplicate ZIP entry ${path}`);
    paths.add(path);

    ensureRange(bytes, localOffset, 30, "zip_local_header_truncated");
    if (localOffset >= centralOffset || view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) fail("zip_local_signature_invalid", `invalid local header for ${path}`);
    const localFlags = view.getUint16(localOffset + 6, true);
    const localMethod = view.getUint16(localOffset + 8, true);
    const localChecksum = view.getUint32(localOffset + 14, true);
    const localCompressedSize = view.getUint32(localOffset + 18, true);
    const localSize = view.getUint32(localOffset + 22, true);
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    ensureRange(bytes, localOffset + 30, localNameLength + localExtraLength + size, "zip_local_entry_truncated");
    const localPath = decodeName(bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength));
    if (localFlags !== flags || localMethod !== method || localChecksum !== checksum
      || localCompressedSize !== compressedSize || localSize !== size || localExtraLength !== 0 || localPath !== path) {
      fail("zip_local_central_mismatch", `local and central metadata differ for ${path}`);
    }
    const dataOffset = localOffset + 30 + localNameLength;
    const dataEnd = dataOffset + size;
    if (dataEnd > centralOffset) fail("zip_entry_overlaps_directory", `${path} overlaps the central directory`);
    occupied.push([localOffset, dataEnd]);
    const payload = Uint8Array.from(bytes.subarray(dataOffset, dataEnd));
    if (crc32(payload) !== checksum) fail("zip_crc_mismatch", `${path} failed CRC-32 verification`);
    entries.push(Object.freeze({ path, bytes: payload, crc32: checksum }));
    cursor += 46 + nameLength;
  }
  if (cursor !== endOffset) fail("zip_central_size_mismatch", "central directory size does not match its entries");
  occupied.sort((left, right) => left[0] - right[0]);
  let expectedOffset = 0;
  for (const [start, end] of occupied) {
    if (start !== expectedOffset) fail("zip_local_layout_invalid", "ZIP contains gaps, overlaps, or unreferenced local data");
    expectedOffset = end;
  }
  if (expectedOffset !== centralOffset) fail("zip_local_layout_invalid", "ZIP contains unreferenced bytes before the central directory");
  const sorted = entries.slice().sort((left, right) => left.path.localeCompare(right.path, "en"));
  if (entries.some((entry, index) => entry.path !== sorted[index].path)) fail("zip_entry_order_invalid", "ZIP entries must use canonical path order");
  return Object.freeze(entries);
}

export const DETERMINISTIC_ZIP_LIMITS = Object.freeze({
  max_archive_bytes: MAX_ARCHIVE_BYTES,
  max_entry_count: MAX_ENTRY_COUNT,
  compression_method: "store",
  symlinks_allowed: false,
});
