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
  styleTags: string[];
  personalReferenceAssetId: string;
  styleReferenceAssetId: string | null;
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

export type QueueItem = {
  id: string;
  status: GenerationTask['status'];
  progress: {
    percent: number;
    step: string | null;
  };
  createdAt: string;
  resultUrl: string | null;
  errorMessage: string | null;
};

export type HistoryItem = {
  id: string;
  status: GenerationTask['status'];
  promptSummary: string;
  referenceTypes: string[];
  generationParams: {
    model: string;
    quality: string;
    size: string;
    outputFormat: string;
  };
  resultImageUrl: string | null;
  createdAt: string;
  sourceTaskId: string | null;
};

export type GalleryItem = {
  id: string;
  generationResultId: string;
  taskId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  isFavorited: boolean;
  savedAt: string;
};
