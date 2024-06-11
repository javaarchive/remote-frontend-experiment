// many thanks to https://github.com/selkies-project/selkies-gstreamer/tree/main/addons/gst-web/src for being a great reference

const defaultPlatformAdapterConfig = {

};

class DefaultPlatformAdapter extends EventTarget {
    constructor(config = {}){
        super();
        this.config = {
            ...defaultPlatformAdapterConfig,
            ...config
        };
        window.addEventListener('resize', () => {
            this.dispatchEvent(new Event('resize'));
        });
    }

    getResolution(){
        // https://github.com/selkies-project/selkies-gstreamer/blob/acd2e46067ba56bc87414c461832b66a36089693/addons/gst-web/src/input.js#L744
        return [
            parseInt( (() => {var offsetRatioWidth = document.body.offsetWidth * window.devicePixelRatio; return offsetRatioWidth - offsetRatioWidth % 2})() ),
            parseInt( (() => {var offsetRatioHeight = document.body.offsetHeight * window.devicePixelRatio; return offsetRatioHeight - offsetRatioHeight % 2})() )
        ];
    }

    getResolutionOld(){
        return [window.innerWidth, window.innerHeight];
    }

    getPixelRatio(){
        window.devicePixelRatio || 1;
    }
}

const defaultConfig = {
    verbose: false,
    peer_id: 1,
    rtcConfig: {
        lifetimeDuration: "86400s",
        // https://github.com/selkies-project/selkies-gstreamer/blob/acd2e46067ba56bc87414c461832b66a36089693/addons/gst-web/src/webrtc.js#L76C30-L87C10
        iceServers: [
            {
                urls: [
                    "stun:stun.l.google.com:19302"
                ]
            },
        ],
        blockStatus: "NOT_BLOCKED",
        iceTransportPolicy: "all"
    }
}
class RemoteStreamer extends EventTarget {

    signaling = false;
    state = "uninitialized";
    wsMessageQueue = [];

    constructor(config){
        super();
        this.config = {
            ...defaultConfig,
            ...config
        };
        if(!this.config.platform){
            this.config.platform = new DefaultPlatformAdapter();
        }
        this.validateConfig(this.config);
        /**
         * @type {DefaultPlatformAdapter}
         */
        this.platform = this.config.platform;
    }

    setStatus(message){
        console.log("Status Update",message);
        this.dispatchEvent(new CustomEvent('status', {
            detail: message
        }));
    }

    validateConfig(config){
        if(!config.signalingURL){
            throw new Error('signalingURL is required');
        }
    }

    setupRtcPeerConnection(){
        this.peerConnection = new RTCPeerConnection(this.config.rtcConfig);
        this.peerConnection.onicecandidate = this.onPeerIceCanidate.bind(this);
        this.peerConnection.ontrack = this.onTrack.bind(this);
        this.peerConnection.ondatachannel = this.onDataChannel.bind(this);
        this.peerConnection.onconnectionstatechange = this.onConnectionStateChange.bind(this);
    }

    onConnectionDisconnected(){
        this.state = "disconnected";
        this.dispatchEvent(new CustomEvent('stateChange'));
    }

    onConnectionFailed(){
        this.state = "disconnected";
        this.dispatchEvent(new CustomEvent('stateChange'));
    }

    cleanupRtcPeerConnection(){
        if(this.dataChannel){
            try{
                this.dataChannel.close();
            }catch(ex){

            }
        }
    }

    onConnectionStateChange(event){
        this.dispatchEvent(new CustomEvent('connectionStateChange', {
            detail: event
        }));
        let state = this.peerConnection.connectionState;
        // https://github.com/selkies-project/selkies-gstreamer/blob/acd2e46067ba56bc87414c461832b66a36089693/addons/gst-web/src/webrtc.js#L446
        switch (state) {
            case "connected":
                this.state = "connected";
                break;

            case "disconnected":
                this.onConnectionDisconnected();
                break;

            case "failed":
                this.onConnectionFailed();
                break;
            default:
        }
    }

    onTrack(event){
        const track = event.track;

    }

    onDataChannel(event){
    }

    onPeerIceCanidate(event){
        if (event.candidate === null) {
            return;
        }
    }

    removeRtcPeerConnection(){
        if(this.peerConnection){
            this.peerConnection.close();
        }
        this.peerConnection = null;
    }

    start(){
        if(!this.peerConnection){
            this.setupRtcPeerConnection();
        }
        if(this.state == "uninitialized" && !this.signaling){
            this.signaling = true;
            this.startSignaling();
        }
    }

    sendHello(){
        const payload = btoa(JSON.stringify({
            res: this.platform.getResolution(),
            scale: this.platform.getPixelRatio()
        }));
        this.ws.send(`HELLO ${this.config.peer_id} ${payload}`)
    }

    sendJson(type, data){
        if(!this.ws || this.ws.readyState != WebSocket.OPEN){
            // add to queue
            console.warn("WebSocket not open, queueing message",type,data);
            this.messageQueue.push(JSON.stringify({
                [type]: data
            }));
            return;
        }
        this.ws.send(JSON.stringify({
            [type]: data
        }));
    }

    onWebSocketOpen(){
        this.state = "signaling_connected";
        this.setStatus("WebSocket opened");
        this.dispatchEvent(new Event('stateChange'));
        this.sendHello();
    }

    onWebSocketClose(){
        if(this.state == "signaling_connected"){
            thid.queueResignal();
        }
    }

    queueResignal(){
        this.setStatus("Queuing signaling reconnect");
        if(!this.resignal){
            this.resignal = setTimeout(() => {
                this.resignal = null;
                this.startSignaling();
            }, 1000);
        }
    }
    
    catchup(){
        this.setStatus("Flushing WebSocket message queue");
        if(this.wsMessageQueue.length > 0){
            this.wsMessageQueue.forEach(message => {
                this.ws.send(message);
            });
            this.wsMessageQueue = [];
        }
    }

    onWebSocketMessage(ev){
        const data = ev.data;
        if(data === "HELLO"){
            this.setStatus("Got HELLO message from WebSocket.");
            console.log("signaling WebSocket server sent HELLO");
            this.catchup();
        }else if(data.startsWith("ERROR")){
            console.error("signaling WebSocket server sent error",data);
            this.dispatchEvent(new CustomEvent('error', {
                detail: data
            }));
            this.dispatchEvent(new CustomEvent('signalServerError', {
                detail: data
            }));
        }else{
            let payload = JSON.parse(data);
            this.dispatchEvent(new CustomEvent('signalingMessage', {
                detail: payload
            }));
            this.onSignalingPayload(payload);
        }
    }

    onSignalingPayload(payload){
        if(payload.sdp){
            this.onSignalingSdp(payload.sdp);
        }else if(payload.ice){
            this.onSignalingIce(payload.ice);
        }
    }

    onSignalingSdp(sdp){
        this.dispatchEvent(new CustomEvent('signalingSdp', {
            sdp: sdp
        }));
    }

    onSignalingIce(canid_json){
        this.dispatchEvent(new CustomEvent('signalingIce', {
            detail: canid_json
        }));
        this.peerConnection.addIceCandidate(new RTCIceCandidate(canid_json));
    }

    onWebSocketError(ev){
        console.error("Signal WebSocket error",ev);
        this.dispatchEvent(new CustomEvent('error', {
            detail: ev
        }));
        this.dispatchEvent(new CustomEvent('signalWebsocketError', {
            detail: ev
        }));
    }

    startSignaling(){
        this.resignal = null;
        this.state = "signaling";
        this.dispatchEvent(new Event('signalingStarted'));
        this.dispatchEvent(new Event('stateChange'));
        if(this.ws){
            try{
                this.ws.close();
            }catch(ex){
                // silently ignored
            }
        }
        this.ws = new WebSocket(this.config.signalingURL);
        this.ws.addEventListener('open', this.onWebSocketOpen.bind(this));
        this.ws.addEventListener('close', this.onWebSocketClose.bind(this));
        this.ws.addEventListener('message', this.onWebSocketMessage.bind(this));
        this.ws.addEventListener('error', this.onWebSocketError.bind(this));
    }
}

// allows use in the browser
window.RemoteClient = RemoteStreamer;