# GU-ACMerDB 从零部署指南（Supabase + GitHub Pages）

仓库地址：`https://github.com/mojohugo/GU-acmerdb`  
最终站点地址：`https://mojohugo.github.io/GU-acmerdb/`

## 1. 在 Supabase 创建项目

1. 打开 `https://supabase.com/dashboard`，用 GitHub 账号登录（你已经完成）。
2. 点击 `New project`。
3. 选择 Organization（没有就先创建一个）。
4. 填写：
   - `Project name`: `gu-acmerdb`（可自定义）
   - `Database Password`: 自己设一个强密码并保存
   - `Region`: 建议选离你近的（如 Singapore）
5. 点击创建，等待项目初始化完成。

## 2. 初始化数据库表和权限（最关键）

1. 进入新项目后，打开左侧 `SQL Editor`。
2. 新建一个 Query。
3. 复制仓库里的 SQL 文件内容：`supabase/schema.sql`。
4. 粘贴并执行（Run）。
5. 执行后确认没有报错。

这个 SQL 会创建：
- `members`（队员）
- `competitions`（赛事）
- `competition_members`（赛事-队员关联）
- `admin_users`（管理员白名单）
- RLS 策略（普通访客可读，只有管理员可写）

## 3. 创建管理员登录账号（Auth）

注意：你用 GitHub 登录 Supabase 控制台，不等于网站后台管理员账号。

1. 打开左侧 `Authentication` -> `Users`。
2. 点击 `Add user`（或 `Create user`）。
3. 创建一个邮箱密码账号（例如你常用邮箱）。
4. 建议勾选自动确认（Auto Confirm）。
5. 创建后，在用户列表里复制这个用户的 `UUID`（就是 `id`）。

## 4. 把这个用户设为管理员

回到 `SQL Editor` 执行下面 SQL（把 `YOUR_AUTH_USER_ID` 换成你刚复制的 UUID）：

```sql
insert into public.admin_users(user_id, display_name, is_admin)
values ('YOUR_AUTH_USER_ID', 'Mojo Admin', true)
on conflict (user_id) do update
set display_name = excluded.display_name,
    is_admin = excluded.is_admin;
```

可选验证：

```sql
select * from public.admin_users;
```

## 5. 获取前端要用的 Supabase 配置

打开 `Project Settings` -> `API`，记下：

1. `Project URL`（用于 `VITE_SUPABASE_URL`）

2. `anon public key`（用于 `VITE_SUPABASE_ANON_KEY`）

   

https://wexmymugzazvjeoiofbm.supabase.co
sb_publishable__S2vKqqLqnmglBPsMqSxQA_NVBvMtAX

sb_secret_XA0mfZZFA58TzrBIrCaJbQ_Fb0nfK7l

## 6. 本地运行（先本地通了再上线）

在项目根目录执行：

```bash
npm install
```

新建 `.env.local`（可复制 `.env.example`）：

```bash
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxx
```

启动：

```bash
npm run dev
```

测试点：
1. 打开首页能正常进入。
2. 打开 `/#/admin`，用第 3 步创建的邮箱密码登录。
3. 能新增队员和赛事，前台能看到数据。

## 7. 配置 GitHub Pages 自动部署

仓库已经有 workflow：`.github/workflows/deploy.yml`。

你只需要做 2 件事：

1. 在 GitHub 仓库打开 `Settings` -> `Pages`  
   - `Build and deployment` 选择 `Source: GitHub Actions`
2. 在 `Settings` -> `Secrets and variables` -> `Actions` -> `Variables` 新增：
   - `VITE_SUPABASE_URL` = 你的 Project URL
   - `VITE_SUPABASE_ANON_KEY` = 你的 anon key

然后推送到 `main` 分支，Actions 会自动构建并发布。

## 8. 常见问题排查

1. 后台登录后提示“不是管理员”
   - 没有在 `admin_users` 插入这位用户，或 UUID 填错。
2. 登录失败 `Invalid login credentials`
   - 邮箱/密码错误，或者用户未确认。
3. 线上页面提示“Supabase 未配置”
   - GitHub Variables 没配，或变量名拼写不对。
4. 新增数据报权限错误（RLS）
   - `schema.sql` 没完整执行，或当前登录用户不在管理员白名单。

## 9. 你可以按这个最短顺序操作

1. Supabase 建项目。
2. 执行 `supabase/schema.sql`。
3. Auth 创建邮箱账号。
4. SQL 插入 `admin_users`。
5. 拿 URL + anon key 配 `.env.local` 本地测试。
6. GitHub 配 Variables，推 `main`，等 Pages 上线。

## 10. 首次推送到 GitHub（当前目录还没有 .git 时）

在项目根目录执行：

```bash
git init
git branch -M main
git remote add origin https://github.com/mojohugo/GU-acmerdb.git
git add .
git commit -m "feat: initial gu-acmerdb with supabase and pages"
git push -u origin main
```

如果提示 `remote origin already exists`，改用：

```bash
git remote set-url origin https://github.com/mojohugo/GU-acmerdb.git
git push -u origin main
```

如果推送要认证，建议用 GitHub PAT（classic 或 fine-grained）作为密码。
