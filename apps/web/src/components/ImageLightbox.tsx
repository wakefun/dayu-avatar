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
    <div className="lightbox" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="lightbox-close" onClick={onClose} aria-label="关闭预览">
          ×
        </button>
        <img
          src={image.src}
          alt={image.alt}
          className="lightbox-image"
          style={image.width && image.height ? { aspectRatio: `${image.width} / ${image.height}` } : undefined}
        />
        {image.meta || actions.length > 0 ? (
          <div className="lightbox-footer">
            {image.meta ? <span>{image.meta}</span> : null}
            {actions.length > 0 ? (
              <div className="lightbox-actions">
                {actions.map((action) =>
                  action.href ? (
                    <a key={action.label} className={`chip ${action.variant ?? 'secondary'}`} href={action.href}>
                      {action.label}
                    </a>
                  ) : (
                    <button
                      key={action.label}
                      type="button"
                      className={`chip ${action.variant ?? 'secondary'}`}
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
