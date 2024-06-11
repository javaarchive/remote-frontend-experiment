

let usp = new URLSearchParams(window.location.search);
let config = {
    signalingURL: usp.get('ws') || (location.origin.replace(/^http/, 'ws')),
    verbose: usp.get('verbose') === '1'
};

document.addEventListener('DOMContentLoaded', () => {
    // this allows autocomplete in vscode, somehow
    /** @type {RemoteStreamer} */
    let client = new RemoteStreamer(config);

    // elements
    let statusEl = document.getElementById('status');

    function updateStatus(message){
        statusEl.innerText = message;
    }

    const clickgrabberEl = document.getElementById('clickgrabber');
    const videoEl = document.getElementById('video');
    const audioEl = document.getElementById('audio');
    const contentEl = document.getElementById('content');

    function enableClickGrabber(){
        clickgrabberEl.classList.remove("hidden");
    }

    function disableClickGrabber(){
        clickgrabberEl.classList.add("hidden");
    }

    updateStatus("Connecting to WebSocket");

    client.linkElement(videoEl);

    /**
     * @type {RemoteInput}
     */
    const input = new RemoteInput(config);
    input.attach(client, videoEl);
    input.setContainer(contentEl);

    client.addEventListener("elementGotStream", () => {
        updateStatus("Click anywhere to play stream");
        enableClickGrabber();
    });

    clickgrabberEl.addEventListener("click", () => {
        videoEl.play();
        audioEl.play();
        disableClickGrabber();
    });

    client.addEventListener("status", (ev) => {
        updateStatus(ev.detail);
    });

    client.start();
});