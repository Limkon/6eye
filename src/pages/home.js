export function generateChatPage() {
    // 样式表：修正排版，增加 E2EE 标识和倒计时样式
    const css = `
    body { margin: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; transition: background-color 0.3s, color 0.3s; height: 100vh; overflow: hidden; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 头部排版：区分进入前和进入后的 UI */
    header { background: #4CAF50; color: white; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); z-index: 10; flex-shrink: 0; }
    header h1 { margin: 0; font-size: 1.4em; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
    header .controls { display: flex; align-items: center; gap: 8px; }
    
    #join-ui { display: flex; align-items: center; gap: 8px; }
    #room-ui { display: none; align-items: center; gap: 10px; }
    
    input[type="text"], input[type="password"], textarea { padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 0.9em; }
    button { 
        padding: 6px 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; 
        transition: 0.2s; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; font-size: 0.85em;
    }
    button:hover { background: #f0f0f0; }
    button#destroy-room { background-color: #dc3545; border-color: #dc3545; color: white; }
    
    /* 倒计时样式 */
    #timer-wrapper { display: none; align-items: center; background: rgba(0,0,0,0.15); padding: 4px 10px; border-radius: 20px; gap: 8px; font-size: 0.85em; }
    #cleanup-timer { color: #ffeb3b; font-weight: bold; }
    #cancel-cleanup { background: transparent; border: none; color: #fff; cursor: pointer; padding: 0; font-size: 1.1em; opacity: 0.8; }
    #cancel-cleanup:hover { opacity: 1; color: #ff5252; }

    .e2ee-badge { color: #ccff90; font-size: 0.7em; border: 1px solid #ccff90; padding: 1px 4px; border-radius: 3px; margin-left: 5px; }

    /* 主体布局 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; }
    #chat { flex: 3; padding: 15px; overflow-y: auto; background: #f9f9f9; display: flex; flex-direction: column; }
    #userlist { flex: 1; min-width: 180px; max-width: 250px; padding: 15px; border-left: 1px solid #ddd; overflow-y: auto; background: #fff; }
    #userlist.hidden { display: none; }
    
    /* Markdown 消息样式 */
    .message { margin: 10px 0; padding: 10px 15px; border-radius: 12px; max-width: 75%; word-wrap: break-word; line-height: 1.4; position: relative; }
    .message-left { align-self: flex-start; background: #e0f7fa; color: #333; border-bottom-left-radius: 0; }
    .message-right { align-self: flex-end; background: #c8e6c9; color: #333; border-bottom-right-radius: 0; }
    .message-username { font-size: 0.75em; color: #666; margin-bottom: 4px; font-weight: bold; }
    .message-content p { margin: 4px 0; }
    .message-content code { background: rgba(0,0,0,0.08); padding: 2px 4px; border-radius: 4px; font-family: monospace; }
    .message-content pre { background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; overflow-x: auto; margin: 8px 0; border: 1px solid rgba(0,0,0,0.1); }

    @media (max-width: 768px) {
        header { flex-direction: column; height: auto; padding: 10px; }
        header .controls { width: 100%; justify-content: center; margin-top: 8px; }
        #join-ui input { width: 40%; }
        #room-ui { flex-wrap: wrap; justify-content: center; }
    }
    `;

    const js = `
    let roomId = '', username = '', joined = false, pollInterval = null;
    let roomPassword = ''; 
    let cleanupEnabled = true; 
    const POLL_RATE = 2000;
    const CLEANUP_TIMEOUT = 30 * 60 * 1000; 
    let lastActivity = Date.now();

    if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

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
        combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
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
        } catch (e) { return "<i>[无法解密：密钥错误]</i>"; }
    }

    // 倒计时刷新
    function updateCleanupTimer() {
        const wrapper = document.getElementById('timer-wrapper');
        if (!cleanupEnabled || !roomId) { wrapper.style.display = 'none'; return; }
        
        const remaining = Math.max(0, CLEANUP_TIMEOUT - (Date.now() - lastActivity));
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        
        document.getElementById('cleanup-timer').innerText = remaining <= 0 ? "建议清理" : \`清理 \${mins}:\${secs.toString().padStart(2, '0')}\`;
        wrapper.style.display = 'flex';
    }
    setInterval(updateCleanupTimer, 1000);

    const els = {};
    document.addEventListener('DOMContentLoaded', () => {
        ['room-id', 'room-key', 'join-room', 'current-room-id', 'username', 'join', 'message', 'send', 'chat', 'userlist', 'destroy-room', 'userlist-toggle', 'cancel-cleanup', 'join-ui', 'room-ui'].forEach(id => {
            els[id] = document.getElementById(id);
        });

        els['cancel-cleanup'].onclick = () => {
            cleanupEnabled = false;
            showToast('已取消自动清理提示');
        };

        els['join-room'].onclick = () => {
            const id = els['room-id'].value.trim();
            if(!id) return showToast('请输入房间ID');
            roomId = id;
            roomPassword = els['room-key'].value.trim();
            
            els['join-ui'].style.display = 'none';
            els['room-ui'].style.display = 'flex';
            els['current-room-id'].innerHTML = \`<i class="fas fa-hashtag"></i> \${roomId} \${roomPassword ? '<span class="e2ee-badge">E2EE</span>' : ''}\`;
            
            lastActivity = Date.now();
            connect();
        };

        els['join'].onclick = async () => {
            const name = els['username'].value.trim();
            if(!name) return showToast('请输入称呼');
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/join\`, {
                    method: 'POST', body: JSON.stringify({username: name}), headers: {'Content-Type': 'application/json'}
                });
                if(!res.ok) throw new Error('加入失败');
                username = name; joined = true;
                els['username'].style.display = 'none';
                els['join'].style.display = 'none';
                els['message'].disabled = false;
                els['send'].disabled = false;
                els['message'].focus();
                showToast('已加入聊天');
                pollMessages();
            } catch(e) { showToast(e.message); }
        };

        els['send'].onclick = async () => {
            let text = els['message'].value.trim();
            if(!text) return;
            if (roomPassword) text = await e2eeEncrypt(text, roomPassword);
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(roomId)}/send\`, {
                    method: 'POST', body: JSON.stringify({username, message: text}), headers: {'Content-Type': 'application/json'}
                });
                if(res.ok) { els['message'].value = ''; lastActivity = Date.now(); pollMessages(); }
            } catch(e) { showToast('发送失败'); }
        };

        els['destroy-room'].onclick = async () => {
            if(confirm('警告：将永久删除该房间所有记录。确认？')) {
                await fetch(\`/api/room/\${encodeURIComponent(roomId)}/destroy\`, { method: 'POST' });
                location.reload();
            }
        };
        els['userlist-toggle'].onclick = () => els['userlist'].classList.toggle('hidden');
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
            const data = await res.json();
            if (data.messages.length > 0) lastActivity = Math.max(lastActivity, ...data.messages.map(m => m.timestamp));
            renderUsers(data.users);
            await renderMessages(data.messages);
        } catch(e) {}
    }

    function renderUsers(users) {
        els['userlist'].innerHTML = '<h3><i class="fas fa-users"></i> 在线</h3>' + (users.length ? users.map(u => \`<div style="padding:4px 0"><i class="fas fa-user-circle"></i> \${u}</div>\`).join('') : '无活跃用户');
    }

    async function renderMessages(msgs) {
        const chat = els['chat'];
        const atBottom = chat.scrollTop + chat.clientHeight >= chat.scrollHeight - 50;
        const htmls = await Promise.all(msgs.map(async m => {
            const type = m.username === username ? 'message-right' : 'message-left';
            let msg = m.message;
            if (roomPassword) msg = await e2eeDecrypt(msg, roomPassword);
            const htmlContent = (typeof marked !== 'undefined') ? marked.parse(msg) : msg;
            return \`<div class="message \${type}">
                <div class="message-username">\${m.username} <span style="font-weight:normal;color:#999">\${new Date(m.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>
                <div class="message-content">\${htmlContent}</div>
            </div>\`;
        }));
        chat.innerHTML = htmls.length ? htmls.join('') : '<div style="text-align:center;color:#999;margin-top:20px;">暂无消息</div>';
        if(atBottom) chat.scrollTop = chat.scrollHeight;
    }

    function showToast(m) { const d = document.createElement('div'); d.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;z-index:9999;'; d.innerText = m; document.body.appendChild(d); setTimeout(() => d.remove(), 2500); }
    `;

    return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>6eye Chat</title>
        <link rel="stylesheet" href="/src/vendor/fontawesome/css/all.min.css">
        <script src="/src/vendor/marked/marked.min.js"></script>
        <style>${css}</style>
    </head>
    <body>
        <div id="app">
            <header>
                <h1><i class="fas fa-eye"></i> MO留書</h1>
                <div class="controls">
                    <div id="join-ui">
                        <input type="password" id="room-key" placeholder="加密密码(可选)" style="width:100px">
                        <input type="text" id="room-id" placeholder="房间ID" style="width:90px">
                        <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    </div>
                    <div id="room-ui">
                        <div id="timer-wrapper">
                            <span id="cleanup-timer"></span>
                            <button id="cancel-cleanup" title="取消清理提示"><i class="fas fa-times-circle"></i></button>
                        </div>
                        <span id="current-room-id"></span>
                        <button id="userlist-toggle" title="在线用户"><i class="fas fa-users"></i></button>
                        <button id="destroy-room" title="销毁记录"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </header>
            <main>
                <section id="chat">
                    <div style="text-align:center;color:#999;margin-top:50px">
                        <i class="fas fa-shield-alt fa-3x"></i><br><br>
                        请输入房间ID进入聊天。<br>端到端加密已开启，服务器仅存储加密后的密文。
                    </div>
                </section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join">加入聊天</button>
                <textarea id="message" placeholder="留言... (支持Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i></button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
