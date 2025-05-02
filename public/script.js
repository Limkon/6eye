let ws;
let username = '';
let joined = false;
let roomId = '';
let lastDisconnectTime = null;
const RECONNECT_TIMEOUT = 2000;

function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
    }
    ws = new WebSocket(`wss://${location.host}/${roomId}`);
    ws.onopen = () => {
        console.log('连接成功');
        document.getElementById('destroy-room').disabled = false;
        if (username && joined) {
            ws.send(JSON.stringify({ type: 'join', username }));
        }
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('收到消息:', data);
            switch (data.type) {
                case 'userList':
                    console.log('收到用户列表:', data.users); // 增强日志
                    updateUserList(data.users);
                    break;
                case 'message':
                    console.log('收到聊天消息:', data.message);
                    addMessage(data.username, data.message);
                    break;
                case 'history':
                    console.log('收到历史消息:', data.messages);
                    data.messages.forEach(msg => {
                        addMessage(msg.username, msg.message);
                    });
                    break;
                case 'joinSuccess':
                    console.log('收到 joinSuccess，启用消息输入框');
                    joined = true;
                    document.getElementById('message').disabled = false;
                    document.getElementById('send').disabled = false;
                    document.getElementById('username-label').style.display = 'none';
                    document.getElementById('username').style.display = 'none';
                    document.getElementById('join').style.display = 'none';
                    // 主动请求用户列表
                    ws.send(JSON.stringify({ type: 'getUserList' }));
                    break;
                case 'joinError':
                    console.log('加入失败:', data.message);
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
                    console.log('房间被销毁');
                    document.getElementById('chat').innerHTML = '';
                    updateUserList([]);
                    alert(data.message);
                    resetRoom();
                    break;
                case 'inactive':
                    console.log('因不活跃被断开:', data.message);
                    alert(data.message);
                    resetRoom();
                    break;
                default:
                    console.warn('未知消息类型:', data);
                    break;
            }
        } catch (error) {
            console.error('消息解析失败:', error);
        }
    };
    ws.onclose = (event) => {
        console.log(`连接关闭，代码: ${event.code}, 原因: ${event.reason}`);
        lastDisconnectTime = Date.now();
        if (event.code === 1000 && (event.reason === 'Inactive' || event.reason === 'RoomDestroyed')) {
            resetRoom();
            return;
        }
        setTimeout(() => {
            if (Date.now() - lastDisconnectTime >= RECONNECT_TIMEOUT) {
                resetRoom();
                alert('连接断开，请刷新后重新加入');
            } else if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                console.log('尝试重连...');
                connect();
            }
        }, RECONNECT_TIMEOUT);
    };
}

function resetRoom() {
    joined = false;
    username = '';
    roomId = '';
    document.getElementById('room-id').value = '';
    document.getElementById('room-id').disabled = false;
    document.getElementById('join-room').disabled = false;
    document.getElementById('current-room-id').textContent = '';
    document.getElementById('chat').innerHTML = '';
    updateUserList([]);
    document.getElementById('username-label').style.display = 'block';
    document.getElementById('username').style.display = 'block';
    document.getElementById('join').style.display = 'block';
    document.getElementById('message').disabled = true;
    document.getElementById('send').disabled = true;
    document.getElementById('destroy-room').disabled = true;
    if (ws) ws.close();
}

document.addEventListener('DOMContentLoaded', () => {
    const joinRoomButton = document.getElementById('join-room');
    const handleJoinRoom = () => {
        console.log('join-room 按钮触发');
        if (roomId) {
            alert('已加入一个房间，无法再次输入房间ID');
            return;
        }
        const input = document.getElementById('room-id');
        const id = input.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        document.getElementById('current-room-id').textContent = `当前房间: ${roomId}`;
        input.value = '';
        input.disabled = true;
        joinRoomButton.disabled = true;
        connect();
    };
    joinRoomButton.addEventListener('click', handleJoinRoom);
    joinRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('join-room 触摸触发');
        handleJoinRoom();
    });

    const joinButton = document.getElementById('join');
    const handleJoin = () => {
        console.log('join 按钮触发');
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
        console.log('join 触摸触发');
        handleJoin();
    });

    const sendButton = document.getElementById('send');
    const handleSend = () => {
        console.log('send 按钮触发');
        const input = document.getElementById('message');
        const msg = input.value.trim();
        if (!msg) return;
        ws.send(JSON.stringify({ type: 'message', message: msg }));
        input.value = '';
    };
    sendButton.addEventListener('click', handleSend);
    sendButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('send 触摸触发');
        handleSend();
    });

    document.getElementById('message').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleSend();
        }
    });

    const themeToggleButton = document.getElementById('theme-toggle');
    const handleThemeToggle = () => {
        console.log('theme-toggle 按钮触发');
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode');
    };
    themeToggleButton.addEventListener('click', handleThemeToggle);
    themeToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('theme-toggle 触摸触发');
        handleThemeToggle();
    });

    const userlistToggleButton = document.getElementById('userlist-toggle');
    const handleUserlistToggle = () => {
        console.log('userlist-toggle 按钮触发');
        document.getElementById('userlist').classList.toggle('hidden');
    };
    userlistToggleButton.addEventListener('click', handleUserlistToggle);
    userlistToggleButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('userlist-toggle 触摸触发');
        handleUserlistToggle();
    });

    const destroyRoomButton = document.getElementById('destroy-room');
    const handleDestroyRoom = () => {
        console.log('destroy-room 按钮触发');
        if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
            ws.send(JSON.stringify({ type: 'destroy' }));
        }
    };
    destroyRoomButton.addEventListener('click', handleDestroyRoom);
    destroyRoomButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        console.log('destroy-room 触摸触发');
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
    console.log('更新用户列表，输入数据:', users); // 增强日志
    const list = document.getElementById('userlist');
    list.innerHTML = '<h3>当前在线用户：</h3>';
    const filteredUsers = users.filter(user => user !== null && user !== undefined);
    console.log('过滤后的用户列表:', filteredUsers); // 增强日志
    if (filteredUsers.length === 0) {
        list.innerHTML += '<div>暂无在线用户</div>';
    } else {
        filteredUsers.forEach(user => {
            const div = document.createElement('div');
            div.textContent = user;
            list.appendChild(div);
        });
    }
}
