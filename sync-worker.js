/**
 * 游泳日记 v3 —— 云端同步后端（Cloudflare Worker，免费额度足够两人用）
 *
 * v3 起采用「多文件」结构，每个房间三个文件，互相独立读写：
 *   shared.json        —— 共享层：卡设置 + 各账号用量汇总（名字/累计次数/最近游泳日）
 *   private_me.json    —— 私有层：「我」的流水（仅本人客户端读写）
 *   private_fr.json    —— 私有层：「朋友」的流水（仅朋友客户端读写）
 *
 * 部署三步：
 *  1. cloudflare.com 注册（免费）→ Workers 和 Pages → 创建 Worker → 创建 → 编辑代码
 *  2. 把本文件内容整段粘进去，点「部署」
 *  3. 在 Worker 的「设置 → 变量」里绑定一个 KV 命名空间，变量名必须叫 SWIM
 *     （KV 命名空间如果还没有：Workers 和 Pages → KV → 创建，名字随意）
 *
 * 部署完会得到一个地址，如 https://swimcard.xxx.workers.dev
 * 把它填进 App「设置 → 同步 → 自建接口 → 接口地址」，房间码自己起一个（如 8848），
 * 朋友填一样的地址和房间码即可。
 *
 * 注意：v3 与旧版（单文件 swim.json）数据格式不兼容，双方需同时升级到新版 App。
 * 旧版无后缀路由 /api/room/{room} 仍保留读写旧 key，仅作兼容，新版客户端不再使用。
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* v3 多文件路由：/api/room/{room}/{file} */
    const m3 = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,32})\/(shared|private_me|private_fr)$/);
    if (m3) {
      const key = 'room:' + m3[1] + ':' + m3[2];
      if (request.method === 'GET') {
        const v = await env.SWIM.get(key);
        return new Response(v || 'null', { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        try {
          const o = JSON.parse(body);
          // shared 必须有 members 对象；private 必须有 logs 数组
          if (!o || typeof o !== 'object') throw new Error('bad');
          if (m3[2] === 'shared') { if (!o.members || typeof o.members !== 'object') throw new Error('bad'); }
          else { if (!Array.isArray(o.logs)) throw new Error('bad'); }
        } catch (e) {
          return json({ error: 'invalid payload' }, 400, cors);
        }
        await env.SWIM.put(key, body);
        return json({ ok: true }, 200, cors);
      }
      return json({ error: 'method not allowed' }, 405, cors);
    }

    /* 旧版单文件路由（兼容，仅读写 room:{room}） */
    const mOld = url.pathname.match(/^\/api\/room\/([A-Za-z0-9_-]{1,32})$/);
    if (mOld) {
      const key = 'room:' + mOld[1];
      if (request.method === 'GET') {
        const v = await env.SWIM.get(key);
        return new Response(v || 'null', { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      if (request.method === 'PUT') {
        const body = await request.text();
        try {
          const o = JSON.parse(body);
          if (!o || !Array.isArray(o.logs)) throw new Error('bad');
        } catch (e) {
          return json({ error: 'invalid payload' }, 400, cors);
        }
        await env.SWIM.put(key, body);
        return json({ ok: true }, 200, cors);
      }
      return json({ error: 'method not allowed' }, 405, cors);
    }

    return json({ error: 'not found' }, 404, cors);
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
