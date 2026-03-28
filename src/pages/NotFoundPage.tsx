import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="panel stack">
      <h2>404</h2>
      <p>页面不存在，请检查地址或返回首页。</p>
      <Link className="btn btn-solid" to="/">
        返回首页
      </Link>
    </section>
  )
}
