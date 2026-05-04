import { chipButtonClass, cx } from './ui';

type ImageLightboxAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  variant?: 'primary' | 'danger' | 'secondary';
};

type ImageLightboxProps = {
  image: {
    src: string;
    alt: string;
    width?: number | null;
    height?: number | null;
    meta?: string;
  } | null;
  actions?: ImageLightboxAction[];
  onClose: () => void;
};

export function ImageLightbox({ image, actions = [], onClose }: ImageLightboxProps) {
  if (!image) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-[rgba(33,27,24,0.76)] px-[14px] pt-[max(16px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="relative grid max-h-full w-full max-w-[430px] gap-3" onClick={(event) => event.stopPropagation()}>
        <button
          type="button"
          className="absolute top-2.5 right-2.5 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-2xl text-[#2f2724]"
          onClick={onClose}
          aria-label="关闭预览"
        >
          ×
        </button>
        <img
          src={image.src}
          alt={image.alt}
          className="block max-h-[76vh] w-full rounded-[24px] bg-white/20 object-contain"
          style={image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined}
        />
        {image.meta || actions.length > 0 ? (
          <div className="grid gap-3 rounded-[24px] bg-white/90 p-[14px]">
            {image.meta ? <span className="text-sm text-[#6b5f59]">{image.meta}</span> : null}
            {actions.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2.5">
                {actions.map((action) =>
                  action.href ? (
                    <a key={action.label} className={cx(chipButtonClass(action.variant ?? 'secondary'))} href={action.href}>
                      {action.label}
                    </a>
                  ) : (
                    <button
                      key={action.label}
                      type="button"
                      className={cx(chipButtonClass(action.variant ?? 'secondary'))}
                      disabled={action.disabled}
                      onClick={action.onClick}
                    >
                      {action.label}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
