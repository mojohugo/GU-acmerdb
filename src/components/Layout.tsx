import type { PropsWithChildren } from 'react'
import { NavLink } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="topbar-kicker">GU ACM Data</p>
          <h1>广州大学 ACM 校队队员库</h1>
        </div>
        <nav className="topbar-nav">
          <NavLink to="/" className={navClassName}>
            首页
          </NavLink>
          <NavLink to="/members" className={navClassName}>
            队员
          </NavLink>
          <NavLink to="/cohorts" className={navClassName}>
            届别赛事
          </NavLink>
          <NavLink to="/admin" className={navClassName}>
            管理
          </NavLink>
          <NavLink to="/about" className={navClassName}>
            关于
          </NavLink>
        </nav>
      </header>

      <main className="main-panel">{children}</main>

      <footer className="footer">
        <p>GU ACMerDB</p>
      </footer>
    </div>
  )
}
