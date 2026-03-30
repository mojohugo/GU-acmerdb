import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const loadHomePage = async () => {
  const module = await import('./pages/HomePage')
  return { default: module.HomePage }
}

const loadMembersPage = async () => {
  const module = await import('./pages/MembersPage')
  return { default: module.MembersPage }
}

const loadMemberDetailPage = async () => {
  const module = await import('./pages/MemberDetailPage')
  return { default: module.MemberDetailPage }
}

const loadCohortsPage = async () => {
  const module = await import('./pages/CohortsPage')
  return { default: module.CohortsPage }
}

const loadAwardsPage = async () => {
  const module = await import('./pages/AwardsPage')
  return { default: module.AwardsPage }
}

const loadCompetitionDetailPage = async () => {
  const module = await import('./pages/CompetitionDetailPage')
  return { default: module.CompetitionDetailPage }
}

const loadAdminPage = async () => {
  const module = await import('./pages/AdminPage')
  return { default: module.AdminPage }
}

const loadAboutPage = async () => {
  const module = await import('./pages/AboutPage')
  return { default: module.AboutPage }
}

const loadNotFoundPage = async () => {
  const module = await import('./pages/NotFoundPage')
  return { default: module.NotFoundPage }
}

const HomePage = lazy(loadHomePage)
const MembersPage = lazy(loadMembersPage)
const MemberDetailPage = lazy(loadMemberDetailPage)
const CohortsPage = lazy(loadCohortsPage)
const AwardsPage = lazy(loadAwardsPage)
const CompetitionDetailPage = lazy(loadCompetitionDetailPage)
const AdminPage = lazy(loadAdminPage)
const AboutPage = lazy(loadAboutPage)
const NotFoundPage = lazy(loadNotFoundPage)

function App() {
  useEffect(() => {
    let timer: number | null = null
    let idleHandle: number | null = null
    const runWarmup = () => {
      void import('./lib/api').then((module) => module.warmPublicData())
    }

    if (typeof window.requestIdleCallback === 'function') {
      idleHandle = window.requestIdleCallback(runWarmup, { timeout: 1500 })
    } else {
      timer = window.setTimeout(runWarmup, 600)
    }

    return () => {
      if (timer !== null) {
        window.clearTimeout(timer)
      }
      if (idleHandle !== null && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleHandle)
      }
    }
  }, [])

  return (
    <Layout>
      <Suspense
        fallback={
          <section className="panel">
            <p className="status">页面加载中...</p>
          </section>
        }
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/members" element={<MembersPage />} />
          <Route path="/member/:memberId" element={<MemberDetailPage />} />
          <Route path="/cohorts" element={<CohortsPage />} />
          <Route path="/awards" element={<AwardsPage />} />
          <Route path="/competition/:competitionId" element={<CompetitionDetailPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/home" element={<Navigate replace to="/" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default App
