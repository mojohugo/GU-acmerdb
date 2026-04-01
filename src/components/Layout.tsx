import type { PropsWithChildren } from 'react'
import { Link, NavLink } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

type NavItem = {
  to: string
  label: string
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', end: true },
  { to: '/members', label: '队员' },
  { to: '/cohorts', label: '时间线' },
  { to: '/awards', label: '获奖' },
  { to: '/admin', label: '后台' },
]

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar topbar-navbar">
        <div className="topbar-head topbar-head-navbar">
          <Link to="/" className="topbar-brand topbar-brand-navbar topbar-brand-link">
            GU ACMerDB
          </Link>

          <nav className="topbar-nav topbar-nav-navbar">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClassName} end={item.end}>
                <span className="nav-link-text">{item.label}</span>
              </NavLink>
            ))}
          </nav>

          <Link className="topbar-about-link" to="/about">
            关于
          </Link>
        </div>
      </header>

      <main className="main-panel">{children}</main>
    </div>
  )
}
