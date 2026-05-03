import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import type { User } from '../lib/types';

type ShellProps = {
  title: string;
  user: User;
  drawerOpen: boolean;
  installAvailable: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  onInstallApp: () => void;
  children: ReactNode;
};

const navItems = [
  { to: '/', label: '头像生成' },
  { to: '/gallery', label: '我的图库' },
  { to: '/queue', label: '任务队列' },
  { to: '/history', label: '历史记录' },
  { to: '/settings', label: '账户设置' },
];

export function AppShell({ title, user, drawerOpen, installAvailable, onOpenDrawer, onCloseDrawer, onInstallApp, children }: ShellProps) {
  const navigate = useNavigate();

  return (
    <div className="phone-frame">
      <header className="topbar glass-card">
        <button className="icon-button" onClick={onOpenDrawer} aria-label="打开导航菜单">
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">
          <div className="eyebrow">Dayu Avatar</div>
          <h1>{title}</h1>
        </div>
        <button
          type="button"
          className="mini-user user-button"
          onClick={() => navigate('/settings')}
          aria-label="打开账户设置"
          style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}
        >
          {user.avatarUrl ? null : user.displayName.slice(0, 1)}
        </button>
      </header>

      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={onCloseDrawer} />
      <aside className={`drawer glass-card ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-user">
          <div className="avatar-mark" style={user.avatarUrl ? { backgroundImage: `url(${user.avatarUrl})` } : undefined}>
            {user.avatarUrl ? null : user.displayName.slice(0, 1)}
          </div>
          <div>
            <strong>{user.displayName}</strong>
            <p>{user.email ?? '已连接大宇统一登录'}</p>
          </div>
        </div>
        <nav className="drawer-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={onCloseDrawer}
            >
              {item.label}
            </NavLink>
          ))}
          <button type="button" className="nav-link install-link" onClick={onInstallApp}>
            {installAvailable ? '添加到桌面' : '已支持添加到桌面'}
          </button>
        </nav>
      </aside>

      <main className="page-content">{children}</main>
    </div>
  );
}
