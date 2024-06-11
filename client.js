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
    tracks = [];

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
        this.setStatus("Received a track of type " + event.track.kind + " track: " + event.track);
        /**
         * @type {MediaStreamTrack}
         */
        const track = event.track;
        /**
         * @type {MediaStream[]}
         */
        const streams = event.streams;
        this.tracks.push([track, streams]);
        this.dispatchEvent(new CustomEvent('track', {
            detail: {
                track,
                streams
            }
        }));
        if(this.element){
            this.setStatus("Attaching track to existing element")
            this.element.srcObject = streams[0];
            this.onElementGotStream();
        }
    }

    onElementGotStream(){
        this.setStatus("Element got a stream");
        this.dispatchEvent(new CustomEvent('elementGotStream'));
        // frontend should hande clicking play
    }

    onDataChannel(event){
        this.setStatus("Received data channel");
        this.dataChannel = event.channel;
        this.dataChannel.onopen = this.onDataChannelOpen.bind(this);
        this.dataChannel.onclose = this.onDataChannelClose.bind(this);
        this.dataChannel.onmessage = this.onDataChannelMessage.bind(this);
    }

    onDataChannelOpen(event){
        this.setStatus("Data channel opened");
    }

    onDataChannelClose(event){
        this.setStatus("Data channel closed");
        this.dataChannel = null;
    }

    sendDataChannelMessage(data){
        if(this.canSendDataChannelMessage()){
            this.dataChannel.send(data);
        }else{
            console.warn("Data channel not open, message lost");
            this.setStatus("Data channel not open, messages are not be delivered.");
        }
    }

    onDataChannelMessage(event){
        const data = event.data;
        try{
            const payload = JSON.parse(data);
            this.onDataChannelPayload(payload);
        }catch(ex){
            console.error("Error parsing data channel message",data,ex);
        }
    }

    sendPong(){
        console.log("Sending pong");
        this.sendDataChannelMessage("pong," + (Date.now() / 1000));
    }

    onDataChannelPayload(payload){
        switch(payload.type){
            case "ping":
                this.sendPong();
                break;
            case "systemaction":
                let action = payload.action;
                this.dispatchEvent(new CustomEvent('systemAction', {
                    detail: action
                }));
                break;
            default:
        }
    }

    onPeerIceCanidate(event){
        if (event.candidate === null) {
            return;
        }
        this.sendSignalingJson("ice", event.candidate);
    }
    /**
     * Resets RTC part
     */
    removeRtcPeerConnection(){
        if(this.peerConnection){
            this.peerConnection.close();
        }
        this.peerConnection = null;
        this.tracks = [];
        if(this.dataChannel){
            try{
                this.dataChannel.close();
            }catch(ex){
                // silently ignored
            }
            this.dataChannel = null;
        }
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

    linkElement(element = null){
        this.element = element;
        // if existing tracks are there
        if(this.tracks.length > 0){
            let streams = this.tracks[0][1];
            this.element.srcObject = streams[0];
            this.onElementGotStream();
        }
    }

    sendHello(){
        const payload = btoa(JSON.stringify({
            res: this.platform.getResolution(),
            scale: this.platform.getPixelRatio()
        }));
        this.ws.send(`HELLO ${this.config.peer_id} ${payload}`)
    }

    sendSignalingJson(type, data){
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

    async onSignalingSdp(sdp){
        this.dispatchEvent(new CustomEvent('signalingSdp', {
            sdp: sdp
        }));
        if(sdp.type != "offer") {
            console.warn("Received SDP of type",sdp.type,"ignoring");
            return;
        }
        this.setStatus("Received SDP");
        this.dispatchEvent(new CustomEvent('signalingSdpOffer', {
            sdp: sdp
        }));
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp));
        let answer = await this.peerConnection.createAnswer();
        this.setStatus("Setting SDP answer");
        this.dispatchEvent(new CustomEvent('signalingSdpAnswer', {
            sdp: answer
        }));
        await this.peerConnection.setLocalDescription(answer);
        this.sendSignalingJson("sdp", answer);
    }

    onSignalingIce(canid_json){
        console.log("signalingIce",canid_json);
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

    canSendDataChannelMessage(){
        return this.dataChannel && this.dataChannel.readyState == "open";
    }
}

const defaultInputConfig = {

};

const ABSOLUTE_MOUSE_TYPE = "m";
const RELATIVE_MOUSE_TYPE = "m2";

class RemoteInput extends EventTarget {
    constructor(config){
        super();
        this.config = {
            ...defaultInputConfig,
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

    active = true;

    /**
     * @type {HTMLElement}
     * @memberof RemoteInput
     */
    element = null;

    mouseMask = 0;

    validateConfig(config){
        
    }

    /**
     * 
     *
     * @param {RemoteClient} remoteClient
     */
    attach(remoteClient, element){
        this.remoteClient = remoteClient;
        this.element = element;
        this.registerEvents(element);
    }

    registerEvents(element){
        this.element.addEventListener("mousedown", this.handleMouseEvent.bind(this));
        this.element.addEventListener("mouseup", this.handleMouseEvent.bind(this));
        this.element.addEventListener("mousemove", this.handleMouseEvent.bind(this));

        this.element.addEventListener("contextmenu", this.contextMenu.bind(this));

        this.element.addEventListener("keydown", this.handleKeyEvent.bind(this));
        this.element.addEventListener("keyup", this.handleKeyEvent.bind(this));

        this.keyboard = new Guacamole.Keyboard(window);
        this.keyboard.onkeydown = (keysym) => {
            this.sendDataChannelMessage("kd," + keysym);
        };
        this.keyboard.onkeyup = (keysym) => {
            this.sendDataChannelMessage("ku," + keysym);
        };
    }

    keyCanceler(event){
        // TODO
    }

    contextMenu(event){
        event.preventDefault();
    }

    handleKeyEvent(event){
        const down = (event.type === 'keydown' ? 1 : 0);
    }

    handleMouseEvent(event){
        const down = (event.type === 'mousedown' ? 1 : 0);
        const button = event.button;
        const buttonMask = (1 << button);
        if(down){
            this.mouseMask |= buttonMask;
        }else {
            this.mouseMask &= ~buttonMask;
        }
        // diff mouse x,y logic I took from a personal project
        // this may cause issues, please report if found
        let x = event.pageX - event.currentTarget.offsetLeft;
        let y = event.pageY - event.currentTarget.offsetTop;

        this.sendMouseEvent(ABSOLUTE_MOUSE_TYPE, x, y, this.mouseMask);
    }

    formatMouseEvent(type, x, y, buttonMask, _ = "0"){
        return `${type},${x},${y},${buttonMask}`;
    }

    sendMouseEvent(type, x, y, mask){
        this.sendDataChannelMessage(this.formatMouseEvent(type, x, y, mask));
    }

    sendDataChannelMessage(data){
        if(this.remoteClient.canSendDataChannelMessage()){
            this.remoteClient.sendDataChannelMessage(data);
        }
        // drop
    }


}

// allows use in the browser
window.RemoteClient = RemoteStreamer;
window.RemoteInput = RemoteInput;