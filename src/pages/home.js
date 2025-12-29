export function generateChatPage() {
    const css = `
    /* 全局重置 */
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif; height: 100vh; overflow: hidden; background-color: #f0f2f5; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 顶部导航栏 */
    header { 
        background: #4CAF50; padding: 0 15px; height: 56px;
        display: flex; justify-content: space-between; align-items: center; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.15); z-index: 100; flex-shrink: 0;
    }
    
    header h1 { 
        margin: 0; font-size: 1.1rem; color: #fff; font-weight: 600; 
        display: flex; align-items: center; gap: 8px; white-space: nowrap; 
    }

    .controls { display: flex; align-items: center; gap: 8px; height: 100%; }
    #join-ui, #room-ui { display: flex; align-items: center; gap: 8px; height: 100%; }
    #room-ui { display: none; } 

    /* 倒计时容器 */
    #timer-wrapper {
        display: none;
        align-items: center;
        background: rgba(0,0,0,0.2);
        padding: 2px 4px 2px 10px;
        border-radius: 16px;
        margin-right: 8px;
        border: 1px solid rgba(255,255,255,0.3);
    }
    #cleanup-timer { 
        color: #fff176; font-weight: bold; font-size: 0.85rem; 
        margin-right: 6px; font-variant-numeric: tabular-nums; 
    }
    
    /* 停止按钮 */
    button#cancel-cleanup {
        background-color: #ff5252 !important;
        color: white !important;
        border: none !important;
        border-radius: 12px;
        height: 24px;
        padding: 0 8px;
        font-size: 0.75rem !important;
        line-height: 24px;
        min-width: auto;
    }
    button#cancel-cleanup:hover { background-color: #d32f2f !important; }

    /* 输入框 */
    input { 
        padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; 
        font-size: 0.9rem; outline: none; background: #fff; color: #333;
    }

    /* 按钮通用 */
    button {
        padding: 0 12px; height: 34px;
        border-radius: 4px; border: 1px solid #ccc;
        font-size: 0.9rem !important;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        white-space: nowrap;
        background-color: #fff;
        color: #333 !important;
        font-weight: 500;
    }
    button:hover { background-color: #f5f5f5; }

    /* 按钮颜色覆盖 */
    header button { opacity: 0.95; border: none; }
    button#destroy-room { background-color: #ffebee; color: #c62828 !important; }
    button#leave-room { background-color: #e3f2fd; color: #1565c0 !important; }
    button#join-room { background-color: #fff; color: #2e7d32 !important; }

    /* 状态徽章 */
    .e2ee-badge { 
        background: rgba(255,255,255,0.25); color: #fff; 
        font-size: 0.75rem; padding: 2px 6px; border-radius: 4px; 
        border: 1px solid rgba(255,255,255,0.5);
    }

    /* 主体布局 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; width: 100%; }
    #chat { 
        flex: 1; padding: 15px; overflow-y: auto; 
        display: flex; flex-direction: column; gap: 10px; 
        background: #f0f2f5;
        scroll-behavior: smooth;
    }
    #userlist { 
        width: 200px; background: #fff; border-left: 1px solid #ddd; 
        padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; 
    }
    #userlist.hidden { display: none; }
    
    /* 消息气泡 */
    .message { max-width: 85%; padding: 8px 12px; border-radius: 8px; word-wrap: break-word; line-height: 1.5; position: relative; }
    .message-left { align-self: flex-start; background: #fff; border: 1px solid #e5e5e5; }
    .message-right { align-self: flex-end; background: #dcf8c6; border: 1px solid #d4eac2; }
    .message-username { font-size: 0.75rem; color: #888; margin-bottom: 2px; display: block; }
    /* 正在发送状态 */
    .message-sending { opacity: 0.7; }
    .message-sending::after { content: ' (发送中...)'; font-size: 0.7em; color: #999; }

    /* 底部输入区 */
    footer { 
        background: #fff; padding: 10px 15px; border-top: 1px solid #ddd; 
        display: flex; gap: 10px; align-items: center; flex-shrink: 0; 
    }
    #message { flex: 1; height: 38px; padding: 8px 12px; border: 1px solid #ccc; border-radius: 4px; resize: none; outline: none; }
    #message:focus { border-color: #4CAF50; }
    
    /* 修复发送按钮样式 */
    #send { 
        background-color: #4CAF50 !important; 
        color: white !important; 
        border: none; 
        border-radius: 4px;
        padding: 0 20px;
        font-weight: bold;
    }
    #send:hover { background-color: #43a047 !important; }
    #send:disabled { background-color: #ccc !important; cursor: not-allowed; }

    /* 移动端适配 */
    @media (max-width: 768px) {
        header { flex-wrap: wrap; height: auto; padding: 8px 10px; gap: 8px; }
        .controls { width: 100%; justify-content: center; }
        #join-ui, #room-ui { width: 100%; justify-content: space-between; flex-wrap: wrap; }
        #timer-wrapper { order: -1; width: 100%; justify-content: center; margin-bottom: 5px; }
        footer { padding: 8px; }
        #username { width: 80px; }
    }
    `;

    const js = `
    const state = {
        roomId: '', roomKey: '', username: '',
        pollInterval: null, cleanupEnabled: true, lastActivity: Date.now()
    };
    
    const CONSTANTS = { POLL_RATE: 2000, CLEANUP_TIMEOUT: 30 * 60 * 1000 };

    if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

    // --- 加密模块 ---
    const Crypto = {
        async deriveKey(password) { 
            const enc = new TextEncoder();
            const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]); 
            return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode(state.roomId), iterations: 100000, hash: "SHA-256" }, baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); 
        },
        async encrypt(text, password) { 
            try {
                const key = await this.deriveKey(password); const iv = crypto.getRandomValues(new Uint8Array(12)); 
                const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)); 
                const comb = new Uint8Array(iv.length + enc.byteLength); comb.set(iv); comb.set(new Uint8Array(enc), iv.length); 
                return btoa(String.fromCharCode(...comb)); 
            } catch(e) { return text; }
        },
        async decrypt(b64, password) { 
            try { 
                const key = await this.deriveKey(password); const comb = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0))); 
                const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: comb.slice(0, 12) }, key, comb.slice(12)); 
                return new TextDecoder().decode(dec); 
            } catch (e) { return "🔒 [密文]"; } 
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        const ui = {
            joinUi: document.getElementById('join-ui'),
            roomUi: document.getElementById('room-ui'),
            roomIdInput: document.getElementById('room-id'),
            roomKeyInput: document.getElementById('room-key'),
            timerWrapper: document.getElementById('timer-wrapper'),
            timerText: document.getElementById('cleanup-timer'),
            cancelTimerBtn: document.getElementById('cancel-cleanup'),
            chatArea: document.getElementById('chat'),
            userListArea: document.getElementById('userlist'),
            msgInput: document.getElementById('message'),
            sendBtn: document.getElementById('send'),
            usernameInput: document.getElementById('username'),
            btnJoinRoom: document.getElementById('join-room'),
            btnJoinChat: document.getElementById('join'),
            btnLeave: document.getElementById('leave-room'),
            btnDestroy: document.getElementById('destroy-room'),
            btnUserList: document.getElementById('userlist-toggle'),
            currentRoomDisplay: document.getElementById('current-room-id')
        };

        function refreshTimer() {
            if (!state.roomId || !state.cleanupEnabled) {
                ui.timerWrapper.style.display = 'none';
                return;
            }
            const remaining = Math.max(0, CONSTANTS.CLEANUP_TIMEOUT - (Date.now() - state.lastActivity));
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            ui.timerText.innerText = remaining <= 0 ? "建议清理" : \`\${mins}:\${secs.toString().padStart(2, '0')} 后清理\`;
            ui.timerWrapper.style.display = 'flex';
        }
        setInterval(refreshTimer, 1000);

        function resetUI() {
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.roomId = ''; state.username = ''; state.roomKey = ''; state.cleanupEnabled = true;
            ui.roomUi.style.display = 'none';
            ui.joinUi.style.display = 'flex';
            ui.chatArea.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px"><i class="fas fa-shield-alt fa-3x"></i><br><br>请输入房间ID进入</div>';
            ui.userListArea.innerHTML = '';
            ui.msgInput.disabled = true; ui.msgInput.value = '';
            ui.sendBtn.disabled = true;
            ui.btnJoinChat.style.display = 'inline-flex';
            ui.usernameInput.disabled = false;
            ui.roomIdInput.value = ''; ui.roomKeyInput.value = '';
        }

        function showToast(msg) {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;z-index:9999;font-size:14px;';
            div.innerText = msg; document.body.appendChild(div);
            setTimeout(() => div.remove(), 2500);
        }

        // --- 核心修复：立即渲染消息 (Optimistic UI) ---
        function appendLocalMessage(text) {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const rendered = (typeof marked !== 'undefined') ? marked.parse(text) : text;
            
            // 创建临时消息 DOM
            const div = document.createElement('div');
            div.className = 'message message-right message-sending'; // 添加发送中状态
            div.innerHTML = \`<span class="message-username">\${state.username} \${time}</span><div>\${rendered}</div>\`;
            
            ui.chatArea.appendChild(div);
            ui.chatArea.scrollTop = ui.chatArea.scrollHeight;
        }

        // --- 事件绑定 ---

        ui.btnJoinRoom.onclick = () => {
            const id = ui.roomIdInput.value.trim();
            if (!id) return showToast('请输入房间ID');
            state.roomId = id;
            state.roomKey = ui.roomKeyInput.value.trim();
            state.lastActivity = Date.now();
            state.cleanupEnabled = true;
            ui.joinUi.style.display = 'none';
            ui.roomUi.style.display = 'flex';
            ui.currentRoomDisplay.innerHTML = \`<strong>#\${state.roomId}</strong> \${state.roomKey ? '<span class="e2ee-badge">密</span>' : ''}\`;
            refreshTimer();
            startPolling();
        };

        ui.btnJoinChat.onclick = async () => {
            const name = ui.usernameInput.value.trim();
            if (!name) return showToast('请输入称呼');
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/join\`, {
                    method: 'POST', body: JSON.stringify({ username: name }), headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) throw new Error('加入失败');
                state.username = name;
                ui.usernameInput.disabled = true;
                ui.btnJoinChat.style.display = 'none';
                ui.msgInput.disabled = false;
                ui.sendBtn.disabled = false;
                ui.msgInput.focus();
                showToast('已加入');
                pollMessages();
            } catch (e) { showToast(e.message); }
        };

        // 发送消息 - 修复延时问题
        ui.sendBtn.onclick = async () => {
            const rawText = ui.msgInput.value.trim();
            if (!rawText) return;

            // 1. 立即清空输入框
            ui.msgInput.value = '';

            // 2. 立即上屏 (本地显示)
            appendLocalMessage(rawText);

            // 3. 后台发送
            let payloadText = rawText;
            if (state.roomKey) payloadText = await Crypto.encrypt(rawText, state.roomKey);

            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/send\`, {
                    method: 'POST', body: JSON.stringify({ username: state.username, message: payloadText }), headers: { 'Content-Type': 'application/json' }
                });
                
                if (res.ok) {
                    state.lastActivity = Date.now();
                    refreshTimer();
                    // 发送成功后，立即拉取一次以确认同步，并消除“发送中”状态(由pollMessages重新渲染覆盖)
                    pollMessages(); 
                }
            } catch (e) { showToast('发送失败'); }
        };

        ui.btnDestroy.onclick = async () => {
            if (!confirm('确定永久销毁房间记录吗？')) return;
            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/destroy\`, { method: 'POST' });
                if (res.ok) { showToast('房间已销毁'); resetUI(); } else { showToast('销毁失败'); }
            } catch (e) { showToast('网络错误'); }
        };

        ui.btnLeave.onclick = () => { if (confirm('确定离开房间吗？')) resetUI(); };
        ui.cancelTimerBtn.onclick = () => { state.cleanupEnabled = false; refreshTimer(); showToast('已停止自动清理提示'); };
        ui.btnUserList.onclick = () => ui.userListArea.classList.toggle('hidden');

        function startPolling() {
            pollMessages();
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.pollInterval = setInterval(pollMessages, CONSTANTS.POLL_RATE);
        }

        async function pollMessages() {
            if (!state.roomId) return;
            try {
                let url = \`/api/room/\${encodeURIComponent(state.roomId)}/messages\`;
                if (state.username) url += \`?user=\${encodeURIComponent(state.username)}\`;
                const res = await fetch(url);
                if (!res.ok) return;
                const data = await res.json();
                
                if (data.messages.length > 0) {
                    const latest = Math.max(...data.messages.map(m => m.timestamp));
                    state.lastActivity = Math.max(state.lastActivity, latest);
                }
                renderData(data);
            } catch (e) {}
        }

        async function renderData(data) {
            ui.userListArea.innerHTML = '<h3>在线</h3>' + (data.users.map(u => \`<div><i class="fas fa-user"></i> \${u}</div>\`).join(''));
            
            const htmls = await Promise.all(data.messages.map(async m => {
                const type = m.username === state.username ? 'message-right' : 'message-left';
                let content = m.message;
                if (state.roomKey) content = await Crypto.decrypt(content, state.roomKey);
                const rendered = (typeof marked !== 'undefined') ? marked.parse(content) : content;
                const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return \`<div class="message \${type}">
                    <span class="message-username">\${m.username} \${time}</span>
                    <div>\${rendered}</div>
                </div>\`;
            }));
            
            // 只有当消息数量变化或处于底部时才更新，防止影响用户阅读历史
            const atBottom = ui.chatArea.scrollTop + ui.chatArea.clientHeight >= ui.chatArea.scrollHeight - 50;
            ui.chatArea.innerHTML = htmls.length ? htmls.join('') : '<div style="text-align:center;color:#999;margin-top:20px;">暂无消息</div>';
            if (atBottom) ui.chatArea.scrollTop = ui.chatArea.scrollHeight;
        }
    });
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
                        <input type="password" id="room-key" placeholder="密码 (可选)" style="width:100px">
                        <input type="text" id="room-id" placeholder="房间ID" style="width:80px">
                        <button id="join-room">进入</button>
                    </div>
                    <div id="room-ui">
                        <div id="timer-wrapper">
                            <span id="cleanup-timer"></span>
                            <button id="cancel-cleanup" title="停止倒计时">停止</button>
                        </div>
                        <span id="current-room-id"></span>
                        <button id="userlist-toggle" class="info"><i class="fas fa-users"></i> 用户</button>
                        <button id="leave-room" class="info"><i class="fas fa-sign-out-alt"></i> 离开</button>
                        <button id="destroy-room" class="danger"><i class="fas fa-trash-alt"></i> 销毁</button>
                    </div>
                </div>
            </header>
            <main>
                <section id="chat"></section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join" class="primary">加入聊天</button>
                <textarea id="message" placeholder="输入消息 (Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i> 发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
