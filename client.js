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
    peer_id: 1
}
class RemoteStreamer extends EventTarget {

    signaling = false;
    state = "uninitialized";

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

    start(){
        if(this.state == "uninitialized" && !this.signaling){
            this.signaling = true;
            this.startSignaling();
        }
    }

    onSignallingMessage(message){

    }

    sendHello(){
        const payload = btoa(JSON.stringify({
            res: this.platform.getResolution(),
            scale: this.platform.getPixelRatio()
        }));
        this.ws.send(`HELLO ${this.config.peer_id} ${payload}`)
    }

    sendJson(type, data){
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
            this.state = "signaling";
            // TODO: attempt reconnect
        }
    }

    queueResignal(){
        if(!this.resignal){
            this.resignal = setTimeout(() => {
                this.resignal = null;
                this.startSignaling();
            }, 1000);
        }
    }

    onWebSocketMessage(ev){
        const data = ev.data;
        if(data === "HELLO"){
            this.setStatus("Got HELLO message from WebSocket.");
            console.log("Signalling WebSocket server sent HELLO");
        }else if(data.startsWith("ERROR")){
            console.error("Signalling WebSocket server sent error",data);
            this.dispatchEvent(new CustomEvent('error', {
                detail: data
            }));
            this.dispatchEvent(new CustomEvent('signalServerError', {
                detail: data
            }));
        }else{
            let payload = JSON.parse(data);
            this.dispatchEvent(new CustomEvent('signallingMessage', {
                detail: payload
            }));
            this.onSignalingPayload(payload);
        }
    }

    onSignalingPayload(payload){
        
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