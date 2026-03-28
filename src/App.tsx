import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'

const HomePage = lazy(async () => {
  const module = await import('./pages/HomePage')
  return { default: module.HomePage }
})

const MembersPage = lazy(async () => {
  const module = await import('./pages/MembersPage')
  return { default: module.MembersPage }
})

const MemberDetailPage = lazy(async () => {
  const module = await import('./pages/MemberDetailPage')
  return { default: module.MemberDetailPage }
})

const CohortsPage = lazy(async () => {
  const module = await import('./pages/CohortsPage')
  return { default: module.CohortsPage }
})

const AdminPage = lazy(async () => {
  const module = await import('./pages/AdminPage')
  return { default: module.AdminPage }
})

const AboutPage = lazy(async () => {
  const module = await import('./pages/AboutPage')
  return { default: module.AboutPage }
})

const NotFoundPage = lazy(async () => {
  const module = await import('./pages/NotFoundPage')
  return { default: module.NotFoundPage }
})

function App() {
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
