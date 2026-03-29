import { lazy, Suspense } from 'react'
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
const CompetitionDetailPage = lazy(loadCompetitionDetailPage)
const AdminPage = lazy(loadAdminPage)
const AboutPage = lazy(loadAboutPage)
const NotFoundPage = lazy(loadNotFoundPage)

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
