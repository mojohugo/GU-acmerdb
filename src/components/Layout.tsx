import type { PropsWithChildren } from 'react'
import { CalendarClock, House, Info, ShieldCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="topbar-ribbon" aria-hidden />
        <span className="topbar-glow topbar-glow-left" aria-hidden />
        <span className="topbar-glow topbar-glow-right" aria-hidden />

        <div className="topbar-head">
          <div className="topbar-brand">
            <p className="topbar-kicker">GZHU ACM Archive</p>
            <h1>广州大学 ACM 战绩档案</h1>
            <p className="topbar-subtitle">像翻队史纪念册一样，查看队员与每一场比赛</p>
          </div>

          <div className="topbar-status" aria-label="站点状态">
            <span className="badge-chip badge-chip-live">持续更新</span>
            <span className="badge-chip">战绩归档</span>
            <span className="badge-chip badge-chip-anime">手作视觉版</span>
          </div>
        </div>

        <nav className="topbar-nav">
          <NavLink to="/" className={navClassName}>
            <House size={14} aria-hidden="true" className="nav-link-icon" />
            首页
          </NavLink>
          <NavLink to="/members" className={navClassName}>
            <Users size={14} aria-hidden="true" className="nav-link-icon" />
            队员
          </NavLink>
          <NavLink to="/cohorts" className={navClassName}>
            <CalendarClock size={14} aria-hidden="true" className="nav-link-icon" />
            赛事时间线
          </NavLink>
          <NavLink to="/admin" className={navClassName}>
            <ShieldCheck size={14} aria-hidden="true" className="nav-link-icon" />
            管理
          </NavLink>
          <NavLink to="/about" className={navClassName}>
            <Info size={14} aria-hidden="true" className="nav-link-icon" />
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
