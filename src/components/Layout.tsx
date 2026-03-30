import type { PropsWithChildren } from 'react'
import { BarChart3, CalendarClock, House, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

type NavItem = {
  to: string
  label: string
  Icon: LucideIcon
  end?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: '首页', Icon: House, end: true },
  { to: '/members', label: '队员档案', Icon: Users },
  { to: '/cohorts', label: '赛事时间线', Icon: CalendarClock },
  { to: '/awards', label: '获奖统计', Icon: BarChart3 },
  { to: '/admin', label: '管理', Icon: ShieldCheck },
]

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar topbar-navbar">
        <div className="topbar-head topbar-head-navbar">
          <div className="topbar-brand topbar-brand-navbar">
            <p className="topbar-kicker">GU ACM TEAM</p>
            <h1>GU ACMerDB</h1>
            <p className="topbar-subtitle">队员档案与赛事数据管理平台</p>
          </div>

          <nav className="topbar-nav topbar-nav-navbar">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={navClassName} end={item.end}>
                <item.Icon size={14} aria-hidden="true" className="nav-link-icon" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="main-panel">{children}</main>

      <footer className="footer">
        <p>
          GU ACMerDB · 广州大学 ACM 校队 · <NavLink to="/about">关于</NavLink>
        </p>
      </footer>
    </div>
  )
}
