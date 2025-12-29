import { initializeContext } from './config.js';
import { handleApiRequest } from './handlers/api.js';
import { generateChatPage } from './pages/home.js';

export default {
    async fetch(request, env, ctx) {
        try {
            const context = await initializeContext(request, env);
            const url = new URL(request.url);
            const path = url.pathname;

            // 1. API 路由分发
            if (path.startsWith('/api/')) {
                return await handleApiRequest(request, context, url);
            }

            // 2. 静态资源路由 (src/vendor)
            // 确保网页可以访问到存放于 vendor 目录下的图标和 CSS
            if (path.startsWith('/src/vendor/')) {
                // 如果您使用的是 Cloudflare Pages 或集成了 Assets 功能
                if (env.ASSETS) {
                    return await env.ASSETS.fetch(request);
                }
                // 如果是普通 Worker 且资源已部署，通常由平台托管或需通过 KV/R2 读取
                // 这里保留逻辑占位，默认尝试从环境资产中获取
            }

            // 3. 首页渲染
            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), {
                    headers: { 'Content-Type': 'text/html;charset=utf-8' }
                });
            }

            return new Response('404 Not Found', { status: 404 });

        } catch (e) {
            const errorMsg = e.message || e.toString();
            console.error('Worker Error:', e.stack);
            return new Response(JSON.stringify({ error: errorMsg }), { 
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};
