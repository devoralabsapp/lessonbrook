import { crc32, deflateSync } from "node:zlib";
import { encode } from "uqr";

function pngChunk(type: string, data: Buffer) {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, -4)), chunk.length - 4);
  return chunk;
}

export function qrPng(payload: string) {
  const { size, data } = encode(payload, { ecc: "M", border: 4 });
  const scale = 8;
  const width = size * scale;
  const stride = width + 1;
  const pixels = Buffer.alloc(stride * width, 255);
  // Each grayscale scanline starts with filter type 0 (unfiltered).
  for (let y = 0; y < width; y++) {
    const start = y * stride;
    pixels[start] = 0;
    const row = data[Math.floor(y / scale)];
    for (let x = 0; x < size; x++) {
      if (row[x])
        pixels.fill(0, start + 1 + x * scale, start + 1 + (x + 1) * scale);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(width, 4);
  header[8] = 8; // Grayscale, 8 bits per pixel.
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
