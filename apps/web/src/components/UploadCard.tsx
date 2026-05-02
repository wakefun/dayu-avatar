type UploadCardProps = {
  title: string;
  description: string;
  value: { fileName: string; fileUrl: string } | null;
  onChange: (file: File) => void;
};

export function UploadCard({ title, description, value, onChange }: UploadCardProps) {
  return (
    <label className="upload-card">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {value ? <img src={value.fileUrl} alt={value.fileName} className="upload-preview" /> : <div className="upload-placeholder">选择图片</div>}
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
