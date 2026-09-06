console.log("PeerJSを使ってサーバーに接続します");
const loadingView = document.getElementById('loading-view');
const loadingMessage = document.getElementById('loading-message');
const newPeer = () => new Promise((resolve, reject) => {
    const peer = new Peer();

    peer.once('open', () => resolve(peer));
    peer.once('error', reject);
});
let peer;
try {
    peer = await newPeer();
    loadingView?.classList.add('is-hidden');
} catch (error) {
    if (loadingMessage) loadingMessage.textContent = '接続できませんでした。ページを再読み込みしてください。';
    loadingView?.querySelector('.loading-spinner')?.classList.add('is-hidden');
    console.error('PeerJSへの接続に失敗しました。', error);
    throw error;
}
console.log(peer.id)
console.log("peerサーバーと接続した");
const waitingView = document.getElementById('waiting-view');
const selectInfo = document.getElementById('select-info');
const savedProfile = document.getElementById('saved-profile');
const nameInput = document.getElementById('name');
const genderInput = document.getElementById('gender');
const decideButton = document.getElementById('info-decited-button');
const termsAgreement = document.getElementById('terms-agreement');
const formError = document.getElementById('form-error');
const startCallButton = document.getElementById('voice-chat-button');
const peerInfoView = document.getElementById('peer-info-view');
const peerName = document.getElementById('matched-peer-name');
const peerGender = document.getElementById('matched-peer-gender');
const confirmCallButton = document.getElementById('start-call-button');
const cancelCallButton = document.getElementById('cancel-call-button');
const cookieMaxAge = 60 * 60 * 24 * 365;
const matchLabel = document.getElementById('match-label');
const peerResponseLabel = document.getElementById('peer-response-label');
let userparms = {};
let matchingSocket;
let currentOpponent;
let currentRole;
let cancelTimer;
let isCancelling = false;
const buttonIcon = startCallButton?.querySelector('.button-icon');
const buttonText = startCallButton?.querySelector('span:last-child');

const setMatchingButtonState = (isMatching) => {
    if (!startCallButton) return;
    startCallButton.dataset.matching = String(isMatching);
    startCallButton.setAttribute('aria-label', isMatching ? 'マッチングをキャンセル' : '通話を始める');
    if (buttonIcon) buttonIcon.textContent = isMatching ? '×' : '☎';
    if (buttonText) buttonText.textContent = isMatching ? 'キャンセル' : '通話を始める';
};
const getCookie = (key) => document.cookie
    .split('; ')
    .find((item) => item.startsWith(`${key}=`))
    ?.slice(key.length + 1);

const setCookie = (key, value) => {
    document.cookie = `${key}=${encodeURIComponent(value)}; max-age=${cookieMaxAge}; path=/; SameSite=Lax`;
};

const getUserInfo = () => ({
    name: decodeURIComponent(getCookie('callRoomName') || ''),
    gender: decodeURIComponent(getCookie('callRoomGender') || ''),
});

const getGenderLabel = (gender) => ({
    male: '男性',
    female: '女性',
    other: 'その他',
}[gender] || '');

const showWaitingView = (userInfo) => {
    waitingView?.classList.remove('is-hidden');
    if (waitingView) waitingView.style.display = 'flex';
    selectInfo?.classList.add('is-hidden');
    if (selectInfo) selectInfo.style.display = 'none';
    if (savedProfile) savedProfile.textContent = `${userInfo.name} / ${getGenderLabel(userInfo.gender)}`;
};

const showSelectInfo = (userInfo) => {
    waitingView?.classList.add('is-hidden');
    if (waitingView) waitingView.style.display = 'none';
    selectInfo?.classList.remove('is-hidden');
    if (selectInfo) selectInfo.style.display = 'block';
    if (nameInput) nameInput.value = userInfo.name;
    if (genderInput) genderInput.value = userInfo.gender;
};

const showPeerInfo = (peerInfo) => {
    waitingView?.classList.add('is-hidden');
    if (waitingView) waitingView.style.display = 'none';
    if (peerName) peerName.textContent = peerInfo.name;
    if (peerGender) peerGender.textContent = getGenderLabel(peerInfo.gender);
    if (peerResponseLabel) peerResponseLabel.style.display = 'none';
    if (confirmCallButton) {
        confirmCallButton.disabled = false;
        confirmCallButton.classList.remove('is-approved');
        confirmCallButton.textContent = 'OK';
    }
    if (cancelCallButton) cancelCallButton.disabled = false;
    if (peerInfoView) peerInfoView.style.display = 'block';
};

const closeMatchingSocket = () => {
    if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = undefined;
    }
    if (matchingSocket && matchingSocket.readyState !== WebSocket.CLOSED) {
        matchingSocket.close();
    }
    matchingSocket = undefined;
    isCancelling = false;
    setMatchingButtonState(false);
    if (startCallButton) startCallButton.disabled = false;
    if (cancelCallButton) cancelCallButton.disabled = false;
    if (matchLabel) matchLabel.style.display = 'none';
    if (peerResponseLabel) peerResponseLabel.style.display = 'none';
    if (peerInfoView) peerInfoView.style.display = 'none';
    currentOpponent = undefined;
    currentRole = undefined;
    if (confirmCallButton) {
        confirmCallButton.disabled = false;
        confirmCallButton.classList.remove('is-approved');
        confirmCallButton.textContent = 'OK';
    }
    if (userparms && userparms.name && userparms.gender) {
        showWaitingView(userparms);
    }
};

const endMatching = () => {
    closeMatchingSocket();
};

const cancelMatchedPair = () => {
    if (isCancelling) return;

    const socket = matchingSocket;
    if (!currentOpponent || !socket || socket.readyState !== WebSocket.OPEN) {
        endMatching();
        return;
    }

    isCancelling = true;
    setMatchingButtonState(false);
    if (startCallButton) startCallButton.disabled = true;
    if (cancelCallButton) cancelCallButton.disabled = true;

    socket.send(JSON.stringify({ event: 'cancel' }));
    cancelTimer = setTimeout(() => {
        if (matchingSocket === socket) endMatching();
    }, 1000);
};

window.addEventListener('beforeunload', () => {
    closeMatchingSocket();
});

window.addEventListener('pagehide', () => {
    closeMatchingSocket();
});

const savedUserInfo = getUserInfo();
if (savedUserInfo.name && savedUserInfo.gender) {
    userparms = savedUserInfo;
    showWaitingView(savedUserInfo);
} else {
    showSelectInfo(savedUserInfo);
}

decideButton?.addEventListener('click', () => {
    const name = nameInput?.value.trim() || '';
    const gender = genderInput?.value || '';

    if (!termsAgreement?.checked) {
        if (formError) formError.textContent = '利用規約への同意が必要です。';
        return;
    }

    if (!name || !gender) {
        if (formError) formError.textContent = '名前と性別の両方を入力・選択してください。';
        if (!name) nameInput?.focus();
        else genderInput?.focus();
        return;
    }

    setCookie('callRoomName', name);
    setCookie('callRoomGender', gender);
    if (formError) formError.textContent = '';
    showWaitingView({ name, gender });
    userparms.name = name;
    userparms.gender = gender;
});

termsAgreement?.addEventListener('change', () => {
    if (decideButton) decideButton.disabled = !termsAgreement.checked;
    if (termsAgreement.checked && formError?.textContent === '利用規約への同意が必要です。') {
        formError.textContent = '';
    }
});
const getWebSocketUrl = () => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const params = new URLSearchParams({
        user_name: userparms.name,
        user_gender: userparms.gender,
        peer_id: peer.id,
    });
    console.log(peer.id);
    return `ws://127.0.0.1:8080/ws/match?${params.toString()}`;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPeerOpen = async (timeoutMs = 10000) => {
    const start = Date.now();
    while (!peer.open) {
        if (Date.now() - start > timeoutMs) {
            window.alert('PeerJS サーバーへの接続がタイムアウトしました (10秒)。');
            throw new Error('PeerJS connection timeout');
        }
        await sleep(100);
    }
    return peer.id;
};

const moveToVoiceRoom = (opponentPeerId, userName, userGender, role) => {
    const socket = matchingSocket;
    matchingSocket = undefined;
    socket?.close();
    window.startVoiceCall?.({
        activePeer: peer,
        opponentId: opponentPeerId,
        peerInfo: {
            user_name: userName,
            user_gender: userGender,
        },
        callRole: role,
        onEnd: endMatching,
    });
};

startCallButton?.addEventListener('click', async () => {
    if (startCallButton.dataset.matching === 'true') {
        endMatching();
        return;
    }

    if (isCancelling || !userparms.name || !userparms.gender) return;
    startCallButton.disabled = false;
    setMatchingButtonState(true);

    try {
        await waitForPeerOpen();
        if (startCallButton.dataset.matching !== 'true') return;
        const socket = new WebSocket(getWebSocketUrl());
        matchingSocket = socket;
        if (matchLabel) matchLabel.style.display = 'block';

        socket.addEventListener('open', () => {
            if (matchLabel) matchLabel.style.display = 'block';
        }, { once: true });

        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);

            if (message.event === 'matched') {
                currentRole = message.role;
                currentOpponent = message.opponent;
                showPeerInfo({
                    name: currentOpponent.user_name,
                    gender: currentOpponent.user_gender,
                });
                if (matchLabel) matchLabel.style.display = 'none';
            }

            if (message.event === 'approved' && message.peer_id) {
                currentRole = message.role || currentRole;
                const opponentName = currentOpponent?.user_name || '';
                const opponentGender = currentOpponent?.user_gender || '';
                if (currentRole === 'p1' || currentRole === 'p2') {
                    moveToVoiceRoom(message.peer_id, opponentName, opponentGender, currentRole);
                }
            }

            if (message.event === 'cancelled') {
                endMatching();
            }
        });

        socket.addEventListener('close', () => {
            if (matchingSocket !== socket) return;
            endMatching();
        });

        socket.addEventListener('error', () => {
            if (matchingSocket !== socket) return;
            endMatching();
        }, { once: true });
    } catch (error) {
        endMatching();
        if (formError) formError.textContent = 'PeerJS に接続できませんでした。';
        console.error(error);
    }
});

cancelCallButton?.addEventListener('click', () => {
    cancelMatchedPair();
});

confirmCallButton?.addEventListener('click', () => {
    if (!matchingSocket || matchingSocket.readyState !== WebSocket.OPEN) return;
    matchingSocket.send(JSON.stringify({ event: 'ok' }));
    if (confirmCallButton) {
        confirmCallButton.disabled = true;
        confirmCallButton.classList.add('is-approved');
    }
    if (peerResponseLabel) peerResponseLabel.style.display = 'block';
});
