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

            // 2. 首页渲染 (直接返回构建好的 HTML，不依赖静态文件)
            if (path === '/' || path === '/index.html') {
                return new Response(generateChatPage(), {
                    headers: { 'Content-Type': 'text/html;charset=utf-8' }
                });
            }

            return new Response('404 Not Found', { status: 404 });

        } catch (e) {
            return new Response(e.stack || e.toString(), { status: 500 });
        }
    }
};
