export function generateChatPage() {
    // 1. CSS 样式：增强可见性，修复布局
    const css = `
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; height: 100vh; overflow: hidden; background-color: #f0f2f5; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 顶部导航 */
    header { 
        background: #4CAF50; color: white; padding: 0 15px; height: 50px;
        display: flex; justify-content: space-between; align-items: center; 
        box-shadow: 0 2px 5px rgba(0,0,0,0.15); z-index: 100; flex-shrink: 0;
    }
    header h1 { margin: 0; font-size: 1.1rem; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
    
    /* 右侧控制区 */
    .controls { display: flex; align-items: center; gap: 10px; height: 100%; }
    
    /* 两个状态面板 */
    #join-ui, #room-ui { display: flex; align-items: center; gap: 8px; height: 100%; }
    #room-ui { display: none; } /* 默认隐藏 */

    /* 倒计时容器 (强制可见性) */
    #timer-wrapper {
        display: none; /* JS 控制显示 */
        align-items: center;
        background: rgba(0, 0, 0, 0.3);
        padding: 2px 8px;
        border-radius: 15px;
        gap: 6px;
        margin-right: 10px;
        border: 1px solid rgba(255,255,255,0.3);
    }
    #cleanup-timer { color: #fff0b3; font-weight: bold; font-size: 0.8rem; white-space: nowrap; }
    
    /* 取消按钮 (高亮修正) */
    #cancel-cleanup {
        background: rgba(255,255,255,0.2) !important;
        border: 1px solid rgba(255,255,255,0.5) !important;
        color: white !important;
        width: 18px; height: 18px;
        border-radius: 50%;
        font-size: 10px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; margin: 0;
        line-height: 1;
    }
    #cancel-cleanup:hover { background: #ff5252 !important; border-color: #ff5252 !important; }

    /* 输入框与按钮 */
    input { padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9rem; outline: none; }
    button {
        padding: 0 12px; height: 32px;
        background: #fff; color: #333;
        border: 1px solid #ddd; border-radius: 4px;
        font-size: 0.85rem; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 5px;
        white-space: nowrap;
    }
    button:hover { background: #f5f5f5; }
    
    /* 特殊按钮 */
    #destroy-room { color: #d32f2f; border-color: #ffcdd2; background: #ffebee; }
    #destroy-room:hover { background: #ffcdd2; }
    #leave-room { color: #1976d2; border-color: #bbdefb; background: #e3f2fd; }
    #join-room { background: #2e7d32; color: white; border: none; }
    #join-room:hover { background: #1b5e20; }

    /* 主体布局 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; width: 100%; }
    #chat { flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
    #userlist { width: 200px; background: #fff; border-left: 1px solid #ddd; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; }
    #userlist.hidden { display: none; }
    
    /* 消息气泡 */
    .message { max-width: 85%; padding: 8px 12px; border-radius: 8px; word-wrap: break-word; line-height: 1.5; position: relative; }
    .message-left { align-self: flex-start; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .message-right { align-self: flex-end; background: #dcf8c6; box-shadow: 0 1px 2px rgba(0,0,0,0.1); }
    .message-username { font-size: 0.75rem; color: #999; margin-bottom: 2px; display: block; }

    /* 底部 */
    footer { background: #fff; padding: 10px; border-top: 1px solid #ddd; display: flex; gap: 10px; flex-shrink: 0; }
    #message { flex: 1; height: 36px; padding: 8px; border: 1px solid #ddd; border-radius: 18px; resize: none; }
    #send { background: #4CAF50; color: white; border: none; border-radius: 18px; padding: 0 20px; }
    #send:disabled { background: #ccc; }

    /* 移动端 */
    @media (max-width: 768px) {
        header { flex-wrap: wrap; height: auto; padding: 8px; }
        .controls { width: 100%; justify-content: center; margin-top: 5px; }
        #timer-wrapper { position: absolute; top: 55px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.6); z-index: 90; }
        #join-ui, #room-ui { width: 100%; justify-content: center; flex-wrap: wrap; }
        footer #username { width: 30%; }
    }
    `;

    // 2. JS 逻辑：使用更安全的字符串拼接，避免反引号嵌套错误
    const js = `
    // 状态管理
    const state = {
        roomId: '',
        roomKey: '',
        username: '',
        pollInterval: null,
        cleanupEnabled: true,
        lastActivity: Date.now()
    };
    
    const CONSTANTS = {
        POLL_RATE: 2000,
        CLEANUP_TIMEOUT: 30 * 60 * 1000 // 30分钟
    };

    if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

    // 加密模块
    const Crypto = {
        async deriveKey(password) { 
            const enc = new TextEncoder();
            const baseKey = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]); 
            return crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: enc.encode(state.roomId), iterations: 100000, hash: "SHA-256" }, 
                baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
            ); 
        },
        async encrypt(text, password) { 
            try {
                const key = await this.deriveKey(password); 
                const iv = crypto.getRandomValues(new Uint8Array(12)); 
                const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)); 
                const comb = new Uint8Array(iv.length + enc.byteLength); 
                comb.set(iv); comb.set(new Uint8Array(enc), iv.length); 
                return btoa(String.fromCharCode(...comb)); 
            } catch(e) { return text; }
        },
        async decrypt(b64, password) { 
            try { 
                const key = await this.deriveKey(password); 
                const comb = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0))); 
                const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: comb.slice(0, 12) }, key, comb.slice(12)); 
                return new TextDecoder().decode(dec); 
            } catch (e) { return "🔒 [密文]"; } 
        }
    };

    // 主逻辑
    document.addEventListener('DOMContentLoaded', () => {
        // UI 引用
        const ui = {
            joinUi: document.getElementById('join-ui'),
            roomUi: document.getElementById('room-ui'),
            roomIdInput: document.getElementById('room-id'),
            roomKeyInput: document.getElementById('room-key'),
            currentRoomDisplay: document.getElementById('current-room-id'),
            timerWrapper: document.getElementById('timer-wrapper'),
            timerText: document.getElementById('cleanup-timer'),
            cancelTimerBtn: document.getElementById('cancel-cleanup'),
            chatArea: document.getElementById('chat'),
            userListArea: document.getElementById('userlist'),
            msgInput: document.getElementById('message'),
            sendBtn: document.getElementById('send'),
            joinBtn: document.getElementById('join'),
            usernameInput: document.getElementById('username'),
            btnJoinRoom: document.getElementById('join-room'),
            btnLeave: document.getElementById('leave-room'),
            btnDestroy: document.getElementById('destroy-room'),
            btnUserList: document.getElementById('userlist-toggle')
        };

        // 刷新倒计时
        function refreshTimer() {
            if (!state.roomId || !state.cleanupEnabled) {
                ui.timerWrapper.style.display = 'none';
                return;
            }
            const remaining = Math.max(0, CONSTANTS.CLEANUP_TIMEOUT - (Date.now() - state.lastActivity));
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);
            ui.timerText.innerText = remaining <= 0 ? "建议清理" : "清理 " + mins + ":" + secs.toString().padStart(2, '0');
            ui.timerWrapper.style.display = 'flex';
        }
        setInterval(refreshTimer, 1000);

        // 重置界面 (返回主页)
        function resetUI() {
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.roomId = ''; state.username = ''; state.roomKey = ''; state.cleanupEnabled = true;

            ui.roomUi.style.display = 'none';
            ui.joinUi.style.display = 'flex';
            
            ui.chatArea.innerHTML = '<div style="text-align:center;color:#999;margin-top:50px">请输入房间ID进入</div>';
            ui.userListArea.innerHTML = '';
            
            ui.msgInput.disabled = true; ui.msgInput.value = '';
            ui.sendBtn.disabled = true;
            ui.joinBtn.style.display = 'inline-block';
            ui.usernameInput.disabled = false;
            ui.roomIdInput.value = ''; 
            ui.roomKeyInput.value = '';
        }

        function showToast(msg) {
            const div = document.createElement('div');
            div.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);color:#fff;padding:8px 16px;border-radius:4px;z-index:9999;font-size:14px;';
            div.innerText = msg; document.body.appendChild(div);
            setTimeout(() => div.remove(), 2500);
        }

        // --- 事件绑定 ---

        // 1. 进入房间
        ui.btnJoinRoom.onclick = () => {
            const id = ui.roomIdInput.value.trim();
            if (!id) return showToast('请输入房间ID');

            state.roomId = id;
            state.roomKey = ui.roomKeyInput.value.trim();
            state.lastActivity = Date.now();
            state.cleanupEnabled = true;

            ui.joinUi.style.display = 'none';
            ui.roomUi.style.display = 'flex';
            
            // 安全的 HTML 插入，避免反引号错误
            ui.currentRoomDisplay.innerHTML = '<strong>#' + state.roomId + '</strong> ' + (state.roomKey ? '<span class="e2ee-badge">密</span>' : '');

            refreshTimer(); // 立即显示
            startPolling();
        };

        // 2. 加入聊天
        ui.joinBtn.onclick = async () => {
            const name = ui.usernameInput.value.trim();
            if (!name) return showToast('请输入称呼');
            try {
                const res = await fetch('/api/room/' + encodeURIComponent(state.roomId) + '/join', {
                    method: 'POST', body: JSON.stringify({ username: name }), headers: { 'Content-Type': 'application/json' }
                });
                if (!res.ok) throw new Error('加入失败');

                state.username = name;
                ui.usernameInput.disabled = true;
                ui.joinBtn.style.display = 'none';
                ui.msgInput.disabled = false;
                ui.sendBtn.disabled = false;
                ui.msgInput.focus();
                showToast('已加入');
                pollMessages();
            } catch (e) { showToast(e.message); }
        };

        // 3. 发送消息
        ui.sendBtn.onclick = async () => {
            let text = ui.msgInput.value.trim();
            if (!text) return;
            if (state.roomKey) text = await Crypto.encrypt(text, state.roomKey);
            try {
                const res = await fetch('/api/room/' + encodeURIComponent(state.roomId) + '/send', {
                    method: 'POST', body: JSON.stringify({ username: state.username, message: text }), headers: { 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    ui.msgInput.value = '';
                    state.lastActivity = Date.now();
                    refreshTimer();
                    pollMessages();
                }
            } catch (e) { showToast('发送失败'); }
        };

        // 4. 销毁房间 (修复 Too Fast 问题：销毁后重置 UI 而不刷新页面)
        ui.btnDestroy.onclick = async () => {
            if (!confirm('确定销毁？记录不可恢复。')) return;
            try {
                const res = await fetch('/api/room/' + encodeURIComponent(state.roomId) + '/destroy', { method: 'POST' });
                if (res.ok) {
                    showToast('房间已销毁');
                    resetUI(); // 返回首页
                } else {
                    showToast('销毁失败');
                }
            } catch (e) { showToast('网络错误'); }
        };

        // 5. 离开房间
        ui.btnLeave.onclick = () => {
            if (confirm('确定离开？')) resetUI();
        };

        // 6. 取消倒计时
        ui.cancelTimerBtn.onclick = () => {
            state.cleanupEnabled = false;
            ui.timerWrapper.style.display = 'none';
            showToast('已取消自动清理提示');
        };

        ui.btnUserList.onclick = () => ui.userListArea.classList.toggle('hidden');

        // 轮询
        function startPolling() {
            pollMessages();
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.pollInterval = setInterval(pollMessages, CONSTANTS.POLL_RATE);
        }

        async function pollMessages() {
            if (!state.roomId) return;
            try {
                let url = '/api/room/' + encodeURIComponent(state.roomId) + '/messages';
                if (state.username) url += '?user=' + encodeURIComponent(state.username);
                
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
            // 用户列表
            ui.userListArea.innerHTML = '<h3>在线</h3>' + (data.users.map(u => '<div><i class="fas fa-user"></i> ' + u + '</div>').join(''));
            
            // 消息列表
            const htmls = await Promise.all(data.messages.map(async m => {
                const type = m.username === state.username ? 'message-right' : 'message-left';
                let content = m.message;
                if (state.roomKey) content = await Crypto.decrypt(content, state.roomKey);
                const rendered = (typeof marked !== 'undefined') ? marked.parse(content) : content;
                const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return '<div class="message ' + type + '"><span class="message-username">' + m.username + ' ' + time + '</span><div>' + rendered + '</div></div>';
            }));
            
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
                        <input type="password" id="room-key" placeholder="密码(可选)" style="width:100px">
                        <input type="text" id="room-id" placeholder="房间ID" style="width:80px">
                        <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    </div>
                    <div id="room-ui">
                        <div id="timer-wrapper">
                            <span id="cleanup-timer"></span>
                            <button id="cancel-cleanup" title="取消提示">❌</button>
                        </div>
                        <span id="current-room-id"></span>
                        <button id="userlist-toggle" title="列表"><i class="fas fa-users"></i></button>
                        <button id="leave-room" title="离开"><i class="fas fa-sign-out-alt"></i></button>
                        <button id="destroy-room" title="销毁"><i class="fas fa-trash-alt"></i></button>
                    </div>
                </div>
            </header>
            <main>
                <section id="chat"></section>
                <section id="userlist" class="hidden"></section>
            </main>
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join">加入</button>
                <textarea id="message" placeholder="消息 (Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i></button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
