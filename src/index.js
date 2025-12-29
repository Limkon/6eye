import { initializeContext } from './config.js';
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

            // 速率限制逻辑
            const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
            const now = Date.now();
            if (ipRateMap.has(clientIP) && (now - ipRateMap.get(clientIP) < RATE_LIMIT_MS)) {
                return new Response(JSON.stringify({ error: '请求太快了，请稍候' }), { status: 429 });
            }
            ipRateMap.set(clientIP, now);
            if (ipRateMap.size > 1000) ipRateMap.clear();

            // API 路由
            if (path.startsWith('/api/')) {
                return await handleApiRequest(request, context, url);
            }

            // 静态资源分发
            if (path.startsWith('/src/vendor/')) {
                if (env.ASSETS) return await env.ASSETS.fetch(request);
            }

            // 首页
            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), {
                    headers: { 'Content-Type': 'text/html;charset=utf-8' }
                });
            }

            return new Response('404 Not Found', { status: 404 });
        } catch (e) {
            return new Response(e.message, { status: 500 });
        }
    },

    // Cron 定时任务处理
    async scheduled(event, env, ctx) {
        const db = env.DB;
        // 自动清理 24 小时前的旧消息
        await db.prepare("DELETE FROM messages WHERE timestamp < ?")
                .bind(Date.now() - (24 * 60 * 60 * 1000)).run();
        console.log('自动清理任务已执行');
    }
};
