import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { cwebpBin, dataRoot } from './config';
import { db, getAsset } from './database';
import { readImageDimensions } from './image-utils';
import { createSolidPng } from './mock-images';
import type { AssetRow } from './types';
import { createId, formatMonthPath, isMissingFileError, nowIso, toStaticUrl } from './utils';

export function createUploadedAsset(
  userId: string,
  category: 'personal_reference' | 'style_reference',
  file: Express.Multer.File,
  imageFile: { mimeType: string; extension: string }
): AssetRow {
  const id = createId('asset');
  const extension = imageFile.extension;
  const dimensions = readImageDimensions(file.buffer, imageFile.mimeType);
  const monthFolder = formatMonthPath();
  const fileName = `${id}${extension}`;
  const storagePath = path.join('uploads', category, monthFolder, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, file.buffer);

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    userId,
    category,
    storagePath,
    toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`),
    fileName,
    imageFile.mimeType,
    dimensions?.width ?? null,
    dimensions?.height ?? null,
    file.size,
    nowIso()
  );

  return getAsset(id)!;
}

export function createSeedAsset(userId: string, category: 'personal_reference' | 'style_reference', name: string, rgb: [number, number, number]) {
  const id = createId('asset');
  const monthFolder = formatMonthPath();
  const storagePath = path.join('uploads', category, monthFolder, `${id}.png`);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, createSolidPng(512, 512, rgb));
  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, 'image/png', 512, 512, ?, ?)`
  ).run(id, userId, category, storagePath, toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`), name, fs.statSync(absolutePath).size, nowIso());
  return getAsset(id)!;
}

export function createBinaryGeneratedAsset(input: {
  userId: string;
  taskId: string;
  category: 'generated_result' | 'generated_thumbnail';
  buffer: Buffer;
  mimeType: string;
  extension: string;
  width: number;
  height: number;
  fileNameSuffix: 'result' | 'thumb';
}) {
  const id = createId('asset');
  const monthFolder = formatMonthPath();
  const fileName = `${input.taskId}-${input.fileNameSuffix}${input.extension}`;
  const storagePath = path.join('generated', monthFolder, input.taskId, fileName);
  const absolutePath = path.join(dataRoot, storagePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, input.buffer);

  db.prepare(
    `INSERT INTO file_assets (id, user_id, category, storage_disk, storage_path, public_url, file_name, mime_type, width, height, byte_size, created_at)
     VALUES (?, ?, ?, 'local', ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.category,
    storagePath,
    toStaticUrl(`/${storagePath.replaceAll(path.sep, '/')}`),
    fileName,
    input.mimeType,
    input.width,
    input.height,
    input.buffer.byteLength,
    nowIso()
  );

  return getAsset(id)!;
}

export function deleteAsset(asset: AssetRow) {
  try {
    fs.unlinkSync(path.join(dataRoot, asset.storage_path));
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }
  db.prepare('DELETE FROM file_assets WHERE id = ?').run(asset.id);
}

export function createWebpThumbnail(sourceStoragePath: string, width: number, height: number) {
  const thumbnailSize = getThumbnailDimensions(width, height);
  return execFileSync(cwebpBin, ['-quiet', '-q', '88', '-resize', String(thumbnailSize.width), String(thumbnailSize.height), path.join(dataRoot, sourceStoragePath), '-o', '-'], {
    maxBuffer: 20 * 1024 * 1024,
  });
}

export function getThumbnailDimensions(width: number, height: number) {
  const maxEdge = 960;
  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
