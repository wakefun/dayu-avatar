import type { ChangeEvent } from 'react';
import type { Asset } from '../lib/types';
import { cx } from './ui';

const acceptedImageTypes = 'image/png,image/jpeg,image/webp';

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
  const count = Math.max(values.length, 1);

  return (
    <div className="grid gap-3.5 rounded-[28px] border border-[#7b6e66]/18 bg-white/55 p-[18px]">
      <div className="grid grid-cols-[auto_1fr] items-start gap-3">
        <div
          className="grid h-12 min-w-12 place-items-center rounded-[18px] bg-gradient-to-br from-[#ecf1fb] to-[#fbf1ea] px-[10px] text-[13px] font-bold text-[#584d47]"
          aria-hidden="true"
        >
          {iconLabel}
        </div>
        <div className="grid gap-2">
          <strong className="text-[15px] text-[#2f2724]">{title}</strong>
          <p className="m-0 text-sm leading-6 text-[#6b5f59]">{description}</p>
        </div>
      </div>

      <div
        className={cx(
          'relative grid aspect-square w-full overflow-hidden rounded-[22px] bg-gradient-to-br from-[#ebeefa]/80 to-[#faeee8]/80',
          count === 2 && 'grid-cols-2',
          count === 3 && 'grid-cols-2 grid-rows-2'
        )}
      >
        {values.length === 0 ? (
          <label className="grid place-items-center px-6 text-center">
            <div className="grid gap-2">
              <strong className="text-[15px] text-[#2f2724]">{actionLabel}</strong>
              <span className="text-sm text-[#6b5f59]">支持 PNG / JPG / WEBP</span>
            </div>
            <input className="sr-only" type="file" accept={acceptedImageTypes} onChange={(event) => handleFileInput(event, onAdd)} />
          </label>
        ) : (
          values.map((asset, index) => (
            <div
              key={asset.id}
              className={cx('relative overflow-hidden', count === 3 && index === 2 && 'col-span-2')}
            >
              <button
                type="button"
                className="block h-full w-full border-0 bg-transparent p-0"
                onClick={() => onPreview(asset)}
                aria-label={`查看${asset.fileName}`}
              >
                <img src={asset.fileUrl} alt={asset.fileName} className="block h-full w-full object-cover" />
              </button>
              <button
                type="button"
                className="absolute top-1 right-1 grid h-11 w-11 place-items-center rounded-full bg-white/88 text-base font-bold text-[#2f2724] shadow-sm"
                onClick={() => onRemove(asset.id)}
                aria-label="移除图片"
              >
                ×
              </button>
            </div>
          ))
        )}

        {values.length > 0 && canAdd ? (
          <label
            className="absolute inset-x-0 bottom-0 grid h-[42%] place-items-center bg-gradient-to-b from-transparent to-[rgba(47,39,36,0.46)]"
            aria-label={actionLabel}
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white/20 text-[26px] font-bold text-white">＋</span>
            <input className="sr-only" type="file" accept={acceptedImageTypes} onChange={(event) => handleFileInput(event, onAdd)} />
          </label>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
        <span className="truncate text-[#6b5f59]">{values.length > 0 ? `${values.length}/${maxCount} 张已上传` : '建议上传清晰图片'}</span>
        <span className="font-semibold text-[#2f2724]">最多 {maxCount} 张</span>
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
