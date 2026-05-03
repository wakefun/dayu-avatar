type UploadCardProps = {
  title: string;
  description: string;
  actionLabel: string;
  iconLabel: string;
  value: { fileName: string; fileUrl: string } | null;
  onChange: (file: File) => void;
};

export function UploadCard({ title, description, actionLabel, iconLabel, value, onChange }: UploadCardProps) {
  return (
    <label className="upload-card">
      <div className="upload-card-head">
        <div className="upload-card-icon" aria-hidden="true">
          {iconLabel}
        </div>
        <div className="upload-card-copy">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>
      {value ? (
        <img src={value.fileUrl} alt={value.fileName} className="upload-preview" />
      ) : (
        <div className="upload-placeholder">
          <div className="upload-placeholder-copy">
            <strong>{actionLabel}</strong>
            <span>支持 PNG / JPG / WEBP</span>
          </div>
        </div>
      )}
      <div className="upload-card-footer">
        <span>{value ? value.fileName : '建议上传清晰图片'}</span>
        <span className="upload-action">{value ? '重新上传' : actionLabel}</span>
      </div>
      <input
        type="file"
        accept="image/*"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onChange(file);
          }
        }}
      />
    </label>
  );
}
