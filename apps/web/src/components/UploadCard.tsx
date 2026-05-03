import type { ChangeEvent } from 'react';
import type { Asset } from '../lib/types';

type UploadCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  iconLabel: string;
  values: Asset[];
  maxCount?: number;
  onAdd: (file: File) => void;
  onRemove: (assetId: string) => void;
  onPreview: (asset: Asset) => void;
};

export function UploadCard({ title, description, actionLabel, iconLabel, values, maxCount = 3, onAdd, onRemove, onPreview }: UploadCardProps) {
  const canAdd = values.length < maxCount;

  return (
    <div className="upload-card">
      <div className="upload-card-head">
        <div className="upload-card-icon" aria-hidden="true">
          {iconLabel}
        </div>
        <div className="upload-card-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>

      <div className={`reference-grid count-${Math.max(values.length, 1)}`}>
        {values.length === 0 ? (
          <label className="reference-empty">
            <div className="upload-placeholder-copy">
              <strong>{actionLabel}</strong>
              <span>支持 PNG / JPG / WEBP</span>
            </div>
            <input type="file" accept="image/*" onChange={(event) => handleFileInput(event, onAdd)} />
          </label>
        ) : (
          values.map((asset) => (
            <div key={asset.id} className="reference-tile">
              <button type="button" className="image-button" onClick={() => onPreview(asset)} aria-label={`查看${asset.fileName}`}>
                <img src={asset.fileUrl} alt={asset.fileName} className="upload-preview" />
              </button>
              {values.length > 1 ? (
                <button type="button" className="remove-image-button" onClick={() => onRemove(asset.id)} aria-label="移除图片">
                  ×
                </button>
              ) : null}
            </div>
          ))
        )}
        {values.length > 0 && canAdd ? (
          <label className="reference-add-overlay" aria-label={actionLabel}>
            <span>＋</span>
            <input type="file" accept="image/*" onChange={(event) => handleFileInput(event, onAdd)} />
          </label>
        ) : null}
      </div>

      <div className="upload-card-footer">
        <span>{values.length > 0 ? `${values.length}/${maxCount} 张已上传` : '建议上传清晰图片'}</span>
        <span className="upload-action">最多 {maxCount} 张</span>
      </div>
    </div>
  );
}

function handleFileInput(event: ChangeEvent<HTMLInputElement>, onAdd: (file: File) => void) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (file) {
    onAdd(file);
  }
}
