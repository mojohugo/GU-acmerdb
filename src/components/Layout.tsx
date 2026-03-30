import type { PropsWithChildren } from 'react'
import { BarChart3, CalendarClock, House, Info, ShieldCheck, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'

function navClassName({ isActive }: { isActive: boolean }) {
  return isActive ? 'nav-link nav-link-active' : 'nav-link'
}

export function Layout({ children }: PropsWithChildren) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-head">
          <div className="topbar-brand">
            <p className="topbar-kicker">Guangzhou University ACM Team</p>
            <h1>广州大学 ACM 校队队员库</h1>
            <p className="topbar-subtitle">队员档案、赛事战绩与获奖记录统一维护</p>
          </div>

          <div className="topbar-status" aria-label="站点状态">
            <span className="badge-chip badge-chip-live">持续维护</span>
            <span className="badge-chip">公开查询</span>
            <span className="badge-chip badge-chip-anime">管理员可编辑</span>
          </div>
        </div>

        <nav className="topbar-nav">
          <NavLink to="/" className={navClassName}>
            <House size={14} aria-hidden="true" className="nav-link-icon" />
            首页
          </NavLink>
          <NavLink to="/members" className={navClassName}>
            <Users size={14} aria-hidden="true" className="nav-link-icon" />
            队员档案
          </NavLink>
          <NavLink to="/cohorts" className={navClassName}>
            <CalendarClock size={14} aria-hidden="true" className="nav-link-icon" />
            赛事时间线
          </NavLink>
          <NavLink to="/awards" className={navClassName}>
            <BarChart3 size={14} aria-hidden="true" className="nav-link-icon" />
            获奖统计
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
        <p>GU ACMerDB · 广州大学 ACM 校队</p>
      </footer>
    </div>
  )
}
