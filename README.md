# remote-frontend-experiment
Minimalistic remoting frontend. 

The purpose of this project is to serve as a base for other frontends that will be a bit more complex or stylish.

# development
Use a static server of your choice. For a simple one, you can use `python -m http.server <port>` which should work on a wide variety of platforms.

# testing url format
`http://localhost:8000/?ws=ws://user:password@localhost:8080/webrtc/signalling/`

# todo
* query parameters are seen by the server hosting the static thing, TODO: fix this