import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { User } from '../lib/types';
import { cx, glassPanelClass } from './ui';

type ShellProps = {
  title: string;
  user: User;
  drawerOpen: boolean;
  showInstallAction: boolean;
  installAvailable: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onInstallApp: () => void;
  children: ReactNode;
};

const navItems = [
  { to: '/', label: '大宇暗房' },
  { to: '/records', label: '我的记录' },
  { to: '/gallery', label: '我的图库' },
  { to: '/settings', label: '账户设置' },
];

const avatarClass =
  'grid h-[42px] w-[42px] place-items-center rounded-full bg-gradient-to-br from-[#f3e8e1] to-[#dde6fa] bg-cover bg-center text-sm font-bold text-[#433632]';

export function AppShell({
  title,
  user,
  drawerOpen,
  showInstallAction,
  installAvailable,
  onOpenDrawer,
  onCloseDrawer,
  onInstallApp,
  children,
}: ShellProps) {
  const navigate = useNavigate();

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[430px] px-[14px] pt-[max(18px,env(safe-area-inset-top))] pb-[max(18px,env(safe-area-inset-bottom))]">
      <header
        className={cx(
          glassPanelClass,
          'sticky top-[max(12px,env(safe-area-inset-top))] z-20 grid grid-cols-[46px_1fr_46px] items-center gap-3 px-4 py-[14px]'
        )}
      >
        <button
          type="button"
          className="grid h-[46px] w-[46px] place-items-center gap-1 rounded-full bg-white/70 transition hover:bg-white"
          onClick={onOpenDrawer}
          aria-label="打开导航菜单"
        >
          <span className="block h-0.5 w-[18px] rounded-full bg-[#5f5651]" />
          <span className="block h-0.5 w-[18px] rounded-full bg-[#5f5651]" />
          <span className="block h-0.5 w-[18px] rounded-full bg-[#5f5651]" />
        </button>

        <div className="min-w-0 text-center">
          <div className="text-center text-[13px] tracking-[0.02em] text-[#8a7c74]">Dayu Darkroom</div>
          <h1 className="truncate font-serif text-[28px] font-semibold text-[#2f2724]">{title}</h1>
        </div>

        <button
          type="button"
          className={cx(avatarClass, 'border-0 p-0')}
          onClick={() => navigate('/settings')}
          aria-label="打开账户设置"
          style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}
        >
          {user.avatarUrl ? null : user.displayName.slice(0, 1)}
        </button>
      </header>

      <button
        type="button"
        className={cx(
          'fixed inset-0 z-[25] bg-[rgba(44,35,30,0.18)] transition-opacity duration-200',
          drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onCloseDrawer}
        tabIndex={drawerOpen ? 0 : -1}
        aria-hidden={!drawerOpen}
        aria-label="关闭导航菜单"
      />

      <aside
        className={cx(
          glassPanelClass,
          'fixed left-4 top-[max(16px,env(safe-area-inset-top))] bottom-[max(16px,env(safe-area-inset-bottom))] z-30 w-[min(78vw,320px)] overflow-y-auto p-[18px] transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-[120%]'
        )}
        aria-hidden={!drawerOpen}
      >
        <div className="mb-5 flex items-center gap-3">
          <div
            className={avatarClass}
            style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}
          >
            {user.avatarUrl ? null : user.displayName.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-[15px] text-[#2f2724]">{user.displayName}</strong>
            <p className="mt-1 truncate text-[13px] text-[#6b5f59]">{user.email ?? '已连接大宇统一登录'}</p>
          </div>
        </div>

        <nav className="grid gap-2">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cx(
                  'rounded-[18px] px-4 py-[14px] text-left text-[15px] text-[#6b5f59] transition',
                  isActive ? 'bg-white/82 text-[#2f2724]' : 'hover:bg-white/60 hover:text-[#2f2724]'
                )
              }
              onClick={onCloseDrawer}
              tabIndex={drawerOpen ? undefined : -1}
            >
              {item.label}
            </NavLink>
          ))}
          {showInstallAction ? (
            <button
              type="button"
              className="rounded-[18px] bg-white/82 px-4 py-[14px] text-left text-[15px] text-[#2f2724] shadow-[inset_0_1px_0_rgba(255,255,255,0.72),0_10px_24px_rgba(198,166,142,0.14)] transition duration-200 hover:-translate-y-0.5 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 enabled:active:translate-y-0"
              disabled={!installAvailable}
              tabIndex={drawerOpen ? undefined : -1}
              onClick={onInstallApp}
            >
              添加到桌面
            </button>
          ) : null}
        </nav>
      </aside>

      <main className="pt-4">{children}</main>
    </div>
  );
}
