let ws;
let username = '';
let joined = false;
let roomId = '';
let roomLocked = false;

function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    ws = new WebSocket(`wss://${location.host}/${roomId}`);
    ws.onopen = () => {
        document.getElementById('destroy-room').disabled = false;
        // 如果是重连后，重新发送加入消息
        if (joined && username) {
            ws.send(JSON.stringify({ type: 'join', username }));
        }
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            // 仅在 joined 状态下处理消息，防止掉线后重新填充
            if (!joined && data.type !== 'joinSuccess' && data.type !== 'joinError') {
                console.log('忽略掉线状态下的消息:', data.type);
                return;
            }
            switch (data.type) {
                case 'userList':
                    updateUserList(data.users);
                    break;
                case 'message':
                    addMessage(data.username, data.message);
                    break;
                case 'history':
                    data.messages.forEach(msg => addMessage(msg.username, msg.message));
                    break;
                case 'joinSuccess':
                    joined = true;
                    document.getElementById('message').disabled = false;
                    document.getElementById('send').disabled = false;
                    document.getElementById('username-label').style.display = 'none';
                    document.getElementById('username').style.display = 'none';
                    document.getElementById('join').style.display = 'none';
                    break;
                case 'joinError':
                    alert(data.message || '用户名已存在，请重新输入');
                    joined = false;
                    username = '';
                    document.getElementById('username').value = '';
                    document.getElementById('username-label').style.display = 'block';
                    document.getElementById('username').style.display = 'block';
                    document.getElementById('join').style.display = 'block';
                    document.getElementById('message').disabled = true;
                    document.getElementById('send').disabled = true;
                    break;
                case 'roomDestroyed':
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    alert(data.message);
                    resetRoom();
                    ws.close();
                    break;
                case 'inactive':
                    alert(data.message);
                    resetRoom();
                    ws.close();
                    break;
            }
        } catch (error) {
            console.error('消息解析失败:', error);
        }
    };
    ws.onclose = (event) => {
        // 记录关闭时的状态
        const wasJoined = joined;
        const wasUsername = username;
        const wasRoomId = roomId;

        // 调试日志
        console.log('WebSocket 关闭，code:', event.code, 'reason:', event.reason);

        // 尝试在1秒内重连
        const reconnectTimeout = setTimeout(() => {
            if (wasJoined && wasRoomId) {
                console.log('尝试重连...');
                connect(); // 触发重连
            }
        }, 1000);

        // 检查1秒后是否重连成功
        setTimeout(() => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.log('重连失败，执行清理逻辑');
                // 确保清理聊天记录和用户列表
                const chatElement = document.getElementById('chat');
                if (chatElement) {
                    chatElement.innerHTML = '';
                    // 强制触发 DOM 更新
                    chatElement.dispatchEvent(new Event('DOMSubtreeModified'));
                    console.log('聊天记录已清空，child count:', chatElement.childElementCount);
                } else {
                    console.error('未找到 chat 元素');
                }
                updateUserList([]);
                console.log('用户列表已清空');

                // 重置状态
                joined = false;
                username = '';
                document.getElementById('message').disabled = true;
                document.getElementById('send').disabled = true;
                document.getElementById('username-label').style.display = 'block';
                document.getElementById('username').style.display = 'block';
                document.getElementById('join').style.display = 'block';
                document.getElementById('destroy-room').disabled = true;

                // 提示用户
                if (event.code !== 1000 || (event.reason !== 'Inactive' && event.reason !== 'RoomDestroyed')) {
                    alert('连接断开，请重新加入');
                    resetRoom();
                }
            } else {
                console.log('重连成功，无需清理');
            }
            // 清除重连定时器
            clearTimeout(reconnectTimeout);
        }, 1000);
    };
}

function resetRoom() {
    roomId = '';
    roomLocked = false;
    document.getElementById('room-id').value = '';
    document.getElementById('current-room-id').textContent = '';
}

document.addEventListener('DOMContentLoaded', () => {
    const joinRoomButton = document.getElementById('join-room');
    const handleJoinRoom = () => {
        if (roomLocked) {
            alert('您已在房间中，请退出后重新进入其他房间');
            return;
        }
        const input = document.getElementById('room-id');
        const id = input.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        roomLocked = true;
        document.getElementById('current-room-id').textContent = `当前房间: ${roomId}`;
        input.value = '';
        connect();
    };
    joinRoomButton.addEventListener('click', handleJoinRoom);
    joinRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJoinRoom();
    });

    const joinButton = document.getElementById('join');
    const handleJoin = () => {
        const input = document.getElementById('username');
        const name = input.value.trim();
        if (!name) {
            alert('请输入用户名');
            return;
        }
        if (joined) {
            alert('已加入聊天室');
            return;
        }
        if (!roomId) {
            alert('请先进入一个房间');
            return;
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            connect();
        }
        username = name;
        ws.send(JSON.stringify({ type: 'join', username }));
    };
    joinButton.addEventListener('click', handleJoin);
    joinButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleJoin();
    });

    const sendButton = document.getElementById('send');
    const handleSend = () => {
        const input = document.getElementById('message');
        const msg = input.value.trim();
        if (!msg) return;
        ws.send(JSON.stringify({ type: 'message', message: msg }));
        input.value = '';
    };
    sendButton.addEventListener('click', handleSend);
    sendButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleSend();
    });

    document.getElementById('message').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    const themeToggleButton = document.getElementById('theme-toggle');
    const handleThemeToggle = () => {
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode');
    };
    themeToggleButton.addEventListener('click', handleThemeToggle);
    themeToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleThemeToggle();
    });

    const userlistToggleButton = document.getElementById('userlist-toggle');
    const handleUserlistToggle = () => {
        document.getElementById('userlist').classList.toggle('hidden');
    };
    userlistToggleButton.addEventListener('click', handleUserlistToggle);
    userlistToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleUserlistToggle();
    });

    const destroyRoomButton = document.getElementById('destroy-room');
    const handleDestroyRoom = () => {
        if (destroyRoomButton.disabled) return;
        if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
            ws.send(JSON.stringify({ type: 'destroy' }));
        }
    };
    destroyRoomButton.addEventListener('click', handleDestroyRoom);
    destroyRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleDestroyRoom();
    });
});

function addMessage(user, message) {
    const chat = document.getElementById('chat');
    const div = document.createElement('div');
    div.className = user === username ? 'message-right' : 'message-left';
    div.textContent = `${user}: ${message}`;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function updateUserList(users) {
    const list = document.getElementById('userlist');
    list.innerHTML = '<h3>当前在线用户：</h3>';
    users.filter(user => user).forEach(user => {
        const div = document.createElement('div');
        div.textContent = user;
        list.appendChild(div);
    });
}
