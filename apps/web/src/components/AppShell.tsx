import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import type { User } from '../lib/types';

type ShellProps = {
  title: string;
  user: User;
  drawerOpen: boolean;
  onOpenDrawer: () => void;
  onCloseDrawer: () => void;
  children: ReactNode;
};

const navItems = [
  { to: '/', label: '头像生成' },
  { to: '/gallery', label: '我的图库' },
  { to: '/queue', label: '任务队列' },
  { to: '/history', label: '历史记录' },
  { to: '/settings', label: '账户设置' },
];

export function AppShell({ title, user, drawerOpen, onOpenDrawer, onCloseDrawer, children }: ShellProps) {
  return (
    <div className="phone-frame">
      <header className="topbar glass-card">
        <button className="icon-button" onClick={onOpenDrawer} aria-label="打开导航菜单">
          <span />
          <span />
          <span />
        </button>
        <div>
          <div className="eyebrow">Dayu Avatar</div>
          <h1>{title}</h1>
        </div>
        <div className="mini-user">{user.displayName.slice(0, 1)}</div>
      </header>

      <div className={`drawer-backdrop ${drawerOpen ? 'open' : ''}`} onClick={onCloseDrawer} />
      <aside className={`drawer glass-card ${drawerOpen ? 'open' : ''}`} aria-hidden={!drawerOpen}>
        <div className="drawer-user">
          <div className="avatar-mark">{user.displayName.slice(0, 1)}</div>
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
        </nav>
      </aside>

      <main className="page-content">{children}</main>
    </div>
  );
}
