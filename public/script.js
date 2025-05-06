let ws;
let username = '';
let joined = false;
let roomId = '';
let roomLocked = false;

const MESSAGE_TYPES = {
    USER_LIST: 'userList',
    MESSAGE: 'message',
    HISTORY: 'history',
    JOIN_SUCCESS: 'joinSuccess',
    JOIN_ERROR: 'joinError',
    ROOM_DESTROYED: 'roomDestroyed',
    INACTIVE: 'inactive',
    JOIN: 'join',
    DESTROY: 'destroy'
};

// DOM Elements (fetched in DOMContentLoaded)
let roomIdInput, joinRoomButton, currentRoomIdElement, usernameLabel, usernameInput, joinButton,
    messageInput, sendButton, chatElement, userListElement, destroyRoomButton,
    themeToggleButton, userlistToggleButton;

function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.close(1000, 'New connection requested');
        } catch (e) {
            console.warn("Error closing existing WebSocket:", e);
        }
    }
    ws = new WebSocket(`wss://${location.host}/${roomId}`);

    ws.onopen = () => {
        console.log('WebSocket connection established.');
        if (destroyRoomButton) destroyRoomButton.disabled = false;
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            switch (data.type) {
                case MESSAGE_TYPES.USER_LIST:
                    updateUserList(data.users);
                    break;
                case MESSAGE_TYPES.MESSAGE:
                    addMessage(data.username, data.message);
                    break;
                case MESSAGE_TYPES.HISTORY:
                    data.messages.forEach(msg => addMessage(msg.username, msg.message));
                    break;
                case MESSAGE_TYPES.JOIN_SUCCESS:
                    joined = true;
                    if (messageInput) messageInput.disabled = false;
                    if (sendButton) sendButton.disabled = false;
                    if (usernameLabel) usernameLabel.style.display = 'none';
                    if (usernameInput) usernameInput.style.display = 'none';
                    if (joinButton) joinButton.style.display = 'none';
                    console.log('Successfully joined room.');
                    break;
                case MESSAGE_TYPES.JOIN_ERROR:
                    alert(data.message || '用户名已存在，请重新输入');
                    joined = false;
                    username = '';
                    if (usernameInput) usernameInput.value = '';
                    if (usernameLabel) usernameLabel.style.display = 'block';
                    if (usernameInput) usernameInput.style.display = 'block';
                    if (joinButton) joinButton.style.display = 'block';
                    if (messageInput) messageInput.disabled = true;
                    if (sendButton) sendButton.disabled = true;
                    break;
                case MESSAGE_TYPES.ROOM_DESTROYED:
                    alert(data.message || '房间已被销毁。');
                    if (chatElement) chatElement.innerHTML = '';
                    updateUserList([]);
                    // ws.close() will trigger onclose where resetRoom() is called
                    if (ws) ws.close(1000, 'RoomDestroyed');
                    break;
                case MESSAGE_TYPES.INACTIVE:
                    alert(data.message || '由于长时间未活动，您已断开连接。');
                    // ws.close() will trigger onclose where resetRoom() is called
                    if (ws) ws.close(1000, 'Inactive');
                    break;
                default:
                    console.warn('Received unknown message type:', data.type);
            }
        } catch (error) {
            console.error('消息解析失败或处理失败:', error, event.data);
        }
    };

    ws.onclose = (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: "${event.reason}", Clean: ${event.wasClean}`);
        joined = false;
        username = ''; // Reset username on disconnect

        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        if (destroyRoomButton) destroyRoomButton.disabled = true;

        // Show username input again
        if (usernameLabel) usernameLabel.style.display = 'block';
        if (usernameInput) {
            usernameInput.style.display = 'block';
            // usernameInput.value = ''; // Keep username input if they want to rejoin with same name? Or clear? Let's clear for fresh state.
            // usernameInput.value = ''; // Already reset by joinError or if user clears it. Let's leave it.
        }
        if (joinButton) joinButton.style.display = 'block';

        // Clear chat and user list (already done in previous logic, but good to ensure)
        if (chatElement) chatElement.innerHTML = '';
        updateUserList([]);

        // Alert only for unexpected disconnections or generic ones.
        // If the server initiated a close for 'Inactive' or 'RoomDestroyed', onmessage would have alerted.
        if (event.reason !== MESSAGE_TYPES.INACTIVE && event.reason !== MESSAGE_TYPES.ROOM_DESTROYED) {
            if (event.code !== 1000 && event.code !== 1005 ) { // 1000 is normal, 1005 means no status code was present
                 alert(`连接意外断开 (Code: ${event.code})，请重新加入`);
            } else if (event.code === 1000 && event.reason && event.reason !== 'New connection requested' && event.reason !== 'UserLeft') { // UserLeft could be custom reason for explicit leave
                 // Log normal closures with specific reasons if not handled by onmessage
                 console.log(`连接正常关闭: ${event.reason}`);
            } else if (!event.reason && event.code === 1000) { // Normal close without specific server reason (e.g. client closed tab)
                // No alert here usually, as it might be intentional.
                // Or if you want to prompt for every close: alert('连接已关闭，请重新加入');
            }
        }
        resetRoom(); // Always reset room state to allow re-entry
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        // Potentially alert user here too, as onerror is often followed by onclose
        // alert('WebSocket连接发生错误，请尝试重新加入。');
    };
}

function resetRoom() {
    roomId = '';
    roomLocked = false;
    if (roomIdInput) roomIdInput.value = '';
    if (currentRoomIdElement) currentRoomIdElement.textContent = '当前房间: 未加入';
    if (destroyRoomButton) destroyRoomButton.disabled = true; // Ensure destroy is disabled
     // Ensure message sending is disabled
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;
    // Show username input related fields if they were hidden
    if (usernameLabel && usernameInput && joinButton && !joined) { // only if not already joined (e.g. initial state)
        usernameLabel.style.display = 'block';
        usernameInput.style.display = 'block';
        joinButton.style.display = 'block';
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Fetch DOM elements
    roomIdInput = document.getElementById('room-id');
    joinRoomButton = document.getElementById('join-room');
    currentRoomIdElement = document.getElementById('current-room-id');
    usernameLabel = document.getElementById('username-label');
    usernameInput = document.getElementById('username');
    joinButton = document.getElementById('join');
    messageInput = document.getElementById('message');
    sendButton = document.getElementById('send');
    chatElement = document.getElementById('chat');
    userListElement = document.getElementById('userlist');
    destroyRoomButton = document.getElementById('destroy-room');
    themeToggleButton = document.getElementById('theme-toggle');
    userlistToggleButton = document.getElementById('userlist-toggle');

    // Basic check for critical elements
    const criticalElements = [roomIdInput, joinRoomButton, currentRoomIdElement, usernameInput, joinButton, messageInput, sendButton, chatElement, userListElement, destroyRoomButton, themeToggleButton, userlistToggleButton];
    if (criticalElements.some(el => !el)) {
        console.error("一个或多个必要的DOM元素未找到。请检查HTML的ID是否正确。");
        alert("页面初始化失败，部分功能可能无法使用。请刷新页面或联系管理员。");
        // return; // Could stop execution if critical elements are missing
    }
    resetRoom(); // Initialize room state on load

    const handleJoinRoom = () => {
        if (roomLocked) {
            alert('您已在房间中，请退出后重新进入其他房间');
            return;
        }
        const id = roomIdInput.value.trim();
        if (!id) {
            alert('请输入房间 ID');
            return;
        }
        roomId = id;
        roomLocked = true; // Lock room choice until connection closes or is reset
        currentRoomIdElement.textContent = `当前房间: ${roomId}`;
        // roomIdInput.value = ''; // Clear after selection
        connect();
    };
    if (joinRoomButton) {
        joinRoomButton.addEventListener('click', handleJoinRoom);
        joinRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoinRoom(); });
    }

    const handleJoin = () => {
        const name = usernameInput.value.trim();
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
            // Attempt to connect if not already, or if connection dropped before username join
            console.log('WebSocket not open, attempting to connect before joining...');
            connect(); // This is async, ideally wait for onopen before sending join.
                       // For simplicity, we assume connect() will establish soon or was already trying.
                       // A more robust way would be to queue the join message until ws.onopen.
            // A brief timeout might allow connection, or disable join button until ws.onopen sets a flag.
            setTimeout(() => { // Adding a small delay to allow ws to potentially open
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendJoinRequest(name);
                } else {
                    alert('连接尚未建立，请稍后再试。');
                }
            }, 500); // Adjust timeout as needed
            return; // Return here, sendJoinRequest will be called in timeout
        }
        sendJoinRequest(name);
    };

    function sendJoinRequest(name) {
        username = name;
        try {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN, username }));
        } catch (error) {
            console.error("发送加入请求失败:", error);
            alert("发送加入请求失败，连接可能已断开。");
        }
    }

    if (joinButton) {
        joinButton.addEventListener('click', handleJoin);
        joinButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoin(); });
    }


    const handleSend = () => {
        const msg = messageInput.value.trim();
        if (!msg) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({ type: MESSAGE_TYPES.MESSAGE, message: msg }));
                messageInput.value = '';
                messageInput.focus(); // Re-focus after sending
            } catch (error) {
                console.error("发送消息失败:", error);
                alert("发送消息失败，连接可能已断开。");
            }
        } else {
            alert("未连接到聊天室，无法发送消息。");
        }
    };

    if (sendButton) {
        sendButton.addEventListener('click', handleSend);
        sendButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleSend(); });
    }

    if (messageInput) {
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    const handleThemeToggle = () => {
        document.body.classList.toggle('dark-mode');
        document.body.classList.toggle('light-mode'); // Assuming light-mode is default or explicitly set
    };
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', handleThemeToggle);
        themeToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleThemeToggle(); });
    }


    const handleUserlistToggle = () => {
        if (userListElement) userListElement.classList.toggle('hidden');
    };
    if (userlistToggleButton) {
        userlistToggleButton.addEventListener('click', handleUserlistToggle);
        userlistToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleUserlistToggle(); });
    }


    const handleDestroyRoom = () => {
        if (destroyRoomButton && destroyRoomButton.disabled) return;
        if (confirm('确定要销毁房间吗？所有聊天记录将被删除！')) {
            if (ws && ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(JSON.stringify({ type: MESSAGE_TYPES.DESTROY }));
                } catch (error) {
                    console.error("发送销毁房间请求失败:", error);
                    alert("发送销毁房间请求失败，连接可能已断开。");
                }
            } else {
                alert("未连接到聊天室，无法销毁房间。");
            }
        }
    };
    if (destroyRoomButton) {
        destroyRoomButton.addEventListener('click', handleDestroyRoom);
        destroyRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleDestroyRoom(); });
    }
});

function addMessage(user, message) {
    if (!chatElement) return;
    const div = document.createElement('div');
    // Sanitize user and message if they can contain HTML, though textContent is safer.
    // For this example, assuming they are plain text.
    const messageOwnerClass = (user === username && username !== '') ? 'message-right' : 'message-left';
    div.className = `message ${messageOwnerClass}`; // Add a general 'message' class too

    const userSpan = document.createElement('span');
    userSpan.className = 'message-username';
    userSpan.textContent = `${user}: `;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'message-text';
    messageSpan.textContent = message;

    div.appendChild(userSpan);
    div.appendChild(messageSpan);

    chatElement.appendChild(div);
    chatElement.scrollTop = chatElement.scrollHeight;
}

function updateUserList(users) {
    if (!userListElement) return;
    userListElement.innerHTML = '<h3>当前在线用户：</h3>'; // Keep title
    if (users && users.length > 0) {
        users.filter(user => user && typeof user === 'string' && user.trim() !== '') // Ensure user is a non-empty string
            .forEach(user => {
                const div = document.createElement('div');
                div.className = 'userlist-entry';
                div.textContent = user;
                userListElement.appendChild(div);
            });
    } else {
        const div = document.createElement('div');
        div.textContent = "暂无其他用户";
        div.className = 'userlist-empty';
        userListElement.appendChild(div);
    }
}
