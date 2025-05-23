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
    DESTROY: 'destroy',
    SYSTEM: 'system',
    ERROR: 'error'
};

// DOM Elements (fetched in DOMContentLoaded)
let roomIdInput, joinRoomButton, currentRoomIdElement, usernameLabel, usernameInput, joinButton,
    messageInput, sendButton, chatElement, userListElement, destroyRoomButton,
    themeToggleButton, userlistToggleButton;

// --- Custom Alert and Confirm ---
function showCustomAlert(message, type = 'info') {
    const alertBox = document.createElement('div');
    alertBox.className = `custom-alert custom-alert-${type}`;
    alertBox.textContent = message;
    document.body.appendChild(alertBox);
    setTimeout(() => {
        if (alertBox.parentNode) {
            alertBox.remove();
        }
    }, 3500);
}

function showCustomConfirm(message, callback) {
    const confirmContainer = document.createElement('div');
    confirmContainer.className = 'custom-confirm-container';

    const confirmBox = document.createElement('div');
    confirmBox.className = 'custom-confirm-box';

    const messageP = document.createElement('p');
    messageP.textContent = message;
    confirmBox.appendChild(messageP);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'custom-confirm-button-container';

    const okButton = document.createElement('button');
    okButton.textContent = '确定';
    okButton.className = 'custom-confirm-button custom-confirm-ok';
    okButton.onclick = () => {
        confirmContainer.remove();
        if (callback) callback(true);
    };

    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.className = 'custom-confirm-button custom-confirm-cancel';
    cancelButton.onclick = () => {
        confirmContainer.remove();
        if (callback) callback(false);
    };

    buttonContainer.appendChild(okButton);
    buttonContainer.appendChild(cancelButton);
    confirmBox.appendChild(buttonContainer);
    confirmContainer.appendChild(confirmBox);
    document.body.appendChild(confirmContainer);
}
// --- End Custom Alert and Confirm ---

function connect() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        try {
            ws.close(1000, 'New connection requested');
        } catch (e) {
            console.warn("Error closing existing WebSocket:", e);
        }
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${location.host}/${roomId}`);

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
                    showCustomAlert(`成功加入房间 ${roomId}，用户名为 ${username}`, 'success');
                    break;
                case MESSAGE_TYPES.JOIN_ERROR:
                    showCustomAlert(data.message || '用户名已存在，请重新输入', 'error');
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
                    showCustomAlert(data.message || '房间已被销毁。', 'info');
                    if (chatElement) chatElement.innerHTML = '';
                    updateUserList([]);
                    if (ws) ws.close(1000, 'RoomDestroyed');
                    break;
                case MESSAGE_TYPES.INACTIVE:
                    showCustomAlert(data.message || '由于长时间未活动，您已断开连接。', 'info');
                    if (ws) ws.close(1000, 'Inactive');
                    break;
                case MESSAGE_TYPES.SYSTEM:
                    addSystemMessage(data.message);
                    break;
                case MESSAGE_TYPES.ERROR:
                     showCustomAlert(`服务器错误: ${data.message}`, 'error');
                     break;
                default:
                    console.warn('Received unknown message type:', data.type, data);
            }
        } catch (error) {
            console.error('消息解析失败或处理失败:', error, event.data);
            showCustomAlert('处理消息时发生错误。', 'error');
        }
    };

    ws.onclose = (event) => {
        console.log(`WebSocket connection closed. Code: ${event.code}, Reason: "${event.reason}", Clean: ${event.wasClean}`);
        joined = false;

        if (messageInput) messageInput.disabled = true;
        if (sendButton) sendButton.disabled = true;
        if (destroyRoomButton) destroyRoomButton.disabled = true;

        if (usernameLabel) usernameLabel.style.display = 'block';
        if (usernameInput) {
            usernameInput.style.display = 'block';
        }
        if (joinButton) joinButton.style.display = 'block';

        if (chatElement) chatElement.innerHTML = '';
        updateUserList([]);

        const handledReasons = [MESSAGE_TYPES.INACTIVE, MESSAGE_TYPES.ROOM_DESTROYED, 'New connection requested', 'UserLeft', 'Room destroyed'];
        if (!handledReasons.includes(event.reason)) {
            if (event.code !== 1000 && event.code !== 1005 ) {
                showCustomAlert(`连接意外断开 (Code: ${event.code})，请重新加入`, 'error');
            } else if (event.code === 1000 && event.reason) {
                console.log(`连接正常关闭: ${event.reason}`);
            } else if (!event.reason && event.code === 1000) {
                console.log('连接已关闭 (例如，关闭标签页)。');
            }
        }
        resetRoom();
    };

    ws.onerror = (error) => {
        console.error('WebSocket Error:', error);
        showCustomAlert('WebSocket连接发生错误，请尝试重新加入。', 'error');
    };
}

function resetRoom() {
    roomId = '';
    roomLocked = false;
    if (roomIdInput) roomIdInput.value = '';
    if (currentRoomIdElement) currentRoomIdElement.textContent = '当前房间: 未加入';
    if (destroyRoomButton) destroyRoomButton.disabled = true;
    if (messageInput) messageInput.disabled = true;
    if (sendButton) sendButton.disabled = true;

    if (usernameLabel && usernameInput && joinButton) {
        if (!joined || (ws && ws.readyState !== WebSocket.OPEN && ws.readyState !== WebSocket.CONNECTING)) {
             usernameLabel.style.display = 'block';
             usernameInput.style.display = 'block';
             joinButton.style.display = 'block';
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
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

    const criticalElements = [roomIdInput, joinRoomButton, currentRoomIdElement, usernameInput, joinButton, messageInput, sendButton, chatElement, userListElement, destroyRoomButton, themeToggleButton, userlistToggleButton];
    if (criticalElements.some(el => !el)) {
        console.error("一个或多个必要的DOM元素未找到。请检查HTML的ID是否正确。");
        showCustomAlert("页面初始化失败，部分功能可能无法使用。请刷新页面或联系管理员。", "error");
    }
    resetRoom();

    const handleJoinRoom = () => {
        if (roomLocked && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
            showCustomAlert('您已在房间中或正在连接，请等待或刷新页面以加入其他房间。', 'info');
            return;
        }
        const id = roomIdInput.value.trim();
        if (!id) {
            showCustomAlert('请输入房间 ID', 'error');
            return;
        }
        roomId = id;
        roomLocked = true;
        if(currentRoomIdElement) currentRoomIdElement.textContent = `当前房间: ${roomId}`;
        if(roomIdInput) roomIdInput.value = '';
        connect();
    };
    if (joinRoomButton) {
        joinRoomButton.addEventListener('click', handleJoinRoom);
        joinRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoinRoom(); });
    }

    const handleJoin = () => {
        const name = usernameInput.value.trim();
        if (!name) {
            showCustomAlert('请输入用户名', 'error');
            return;
        }
        if (joined) {
            showCustomAlert('已加入聊天室', 'info');
            return;
        }
        if (!roomId) {
            showCustomAlert('请先进入一个房间', 'error');
            return;
        }
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            console.log('WebSocket not open, attempting to connect before joining...');
            showCustomAlert('正在连接到房间，请稍候...', 'info');
            setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    sendJoinRequest(name);
                } else if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
                    showCustomAlert('连接尚未建立或已断开，请先确保已成功进入房间。', 'error');
                }
            }, 700);
            return;
        }
        sendJoinRequest(name);
    };

    function sendJoinRequest(name) {
        username = name;
        try {
            ws.send(JSON.stringify({ type: MESSAGE_TYPES.JOIN, username }));
        } catch (error) {
            console.error("发送加入请求失败:", error);
            showCustomAlert("发送加入请求失败，连接可能已断开。", "error");
        }
    }

    if (joinButton) {
        joinButton.addEventListener('click', handleJoin);
        joinButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleJoin(); });
    }

    const handleSend = () => {
        if (!messageInput) return;
        const msg = messageInput.value.trim();
        if (!msg) return;
        if (ws && ws.readyState === WebSocket.OPEN) {
            if (!joined) {
                showCustomAlert("请先设置您的称呼并加入聊天。", "error");
                return;
            }
            try {
                ws.send(JSON.stringify({ type: MESSAGE_TYPES.MESSAGE, message: msg }));
                messageInput.value = '';
                messageInput.focus();
            } catch (error) {
                console.error("发送消息失败:", error);
                showCustomAlert("发送消息失败，连接可能已断开。", "error");
            }
        } else {
            showCustomAlert("未连接到聊天室，无法发送消息。", "error");
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
        document.body.classList.toggle('light-mode');
        themeToggleButton.textContent = document.body.classList.contains('dark-mode') ? '☀️ 日间主题' : '🌗 暗黑主题';
    };
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', handleThemeToggle);
        themeToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleThemeToggle(); });
    }

    const handleUserlistToggle = () => {
        if (userListElement) {
            const isHidden = userListElement.classList.toggle('hidden');
        }
    };
    if (userlistToggleButton) {
        userlistToggleButton.addEventListener('click', handleUserlistToggle);
        userlistToggleButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleUserlistToggle(); });
    }

    const handleDestroyRoom = () => {
        // 新增：诊断日志
        console.log('handleDestroyRoom called. Button found:', !!destroyRoomButton, 'Button disabled state:', destroyRoomButton ? destroyRoomButton.disabled : 'N/A');

        if (destroyRoomButton && destroyRoomButton.disabled) {
            // 新增：更明确的日志
            console.log('Destroy room button is currently disabled, action prevented.');
            showCustomAlert("销毁按钮当前不可用 (可能未连接或正在处理)。", "info");
            return;
        }
        showCustomConfirm('确定要销毁房间吗？所有聊天记录将被删除！', (confirmed) => {
            console.log('Custom confirm callback. Confirmed:', confirmed); // 新增：诊断日志
            if (confirmed) {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log('WebSocket is open, sending DESTROY message.'); // 新增：诊断日志
                    try {
                        ws.send(JSON.stringify({ type: MESSAGE_TYPES.DESTROY }));
                    } catch (error) {
                        console.error("发送销毁房间请求失败:", error);
                        showCustomAlert("发送销毁房间请求失败，连接可能已断开。", "error");
                    }
                } else {
                    console.log('WebSocket not open or not available. Cannot destroy room.'); // 新增：诊断日志
                    showCustomAlert("未连接到聊天室，无法销毁房间。", "error");
                }
            }
        });
    };
    if (destroyRoomButton) {
        destroyRoomButton.addEventListener('click', handleDestroyRoom);
        // 修改：移除了 destroyRoomButton 的 touchstart 事件监听器
        // destroyRoomButton.addEventListener('touchstart', (e) => { e.preventDefault(); handleDestroyRoom(); });
    }
});

function addMessage(user, message) {
    if (!chatElement) return;
    const div = document.createElement('div');
    const messageOwnerClass = (user === username && username !== '') ? 'message-right' : 'message-left';
    div.className = `message ${messageOwnerClass}`;

    const userSpan = document.createElement('span');
    userSpan.className = 'message-username-display';
    userSpan.textContent = user;

    const messageSpan = document.createElement('span');
    messageSpan.className = 'message-text';
    messageSpan.textContent = message;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.appendChild(messageSpan);

    div.appendChild(userSpan);
    div.appendChild(contentDiv);

    chatElement.appendChild(div);
    chatElement.scrollTop = chatElement.scrollHeight;
}

function addSystemMessage(message) {
    if (!chatElement) return;
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = message;
    chatElement.appendChild(div);
    chatElement.scrollTop = chatElement.scrollHeight;
}

function updateUserList(users) {
    if (!userListElement) return;
    userListElement.innerHTML = '<h3>当前在线用户：</h3>';
    if (users && users.length > 0) {
        users.filter(user => user && typeof user === 'string' && user.trim() !== '')
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
