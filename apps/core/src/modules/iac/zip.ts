/**
 * A minimal, dependency-free ZIP writer (store / no compression). The Terraform
 * generator emits a file map; the export endpoint needs to hand the browser a
 * single download, so we package the bundle as a `.zip`. Like the HCL writer next
 * door, this is purpose-built rather than a library: pure, tiny, and crucially
 * *deterministic* (fixed timestamps) so identical models produce byte-identical
 * archives — which keeps the export cacheable and golden-testable.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// A fixed DOS timestamp (1980-01-01 00:00:00) keeps archives byte-stable.
const DOS_TIME = 0;
const DOS_DATE = 0x0021; // year 1980, month 1, day 1

interface Entry {
  name: string;
  data: Buffer;
  crc: number;
  offset: number;
}

/**
 * Pack a name→content file map into a stored (uncompressed) ZIP archive. Entries
 * are emitted in sorted-name order so the byte output is fully deterministic.
 */
export function zipFiles(files: Record<string, string>): Buffer {
  const names = Object.keys(files).sort();
  const chunks: Buffer[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  for (const name of names) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(files[name]!, 'utf8');
    const crc = crc32(data);

    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); // local file header signature
    header.writeUInt16LE(20, 4); // version needed
    header.writeUInt16LE(0, 6); // flags
    header.writeUInt16LE(0, 8); // method: store
    header.writeUInt16LE(DOS_TIME, 10);
    header.writeUInt16LE(DOS_DATE, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18); // compressed size
    header.writeUInt32LE(data.length, 22); // uncompressed size
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28); // extra length

    entries.push({ name, data, crc, offset });
    chunks.push(header, nameBuf, data);
    offset += header.length + nameBuf.length + data.length;
  }

  const central: Buffer[] = [];
  let centralSize = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const rec = Buffer.alloc(46);
    rec.writeUInt32LE(0x02014b50, 0); // central directory header signature
    rec.writeUInt16LE(20, 4); // version made by
    rec.writeUInt16LE(20, 6); // version needed
    rec.writeUInt16LE(0, 8); // flags
    rec.writeUInt16LE(0, 10); // method: store
    rec.writeUInt16LE(DOS_TIME, 12);
    rec.writeUInt16LE(DOS_DATE, 14);
    rec.writeUInt32LE(e.crc, 16);
    rec.writeUInt32LE(e.data.length, 20); // compressed size
    rec.writeUInt32LE(e.data.length, 24); // uncompressed size
    rec.writeUInt16LE(nameBuf.length, 28);
    rec.writeUInt16LE(0, 30); // extra length
    rec.writeUInt16LE(0, 32); // comment length
    rec.writeUInt16LE(0, 34); // disk number start
    rec.writeUInt16LE(0, 36); // internal attributes
    rec.writeUInt32LE(0, 38); // external attributes
    rec.writeUInt32LE(e.offset, 42); // local header offset
    central.push(rec, nameBuf);
    centralSize += rec.length + nameBuf.length;
  }

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4); // disk number
  end.writeUInt16LE(0, 6); // disk with central directory
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralSize, 12); // central directory size
  end.writeUInt32LE(offset, 16); // central directory offset
  end.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...chunks, ...central, end]);
}
