export function generateChatPage() {
    const css = `
    /* 全局重置 */
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; height: 100vh; overflow: hidden; background-color: #f0f2f5; }
    #app { display: flex; flex-direction: column; height: 100%; }

    /* 顶部导航栏 */
    header { 
        background: #4CAF50; color: white; padding: 0 15px; height: 60px;
        display: flex; justify-content: space-between; align-items: center; 
        box-shadow: 0 2px 5px rgba(0,0,0,0.15); z-index: 100; flex-shrink: 0;
    }
    header h1 { margin: 0; font-size: 1.2rem; font-weight: 600; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
    
    /* 右侧控制区 */
    .controls { display: flex; align-items: center; gap: 10px; height: 100%; }

    /* 登录/房间 UI 容器 */
    #join-ui, #room-ui { display: flex; align-items: center; gap: 8px; height: 100%; }
    #room-ui { display: none; } /* 默认隐藏房间UI */

    /* 倒计时条 (高亮显示) */
    #timer-wrapper {
        display: none; /* 默认隐藏，JS控制显示 */
        align-items: center;
        background: rgba(0, 0, 0, 0.25);
        padding: 4px 12px;
        border-radius: 20px;
        gap: 8px;
        border: 1px solid rgba(255, 255, 255, 0.3);
        margin-right: 10px;
        animation: fadeIn 0.3s ease;
    }
    #cleanup-timer { color: #fff0b3; font-weight: 700; font-size: 0.85rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
    
    /* 取消按钮 */
    #cancel-cleanup {
        background: rgba(255, 255, 255, 0.2) !important;
        border: none !important;
        color: white !important;
        width: 20px; height: 20px;
        border-radius: 50%;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        padding: 0; margin: 0;
    }
    #cancel-cleanup:hover { background: #ff5252 !important; transform: scale(1.1); }

    /* 通用输入框 */
    input { 
        padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; 
        font-size: 0.9rem; outline: none; transition: border-color 0.2s;
    }
    input:focus { border-color: #4CAF50; }

    /* 通用按钮 */
    button {
        padding: 0 16px; height: 36px;
        background: #fff; color: #333;
        border: 1px solid #ddd; border-radius: 6px;
        font-size: 0.9rem; font-weight: 500;
        cursor: pointer; transition: all 0.2s;
        display: inline-flex; align-items: center; justify-content: center; gap: 6px;
        white-space: nowrap;
    }
    button:hover { background: #f5f5f5; border-color: #ccc; }
    button:active { transform: translateY(1px); }

    /* 特殊按钮 */
    #destroy-room { color: #d32f2f; border-color: #ffcdd2; background: #ffebee; }
    #destroy-room:hover { background: #ffcdd2; }
    #leave-room { color: #1976d2; border-color: #bbdefb; background: #e3f2fd; }
    #leave-room:hover { background: #bbdefb; }
    #join-room, #join { background: #2e7d32; color: white; border: none; }
    #join-room:hover, #join:hover { background: #1b5e20; }

    /* 状态徽章 */
    .e2ee-badge { 
        background: rgba(255,255,255,0.2); color: #fff; 
        font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; 
        border: 1px solid rgba(255,255,255,0.4);
    }

    /* 主体布局 */
    main { flex: 1; display: flex; overflow: hidden; position: relative; width: 100%; }
    
    #chat { 
        flex: 1; padding: 20px; overflow-y: auto; 
        display: flex; flex-direction: column; gap: 15px;
        scroll-behavior: smooth;
    }
    
    #userlist { 
        width: 220px; background: #fff; border-left: 1px solid #e0e0e0;
        padding: 15px; overflow-y: auto; flex-shrink: 0;
        display: flex; flex-direction: column; gap: 10px;
    }
    #userlist.hidden { display: none; }
    #userlist h3 { margin: 0 0 10px 0; font-size: 1rem; color: #555; border-bottom: 2px solid #eee; padding-bottom: 8px; }

    /* 消息气泡 */
    .message { 
        max-width: 85%; padding: 10px 14px; border-radius: 12px; 
        position: relative; word-wrap: break-word; line-height: 1.5;
        box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    .message-left { align-self: flex-start; background: #fff; border-top-left-radius: 2px; }
    .message-right { align-self: flex-end; background: #dcf8c6; border-top-right-radius: 2px; }
    .message-username { font-size: 0.75rem; color: #999; margin-bottom: 4px; display: block; }
    
    /* 底部输入区 */
    footer { 
        background: #fff; padding: 15px; border-top: 1px solid #e0e0e0;
        display: flex; align-items: center; gap: 10px;
    }
    #message { flex: 1; height: 40px; padding: 8px 12px; resize: none; border-radius: 20px; border: 1px solid #ddd; }
    #message:focus { border-color: #4CAF50; }
    #send { border-radius: 20px; padding: 0 24px; background: #4CAF50; color: white; border: none; }
    #send:hover { background: #43a047; }
    #send:disabled { background: #ccc; cursor: not-allowed; }

    /* 移动端适配 */
    @media (max-width: 768px) {
        header { flex-wrap: wrap; height: auto; padding: 10px; gap: 10px; }
        header h1 { width: 100%; justify-content: center; }
        .controls { width: 100%; justify-content: center; }
        #join-ui, #room-ui { width: 100%; justify-content: center; flex-wrap: wrap; }
        
        #timer-wrapper { order: -1; width: 100%; justify-content: center; margin: 0 0 10px 0; }
        
        #userlist { position: absolute; right: 0; top: 0; bottom: 0; z-index: 50; box-shadow: -5px 0 15px rgba(0,0,0,0.1); }
        
        footer { padding: 10px; }
        #username { width: 30%; }
        #join { width: 25%; padding: 0 5px; }
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    `;

    const js = `
    // --- 全局状态管理 ---
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

    // Markdown 配置
    if (typeof marked !== 'undefined') { marked.setOptions({ breaks: true, gfm: true }); }

    // --- 加密模块 (Web Crypto API) ---
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
            } catch(e) { console.error(e); return text; }
        },
        async decrypt(b64, password) { 
            try { 
                const key = await this.deriveKey(password); 
                const comb = new Uint8Array(atob(b64).split("").map(c => c.charCodeAt(0))); 
                const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv: comb.slice(0, 12) }, key, comb.slice(12)); 
                return new TextDecoder().decode(dec); 
            } catch (e) { return "🔒 <i>[无法解密消息]</i>"; } 
        }
    };

    // --- 主逻辑 ---
    document.addEventListener('DOMContentLoaded', () => {
        // UI 元素引用
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

        // 1. 刷新倒计时显示
        function refreshTimer() {
            // 如果不在房间或开关关闭，强制隐藏
            if (!state.roomId || !state.cleanupEnabled) {
                ui.timerWrapper.style.display = 'none';
                return;
            }

            const remaining = Math.max(0, CONSTANTS.CLEANUP_TIMEOUT - (Date.now() - state.lastActivity));
            const mins = Math.floor(remaining / 60000);
            const secs = Math.floor((remaining % 60000) / 1000);

            ui.timerText.innerText = remaining <= 0 ? "建议清理" : \`清理倒数 \${mins}:\${secs.toString().padStart(2, '0')}\`;
            ui.timerWrapper.style.display = 'flex'; // 强制显示
        }
        
        // 启动全局定时器
        setInterval(refreshTimer, 1000);

        // 2. 重置界面 (完全清理状态)
        function resetUI() {
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.roomId = '';
            state.username = '';
            state.roomKey = '';
            state.cleanupEnabled = true;

            // 切换视图
            ui.roomUi.style.display = 'none';
            ui.joinUi.style.display = 'flex';
            
            // 清空内容
            ui.chatArea.innerHTML = \`<div style="text-align:center;color:#999;margin-top:50px"><i class="fas fa-shield-alt fa-3x"></i><br><br>请输入房间ID进入。<br>支持端到端加密与Markdown。</div>\`;
            ui.userListArea.innerHTML = '';
            
            // 重置输入控件
            ui.msgInput.disabled = true; ui.msgInput.value = '';
            ui.sendBtn.disabled = true;
            ui.joinBtn.style.display = 'inline-block';
            ui.usernameInput.disabled = false;
            ui.roomIdInput.value = ''; 
            ui.roomKeyInput.value = '';
        }

        // 3. 通用 Toast 提示
        function showToast(msg, isError = false) {
            const div = document.createElement('div');
            div.style.cssText = \`position:fixed;top:20px;left:50%;transform:translateX(-50%);background:\${isError ? '#d32f2f' : 'rgba(0,0,0,0.8)'};color:#fff;padding:10px 20px;border-radius:20px;z-index:9999;font-size:14px;box-shadow:0 4px 10px rgba(0,0,0,0.2);\`;
            div.innerText = msg;
            document.body.appendChild(div);
            setTimeout(() => div.remove(), 3000);
        }

        // --- 事件绑定 ---

        // [进入房间]
        ui.btnJoinRoom.onclick = () => {
            const id = ui.roomIdInput.value.trim();
            if (!id) return showToast('请输入房间ID', true);

            state.roomId = id;
            state.roomKey = ui.roomKeyInput.value.trim();
            state.lastActivity = Date.now();
            state.cleanupEnabled = true; // 重置倒计时开关

            // 切换 UI
            ui.joinUi.style.display = 'none';
            ui.roomUi.style.display = 'flex';
            ui.currentRoomDisplay.innerHTML = \`<strong>#\${state.roomId}</strong> \${state.roomKey ? '<span class="e2ee-badge">E2EE</span>' : ''}\`;

            refreshTimer(); // 立即触发一次显示
            startPolling();
        };

        // [加入聊天]
        ui.joinBtn.onclick = async () => {
            const name = ui.usernameInput.value.trim();
            if (!name) return showToast('请输入您的称呼', true);

            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/join\`, {
                    method: 'POST', 
                    body: JSON.stringify({ username: name }), 
                    headers: { 'Content-Type': 'application/json' }
                });
                
                if (!res.ok) throw new Error((await res.json()).error || '加入失败');

                state.username = name;
                ui.usernameInput.disabled = true;
                ui.joinBtn.style.display = 'none';
                ui.msgInput.disabled = false;
                ui.sendBtn.disabled = false;
                ui.msgInput.focus();

                showToast('已加入聊天');
                pollMessages(); // 立即刷新
            } catch (e) { showToast(e.message, true); }
        };

        // [发送消息]
        ui.sendBtn.onclick = async () => {
            let text = ui.msgInput.value.trim();
            if (!text) return;

            if (state.roomKey) text = await Crypto.encrypt(text, state.roomKey);

            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/send\`, {
                    method: 'POST',
                    body: JSON.stringify({ username: state.username, message: text }),
                    headers: { 'Content-Type': 'application/json' }
                });
                if (res.ok) {
                    ui.msgInput.value = '';
                    state.lastActivity = Date.now();
                    refreshTimer();
                    pollMessages();
                } else { throw new Error('发送失败'); }
            } catch (e) { showToast('发送失败，请重试', true); }
        };

        // [销毁房间] - 核心修复：销毁后再重置 UI
        ui.btnDestroy.onclick = async () => {
            if (!confirm('⚠️ 严重警告：\n确定要永久销毁当前房间的所有记录吗？\n此操作不可恢复！')) return;

            try {
                const res = await fetch(\`/api/room/\${encodeURIComponent(state.roomId)}/destroy\`, { method: 'POST' });
                if (!res.ok) throw new Error('销毁请求失败');
                
                showToast('房间记录已销毁');
                resetUI(); // 成功后才退出，避免误判
            } catch (e) {
                showToast('销毁失败: ' + e.message, true);
            }
        };

        // [离开房间]
        ui.btnLeave.onclick = () => {
            if (confirm('确定离开房间吗？本地视图将被清空。')) {
                resetUI();
                showToast('已安全退出');
            }
        };

        // [取消倒计时]
        ui.cancelTimerBtn.onclick = () => {
            state.cleanupEnabled = false;
            refreshTimer(); // 立即更新 UI
            showToast('自动清理提示已关闭');
        };

        // [显示用户列表]
        ui.btnUserList.onclick = () => ui.userListArea.classList.toggle('hidden');

        // --- 轮询逻辑 ---
        function startPolling() {
            pollMessages();
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.pollInterval = setInterval(pollMessages, CONSTANTS.POLL_RATE);
        }

        async function pollMessages() {
            if (!state.roomId) return;
            try {
                // 如果已加入，带上用户名以维持心跳
                let url = \`/api/room/\${encodeURIComponent(state.roomId)}/messages\`;
                if (state.username) url += \`?user=\${encodeURIComponent(state.username)}\`;

                const res = await fetch(url);
                if (!res.ok) return; // 静默失败

                const data = await res.json();
                
                // 更新活跃时间
                if (data.messages.length > 0) {
                    const latest = Math.max(...data.messages.map(m => m.timestamp));
                    state.lastActivity = Math.max(state.lastActivity, latest);
                }

                renderUsers(data.users);
                renderMessages(data.messages);
            } catch (e) { console.error('Poll error', e); }
        }

        function renderUsers(users) {
            ui.userListArea.innerHTML = '<h3>在线用户</h3>' + 
                (users.length ? users.map(u => \`<div><i class="fas fa-user-circle"></i> \${u}</div>\`).join('') : '<div style="color:#999">暂无活跃用户</div>');
        }

        async function renderMessages(msgs) {
            const htmls = await Promise.all(msgs.map(async m => {
                const isMe = m.username === state.username;
                const type = isMe ? 'message-right' : 'message-left';
                
                let content = m.message;
                if (state.roomKey) content = await Crypto.decrypt(content, state.roomKey);
                
                const rendered = (typeof marked !== 'undefined') ? marked.parse(content) : content;
                const time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return \`<div class="message \${type}">
                    <span class="message-username">\${m.username} &nbsp;\${time}</span>
                    <div>\${rendered}</div>
                </div>\`;
            }));

            // 智能滚动：只有在底部时才自动滚动
            const atBottom = ui.chatArea.scrollTop + ui.chatArea.clientHeight >= ui.chatArea.scrollHeight - 50;
            ui.chatArea.innerHTML = htmls.length ? htmls.join('') : '<div style="text-align:center;color:#999;margin-top:20px;">暂无消息</div>';
            if (atBottom || msgs.length === 1) ui.chatArea.scrollTop = ui.chatArea.scrollHeight;
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
                        <input type="password" id="room-key" placeholder="访问密码 (可选)" style="width:110px">
                        <input type="text" id="room-id" placeholder="房间ID" style="width:90px">
                        <button id="join-room"><i class="fas fa-sign-in-alt"></i> 进入</button>
                    </div>
                    
                    <div id="room-ui">
                        <div id="timer-wrapper">
                            <span id="cleanup-timer"></span>
                            <button id="cancel-cleanup" title="取消倒计时">✕</button>
                        </div>
                        
                        <span id="current-room-id"></span>
                        
                        <button id="userlist-toggle" title="显隐用户列表"><i class="fas fa-users"></i> 用户</button>
                        <button id="leave-room" title="退出当前房间"><i class="fas fa-sign-out-alt"></i> 离开</button>
                        <button id="destroy-room" title="永久销毁记录"><i class="fas fa-trash-alt"></i> 销毁</button>
                    </div>
                </div>
            </header>
            
            <main>
                <section id="chat">
                    <div style="text-align:center;color:#999;margin-top:50px">
                        <i class="fas fa-shield-alt fa-3x"></i><br><br>
                        请输入房间ID进入。<br>支持端到端加密与Markdown。
                    </div>
                </section>
                <section id="userlist" class="hidden"></section>
            </main>
            
            <footer>
                <input type="text" id="username" placeholder="您的称呼">
                <button id="join"><i class="fas fa-user-plus"></i> 加入聊天</button>
                <textarea id="message" placeholder="输入消息 (Markdown)" disabled></textarea>
                <button id="send" disabled><i class="fas fa-paper-plane"></i> 发送</button>
            </footer>
        </div>
        <script>${js}</script>
    </body>
    </html>
    `;
}
