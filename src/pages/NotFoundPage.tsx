import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <section className="panel stack">
      <h2>404 · 走丢啦</h2>
      <p>这个页面没有找到，可能是地址写错了，或者它已经搬家。</p>
      <Link className="btn btn-solid" to="/">
        返回首页
      </Link>
    </section>
  )
}
