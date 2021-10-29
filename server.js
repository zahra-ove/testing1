// start point
const fs = require('fs');
var wav = require('wav');
const { v4: uuidv4 } = require('uuid')
const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server);
const path = require('path');
// var ss = require('socket.io-stream'); // not used
const vosk = require('vosk');
const { Readable } = require("stream");
const ffmpeg = require('ffmpeg');

//----- constatns
SAMPLE_RATE = 16000;
let received_audio = null;
let id = null;
let STT =  [{id:45, result:"bjhbvhdsbvb"}, {id:89, result:"uuuu"}];
//-----


app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

app.get('/', (req, res) => {
    res.render('index');
});


//============== api routes start ==============//
// app.get('/api/v1/voice/:id/get', function(req, res) {

//     let wanted_stt = STT.find(stt => stt.id === req.params.id);
//     if(!wanted_stt) res.status(404).send('تکست مورد نظر یافت نشد');

//     console.log(wanted_stt);
//     // res.send(JSON.stringify(wanted_stt));
//     res.send(wanted_stt);
// });
//============== api routes end ==============//
let dir = './audios';
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {
        recursive: true
    });
}




// MODEL_PATH = "models/farsi-model-big"; //model path for big persian model
MODEL_PATH = "models/farsi-model-small"; //model path for small persian model
const model = new vosk.Model(MODEL_PATH); //load vosk model
console.log('vosk model loaded');


io.on('connection', socket => {
    console.log('someone connecting to socketio');

    socket.on('data', data => {
        received_audio = data.blob;
        id = data.id;

        let currentTime = Date.now(); //time as unique string
        let uuid_var = uuidv4(); // unique code
        let file = `original_${uuid_var}_audio_${currentTime}.webm`;
        let converted_file = `convetred_${uuid_var}_audio_${currentTime}.webm`;

        //todo: save in STT array
        STT.push({id:id, result:null, raw_received_audio:received_audio, original_file:file, converterd_file:converted_file});
        console.log(received_audio);
        console.log(id);
        console.log(STT);


        // FILE_NAME = file;
        // let FILE_FULL_DIR = dir + '/' + file;
        // let CONVERTED_FILE_FULL_DIR = dir + '/' + converted_file;

        // // open function with filename, file opening mode and callback function
        // fs.open(file, 'w', function(err, file) {
        //     if (err) {
        //         throw err;
        //         console.log('err occured line 93');
        //     }
        //     console.log('File is opened in write mode.');
        // });
        // const stream = fs.createWriteStream(path.join(__dirname, './audios/' +
        //     file));
        // stream.write(received_audio);


        let r = to_wav_converter(id, received_audio, socket);

    });


});







const hostname = '127.0.0.1';
const port = process.env.PORT || 3000;

server.listen(port, hostname, () => {
    console.log(`Server running at http: //${hostname}:${port}/`);
});


async function to_wav_converter(sampleId, receivedAudio, socket) 
{
    
    let sttIndx = STT.find(stt => stt.id === sampleId);    // related object
    console.log(sttIndx);


    let file_full_dir = dir + '/' + sttIndx.original_file;
    let converted_file_full_dir = dir + '/' + sttIndx.converterd_file;


    //===========
    fs.writeFile(file_full_dir, receivedAudio, (error) => {
        if (error) throw error;
        else {
            console.log('file is written successfully');
    
            try {
                var process = new ffmpeg(file_full_dir);
                process.then(function(receivedAudio) {
                    receivedAudio.setVideoFormat('wav') //convert to wav format
                            .setAudioChannels(1)
                            .setAudioFrequency(16000)
                            .setVideoBitRate(256)
                            .save(converted_file_full_dir, function(err, file) {
                                if (!err) {
                                    console.log('Video file: ' + file);
                                    //================ added
                                    if (!fs.existsSync(MODEL_PATH)) {
                                        console.log("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.")
                                        process.exit()
                                    }
        
                                    vosk.setLogLevel(0);
                                    // const model = new vosk.Model(MODEL_PATH);
                                    const wfReader = new wav.Reader();
                                    const wfReadable = new Readable().wrap(wfReader);
        
                                    wfReader.on('format', async({ audioFormat, sampleRate, channels }) => {
                                        console.log('we are here in wfReader format section');
                                        console.log('audioFormat: ' + audioFormat);
                                        console.log('sampleRate: ' + sampleRate);
                                        console.log('channels: ' + channels);
        
                                        if (audioFormat != 1 || channels != 1) {
                                            console.error("Audio file must be WAV format mono PCM.");
                                            process.exit(1);
                                        }
                                        // const rec = new vosk.Recognizer({ model: model, sampleRate: sampleRate });
                                        const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });
                                        rec.setMaxAlternatives(10);
                                        rec.setWords(true);
        
                                        for await (const data of wfReadable) {
                                            const end_of_speech = rec.acceptWaveform(data);
                                            console.log('we are here in end_of_speech ' + end_of_speech);
                                            if (end_of_speech) {
                                                console.log('rec result:');
                                                console.log(JSON.stringify(rec.result(), null, 4));
                                            }
                                        }
                                        console.log('rec final result:');
                                        console.log(JSON.stringify(rec.finalResult(rec), null, 4));
                                        //----
                                        // let signleSTT = {id: id, result:JSON.stringify(rec.finalResult(rec))};
        
                                        // let sttIndx = STT.find(stt => stt.id === sampleId);
                                        sttIndx.result = JSON.stringify(rec.finalResult(rec));
        
                                        console.log(sttIndx);
                                        console.log(STT);
        
                                        // socket.emit('res', sttIndx.result);
                                        console.log(sttIndx.result);
                                        socket.emit('res', sttIndx.result);
                                        //----
        
                                        rec.free();
        
                                        return await Promise.resolve(sttIndx.result);   //--- added for test
                                    });
        
                                    let readableFile = fs.createReadStream(converted_file_full_dir);
                                    readableFile.pipe(wfReader);
        
                                    //================ added
                                } else {
                                    console.log('error occured in line 123');
                                }
        
                            });
        
                        console.log('The video processed');
                        
                    },
                    function(err) {
                        console.log('Error: ' + err);
                    });
            } catch (e) {
                console.log(e.code);
                console.log(e.msg);
            }
        }
    });

    // open function with filename, file opening mode and callback function
    // fs.open(file_full_dir, 'w', function(err, file) {
    //     if (err) {
    //         throw err;
    //         console.log('err occured line 93');
    //     }
    //     console.log('File is opened in write mode.');
    // });
    // // const stream = fs.createWriteStream(path.join(__dirname, './audios/' +
    // //     file));
    // const stream = fs.createWriteStream(file_full_dir);
    // stream.write(received_audio);


    // try {
    //     var process = new ffmpeg(file_full_dir);
    //     process.then(function(receivedAudio) {
    //         receivedAudio.setVideoFormat('wav') //convert to wav format
    //                 .setAudioChannels(1)
    //                 .setAudioFrequency(16000)
    //                 .setVideoBitRate(256)
    //                 .save(converted_file_full_dir, function(err, file) {
    //                     if (!err) {
    //                         console.log('Video file: ' + file);
    //                         //================ added
    //                         if (!fs.existsSync(MODEL_PATH)) {
    //                             console.log("Please download the model from https://alphacephei.com/vosk/models and unpack as " + MODEL_PATH + " in the current folder.")
    //                             process.exit()
    //                         }

    //                         vosk.setLogLevel(0);
    //                         // const model = new vosk.Model(MODEL_PATH);
    //                         const wfReader = new wav.Reader();
    //                         const wfReadable = new Readable().wrap(wfReader);

    //                         wfReader.on('format', async({ audioFormat, sampleRate, channels }) => {
    //                             console.log('we are here in wfReader format section');
    //                             console.log('audioFormat: ' + audioFormat);
    //                             console.log('sampleRate: ' + sampleRate);
    //                             console.log('channels: ' + channels);

    //                             if (audioFormat != 1 || channels != 1) {
    //                                 console.error("Audio file must be WAV format mono PCM.");
    //                                 process.exit(1);
    //                             }
    //                             // const rec = new vosk.Recognizer({ model: model, sampleRate: sampleRate });
    //                             const rec = new vosk.Recognizer({ model: model, sampleRate: SAMPLE_RATE });
    //                             rec.setMaxAlternatives(10);
    //                             rec.setWords(true);

    //                             for await (const data of wfReadable) {
    //                                 const end_of_speech = rec.acceptWaveform(data);
    //                                 console.log('we are here in end_of_speech ' + end_of_speech);
    //                                 if (end_of_speech) {
    //                                     console.log('rec result:');
    //                                     console.log(JSON.stringify(rec.result(), null, 4));
    //                                 }
    //                             }
    //                             console.log('rec final result:');
    //                             console.log(JSON.stringify(rec.finalResult(rec), null, 4));
    //                             //----
    //                             // let signleSTT = {id: id, result:JSON.stringify(rec.finalResult(rec))};

    //                             // let sttIndx = STT.find(stt => stt.id === sampleId);
    //                             sttIndx.result = JSON.stringify(rec.finalResult(rec));

    //                             console.log(sttIndx);
    //                             console.log(STT);

    //                             // socket.emit('res', sttIndx.result);
    //                             //----

    //                             rec.free();

    //                             return await Promise.resolve(sttIndx.result);   //--- added for test
    //                         });

    //                         let readableFile = fs.createReadStream(converted_file_full_dir);
    //                         readableFile.pipe(wfReader);

    //                         //================ added
    //                     } else {
    //                         console.log('error occured in line 123');
    //                     }

    //                 });

    //             console.log('The video processed');
                
    //         },
    //         function(err) {
    //             console.log('Error: ' + err);
    //         });
    // } catch (e) {
    //     console.log(e.code);
    //     console.log(e.msg);
    // }
}
