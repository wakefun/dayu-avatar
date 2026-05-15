import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSolidPng } from '../mock-images';

type TestServer = {
  url: string;
  close: () => Promise<void>;
};

type LoginPayload = {
  user: {
    id: string;
  };
};

type UploadPayload = {
  asset: {
    id: string;
    fileUrl: string;
    contentHash: string | null;
  };
};

type CreateTaskPayload = {
  task: {
    id: string;
    prompt: string;
    personalReferenceAssetId: string;
    personalReferenceAssetIds: string[];
    styleReferenceAssetIds: string[];
    generationParams: {
      model: string;
      quality: string;
      size: string;
      outputFormat: string;
    };
    sourceTaskId: string | null;
  };
};

type RecordsPayload = {
  items: Array<{
    id: string;
    status: string;
    result: {
      id: string;
      imageUrl: string | null;
      contentHash: string | null;
      savedToGallery: boolean;
    } | null;
  }>;
};

type GalleryPayload = {
  items: Array<{
    id: string;
    generationResultId: string;
    taskId: string;
  }>;
};

let server: TestServer;
let cookie = '';
let tempRoot = '';

before(async () => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dayu-api-smoke-'));
  process.env.DAYU_DATA_ROOT = path.join(tempRoot, 'data');
  process.env.GENERATION_MODE = 'mock';
  process.env.AUTH_MODE = 'mock';

  const { createApp } = await import('../app');
  const app = createApp();
  const listener = app.listen(0);
  server = await new Promise<TestServer>((resolve, reject) => {
    listener.once('error', reject);
    listener.once('listening', () => {
      const address = listener.address();
      assert(address && typeof address === 'object');
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((closeResolve, closeReject) => listener.close((error) => (error ? closeReject(error) : closeResolve()))),
      });
    });
  });
});

after(async () => {
  await server?.close();
  if (tempRoot) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('soft deletion, cancellation, gallery removal, and upload dedupe stay consistent', async () => {
  const login = await requestJson<LoginPayload>('/api/auth/mock-login', {
    method: 'POST',
    body: JSON.stringify({ displayName: 'Dedupe Smoke User' }),
  });
  assert.ok(login.user.id);

  const firstUpload = await uploadPng('same-personal.png');
  const secondUpload = await uploadPng('same-personal-again.png');
  assert.equal(secondUpload.asset.id, firstUpload.asset.id);
  assert.equal(secondUpload.asset.fileUrl, firstUpload.asset.fileUrl);
  assert.ok(firstUpload.asset.contentHash);
  assert.equal(secondUpload.asset.contentHash, firstUpload.asset.contentHash);

  const activeTask = await createTask(firstUpload.asset.id, 'cancel me');
  const activeFineTune = await fetchWithCookie(`/api/generation-tasks/${activeTask.task.id}/fine-tune`, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'adjust active task' }),
  });
  const activeFineTunePayload = (await activeFineTune.json()) as { error: { code: string; message: string } };
  assert.equal(activeFineTune.status, 409);
  assert.equal(activeFineTunePayload.error.code, 'INVALID_STATE');

  await requestJson<{ success: true }>(`/api/generation-tasks/${activeTask.task.id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
  const canceledLookup = await fetchWithCookie(`/api/generation-tasks/${activeTask.task.id}`);
  assert.equal(canceledLookup.status, 404);

  const recordsAfterCancel = await requestJson<RecordsPayload>('/api/records');
  assert.equal(recordsAfterCancel.items.some((item) => item.id === activeTask.task.id), false);

  const completedTask = await createTask(firstUpload.asset.id, 'complete me');
  await waitForCompletedRecord(completedTask.task.id);
  const completedRecords = await requestJson<RecordsPayload>('/api/records');
  const completedRecord = completedRecords.items.find((item) => item.id === completedTask.task.id);
  assert.equal(completedRecord?.status, 'completed');
  assert.ok(completedRecord.result?.id);
  assert.ok(completedRecord.result.contentHash);

  const emptyFineTune = await fetchWithCookie(`/api/generation-tasks/${completedTask.task.id}/fine-tune`, { method: 'POST', body: JSON.stringify({ prompt: '   ' }) });
  const emptyFineTunePayload = (await emptyFineTune.json()) as { error: { code: string; message: string } };
  assert.equal(emptyFineTune.status, 400);
  assert.equal(emptyFineTunePayload.error.code, 'VALIDATION_ERROR');

  const fineTune = await requestJson<CreateTaskPayload>(`/api/generation-tasks/${completedTask.task.id}/fine-tune`, {
    method: 'POST',
    body: JSON.stringify({ prompt: 'make the light warmer' }),
  });
  assert.equal(fineTune.task.prompt, 'make the light warmer');
  assert.equal(fineTune.task.sourceTaskId, completedTask.task.id);
  assert.deepEqual(fineTune.task.styleReferenceAssetIds, []);
  assert.equal(fineTune.task.personalReferenceAssetIds.length, 1);
  assert.notEqual(fineTune.task.personalReferenceAssetIds[0], firstUpload.asset.id);
  assert.equal(fineTune.task.personalReferenceAssetId, fineTune.task.personalReferenceAssetIds[0]);
  assert.equal(fineTune.task.generationParams.size, completedTask.task.generationParams.size);
  assert.equal(fineTune.task.generationParams.model, completedTask.task.generationParams.model);
  assert.equal(fineTune.task.generationParams.quality, completedTask.task.generationParams.quality);
  assert.equal(fineTune.task.generationParams.outputFormat, completedTask.task.generationParams.outputFormat);

  const galleryCreate = await requestJson<{ item: { id: string; taskId: string } }>('/api/gallery-items', {
    method: 'POST',
    body: JSON.stringify({ generationResultId: completedRecord.result.id }),
  });
  assert.equal(galleryCreate.item.taskId, completedTask.task.id);
  let gallery = await requestJson<GalleryPayload>('/api/gallery-items');
  assert.equal(gallery.items.some((item) => item.id === galleryCreate.item.id), true);

  await requestJson<{ success: true }>(`/api/gallery-items/${galleryCreate.item.id}`, { method: 'DELETE' });
  gallery = await requestJson<GalleryPayload>('/api/gallery-items');
  assert.equal(gallery.items.some((item) => item.id === galleryCreate.item.id), false);

  const galleryResave = await requestJson<{ item: { id: string } }>('/api/gallery-items', {
    method: 'POST',
    body: JSON.stringify({ generationResultId: completedRecord.result.id }),
  });
  assert.equal(galleryResave.item.id, galleryCreate.item.id);

  await requestJson<{ success: true }>(`/api/records/${completedTask.task.id}`, { method: 'DELETE' });
  const deletedTaskLookup = await fetchWithCookie(`/api/generation-tasks/${completedTask.task.id}`);
  assert.equal(deletedTaskLookup.status, 404);
  const recordsAfterDelete = await requestJson<RecordsPayload>('/api/records');
  assert.equal(recordsAfterDelete.items.some((item) => item.id === completedTask.task.id), false);
  gallery = await requestJson<GalleryPayload>('/api/gallery-items');
  assert.equal(gallery.items.some((item) => item.id === galleryResave.item.id), false);

  assertStaticFileStillExists(firstUpload.asset.fileUrl);
  assertStaticFileStillExists(completedRecord.result.imageUrl);
});

async function createTask(personalAssetId: string, prompt: string) {
  return requestJson<CreateTaskPayload>('/api/generation-tasks', {
    method: 'POST',
    body: JSON.stringify({
      prompt,
      styleTags: [],
      personalReferenceAssetIds: [personalAssetId],
      styleReferenceAssetIds: [],
      quantity: 1,
      generationParams: {
        model: 'mock-image',
        quality: 'high',
        size: '1024x1536',
        outputFormat: 'png',
      },
    }),
  });
}

async function waitForCompletedRecord(taskId: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const records = await requestJson<RecordsPayload>('/api/records');
    const record = records.items.find((item) => item.id === taskId);
    if (record?.status === 'completed' && record.result?.imageUrl) {
      return record;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  assert.fail(`task ${taskId} did not complete`);
}

async function uploadPng(fileName: string) {
  const formData = new FormData();
  const buffer = createSolidPng(24, 24, [120, 160, 200]);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
  formData.append('category', 'personal_reference');
  formData.append('file', new Blob([arrayBuffer], { type: 'image/png' }), fileName);
  return requestJson<UploadPayload>('/api/uploads', { method: 'POST', body: formData });
}

async function requestJson<T>(pathname: string, init: RequestInit = {}) {
  const response = await fetchWithCookie(pathname, init);
  const payload = (await response.json()) as unknown;
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload as T;
}

async function fetchWithCookie(pathname: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (cookie) {
    headers.set('Cookie', cookie);
  }
  if (typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${server.url}${pathname}`, {
    ...init,
    headers,
  });

  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    cookie = setCookie.split(';')[0] ?? cookie;
  }

  return response;
}

function assertStaticFileStillExists(fileUrl: string | null) {
  assert.ok(fileUrl);
  const relativePath = fileUrl.replace(/^\/static\//, '');
  assert.equal(fs.existsSync(path.join(tempRoot, 'data', relativePath)), true);
}
