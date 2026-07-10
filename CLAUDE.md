# DeepSeek Thinking Toggle Proxy

让你在 Claude Code 里一句话开关 DeepSeek 的深度思考，**不用重启代理、不用改配置**。

## 它是什么

Claude Code 用 Anthropic 协议发请求，但 DeepSeek 的"深度思考"用的是另一套字段（`thinking.type` + `output_config.effort`）。这个本地代理坐在中间帮你在请求发出去之前注入这些字段，这样 Claude Code 就能正常用 DeepSeek 的深度思考了。

## 你需要什么

- [Node.js](https://nodejs.org)（装好就行，不用会）
- DeepSeek API Key（在 [DeepSeek 控制台](https://platform.deepseek.com/api_keys) 获取）
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安装

## 文件说明

| 文件 | 放哪里 | 作用 |
|------|--------|------|
| `proxy.js` | 随便放，推荐 `~/deepseek-proxy/` | 代理主程序，`node proxy.js` 启动 |
| `proxy-config.json` | 和 `proxy.js` 同目录 | 热更新配置，改了立刻生效 |
| `settings.json` | **不是完整文件！** 把内容合并到 `~/.claude/settings.json` | Claude Code 连接代理所需的设置 |
| `toggle-thinking/` | 整个文件夹放到 `~/.claude/skills/` | 在 Claude Code 里说"开启/关闭深度思考"就能切换 |

## 安装步骤（3 步）

### 第 1 步：启动代理

```bash
# 把仓库里的文件放到一个目录，比如 ~/deepseek-proxy/
# 然后终端里运行：
node ~/deepseek-proxy/proxy.js
```

看到下面的输出就是成功了：
```
DeepSeek Thinking Proxy → 127.0.0.1:17861
  Upstream: api.deepseek.com/anthropic/v1/messages
  Thinking: enabled  Effort: high
```

> 💡 **保持这个终端窗口开着**，关了代理就停了。可以最小化。

### 第 2 步：配置 Claude Code

把仓库里的 `settings.json` 的内容**合并**到你自己的 `~/.claude/settings.json` 里：

**Windows**: `C:\Users\你的用户名\.claude\settings.json`
**Mac/Linux**: `~/.claude/settings.json`

重点改这个：
```json
"ANTHROPIC_AUTH_TOKEN": "sk-你的DeepSeek-API-Key填这里"
```
把 `sk-你的DeepSeek-API-Key填这里` 换成你在 DeepSeek 控制台拿到的真实 Key。

> ⚠️ 如果你的 `settings.json` 里已经有内容，**不要整个覆盖**，把 `env` 和 `permissions` 里的条目加进去就行。

### 第 3 步：安装 Skill

把仓库里的 `toggle-thinking` 文件夹复制到 `~/.claude/skills/` 下面：

**Windows**:
```
复制 toggle-thinking 文件夹 →
C:\Users\你的用户名\.claude\skills\toggle-thinking\
```

**Mac/Linux**:
```bash
cp -r toggle-thinking ~/.claude/skills/
```

然后在 Claude Code 里输入 `/reload-skills`，或者重启 Claude Code。

## 怎么用

在 Claude Code 里直接说：

| 你说 | 效果 |
|------|------|
| `开启深度思考` | 打开深度思考 |
| `关闭深度思考` | 关掉深度思考 |
| `切换思考` | 当前是开→关闭，当前是关→打开 |

**不需要重启任何东西，说完立刻生效。**

## 把 proxy 换成开机自启（可选）

Windows 上可以用任务计划程序，Mac/Linux 上可以用 systemd 或 launchd。
最简单的办法是每次用之前手动 `node proxy.js` 跑起来就行。

## 常见问题

**Q: 怎么确认深度思考真的开了？**
A: 看 proxy 的终端输出，每行都有 `thinking=enabled` 或 `thinking=disabled`。或者访问 `http://127.0.0.1:17861/__health` 查看状态。

**Q: 端口 17861 被占用了怎么办？**
A: 启动时换一个端口：`PORT=17862 node proxy.js`，然后 settings.json 里的 `ANTHROPIC_BASE_URL` 也要改成 `http://127.0.0.1:17862`。

**Q: 我不想用 skill，能手动切换吗？**
A: 可以，直接编辑 `proxy-config.json`，把 `thinking` 改成 `enabled` 或 `disabled`，保存即生效。或者用 curl：
```bash
# 开启
curl -X POST http://127.0.0.1:17861/__config -H "Content-Type: application/json" -d "{\"thinking\":\"enabled\"}"
# 关闭
curl -X POST http://127.0.0.1:17861/__config -H "Content-Type: application/json" -d "{\"thinking\":\"disabled\"}"
```
