/**
 * 最简 DeepSeek Thinking 代理
 *
 * 作用：拦截 Claude Code → DeepSeek 的请求，注入 DeepSeek 真正认的
 *       output_config.effort（替代 Claude Code 发出的 budget_tokens）
 *
 * 用法：
 *   node proxy.js                    # 启动代理，默认 thinking=enabled, effort=high
 *   PORT=17861 node proxy.js         # 自定义端口（只能启动时指定）
 *
 * 热更新：编辑 proxy-config.json 后即时生效，无需重启代理
 *
 * Claude Code 设置 (~/.claude/settings.json)：
 *   { "env": {
 *       "ANTHROPIC_BASE_URL": "http://127.0.0.1:17861",
 *       "ANTHROPIC_AUTH_TOKEN": "sk-your-deepseek-key",
 *       "ANTHROPIC_MODEL": "deepseek-v4-pro"
 *   }}
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ---- 配置 ----
const PORT = process.env.PORT || 17861;
const UPSTREAM_HOST = 'api.deepseek.com';
const UPSTREAM_PATH = '/anthropic/v1/messages';
const CONFIG_PATH = path.join(__dirname, 'proxy-config.json');

// 默认配置文件
const DEFAULT_CONFIG = {
  thinking: 'enabled',   // enabled | disabled
  effort: 'high',        // max | high
};

// 首次启动时自动创建配置文件
function ensureConfig() {
  try { fs.statSync(CONFIG_PATH); } catch {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
    console.log(`已创建配置文件: ${CONFIG_PATH}`);
  }
}

// 每次请求时实时读配置（实现热更新）
function readConfig() {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

// ---- 日志 ----
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// ---- 核心：注入 DeepSeek 认的字段 ----
function mutatePayload(cfg, payload) {
  // 0. 清洗模型名：去掉 [1M] [128K] 等后缀，DeepSeek API 不认识
  if (payload.model) {
    payload.model = payload.model.replace(/\[\d+[KM]\]/g, '').trim();
  }

  // 1. 注入 thinking.type
  payload.thinking = { ...(payload.thinking || {}), type: cfg.thinking };

  // 2. 如果开启思考 → 注入 output_config.effort（DeepSeek 认这个）
  //    如果关闭思考 → 必须删掉 output_config，否则 DeepSeek 400
  if (cfg.thinking === 'enabled') {
    payload.output_config = { ...(payload.output_config || {}), effort: cfg.effort };
  } else {
    delete payload.output_config;
  }

  return payload;
}

// ---- HTTP 服务器 ----
const server = http.createServer((req, res) => {
  const cfg = readConfig();  // 每次请求实时读，实现热更新

  // 健康检查
  if (req.method === 'GET' && req.url === '/__health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, thinking: cfg.thinking, effort: cfg.thinking === 'enabled' ? cfg.effort : null }));
  }

  // 配置热更新（任何 agent / 脚本都能调）
  if (req.method === 'POST' && req.url === '/__config') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const update = JSON.parse(body);
        const current = readConfig();
        const merged = { ...current, ...update };
        // 只保留合法字段
        const valid = {};
        if (merged.thinking === 'enabled' || merged.thinking === 'disabled') valid.thinking = merged.thinking;
        if (merged.effort === 'high' || merged.effort === 'max') valid.effort = merged.effort;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(valid, null, 2));
        log(`CONFIG_UPDATED thinking=${valid.thinking} effort=${valid.effort}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, thinking: valid.thinking, effort: valid.thinking === 'enabled' ? valid.effort : null }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  if (req.method !== 'POST') {
    res.writeHead(501);
    return res.end('POST only');
  }

  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString());
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: `Invalid JSON: ${err.message}` }));
    }

    // 注入字段
    mutatePayload(cfg, payload);
    const bodyOut = JSON.stringify(payload);

    log(`→ ${payload.model}  thinking=${cfg.thinking}  effort=${cfg.thinking === 'enabled' ? cfg.effort : 'off'}`);

    // 转发到 DeepSeek
    const upstream = https.request({
      hostname: UPSTREAM_HOST,
      port: 443,
      path: req.url.startsWith('/v1/messages') ? UPSTREAM_PATH : UPSTREAM_PATH + req.url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyOut),
        'Authorization': req.headers.authorization || '',
        'x-api-key': req.headers['x-api-key'] || '',
        'anthropic-version': req.headers['anthropic-version'] || '2023-06-01',
      },
      rejectUnauthorized: true,
    }, upstreamRes => {
      res.writeHead(upstreamRes.statusCode, upstreamRes.headers);

      // 嗅探 SSE 统计思考量（顺便验证思考是否真正生效）
      let thinkingChars = 0, textChars = 0, lineBuf = '';
      const isStream = (upstreamRes.headers['content-type'] || '').includes('event-stream');
      upstreamRes.on('data', chunk => {
        if (isStream) {
          const text = chunk.toString('utf8');
          lineBuf += text;
          const lines = lineBuf.split(/\r?\n/);
          lineBuf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data:')) continue;
            const data = line.slice(5).trim();
            if (!data || data === '[DONE]') continue;
            try {
              const evt = JSON.parse(data);
              if (evt.type === 'content_block_delta') {
                if (evt.delta?.type === 'thinking_delta') thinkingChars += (evt.delta.thinking || '').length;
                if (evt.delta?.type === 'text_delta') textChars += (evt.delta.text || '').length;
              }
            } catch {}
          }
        }
      });
      upstreamRes.on('end', () => {
        log(`← thinking=${thinkingChars > 0 ? `Y(${thinkingChars}chars)` : 'N'} text=${textChars}chars`);
      });
      upstreamRes.pipe(res);
    });

    upstream.setTimeout(300000, () => {
      upstream.destroy();
      if (!res.headersSent) { res.writeHead(504); res.end('timeout'); }
    });

    upstream.on('error', err => {
      log(`ERROR: ${err.message}`);
      if (!res.headersSent) { res.writeHead(502); res.end(JSON.stringify({ error: err.message })); }
    });

    upstream.write(bodyOut);
    upstream.end();
  });
});

ensureConfig();
server.listen(PORT, '127.0.0.1', () => {
  const cfg = readConfig();
  console.log(`DeepSeek Thinking Proxy → 127.0.0.1:${PORT}`);
  console.log(`  Upstream: ${UPSTREAM_HOST}${UPSTREAM_PATH}`);
  console.log(`  Thinking: ${cfg.thinking}  Effort: ${cfg.thinking === 'enabled' ? cfg.effort : 'N/A'}`);
  console.log(`  配置文件: ${CONFIG_PATH}`);
  console.log('');
  console.log('Claude Code 设置:');
  console.log('  ANTHROPIC_BASE_URL=http://127.0.0.1:17861');
  console.log('  ANTHROPIC_AUTH_TOKEN=sk-你的deepseek-key');
  console.log('  ANTHROPIC_MODEL=deepseek-v4-pro');
});
