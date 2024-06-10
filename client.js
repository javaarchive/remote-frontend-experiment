const defaultConfig = {
    verbose: false
}
class RemoteClient extends EventTarget {

    signaling = false;
    state = "uninitialized";

    constructor(config){
        this.config = {
            ...defaultConfig,
            ...config
        };
        self.validateConfig(this.config);
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

    startSignaling(){
        this.state = "signaling";
        this.ws = new WebSocket(this.config.signalingURL);
        this.ws.onopen = () => {
            this.state = "signaling_connected";
            this.ws.send(JSON.stringify({
                type: "connect"
            }));
        }
    }
}

// allows use in the browser
window.RemoteClient = RemoteClient;