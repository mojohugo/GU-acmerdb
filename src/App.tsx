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
const AdminPage = lazy(loadAdminPage)
const AboutPage = lazy(loadAboutPage)
const NotFoundPage = lazy(loadNotFoundPage)

function runWhenIdle(task: () => void) {
  if (typeof window === 'undefined') {
    return () => {}
  }

  if ('requestIdleCallback' in window) {
    const idleId = window.requestIdleCallback(() => task(), { timeout: 2_000 })
    return () => window.cancelIdleCallback(idleId)
  }

  const timeoutId = setTimeout(task, 300)
  return () => clearTimeout(timeoutId)
}

function App() {
  useEffect(() => {
    return runWhenIdle(() => {
      void Promise.allSettled([
        loadMembersPage(),
        loadMemberDetailPage(),
        loadCohortsPage(),
        loadAboutPage(),
      ])

      void import('./lib/api')
        .then((module) => module.warmPublicData())
        .catch(() => undefined)
    })
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
