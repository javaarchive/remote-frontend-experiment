

let usp = new URLSearchParams(window.location.search);
let config = {
    signalingURL: usp.get('signalingURL') || (location.origin.replace(/^http/, 'ws')),
    verbose: usp.get('verbose') === '1'
};

// this allows autocomplete in vscode, somehow
/** @type {RemoteClient} */
let client = new RemoteClient(config);
