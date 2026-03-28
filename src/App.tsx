import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AboutPage } from './pages/AboutPage'
import { AdminPage } from './pages/AdminPage'
import { CohortsPage } from './pages/CohortsPage'
import { HomePage } from './pages/HomePage'
import { MemberDetailPage } from './pages/MemberDetailPage'
import { MembersPage } from './pages/MembersPage'
import { NotFoundPage } from './pages/NotFoundPage'

function App() {
  return (
    <Layout>
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
    </Layout>
  )
}

export default App
