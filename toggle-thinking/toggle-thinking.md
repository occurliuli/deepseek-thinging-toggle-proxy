---
name: toggle-thinking
description: Toggle DeepSeek deep thinking mode on/off without restarting. Use when user says 开启/打开/启用/关闭/停止/禁用 深度思考/思考, or enable/disable/toggle thinking, or 切换思考. Also use when user wants to adjust thinking effort level (max/high/medium/low).
---

# Toggle DeepSeek Thinking

Switch the local proxy's deep thinking mode on/off without restarting.

## Trigger

User says any of:
- 开启/打开/启用 深度思考 / 思考
- 关闭/停止/禁用 深度思考 / 思考
- enable / disable thinking
- toggle thinking / 切换思考

## Action

1. Read `~/deepseek-proxy/proxy-config.json`（Windows 上 `~` = `C:\Users\你的用户名`）
2. Set `.thinking` to `"enabled"` or `"disabled"`
3. Write back
4. Confirm

## Config file

Path: `~/deepseek-proxy/proxy-config.json`

格式：
```json
{"thinking":"enabled","effort":"high"}
```

`thinking` 字段：`"enabled"` 或 `"disabled"`

## Effort level

If user also wants to change effort level（目前只支持 `high` / `max`），更新 `.effort` 字段即可。

## 注意

如果你把 proxy 放在了其他目录，请把上面路径改成你实际的 `proxy-config.json` 位置。
