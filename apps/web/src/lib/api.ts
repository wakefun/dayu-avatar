import type {
  Asset,
  CreateGenerationTaskResponse,
  GalleryItem,
  GenerationResult,
  GenerationTask,
  RecordsResponse,
  SessionSummary,
  StyleReferenceAnalysis,
  User,
} from './types';

async function request<T>(input: RequestInfo, init: RequestInit = {}): Promise<T> {
  const { headers, body, ...rest } = init;
  const requestHeaders = new Headers(headers);

  if (typeof body === 'string' && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(input, {
    credentials: 'include',
    ...rest,
    body,
    headers: requestHeaders,
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const message = payload?.error?.message ?? '请求失败';
    throw new Error(message);
  }

  return payload as T;
}

export const api = {
  me: () => request<{ user: User | null; session: SessionSummary | null }>('/api/auth/me'),
  mockLogin: (displayName: string) =>
    request<{ user: User; session: SessionSummary }>('/api/auth/mock-login', {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),
  startLogin: () => {
    window.location.assign('/api/auth/login');
  },
  logout: () => request<{ success: true; postLogoutRedirectUrl?: string }>('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) }),
  upload: async (file: File, category: 'personal_reference' | 'style_reference') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    const response = await fetch('/api/uploads', {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    const isJson = response.headers.get('content-type')?.includes('application/json');
    const payload = isJson ? await response.json() : null;
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? '上传失败');
    }
    return payload as { asset: Asset };
  },
  createTask: (body: {
    prompt: string;
    styleTags: string[];
    styleReferenceAnalysis: StyleReferenceAnalysis | null;
    personalReferenceAssetIds: string[];
    styleReferenceAssetIds: string[];
    quantity: number;
    generationParams: {
      model: string;
      quality: string;
      size: string;
      outputFormat: string;
    };
  }) => request<CreateGenerationTaskResponse>('/api/generation-tasks', { method: 'POST', body: JSON.stringify(body) }),
  analyzeStyleReferences: (assetIds: string[]) =>
    request<{ analysis: StyleReferenceAnalysis }>('/api/style-reference-analysis', { method: 'POST', body: JSON.stringify({ assetIds }) }),
  getTask: (taskId: string) => request<{ task: GenerationTask }>(`/api/generation-tasks/${taskId}`),
  streamTask: (taskId: string) => new EventSource(`/api/generation-tasks/${encodeURIComponent(taskId)}/events`),
  getTaskProgress: (taskId: string) =>
    request<{ taskId: string; status: GenerationTask['status']; progress: { percent: number; step: string | null; message: string } }>(
      `/api/generation-tasks/${taskId}/progress`
    ),
  getTaskResult: (taskId: string) => request<{ result: GenerationResult }>(`/api/generation-tasks/${taskId}/result`),
  retryTask: (taskId: string) => request<{ task: GenerationTask }>(`/api/generation-tasks/${taskId}/retry`, { method: 'POST', body: JSON.stringify({}) }),
  getRecords: (cursor: number | null = null, limit = 10) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor !== null) {
      params.set('cursor', String(cursor));
    }
    return request<RecordsResponse>(`/api/records?${params.toString()}`);
  },
  streamRecords: () => new EventSource('/api/records/events'),
  getGallery: () => request<{ items: GalleryItem[] }>('/api/gallery-items'),
  saveGallery: (generationResultId: string) =>
    request<{ item: GalleryItem }>('/api/gallery-items', { method: 'POST', body: JSON.stringify({ generationResultId }) }),
  updateGallery: (itemId: string, isFavorited: boolean) =>
    request<{ item: GalleryItem }>(`/api/gallery-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isFavorited }) }),
  setAvatarFromGallery: (galleryItemId: string) =>
    request<{ user: User }>('/api/users/me/avatar', { method: 'POST', body: JSON.stringify({ galleryItemId }) }),
  deleteGallery: (itemId: string) => request<{ success: true }>(`/api/gallery-items/${itemId}`, { method: 'DELETE' }),
};
