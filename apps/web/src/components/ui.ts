export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export const glassPanelClass =
  'rounded-[30px] border border-white/70 bg-[linear-gradient(145deg,rgba(255,255,255,0.82),rgba(255,248,242,0.58))] shadow-[0_24px_56px_rgba(124,105,91,0.12),0_8px_22px_rgba(186,198,225,0.18),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[34px]';

export const pageStackClass = 'grid gap-[18px] pb-6';

export const softCardClass =
  'rounded-[24px] border border-white/72 bg-[linear-gradient(155deg,rgba(255,255,255,0.78),rgba(255,247,240,0.56))] p-4 shadow-[0_18px_42px_rgba(118,95,78,0.11),0_4px_14px_rgba(186,198,225,0.16),inset_0_1px_0_rgba(255,255,255,0.84)]';

export const primaryButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border border-transparent bg-gradient-to-br from-[#d5ad85] via-[#c7967e] to-[#a79bc9] px-[18px] py-3 text-sm font-semibold text-white shadow-[0_16px_34px_rgba(190,149,127,0.32),inset_0_1px_0_rgba(255,255,255,0.34)] transition duration-200 hover:-translate-y-0.5 hover:brightness-[1.04] active:translate-y-0 active:scale-[0.99] disabled:opacity-60';

export const secondaryButtonClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-full border border-white/68 bg-white/78 px-[18px] py-3 text-sm font-semibold text-[#2f2724] shadow-[0_10px_24px_rgba(118,95,78,0.09),inset_0_1px_0_rgba(255,255,255,0.78)] transition duration-200 hover:-translate-y-0.5 hover:bg-white active:translate-y-0 active:scale-[0.99] disabled:opacity-60';

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
