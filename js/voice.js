let opponentPeerId;
let role;
let peer;
let onCallEnd;
let peerHandlersRegistered = false;
const voiceView = document.getElementById('voice-view');
const appShell = document.querySelector('.app-shell');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const peerStatusIcon = document.getElementById('peer-status-icon');
const peerMikeOnIcon = document.getElementById('peer-mike-on-icon');
const peerMikeOffIcon = document.getElementById('peer-mike-off-icon');
const myStatusIcon = document.getElementById('my-status-icon');
const chatButton = document.getElementById('chat-button');
const chatSheet = document.getElementById('chat-sheet');
const closeChatButton = document.getElementById('close-chat');
const chatInput = document.getElementById('chat-input');
const sendChatButton = document.getElementById('send-chat');
const chatMessages = document.getElementById('chat-messages');
const micButton = document.getElementById('mic-button');
const micOnButton = document.getElementById('mike-on-button');
const micOffButton = document.getElementById('mike-off-button');
const chatOnButton = document.getElementById('chat-on-button');
const chatOffButton = document.getElementById('chat-off-button');
const videoButton = document.getElementById('video-button');
const videoOnButton = document.getElementById('video-on-button');
const videoOffButton = document.getElementById('video-off-button');
const endCallButton = document.getElementById('end-call-button');
const peerName = document.getElementById('peer-name');
let localStream=undefined;
let mediaCall;
let dataConnection;
let isCallEnding = false;
let heartbeatTimer;
let lastHeartbeatResponseAt = 0;
const heartbeatIntervalMs = 3000;
const heartbeatTimeoutMs = 10000;

const stopHeartbeat = () => {
	if (heartbeatTimer) {
		clearInterval(heartbeatTimer);
		heartbeatTimer = undefined;
	}
	lastHeartbeatResponseAt = 0;
};

const startHeartbeat = (connection) => {
	stopHeartbeat();
	lastHeartbeatResponseAt = Date.now();
	heartbeatTimer = setInterval(() => {
		if (dataConnection !== connection || !connection.open) {
			stopHeartbeat();
			return;
		}
		if (Date.now() - lastHeartbeatResponseAt > heartbeatTimeoutMs) {
			stopHeartbeat();
			finishCallAndGoHome('相手との接続がタイムアウトしました。');
			return;
		}
		try {
			connection.send({ type: 'heartbeat-ping' });
		} catch (error) {
			console.warn('接続確認の送信に失敗しました。', error);
			finishCallAndGoHome('相手との接続が切れました。');
		}
	}, heartbeatIntervalMs);
};

const finishCallAndGoHome = async (reason = '')=> {
	if (isCallEnding) return;
	isCallEnding = true;
	stopHeartbeat();
	if (reason) {
		console.warn(reason);
	}

	const connection = dataConnection;
	if (connection?.open) {
		try {
		    await connection.send({ type: 'call-end', reason });
			console.log('切断通知を送信しました。');
		} catch (error) {
			console.warn('切断通知の送信に失敗しました。', error);
		}
	}

	if (localStream) {
		localStream.getTracks().forEach((track) => track.stop());
		localStream = undefined;
	}

	if (mediaCall) {
		try {
			mediaCall.close();
		} catch (error) {
			console.warn('mediaCall の close に失敗しました。', error);
		}
		mediaCall = undefined;
	}

	const completeCleanup = () => {
		if (connection) {
			try {
				connection.close();
			} catch (error) {
				console.warn('dataConnection の close に失敗しました。', error);
			}
		}
		if (dataConnection === connection) dataConnection = undefined;
		chatMessages?.replaceChildren();
		if (chatInput) chatInput.value = '';
		chatSheet?.classList.remove('is-open');
		chatSheet?.setAttribute('aria-hidden', 'true');
		setChatButtonState(false);
		voiceView?.classList.add('is-hidden');
		appShell?.classList.remove('is-hidden');
		document.body.classList.remove('is-in-call');
		onCallEnd?.();
	};

	await new Promise(resolve => setTimeout(() => { completeCleanup(); resolve(); }, connection?.open ? 150 : 0));
};
const setChatButtonState = (isOpen) => {
	if (chatOnButton) chatOnButton.style.display = isOpen ? 'inline-block' : 'none';
	if (chatOffButton) chatOffButton.style.display = isOpen ? 'none' : 'inline-block';
	if (chatButton) {
		chatButton.classList.toggle('is-muted', !isOpen);
		chatButton.setAttribute('aria-label', isOpen ? 'チャットを閉じる' : 'チャットを開く');
		chatButton.setAttribute('aria-expanded', String(isOpen));
	}
};

setChatButtonState(false);
window.addEventListener('beforeunload', () => {
	if (peer && !isCallEnding) {
		finishCallAndGoHome('ページを離れたため通話を終了しました。');
	}
});

const addChatMessage = (text, isOwnMessage) => {
	const message = document.createElement('p');
	message.textContent = text;
	if (isOwnMessage) message.classList.add('own');
	chatMessages?.appendChild(message);
	if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
};

const showVideo = (video, stream, fallbackIcon) => {
	if (!video) return;
	video.srcObject = stream;
	video.hidden = false;
	fallbackIcon?.setAttribute('hidden', '');
};

const setLocalVideoState = (isEnabled) => {
	if (localVideo) localVideo.hidden = !isEnabled;
	if (isEnabled) myStatusIcon?.setAttribute('hidden', '');
	else myStatusIcon?.removeAttribute('hidden');
};

const setMicrophoneButtonState = (isEnabled) => {
	if (micOnButton) micOnButton.style.display = isEnabled ? 'inline-block' : 'none';
	if (micOffButton) micOffButton.style.display = isEnabled ? 'none' : 'inline-block';
	if (micButton) {
		micButton.classList.toggle('is-muted', !isEnabled);
		micButton.setAttribute('aria-label', isEnabled ? 'マイクをオフにする' : 'マイクをオンにする');
	}
};

const setVideoButtonState = (isEnabled) => {
	console.log("ボタン押された")
	if (videoOnButton) videoOnButton.style.display = isEnabled ? 'inline-block' : 'none';
	if (videoOffButton) videoOffButton.style.display = isEnabled ? 'none' : 'inline-block';
	if (videoButton) {
		videoButton.classList.toggle('is-muted', !isEnabled);
		videoButton.setAttribute('aria-label', isEnabled ? 'ビデオをオフにする' : 'ビデオをオンにする');
	}
	console.log("ビデオボタンの状態:", isEnabled);
};

const setRemoteVideoState = (isEnabled) => {
	if (remoteVideo) remoteVideo.hidden = !isEnabled;
	if (isEnabled) peerStatusIcon?.setAttribute('hidden', '');
	else peerStatusIcon?.removeAttribute('hidden');
};

const setRemoteAudioState = (isEnabled) => {
	peerMikeOnIcon?.toggleAttribute('hidden', !isEnabled);
	peerMikeOffIcon?.toggleAttribute('hidden', isEnabled);
	peerStatusIcon?.setAttribute('aria-label', isEnabled ? '相手のマイクはオンです' : '相手のマイクはオフです');
};

const notifyMediaState = () => {
	const audioTrack = localStream?.getAudioTracks()[0];
	const videoTrack = localStream?.getVideoTracks()[0];
	if (dataConnection?.open && (audioTrack || videoTrack)) {
		dataConnection.send({
			type: 'media-state',
			audio: audioTrack?.enabled ?? false,
			video: videoTrack?.enabled ?? false,
		});
	}
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

const setupDataConnection = (connection) => {
	if (!connection) return;
	dataConnection = connection;
	connection.on('data', (data) => {
		if (typeof data === 'string') {
			addChatMessage(data, false);
			return;
		}
		if (data?.type === 'media-state') {
			setRemoteAudioState(Boolean(data.audio));
			setRemoteVideoState(Boolean(data.video));
			return;
		}
		if (data?.type === 'heartbeat-ping') {
			if (connection.open) connection.send({ type: 'heartbeat-pong' });
			return;
		}
		if (data?.type === 'heartbeat-pong') {
			if (dataConnection === connection) lastHeartbeatResponseAt = Date.now();
			return;
		}
		if (data?.type === 'call-end') {
			finishCallAndGoHome(data.reason || '相手が通話を切りました。');
		}
	});
	connection.on('open', () => {
		notifyMediaState();
		startHeartbeat(connection);
	});
	connection.on('close', () => {
		if (dataConnection === connection) stopHeartbeat();
		if (dataConnection === connection) {
			dataConnection = undefined;
		}
		if (!isCallEnding) {
			finishCallAndGoHome('相手との接続が切れたため通話を終了しました。');
		}
	});
	connection.on('error', (err) => {
		console.error('DataConnection エラー:', err);
	});
};

const ensureDataConnection = async () => {
	if (!opponentPeerId || !peer || peer.destroyed) return undefined;

	try {
		await waitForPeerOpen(10000);
	} catch {
		return undefined;
	}

	if (dataConnection && dataConnection.peer === opponentPeerId) {
		return dataConnection;
	}

	if (dataConnection && dataConnection.peer !== opponentPeerId) {
		try {
			dataConnection.close();
		} catch (error) {
			console.warn('古い接続の破棄に失敗しました。', error);
		}
		dataConnection = undefined;
	}

	const connection = peer.connect(opponentPeerId);
	console.log('Peer connect:', connection, opponentPeerId);
	setupDataConnection(connection);
	return connection;
};

const handleMediaCall = (call) => {
	if (!call) return;
	mediaCall = call;
	call.on('stream', (stream) => {
		if (remoteVideo) remoteVideo.srcObject = stream;
		setRemoteVideoState(true);
	});
	call.on('close', () => {
		if (!isCallEnding) {
			finishCallAndGoHome('相手の通話が終了されたため、接続を切りました。');
		}
		if (remoteVideo) {
			remoteVideo.srcObject = null;
			remoteVideo.hidden = true;
		}
		peerStatusIcon?.removeAttribute('hidden');
	});
	call.on('error', (err) => {
		console.error('MediaCall エラー:', err);
	});
};

const getLocalStream = async () => {
	if (localStream) return localStream;
	localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
	localStream.getAudioTracks().forEach((track) => { track.enabled = true; });
	localStream.getVideoTracks().forEach((track) => { track.enabled = false; });
	setMicrophoneButtonState(true);
	setVideoButtonState(false);
	setRemoteAudioState(true);
	if (localVideo) localVideo.srcObject = localStream;
	setLocalVideoState(false);
	return localStream;
};

const initPeerAndCall = async () => {
	try {
		await waitForPeerOpen(10000);
		const stream = await getLocalStream();
		if (role === 'p1' && opponentPeerId) {
			handleMediaCall(peer.call(opponentPeerId, stream));
			await setPeerConnectionReady();
		}
	} catch (error) {
		console.error('通話初期化エラー:', error);
	}
};

const sendChatMessage = async () => {
	const text = chatInput?.value.trim();
	if (!text) return;

	try {
		await waitForPeerOpen(10000);
	} catch {
		return;
	}

	const connection = await ensureDataConnection();
	if (connection) {
		if (!connection.open) {
			const start = Date.now();
			while (!connection.open && Date.now() - start < 5000) {
				await sleep(100);
			}
		}
		if (connection.open) {
			connection.send(text);
		}
	}

	addChatMessage(text, true);
	chatInput.value = '';
};

const setPeerConnectionReady = async () => {
	if (!opponentPeerId) return;
	await ensureDataConnection();
};

window.startVoiceCall = ({ activePeer, opponentId, peerInfo, callRole, onEnd }) => {
	peer = activePeer;
	opponentPeerId = opponentId;
	role = callRole;
	onCallEnd = onEnd;
	isCallEnding = false;
	if (peerName) peerName.textContent = peerInfo.user_name || '相手';
	appShell?.classList.add('is-hidden');
	voiceView?.classList.remove('is-hidden');
	document.body.classList.add('is-in-call');

	if (!peerHandlersRegistered) {
		peerHandlersRegistered = true;
		peer.on('call', async (call) => {
			try {
				await waitForPeerOpen(10000);
				const stream = await getLocalStream();
				call.answer(stream);
				handleMediaCall(call);
				await setPeerConnectionReady();
			} catch (error) {
				console.error(error);
			}
		});

		peer.on('connection', (connection) => {
			setupDataConnection(connection);
			if (connection.peer && connection.peer !== opponentPeerId) {
				connection.close();
			}
		});

		peer.on('error', (error) => {
			console.error('Peer エラー:', error);
		});
	}

	initPeerAndCall();
};

const buttonHandlers = {
	init() {
		chatButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.toggleChat();
		});

		closeChatButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.closeChat();
		});

		sendChatButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.sendChat();
		});

		chatInput?.addEventListener('keydown', (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				this.sendChat();
			}
		});

		micButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.toggleMicrophone();
		});

		videoButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.toggleVideo();
		});

		endCallButton?.addEventListener('click', (event) => {
			event.preventDefault();
			this.endCall();
		});
	},

	toggleChat() {
		const isOpen = chatSheet?.classList.toggle('is-open');
		chatSheet?.setAttribute('aria-hidden', String(!isOpen));
		setChatButtonState(Boolean(isOpen));
	},

	closeChat() {
		chatSheet?.classList.remove('is-open');
		chatSheet?.setAttribute('aria-hidden', 'true');
		setChatButtonState(false);
	},

	sendChat() {
		sendChatMessage();
	},

	toggleMicrophone() {
		const track = localStream?.getAudioTracks()[0];
		if (!track) return;
		track.enabled = !track.enabled;
		setMicrophoneButtonState(track.enabled);
		notifyMediaState();
	},

	toggleVideo() {
		const track = localStream?.getVideoTracks()[0];
		if (!track) return;
		track.enabled = !track.enabled;
		setLocalVideoState(track.enabled);
		setVideoButtonState(track.enabled);
		notifyMediaState();
	},

	endCall() {
		finishCallAndGoHome('通話を終了しました。');
	}
};

buttonHandlers.init();
