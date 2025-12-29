export function generateChatPage() {
    // 1. 样式表：增加 E2EE 标识和倒计时样式
    const css = `
    body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; transition: background-color 0.3s, color 0.3s; height: 100vh; overflow: hidden; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 头部 */
    header { background: #4CAF50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }
    header h1 { margin: 0; font-size: 1.5em; display: flex; align-items: center; gap: 8px; }
    header .controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    
    /* 控件 */
    input[type="text"], input[type="password"], textarea { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 1em; }
    button { 
        padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; 
        transition: 0.2s; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; font-size: 0.9em;
    }
    button:hover { background: #f0f0f0; }
    button:disabled { background: #eee; color: #aaa; cursor: not-allowed; }
    button#destroy-room { background-color: #dc3545; border-color: #dc3545; color: white; }
    button#destroy-room:hover:not(:disabled) { background-color: #c82333; }
    
    /* 状态标识 */
    #cleanup-timer { font-size: 0.8em; color: #ffeb3b; font-weight: bold; background: rgba(0,0,0,0.2); padding: 2px 6px; border-radius: 4px; display: none; }
    .e2ee-badge { color: #ccff90; font-size: 0.7em; margin-left: 5px; border: 1px solid #ccff90; padding: 1px 4px; border-radius: 3px; }

    /* 主体 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; }
    #chat { flex: 3; padding: 15px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; }
    #userlist { flex: 1; min-width: 180px; max-width: 250px; padding: 15px; border-left: 1px solid #ddd; overflow-y: auto; background: #fff; }
    #userlist.hidden { display: none; }
    
    /* Markdown 样式 */
    .message-content p { margin: 4px 0; }
    .message-content code { background: rgba(0,0,0,0.08); padding: 2px 4px; border-radius: 4px; font-family: monospace; }
    .message-content pre { background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0; border: 1px solid rgba(0,0,0,0.1); }

    /* 消息气泡 */
    .message { margin: 10px 0; padding: 10px 15px; border-radius: 12px; max-width: 70%; word-wrap: break-word; position: relative; line-height: 1.4; }
    .message-left { align-self: flex-start; background: #e0f7fa; color: #333; border-bottom-left-radius: 0; }
    .message-right { align-self: flex-end; background: #c8e6c9; color: #333; border-bottom-right-radius: 0; }
    .message-username { font-size: 0.75em; color: #666; margin-bottom: 4px; font-weight: bold; }

    @media (max-width: 600px) {
        header { flex-direction: column; align-items: stretch; gap: 10px; }
        header .controls { justify-content: space-between; }
        #room-key, #room-id { flex: 1; width: auto; }
        footer #username { width: 40%; }
        footer #join { width: 30%; }
        footer #message { width: 100%; order: 3; margin-top: 5px; }
        footer #send { width: 30%; order: 2; margin-left: auto; }
    }
    `;

    // 2. 脚本逻辑：集成 Web Crypto API 和 Markdown 渲染
    const js = `
    let roomId = '', username = '', joined = false, pollInterval = null;
    let roomPassword = ''; // 客户端 E2EE 密钥
    const POLL_RATE = 2000;
    const CLEANUP_TIMEOUT = 30 * 60 * 1000; // 30分钟无活动建议销毁
    let lastActivity = Date.now();

    // 配置 Markdown
    if (typeof marked !== 'undefined') {
        marked.setOptions({ breaks: true, gfm: true });
    }

    // --- E2EE 加密核心 (Web Crypto API) ---
    async function deriveKey(password) {
        const encoder = new TextEncoder();
        const salt = encoder.encode(roomId); 
        const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
        return crypto.subtle.deriveKey(
            { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
            baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
        );
    }

    async function e2eeEncrypt(text, password) {
        const key = await deriveKey(password);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text));
        const combined = new Uint8Array(iv.length + encrypted.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(encrypted), iv.length);
        return btoa(String.fromCharCode(...combined));
    }

    async function e2eeDecrypt(b64, password) {
        try {
            const key = await deriveKey(password);
            const combined = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const data = combined.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
            return new TextDecoder().decode(decrypted);
        } catch (e) { return "<i>[无法解密：密钥错误或内容损坏]</i>"; }
    }

    // --- 倒计时逻辑 ---
    function updateCleanupTimer() {
        const timerEl = document.getElementById('cleanup-timer');
        const remaining = Math.max(0, CLEANUP_TIMEOUT - (Date.now() - lastActivity));
        if (remaining <= 0) { timerEl.innerText = "建议销毁记录"; return; }
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        timerEl.innerText = \`清理倒计时 \${mins}:\${secs.toString().padStart(2, '0')}\`;
        timerEl.style.display = 'inline-block';
    }
    setInterval(updateCleanupTimer, 1000);

    function showToast(msg) {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:10px 20px;border-radius:4px;z-index:9999;font-size:14px;';
        div.innerText = msg;
        document.body.appendChild(div);
        setTimeout(() => div.remove(), 3000);
    }

    const els = {};
    document.addEventListener('DOMContentLoaded', () => {
        ['room-id', 'room-key', 'join-room', 'current-room-id', 'username', 'join', 'message', 'send', 'chat', 'userlist', 'destroy-room', 'userlist-toggle'].forEach(id => {
            els[id] = document.getElementById(id);
        });

        els['join-room'].onclick = () => {
            const id = els['room-id'].value.trim();
            if(!id) return showToast('请输入房间ID');
            roomId = id;
            roomPassword = els['room-key'].value.trim();
            els['current-room-id'].innerHTML = \`<i class="fas fa-door-open"></i> 房间: \${roomId} \${roomPassword ? '<span class="e2ee-badge"><i class="fas fa-lock"></i> E2EE</span>' : ''}\`;
            els['room-id'].value = '';
            els['room-key'].value = '';
            connect();
        };

        els['join'].onclick = async () => {
            if(!roomId) return showToast('请先进入房间');
            const name = els['username'].value.trim();
            if(!name) return showToast('请输入您的称呼');
            
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/join\`, {
                    method: 'POST', body: JSON.stringify({username: name}), headers: {'Content-Type': 'application/json'}
                });
                if(!res.ok) throw new Error((await res.json()).error || '加入失败');
                username = name; joined = true;
                els['username'].style.display = 'none';
                els['join'].style.display = 'none';
                els['message'].disabled = false;
                els['send'].disabled = false;
                els['message'].focus();
                showToast('加入成功');
                pollMessages();
            } catch(e) { showToast(e.message); }
        };

        els['send'].onclick = async () => {
            let msgText = els['message'].value.trim();
            if(!msgText) return;
            
            // 发送前 E2EE 加密
            if (roomPassword) {
                msgText = await e2eeEncrypt(msgText, roomPassword);
            }

            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/send\`, {
                    method: 'POST', body: JSON.stringify({username, message: msgText}), headers: {'Content-Type': 'application/json'}
                });
                if(res.ok) { els['message'].value = ''; lastActivity = Date.now(); pollMessages(); }
            } catch(e) { showToast('发送失败'); }
        };

        els['destroy-room'].onclick = async () => {
            if(confirm('确定永久销毁当前房间的所有记录吗？')) {
                await fetch(\`/api/room/\${encodeURIComponent(roomId)}/destroy\`, { method: 'POST' });
                location.reload();
            }
        };
        els['userlist-toggle'].onclick = () => { els['userlist'].classList.toggle('hidden'); };
    });

    function connect() {
        pollMessages();
        if(pollInterval) clearInterval(pollInterval);
        pollInterval = setInterval(pollMessages, POLL_RATE);
        els['destroy-room'].disabled = false;
    }

    async function pollMessages() {
        if(!roomId) return;
        try {
            const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/messages?user=\${encodeURIComponent(username)}\`);
            if(!res.ok) return;
            const data = await res.json();
            renderUsers(data.users);
            await renderMessages(data.messages);
        } catch(e) { console.error('轮询错误', e); }
    }

    function renderUsers(users) {
        const title = '<h3><i class="fas fa-users"></i> 在线用户</h3>';
        const list = users.length 
            ? users.map(u => \`<div class="user-item"><i class="fas fa-user-circle"></i> \${u}</div>\`).join('') 
            : '<div style="color:#999;font-size:0.9em;">暂无活跃用户</div>';
        els['userlist'].innerHTML = title + list;
    }

    async function renderMessages(msgs) {
        const chat = els['chat'];
        const shouldScroll = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 100;
        if (msgs.length === 0) {
            chat.innerHTML = '<div style="text-align:center;color:#999;margin-top:20px;"><i class="fas fa-comment-slash"></i> 暂无消息</div>';
            return;
        }

        if (msgs.length > 0) {
            const latestMsgTime = Math.max(...msgs.map(m => m.timestamp));
            lastActivity = Math.max(lastActivity, latestMsgTime);
        }

        const rendered = await Promise.all(msgs.map(async m => {
            const isMe = m.username === username;
            const type = isMe ? 'message-right' : 'message-left';
            const time = new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // E2EE 解密
            let content = m.message;
            if (roomPassword) {
                content = await e2eeDecrypt(content, roomPassword);
            }
            
            const htmlContent = (typeof marked !== 'undefined') ? marked.parse(content) : content;

            return \`<div class="message \${type}">
                <div class="message-username">\${m.username} <span style="font-weight:normal;font-size:0.8em;color:#999;margin-left:5px">\${time}</span></div>
                <div class="message-content">\${htmlContent}</div>
            </div>\`;
        }));

        chat.innerHTML = rendered.join('');
        if(shouldScroll) chat.scrollTop = chat.scrollHeight;
    }
    `;

    // 3. HTML 结构
    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>6eye Chat | E2EE</title>
        <link rel="stylesheet" href="/src/vendor/fontawesome/css/all.min.css">
        <script src="/src/vendor/marked/marked.min.js"></script>
        <style>${css}</style>
    </head>
    <body>
        <div id="app">
            <header>
                <h1><i class="fas fa-eye"></i> MO留書</h1>
                <div class="controls">
                    <span id="cleanup-timer"></span>
                    <span id="current-room-id" style="font-size:0.9em;margin-right:5px"><i class="fas fa-ghost"></i> 未加入房间</span>
                    <input type="password" id="room-key" placeholder="可选访问密码" style="width:110px">
                    <input type="text" id="room-id" placeholder="房间ID" style="width:90px">
                    <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    <button id="userlist-toggle"><i class="fas fa-users"></i> 用户</button>
                    <button id="destroy-room" title="销毁房间记录" disabled><i class="fas fa-trash-alt"></i> 销毁</button>
                </div>
            </header>
            <main>
                <section id="chat">
                    <div style="text-align:center;color:#999;margin-top:50px">
                        <i class="fas fa-shield-alt fa-3x"></i><br><br>
                        请输入房间ID（及可选密码）进入聊天。<br>
                        设置密码后将开启端到端加密（E2EE）。
                    </div>
                </section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join"><i class="fas fa-user-plus"></i> 加入</button>
                <textarea id="message" placeholder="输入留言... (支持 Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i> 发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
