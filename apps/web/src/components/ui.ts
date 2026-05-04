export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const glassPanelClass =
  'rounded-[28px] border border-white/60 bg-white/72 shadow-[0_20px_48px_rgba(186,198,225,0.22)] backdrop-blur-[32px]';

export const pageStackClass = 'grid gap-[18px] pb-6';

export const softCardClass = 'rounded-[22px] border border-[#807269]/10 bg-white/62 p-4';

export const primaryButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border border-transparent bg-gradient-to-br from-[#d5ad85] via-[#c7967e] to-[#a79bc9] px-[18px] py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(190,149,127,0.28)] transition duration-150 hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-60';

export const secondaryButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#786960]/15 bg-white/78 px-[18px] py-3 text-sm font-semibold text-[#2f2724] transition duration-150 hover:bg-white active:scale-[0.99] disabled:opacity-60';

export const dangerButtonClass = `${secondaryButtonClass} text-[#b36f67]`;

export function chipButtonClass(variant: 'primary' | 'secondary' | 'danger' = 'secondary') {
  if (variant === 'primary') {
    return 'inline-flex min-h-11 items-center justify-center rounded-full border border-transparent bg-gradient-to-br from-[#d5ad85] via-[#c7967e] to-[#a79bc9] px-[18px] py-2.5 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(190,149,127,0.22)] transition duration-150 hover:brightness-[1.03] active:scale-[0.99] disabled:opacity-60';
  }

  if (variant === 'danger') {
    return 'inline-flex min-h-11 items-center justify-center rounded-full border border-[#7a6a60]/14 bg-white/78 px-[18px] py-2.5 text-sm font-semibold text-[#b36f67] transition duration-150 hover:bg-white active:scale-[0.99] disabled:opacity-60';
  }

  return 'inline-flex min-h-11 items-center justify-center rounded-full border border-[#7a6a60]/14 bg-white/72 px-[18px] py-2.5 text-sm font-medium text-[#2f2724] transition duration-150 hover:bg-white active:scale-[0.99] disabled:opacity-60';
}

export const fieldLabelClass = 'grid gap-2 text-sm text-[#6b5f59]';

export const inputClass =
  'w-full rounded-[18px] border border-[#807269]/16 bg-white/70 px-4 py-3 text-[15px] text-[#2f2724] outline-none transition duration-150 placeholder:text-[#8b7e76] focus:border-[#cfa983]/50 focus:ring-4 focus:ring-[#d5ad85]/10';

export const textareaClass = `${inputClass} min-h-[120px] resize-y`;

export const helperTextClass = 'text-sm leading-6 text-[#6b5f59]';
