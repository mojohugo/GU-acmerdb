import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="panel stack">
      <h2>404</h2>
      <Link className="btn btn-solid" to="/">
        返回首页
      </Link>
    </section>
  )
}
