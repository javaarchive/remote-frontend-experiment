

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

    updateStatus("Connecting to WebSocket");

    client.addEventListener("status", (ev) => {
        updateStatus(ev.detail);
    });

    client.start();
});