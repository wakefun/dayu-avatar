import 'express-session';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    authMode?: 'mock' | 'oidc';
    oidcState?: string;
    oidcNonce?: string;
    oidcCodeVerifier?: string;
    oidcIdToken?: string;
  }
}

export type AssetCategory = 'personal_reference' | 'style_reference' | 'generated_result' | 'generated_thumbnail';
export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled';
export type AuthMode = 'mock' | 'oidc';
export type GenerationMode = 'mock' | 'openai';

export type UserRow = {
  id: string;
  display_name: string;
  email: string | null;
  avatar_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AssetRow = {
  id: string;
  user_id: string;
  category: AssetCategory;
  storage_path: string;
  public_url: string;
  file_name: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  byte_size: number | null;
  created_at: string;
};

export type TaskRow = {
  id: string;
  user_id: string;
  status: TaskStatus;
  prompt: string;
  style_tags_json: string;
  summary: string | null;
  personal_reference_asset_id: string;
  style_reference_asset_id: string | null;
  personal_reference_asset_ids_json: string | null;
  style_reference_asset_ids_json: string | null;
  model: string;
  quality: string;
  size: string;
  output_format: string;
  progress_percent: number;
  progress_step: string | null;
  error_code: string | null;
  error_message: string | null;
  source_task_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type ResultRow = {
  id: string;
  task_id: string;
  image_asset_id: string;
  thumbnail_asset_id: string | null;
  saved_to_gallery: number;
  created_at: string;
};

export type RecordRow = TaskRow & {
  result_id: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  image_width: number | null;
  image_height: number | null;
};

export type GalleryRow = {
  id: string;
  user_id: string;
  generation_result_id: string;
  is_favorited: number;
  saved_at: string;
};

export type SessionRow = {
  id: string;
  user_id: string | null;
  auth_mode: AuthMode | null;
  expires_at: string | null;
};
