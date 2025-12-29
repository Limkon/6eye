fullContent: `import { initializeContext } from './config.js';
import { handleApiRequest } from './handlers/api.js';
import { generateChatPage } from './pages/home.js';

const ipRateMap = new Map();
const RATE_LIMIT_MS = 1000; 

export default {
    async fetch(request, env, ctx) {
        try {
            const context = await initializeContext(request, env);
            const url = new URL(request.url);
            const path = url.pathname;

            // 速率限制
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const now = Date.now();
            if (ipRateMap.has(clientIP) && (now - ipRateMap.get(clientIP) < RATE_LIMIT_MS)) {
                return new Response('Too Fast', { status: 429 });
            }
            ipRateMap.set(clientIP, now);

            // 修复：将 ctx 传递给处理函数，用于处理异步任务(waitUntil)
            if (path.startsWith('/api/')) return await handleApiRequest(request, context, url, ctx);
            if (path.startsWith('/src/vendor/')) return (env.ASSETS) ? await env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });

            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
            }
            return new Response('Not Found', { status: 404 });
        } catch (e) {
            return new Response(e.message, { status: 500 });
        }
    },

    async scheduled(event, env, ctx) {
        // 定时清理旧数据 - 修改为清理 1 小时前的数据 (3600000 ms)
        await env.DB.prepare("DELETE FROM messages WHERE timestamp < ?").bind(Date.now() - 3600000).run();
    }
};
