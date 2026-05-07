export type AuthMode = 'mock' | 'oidc';

export type SessionSummary = {
  id: string;
  expiresAt: string | null;
  authMode: AuthMode;
};

export type User = {
  id: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
};

export type Asset = {
  id: string;
  category: 'personal_reference' | 'style_reference' | 'generated_result' | 'generated_thumbnail';
  mimeType: string;
  width: number | null;
  height: number | null;
  fileName: string;
  fileUrl: string;
  createdAt: string;
};

export type GenerationTask = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
  prompt: string;
  promptSummary: string;
  styleTags: string[];
  personalReferenceAssetId: string;
  styleReferenceAssetId: string | null;
  personalReferenceAssetIds: string[];
  styleReferenceAssetIds: string[];
  personalReferenceAssets: Asset[];
  styleReferenceAssets: Asset[];
  generationParams: {
    model: string;
    quality: string;
    size: string;
    outputFormat: string;
  };
  progress: {
    percent: number;
    step: string | null;
    message: string;
  };
  result: GenerationResult | null;
  error: { code: string; message: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceTaskId: string | null;
};

export type CreateGenerationTaskResponse = {
  task: GenerationTask;
  tasks?: GenerationTask[];
};

export type GenerationResult = {
  id: string;
  taskId: string;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  savedToGallery: boolean;
  createdAt: string;
};

export type TaskStreamPayload = {
  task: GenerationTask;
};

export type RecordItem = {
  id: string;
  status: GenerationTask['status'];
  promptSummary: string;
  summary: string;
  prompt: string;
  styleTags: string[];
  personalReferenceAssets: Asset[];
  styleReferenceAssets: Asset[];
  referenceTypes: string[];
  generationParams: {
    model: string;
    quality: string;
    size: string;
    outputFormat: string;
  };
  progress: {
    percent: number;
    step: string | null;
    message: string;
  };
  result: {
    id: string;
    taskId: string;
    imageUrl: string | null;
    thumbnailUrl: string | null;
    width: number | null;
    height: number | null;
    createdAt: string;
  } | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  sourceTaskId: string | null;
};

export type RecordsResponse = {
  items: RecordItem[];
  pagination: {
    limit: number;
    nextCursor: number | null;
    hasMore: boolean;
  };
};

export type GalleryItem = {
  id: string;
  generationResultId: string;
  taskId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  isFavorited: boolean;
  savedAt: string;
};
