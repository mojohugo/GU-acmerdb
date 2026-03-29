# GU ACMerDB

广州大学 ACM 校队队员与赛事记录站点，使用 React + Vite + Supabase，目标部署平台 GitHub Pages。

## 功能

- 前端: React + Vite
- 路由: Hash Router（GitHub Pages 刷新不 404）
- 数据与登录: Supabase（管理员登录 + PostgreSQL）
- 视图: 队员列表、队员详情、赛事时间线、获奖查询/统计/导出
- 附件: 比赛详情支持上传奖状与赛事照片（阿里 OSS）

## 本地开发

```bash
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

```bash
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

## Supabase 初始化

1. 在 Supabase SQL Editor 执行 [supabase/schema.sql](./supabase/schema.sql)
2. 在 Authentication -> Users 创建管理员账号（邮箱密码）
3. 执行 SQL 授权管理员（替换用户 ID）

```sql
insert into public.admin_users(user_id, display_name, is_admin)
values ('YOUR_AUTH_USER_ID', 'Admin', true)
on conflict (user_id) do update set is_admin = excluded.is_admin;
```

## GitHub Pages 部署

- 已包含 workflow: `.github/workflows/deploy.yml`
- `vite.config.ts` 默认仓库路径为 `/GU-acmerdb/`
- 若你的仓库名不同，请修改 `vite.config.ts` 的 `repoName`
- 详细逐步操作见: [docs/SETUP_CN.md](./docs/SETUP_CN.md)

## 阿里 OSS（奖状/赛事照片）

- 需要部署 Supabase Edge Function: `oss-sign-upload`
- 需要执行最新版 `supabase/schema.sql`（新增 `competition_media`）
- 配置步骤见: [docs/ALI_OSS_SETUP_CN.md](./docs/ALI_OSS_SETUP_CN.md)

## TODO

- 管理后台: 批量导入、附件上传进度/压缩/OSS回收清理
- 检索: 更接近 OIerDb 的高级搜索与统计图
- 展示: 学校/队伍排名页、选手跨赛季趋势图
