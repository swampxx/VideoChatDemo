'use strict';

var isChannelReady = false;
var isInitiator = false;
var isStarted = false;
var localStream;
var pc, pcThird;
var remoteStream;
var turnReady;
var isThird = true ; //To fix third user, 
					// 'bye' messsage bug.
// Look for STUN and TURN servers --- for demo

var pcConfig = {
		'iceServers': [{
		'urls': 'stun:stun.l.google.com:19302'
	}]
};

var sdpConstraints = {
	offerToReceiveAudio: true,
	offerToReceiveVideo: true
};

var thirdPeerConstraints = {
	offerToReceiveVideo: false,
	offerToReceiveAudio: false
};

//var room = 'foo';
var room = prompt('Enter room name:');

var socket = io.connect();


if (room !== '') {
	socket.emit('create or join', room);
}



socket.on('created', function(room) {
	isInitiator = true;
});

socket.on('full', function(room) {
	console.log('roomIsFull');
});

socket.on('join', function (room){
	isChannelReady = true;
});

socket.on('joined', function(room) {
	isChannelReady = true;
});

socket.on('log', function(array) {
	console.log.apply(console, array);
});

function sendMessage(message) {
	socket.emit('message', {
		r: room, 
		msg: message});
}

// RECEIVING MESSAGES
socket.on('message', function(message) {
	console.log("mesaj alindi");
	if (message === 'got user media') {
	maybeStart();
	} 
	else if (message.type === 'offer') {
		if (!isInitiator && !isStarted) {
			maybeStart();
		}
		pc.setRemoteDescription(new RTCSessionDescription(message));
		doAnswer();
	} 
	else if (message.type === 'answer' && isStarted) {
		pc.setRemoteDescription(new RTCSessionDescription(message));
	} 
	else if (message.type === 'candidate' && isStarted) {
		var candidate = new RTCIceCandidate({
			sdpMLineIndex: message.label,
			candidate: message.candidate 
		});
		pc.addIceCandidate(candidate);
	} 
	else if (message === 'bye' && isStarted) {
		handleRemoteHangup();
	}
});

//Receiving messages for THIRDclient


var localVideo = document.querySelector('#localVideo');
var remoteVideo = document.querySelector('#remoteVideo');

//starts========###
var constraints = {
	video: true,
	audio: true
};

var constraintsThird = {
	video: false,
	audio: false
};

navigator.mediaDevices.getUserMedia(constraints)
	.then(gotStream);


function gotStream(stream) {
	console.log('Adding local stream.');
	localStream = stream;
	localVideo.srcObject = stream;
	sendMessage('got user media');
	console.log(isInitiator);
	if (isInitiator) {
		maybeStart();
	}
}

console.log('Getting user media with constraints', constraints);
// ######### look for TURN AND STUN
if (location.hostname !== 'localhost') {
	requestTurn(
		'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
	);
}

function maybeStart() {
	console.log('>>>>>>> maybeStart() ', isStarted, localStream, isChannelReady);
	if (!isStarted && typeof localStream !== 'undefined' && isChannelReady) {
		console.log('>>>>>> creating peer connection');
		createPeerConnection();
		console.log('qwe');
		pc.addStream(localStream);
		console.log('asd');
		isStarted = true;
		console.log('isInitiator', isInitiator);
		if (isInitiator) {
			doCall();
		}
	}
}

window.onbeforeunload = function() {
	console.log('user disconnected');
	if(!isThird)
		sendMessage('bye');
};

/////////////////////////////////////////////////////////

function createPeerConnection() {
	try {
		pc = new RTCPeerConnection(null);
		pc.onicecandidate = handleIceCandidate;
		pc.onaddstream = handleRemoteStreamAdded;
		pc.onremovestream = handleRemoteStreamRemoved;
		console.log('Created RTCPeerConnnection');
		isThird = false;
	} 
	catch (e) {
		console.log('Failed to create PeerConnection, exception: ' + e.message);
		alert('Cannot create RTCPeerConnection object.');
		return;
	}
}

function handleIceCandidate(event) {
	console.log('icecandidate event: ', event);
	if (event.candidate) {
		sendMessage({
			type: 'candidate',
			label: event.candidate.sdpMLineIndex,
			id: event.candidate.sdpMid,
			candidate: event.candidate.candidate
	});
	} 
	else {
		console.log('End of candidates.');
	}
}

function handleCreateOfferError(event) {
	console.log('createOffer() error: ', event);
}

function doCall() {
	console.log('Sending offer to peer');
	pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
	console.log('Sending answer to peer.');
	pc.createAnswer().then(
		setLocalAndSendMessage,
		onCreateSessionDescriptionError
	);
}

function setLocalAndSendMessage(sessionDescription) {
	pc.setLocalDescription(sessionDescription);
	console.log('setLocalAndSendMessage sending message', sessionDescription);
	sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
	trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
	var turnExists = false;
	for (var i in pcConfig.iceServers) {
		if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
			turnExists = true;
			turnReady = true;
			break;
		}
	}
	if (!turnExists) {
		console.log('Getting TURN server from ', turnURL);
		// No TURN server ===> Get one from computeengineondemand.appspot.com:
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function() {
		if (xhr.readyState === 4 && xhr.status === 200) {
				var turnServer = JSON.parse(xhr.responseText);
				console.log('Got TURN server: ', turnServer);
				pcConfig.iceServers.push({
					'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
					'credential': turnServer.password
				});
				turnReady = true;
		}
	};
		xhr.open('GET', turnURL, true);
		xhr.send();
	}
}

function handleRemoteStreamAdded(event) {
	console.log('Remote stream added.');
	remoteStream = event.stream;
	remoteVideo.srcObject = remoteStream;
}

function handleRemoteStreamRemoved(event) {
	console.log('Remote stream removed. Event: ', event);
}

function hangup() {
	console.log('Hanging up.');
	stop();
	sendMessage('bye');
}

function handleRemoteHangup() {
	console.log('Session terminated.');
	isInitiator = true;
	isStarted = false;
	isChannelReady = false;
	hangup();
}

function stop() {
	isStarted = false;
	pc.close();
	pc = null;
}

var button = document.getElementById('closeButton');

button.addEventListener('click',hangup);
