export function AboutPage() {
  return (
    <section className="panel stack">
      <h2>关于项目</h2>
      <p>
        这个站点用于记录广州大学 ACM 校队队员信息与比赛成绩，目标是长期稳定地维护与查询数据。
      </p>
      <p>
        技术栈为 React + Vite + Supabase，已支持 Hash 路由，地址中含 <code>#/</code>，刷新页面不会触发 GitHub
        Pages 的 404。
      </p>
      <p className="todo-note">
        TODO: 后续继续补齐统计图、学校/队伍排名页、复杂检索条件、跨页面报表与主题切换。
      </p>
    </section>
  )
}
