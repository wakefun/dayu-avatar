export type ImageFileInfo = {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  extension: '.png' | '.jpg' | '.webp';
};

export function detectImageFile(buffer: Buffer): ImageFileInfo | null {
  if (isPng(buffer)) {
    return { mimeType: 'image/png', extension: '.png' };
  }
  if (isJpeg(buffer)) {
    return { mimeType: 'image/jpeg', extension: '.jpg' };
  }
  if (isWebp(buffer)) {
    return { mimeType: 'image/webp', extension: '.webp' };
  }

  return null;
}

export function readImageDimensions(buffer: Buffer, mimeType: string) {
  try {
    if (mimeType === 'image/png') {
      return readPngDimensions(buffer);
    }
    if (mimeType === 'image/jpeg') {
      return readJpegDimensions(buffer);
    }
    if (mimeType === 'image/webp') {
      return readWebpDimensions(buffer);
    }
  } catch {
    return null;
  }
  return null;
}

export function parseSize(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return [1024, 1536] as const;
  }
  return [Number(match[1]), Number(match[2])] as const;
}

export function normalizeOpenAiSize(size: string): `${number}x${number}` {
  const normalized = normalizeImageDimensions(...parseSize(size));
  return `${normalized.width}x${normalized.height}`;
}

export function normalizeOutputFormat(format: string): 'png' | 'jpeg' | 'webp' {
  if (format === 'jpeg' || format === 'jpg') {
    return 'jpeg';
  }
  if (format === 'webp') {
    return 'webp';
  }
  return 'png';
}

function readPngDimensions(buffer: Buffer) {
  if (buffer.byteLength < 24 || !isPng(buffer)) {
    return null;
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function readJpegDimensions(buffer: Buffer) {
  if (!isJpeg(buffer)) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.byteLength) {
    if (buffer[offset] !== 0xff) {
      return null;
    }

    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) {
      return null;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      continue;
    }

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.byteLength) {
      return null;
    }
    if (isJpegStartOfFrameMarker(marker)) {
      const height = buffer.readUInt16BE(offset + 3);
      const width = buffer.readUInt16BE(offset + 5);
      return width > 0 && height > 0 ? { width, height } : null;
    }
    offset += length;
  }

  return null;
}

function isJpegStartOfFrameMarker(marker: number) {
  return (
    (marker >= 0xc0 && marker <= 0xc3) ||
    (marker >= 0xc5 && marker <= 0xc7) ||
    (marker >= 0xc9 && marker <= 0xcb) ||
    (marker >= 0xcd && marker <= 0xcf)
  );
}

function readWebpDimensions(buffer: Buffer) {
  if (buffer.byteLength < 16 || !isWebp(buffer)) {
    return null;
  }

  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8 ' && buffer.byteLength >= 30) {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunkType === 'VP8L' && buffer.byteLength >= 25) {
    const bits = buffer.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { width, height };
  }
  if (chunkType === 'VP8X' && buffer.byteLength >= 30) {
    const width = 1 + buffer.readUIntLE(24, 3);
    const height = 1 + buffer.readUIntLE(27, 3);
    return { width, height };
  }

  return null;
}

function normalizeImageDimensions(width: number, height: number) {
  const maxEdge = 3840;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const maxAspectRatio = 3;

  let nextWidth = width;
  let nextHeight = height;

  const longestEdge = Math.max(nextWidth, nextHeight);
  if (longestEdge > maxEdge) {
    const scale = maxEdge / longestEdge;
    nextWidth *= scale;
    nextHeight *= scale;
  }

  const aspectRatio = Math.max(nextWidth, nextHeight) / Math.max(1, Math.min(nextWidth, nextHeight));
  if (aspectRatio > maxAspectRatio) {
    if (nextWidth >= nextHeight) {
      nextWidth = nextHeight * maxAspectRatio;
    } else {
      nextHeight = nextWidth * maxAspectRatio;
    }
  }

  const pixels = nextWidth * nextHeight;
  if (pixels > maxPixels) {
    const scale = Math.sqrt(maxPixels / pixels);
    nextWidth *= scale;
    nextHeight *= scale;
  } else if (pixels < minPixels) {
    const scale = Math.sqrt(minPixels / Math.max(pixels, 1));
    nextWidth *= scale;
    nextHeight *= scale;
  }

  return fitRoundedDimensions(nextWidth, nextHeight, maxPixels);
}

function fitRoundedDimensions(width: number, height: number, maxPixels: number) {
  let nextWidth = roundDownToMultipleOf16(width);
  let nextHeight = roundDownToMultipleOf16(height);

  while (nextWidth * nextHeight > maxPixels) {
    if (nextWidth >= nextHeight) {
      nextWidth = Math.max(16, nextWidth - 16);
    } else {
      nextHeight = Math.max(16, nextHeight - 16);
    }
  }

  return {
    width: nextWidth,
    height: nextHeight,
  };
}

function roundDownToMultipleOf16(value: number) {
  return Math.max(16, Math.floor(value / 16) * 16);
}

function isPng(buffer: Buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebp(buffer: Buffer) {
  return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}
