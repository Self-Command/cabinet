# Cabinet Docker 部署指南（Claude Code / 低资源版）

这套部署不改 Cabinet 业务代码，只把现有 Next.js + daemon + Claude Code CLI 放进 Docker。适合 4G 内存、6 核 VPS。

默认使用“宿主机 Nginx 反代”模式：Docker 只绑定 `127.0.0.1:4000` 和 `127.0.0.1:4100`，不会占用宿主机的 `80/443`。

## 服务器要求

- Ubuntu 22.04/24.04 或 Debian 12
- Docker + Docker Compose plugin
- 宿主机已有 Nginx，或准备安装 Nginx
- 4G 内存建议加 2G swap
- 域名 A 记录指向服务器公网 IP

## 1. 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker version
```

建议加 swap：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. 准备配置

在仓库根目录执行：

```bash
cd deploy
cp .env.example .env
mkdir -p secrets data claude/home
cp secrets/.cabinet.env.example secrets/.cabinet.env
chmod 600 secrets/.cabinet.env
cp claude/claude.env.example claude/claude.env
```

编辑 `deploy/.env`：

```env
CABINET_DOMAIN=cabinet.example.com
CABINET_APP_PORT=4000
CABINET_DAEMON_PORT=4100
CABINET_MEM_LIMIT=3500m
CABINET_CPUS=5.5
NODE_MAX_OLD_SPACE_SIZE=768
```

编辑 `deploy/secrets/.cabinet.env`：

```env
KB_PASSWORD=一个很长的登录密码
CABINET_AUTH_SALT=用 openssl rand -hex 32 生成
ANTHROPIC_API_KEY=sk-ant-...
```

`deploy/secrets/.cabinet.env` 只放 Cabinet 登录和密钥。Claude Code 的非密钥配置放到 `deploy/claude/`，不要混进项目根目录 `.env`。

生成 salt：

```bash
openssl rand -hex 32
```

## 3. 启动

```bash
docker compose up -d --build
docker compose logs -f cabinet
```

此时 Cabinet 只在本机可访问：

```bash
curl http://127.0.0.1:4000/api/health
curl http://127.0.0.1:4100/health
```

## 4. 配置宿主机 Nginx

复制示例：

```bash
sudo cp nginx-cabinet.conf /etc/nginx/sites-available/cabinet.conf
sudo sed -i 's/cabinet.example.com/你的域名/g' /etc/nginx/sites-available/cabinet.conf
sudo ln -s /etc/nginx/sites-available/cabinet.conf /etc/nginx/sites-enabled/cabinet.conf
sudo nginx -t
sudo systemctl reload nginx
```

如果你已有 HTTPS/Certbot，只需要把 `location /` 和 `location /daemon/` 两段合并到你的 HTTPS server block 里。

访问：

```text
https://你的域名
```

首次进入用 `KB_PASSWORD` 登录。

## Claude Code 外置配置

这套 Compose 已经把 Claude Code 相关目录映射出来：

```text
deploy/claude/home       -> /home/cabinet
deploy/data              -> /data
deploy/claude/claude.env -> 可选 Claude Code 环境变量
```

这不是单个文件映射：`/home/cabinet` 和 `/data` 都是整目录映射。Claude Code 在容器里写到这些目录的任何配置、登录态、MCP、项目指令都会落到宿主机。

首次启动后会自动生成这些文件：

```text
deploy/claude/home/.claude/settings.json
deploy/claude/home/.claude/CLAUDE.md
deploy/claude/home/.claude/agents/
deploy/claude/home/.claude.json
deploy/data/.claude/settings.json
deploy/data/.claude/settings.local.json
deploy/data/.claude/CLAUDE.md
deploy/data/.mcp.json
deploy/data/CLAUDE.md
```

对应 Claude Code 官方配置层级：

- 用户设置：`deploy/claude/home/.claude/settings.json`
- 用户指令：`deploy/claude/home/.claude/CLAUDE.md`
- 用户 MCP / 状态：`deploy/claude/home/.claude.json`
- 项目设置：`deploy/data/.claude/settings.json`
- 项目本地设置：`deploy/data/.claude/settings.local.json`
- 项目指令：`deploy/data/.claude/CLAUDE.md` 或 `deploy/data/CLAUDE.md`
- 项目 MCP：`deploy/data/.mcp.json`

如果你要配置代理、自定义 Anthropic endpoint、默认模型等 Claude Code 环境变量，编辑：

```bash
nano deploy/claude/claude.env
docker compose up -d --force-recreate
```

示例：

```env
ANTHROPIC_BASE_URL=https://api.anthropic.com
ANTHROPIC_MODEL=sonnet
HTTP_PROXY=http://127.0.0.1:7890
HTTPS_PROXY=http://127.0.0.1:7890
```

密钥仍建议放 `deploy/secrets/.cabinet.env`：

```env
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_CODE_OAUTH_TOKEN=...
```

## 权限说明

Cabinet 当前更像单用户/小团队私有工作台，不是带角色权限的多用户系统：

- 不设置 `KB_PASSWORD` 时，Web 端基本等于公开访问，不建议公网这样部署。
- 设置 `KB_PASSWORD` 后，所有知道密码的人都是同一身份，登录后都可以编辑内容、改设置、配置 Provider、运行 Agent。
- 项目里没有 viewer/editor/admin 这类角色，也没有按用户区分频道聊天身份。
- Telegram 集成有 allowlist，但那只限制 Telegram bot 的可用用户，不等于 Web 端权限系统。

如果要给别人只读访问，建议先不要直接开放 Cabinet 本体；可以另做静态发布/导出站点，或者等官方支持多用户权限后再开放。

## 5. 验证 Claude Code

进入容器：

```bash
docker compose exec cabinet bash
```

检查 Claude Code：

```bash
claude --version
claude -p 'Reply with exactly OK' --output-format text
```

如果你不用 `ANTHROPIC_API_KEY`，而是 Claude 订阅登录，有两种方式：

```bash
# 推荐：本地运行后复制 token 到 secrets/.cabinet.env
claude setup-token
# 然后设置 CLAUDE_CODE_OAUTH_TOKEN=...
```

或者直接在容器里登录，登录状态会保存在 `deploy/claude/home`：

```bash
docker compose exec cabinet claude auth login
```

## 6. 性能建议

- 同时运行 Claude Agent 控制在 1-2 个。
- 不要把大型代码仓库整个放进 Cabinet data 目录，避免文件监听过多。
- 默认 `NODE_OPTIONS=--max-old-space-size=768`，4G 机器更稳。
- `CABINET_MEM_LIMIT=3500m` 给宿主机 Nginx 和系统留一点余量。
- 数据存在宿主机目录 `deploy/data`，不要放 NFS/对象存储。

## 7. 更新

```bash
git pull
cd deploy
docker compose build --no-cache cabinet
docker compose up -d
```

## 8. 备份

备份 Cabinet 数据：

```bash
docker run --rm \
  -v "$PWD/data:/data:ro" \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/cabinet-data-$(date +%F).tgz -C /data .
```

备份 Claude 登录状态：

```bash
docker run --rm \
  -v "$PWD/claude/home:/home:ro" \
  -v "$PWD/backups:/backup" \
  alpine tar czf /backup/cabinet-home-$(date +%F).tgz -C /home .
```

## 9. 常见问题

### 页面能打开，但 Agent / Web Terminal 连不上

检查 `deploy/.env` 里的域名必须和浏览器访问的域名一致：

```env
CABINET_DOMAIN=cabinet.example.com
```

然后重启：

```bash
docker compose up -d --force-recreate
sudo nginx -t && sudo systemctl reload nginx
```

也要确认 Nginx 里 `/daemon/` 这一段启用了 WebSocket upgrade。

### Provider 显示未登录

先在容器内跑：

```bash
claude -p 'Reply with exactly OK' --output-format text
```

如果这条能返回 OK，说明 Claude Code 可用。再到 Cabinet 设置页点 Verify。

### 构建时内存不足

在服务器上构建 Next.js 可能吃内存。先加 swap，或者在本地构建镜像后推到服务器。

### 想省更多内存

关闭不需要的定时任务和 heartbeat，避免多个 Agent 同时跑。Claude Code 的主要开销来自 agent 子进程和工具调用，不是 Nginx 或 Docker 本身。
