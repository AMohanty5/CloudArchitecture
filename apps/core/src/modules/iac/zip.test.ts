import { describe, expect, it } from 'vitest';
import { zipFiles } from './zip';

/** Read the stored entries back out of a minimal ZIP by walking local file headers. */
function readEntries(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const compSize = buf.readUInt32LE(i + 18);
    const nameLen = buf.readUInt16LE(i + 26);
    const extraLen = buf.readUInt16LE(i + 28);
    const name = buf.toString('utf8', i + 30, i + 30 + nameLen);
    const dataStart = i + 30 + nameLen + extraLen;
    out[name] = buf.toString('utf8', dataStart, dataStart + compSize);
    i = dataStart + compSize;
  }
  return out;
}

describe('zipFiles', () => {
  const files = { 'b.tf': 'resource "x" {}\n', 'a.tf': '# header\n', 'README.md': '# Readme\n' };
  const zip = zipFiles(files);

  it('produces a valid archive with the end-of-central-directory record', () => {
    expect(zip.subarray(0, 4).readUInt32LE(0)).toBe(0x04034b50); // first local header
    const eocd = zip.subarray(zip.length - 22);
    expect(eocd.readUInt32LE(0)).toBe(0x06054b50);
    expect(eocd.readUInt16LE(10)).toBe(3); // total entries
  });

  it('round-trips every file byte-for-byte', () => {
    expect(readEntries(zip)).toEqual(files);
  });

  it('stores entries in sorted-name order (stable output)', () => {
    expect(Object.keys(readEntries(zip))).toEqual(['README.md', 'a.tf', 'b.tf']);
  });

  it('is deterministic — identical input yields identical bytes', () => {
    expect(zipFiles(files).equals(zip)).toBe(true);
  });
});
