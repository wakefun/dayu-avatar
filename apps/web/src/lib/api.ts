import type {
  Asset,
  CreateGenerationTaskResponse,
  GalleryItem,
  GenerationResult,
  GenerationTask,
  HistoryItem,
  QueueItem,
  SessionSummary,
  User,
} from './types';

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
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
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error?.message ?? '上传失败');
    }
    return payload as { asset: Asset };
  },
  createTask: (body: {
    prompt: string;
    styleTags: string[];
    personalReferenceAssetId: string;
    styleReferenceAssetId: string | null;
    quantity: number;
    generationParams: {
      model: string;
      quality: string;
      size: string;
      outputFormat: string;
    };
  }) => request<CreateGenerationTaskResponse>('/api/generation-tasks', { method: 'POST', body: JSON.stringify(body) }),
  getTask: (taskId: string) => request<{ task: GenerationTask }>(`/api/generation-tasks/${taskId}`),
  getTaskProgress: (taskId: string) =>
    request<{ taskId: string; status: GenerationTask['status']; progress: { percent: number; step: string | null; message: string } }>(
      `/api/generation-tasks/${taskId}/progress`
    ),
  getTaskResult: (taskId: string) => request<{ result: GenerationResult }>(`/api/generation-tasks/${taskId}/result`),
  retryTask: (taskId: string) => request<{ task: GenerationTask }>(`/api/generation-tasks/${taskId}/retry`, { method: 'POST', body: JSON.stringify({}) }),
  getQueue: () => request<{ items: QueueItem[] }>('/api/queue'),
  getHistory: () => request<{ items: HistoryItem[] }>('/api/history'),
  getGallery: () => request<{ items: GalleryItem[] }>('/api/gallery-items'),
  saveGallery: (generationResultId: string) =>
    request<{ item: GalleryItem }>('/api/gallery-items', { method: 'POST', body: JSON.stringify({ generationResultId }) }),
  updateGallery: (itemId: string, isFavorited: boolean) =>
    request<{ item: GalleryItem }>(`/api/gallery-items/${itemId}`, { method: 'PATCH', body: JSON.stringify({ isFavorited }) }),
  deleteGallery: (itemId: string) => request<{ success: true }>(`/api/gallery-items/${itemId}`, { method: 'DELETE' }),
};
