// creating socket io 
const socket = io.connect('http://127.0.0.1:3000/');



let track = null;
let stream;
let src;
let mediaRecorder


let chunks = [];
let constraint = { audio: { noiseSuppression: true, echoCancellation: true }, video: false };
// let constraint = { audio: true, video: false };
let listen = false; //microphone is off

async function start(constraint) {

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        track = stream.getAudioTracks()[0];

        mediaRecorder = new MediaRecorder(stream);
        console.log(mediaRecorder);
        mediaRecorder.start();

        mediaRecorder.ondataavailable = function(e) {
            chunks.push(e.data);
        }

        mediaRecorder.onstop = function(e) {
            var blob = new Blob(chunks, { 'type': 'audio/webm; codecs=opus' });
            chunks = [];
            let uniqString = (new Date%9e6).toString(36);
            // let audioURL = URL.createObjectURL(blob);
            socket.emit('data', {blob: blob, id:uniqString});


            // stop microphone
            stream.getAudioTracks().forEach(track => {
                track.stop();
            });
        }

        mediaRecorder.onerror = function(e) {
            console.log(e);
            console.log(e.error);
        }

    } catch (e) {
        console.log(e);
    }
}


document.getElementById('audio').addEventListener('click', () => {
    if (!listen) {
        start(constraint);
        listen = true;
        console.log('start audio recrding ...');
    } else {
        mediaRecorder.stop();
        listen = false;
        console.log('stop audio recrding ...');
    }
});

socket.on('res', data=>{
    console.log(JSON.parse(data));
});