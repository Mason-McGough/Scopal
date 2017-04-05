/**
* @Author: Pingjun Chen <Pingjun>
* @Date:   2017-02-07T17:46:36-05:00
* @Email:  codingPingjun@gmail.com
* @Filename: musclerecord.js
* @Last modified by:   pingjun
* @Last modified time: 2017-Feb-17 11:53:04
* @License: The MIT License (MIT)
* @Copyright: Lab BICI2. All Rights Reserved.
*/

var audio_context;
var recorder;
var sample_rate_flac=44100;

function __log(e, data) {
  if(debug) console.log("\n" + e + " " + (data || ''));
}

function isEmpty(obj) {
  for (var key in obj) {
    if (obj.hasOwnProperty(key))
    return false;
  }
  return true;
}

function startUserMedia(stream) {
  var input = audio_context.createMediaStreamSource(stream);
  __log('Media stream created.' );
  __log("input sample rate " + input.context.sampleRate);

  // Feedback!
  //input.connect(audio_context.destination);
  __log('Input connected to audio context destination.');
  recorder = new Recorder(input, {
    numChannels: 1
  });
  __log('Recorder initialised.');
}

function startRecording(button) {
  // check that a region is selected before executing
  if (!region) {
      return;
  }
  recorder && recorder.record();
  button.disabled = true;
  button.nextElementSibling.disabled = false;
  $(button).hide();
  $(button).parent().prev().fadeIn();
  $(button.nextElementSibling).show();

  var recordingslist = $(button).parent().next().children();
  recordingslist.empty();
  __log('Recording...');
}

function stopRecording(button) {
  recorder && recorder.stop();
  button.disabled = true;
  button.previousElementSibling.disabled = false;
  $(button).hide();
  $(button.previousElementSibling).show();
  $(button).parent().prev().fadeOut();

  __log('Stopped recording.');
  recorder && recorder.exportWAV(function(blob) {});
  recorder && recorder.clear();
}


window.onload = function init() {
  try {
    // webkit shim
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    navigator.getUserMedia = ( navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia);
      window.URL = window.URL || window.webkitURL;

      audio_context = new AudioContext;
      __log('Audio context set up.');
      __log('navigator.getUserMedia ' + (navigator.getUserMedia ? 'available.' : 'not present!'));
    } catch (e) {
      alert('No web audio support in this browser!');
    }

    navigator.getUserMedia({audio: true}, startUserMedia, function(e) {
      __log('No live audio input: ' + e);
    });
  };


// uploadAudio() have changes
(function(window){
var Recorder = function(source, cfg){
  var config = cfg || {};
  var bufferLen = config.bufferLen || 4096;
  var numChannels = config.numChannels || 2;
  this.context = source.context;
  this.node = (this.context.createScriptProcessor ||
    this.context.createJavaScriptNode).call(this.context,
      bufferLen, numChannels, numChannels);

  var WORKER_PATH = '../static/js/Recordmp3js/recorderWorker.js';
  var worker = new Worker(config.workerPath || WORKER_PATH);
  worker.postMessage({
    command: 'init',
    config: {
      sampleRate: this.context.sampleRate,
      numChannels: numChannels
    }
  });

  var recording = false, currCallback;

  this.node.onaudioprocess = function(e){
    if (!recording) return;
    var buffer = [];
    for (var channel = 0; channel < numChannels; channel++){
      buffer.push(e.inputBuffer.getChannelData(channel));
    }
    worker.postMessage({
      command: 'record',
      buffer: buffer
    });
  }

  this.configure = function(cfg){
    for (var prop in cfg){
      if (cfg.hasOwnProperty(prop)){
        config[prop] = cfg[prop];
      }
    }
  }
  this.record = function(){
    recording = true;
  }
  this.stop = function(){
    recording = false;
  }
  this.clear = function(){
    worker.postMessage({ command: 'clear' });
  }
  this.getBuffer = function(cb) {
    currCallback = cb || config.callback;
    worker.postMessage({ command: 'getBuffer' })
  }
  this.exportWAV = function(cb, type){
    currCallback = cb || config.callback;
    type = type || config.type || 'audio/wav';
    if (!currCallback) throw new Error('Callback not set');
    worker.postMessage({
      command: 'exportWAV',
      type: type
    });
  }

  //Mp3 conversion
  worker.onmessage = function(e){
    var blob = e.data.wav;
    var raw = e.data.raw;
    var arrayBuffer;
    var fileReader = new FileReader();

    fileReader.onload = function(){
      arrayBuffer = this.result;
      var buffer = new Uint8Array(arrayBuffer),
      data = parseWav(buffer);

      var mp3encoderWorker = new Worker('../static/js/Recordmp3js/mp3Worker.js');
      //-------------------------MP3 encoding---------------------------------
      mp3encoderWorker.postMessage({ cmd: 'init', config:{
        mode : 3,
        channels:1,
        samplerate: data.sampleRate,
        bitrate: data.bitsPerSample
      }});

      mp3encoderWorker.postMessage({ cmd: 'encode', buf: Uint8ArrayToFloat32Array(data.samples) });
      mp3encoderWorker.postMessage({ cmd: 'finish'});
      mp3encoderWorker.onmessage = function(e) {
        if (e.data.cmd == 'data') {
          //console.log("Done converting to Mp3");
          var mp3Blob = new Blob([new Uint8Array(e.data.buf)], {type: 'audio/mp3'});
          uploadAudio(mp3Blob);

          if( debug ) console.log(" > creating the playback for the recorded region");
          var url = 'data:audio/mp3;base64,'+encode64(e.data.buf);
//          var seluid = $(".region-tag.selected").attr('id');
//          var li = document.createElement('li');
//          var au = document.createElement('audio');
//
//          au.controls = true;
//          au.src = url;
//          au.style.width='100%';
//
//          li.appendChild(au);
//          $('#rl-'+seluid).append(li);

            $("#menuAudioPlayer").attr("src", url);
        }
      }// end encodeWorker.onmessage

    };// end fileReader onload

    fileReader.readAsArrayBuffer(blob);
    currCallback(blob);

    //===================FLAC Encoding================================
    if ( debug ) console.log('> working on the flac initialization..');
    var flacencoderWorker = new Worker('../static/js/Recordmp3js/flacWorker.js')
    flacencoderWorker.postMessage({ cmd: 'init', config:{
        samplerate : sample_rate_flac,
        bps:16,
        channels: 1,
        compression: 5
      }});

    if ( debug ) console.log('> working on the flac encoding now');
    flacencoderWorker.postMessage({ cmd: 'encode', buf: raw });
    flacencoderWorker.postMessage({ cmd: 'finish' });
    flacencoderWorker.onmessage = function (e) {
      if (e.data.cmd == 'end') {
        if ( debug ) console.log('> done with flac encoding');
        var reader = new FileReader();
        reader.onload = function(){
          var flacData=encode64(this.result);
          uploadFlac(flacData);
          sendASRRequest(flacData);
        }
        reader.readAsArrayBuffer(e.data.buf);
        flacencoderWorker.terminate();
        flacencoderWorker = null;
        if (debug) console.log(e.data.buf);
      }
    };// end flac encoder
  }// end on message worker

  function sendASRRequest(blob) {
      var _google_api_key = 'AIzaSyDAK2WnLt3T9n3Q3IxvkMBDgW8rL2J1d94';
      var key = _google_api_key;
      var requestData={};
      requestData.config={encoding: "FLAC",sampleRate: sample_rate_flac};
      requestData.audio={content: blob};
      var cur_id = $(".region-tag.selected").attr('id');
      var messageSpan = $('#regionStatus');
      messageSpan.html('Translating...');
      messageSpan.attr('class','region-translating');
      messageSpan.fadeIn();
      $.ajax({ // asynchronous javascript and xml
        type: 'POST',
        url: ' https://speech.googleapis.com/v1beta1/speech:syncrecognize?key='+key,
        contentType: "application/json; charset=utf-8",
        data: JSON.stringify(requestData)
      }).done(function(responseData) {
        var reg_idx = -1;
        var cur_img_region = ImageInfo[currentImage]["Regions"];
        messageSpan.fadeOut("slow", function() {
            messageSpan.html('Recording...');
            messageSpan.attr('class','region-recording');
        });

        for(var i = 0; i < cur_img_region.length; i++ )
        {
          // if (debug) console.log("region id >", cur_img_region[i].uid);
          if (cur_img_region[i].uid == cur_id)
            reg_idx = i;
        }

        if (reg_idx >= 0) {
          if (isEmpty(responseData)) {
            $("#desp-"+cur_id).val('Please speak again...');
            ImageInfo[currentImage]["Regions"][reg_idx].transcript = '';
            if( debug ) console.log(" > Hear nothing ");
          }
          else {
            var confidence = responseData.results[0].alternatives[0].confidence;
            var transcript = responseData.results[0].alternatives[0].transcript;
            $("#desp-"+cur_id).val(transcript);
            ImageInfo[currentImage]["Regions"][reg_idx].transcript = transcript;

            if( debug ) console.log(" > ", confidence);
            if( debug ) console.log(" > ", transcript);
          }
        }

      });
      if (debug) console.log("Waiting for Recognition Result...");
  }


  function uploadAudio(mp3Data){
    if ( debug ) console.log('> working on the upload');
    var reader = new FileReader();
    reader.onload = function(event){
      var fd = new FormData();

      fd.append('data', event.target.result);
      fd.append('imageidx', currentImage);
      fd.append('uid', $(".region-tag.selected").attr('id'));

      $.ajax({ // asynchronous javascript and xml
        type: 'POST',
        url: '/uploadmp3/',
        data: fd,
        processData: false,
        contentType: false
      }).done(function() {
        if( debug ) console.log(" > upload finish");
      });
    };
    reader.readAsDataURL(mp3Data);
  }

  function uploadFlac(flacData) {
    if ( debug ) console.log('> upload flac to server');
    var fd = new FormData();

      fd.append('data', flacData);
      fd.append('imageidx', currentImage);
      fd.append('uid', $(".region-tag.selected").attr('id'));
      $.ajax({ // asynchronous javascript and xml
        type: 'POST',
        url: '/uploadFLAC/',
        data: fd,
        processData: false,
        contentType: false
      }).done(function() {
        if( debug ) console.log(" > upload FLAC finished");
      });
  }

  function encode64(buffer) {
    var binary = '',
    bytes = new Uint8Array( buffer ),
    len = bytes.byteLength;
    for (var i = 0; i < len; i++) {
      binary += String.fromCharCode( bytes[ i ] );
    }
    return window.btoa( binary );
  }

  function parseWav(wav) {
    function readInt(i, bytes) {
      var ret = 0,
      shft = 0;
      while (bytes) {
        ret += wav[i] << shft;
        shft += 8;
        i++;
        bytes--;
      }
      return ret;
    }
    if (readInt(20, 2) != 1) throw 'Invalid compression code, not PCM';
    if (readInt(22, 2) != 1) throw 'Invalid number of channels, not 1';
    return {
      sampleRate: readInt(24, 4),
      bitsPerSample: readInt(34, 2),
      samples: wav.subarray(44)
    };
  }

  function Uint8ArrayToFloat32Array(u8a){
    var f32Buffer = new Float32Array(u8a.length);
    for (var i = 0; i < u8a.length; i++) {
      var value = u8a[i<<1] + (u8a[(i<<1)+1]<<8);
      if (value >= 0x8000) value |= ~0x7FFF;
      f32Buffer[i] = value / 0x8000;
    }
    return f32Buffer;
  }

  source.connect(this.node);
  this.node.connect(this.context.destination);    //this should not be necessary
  };// end var Recorder

window.Recorder = Recorder;
})(window);
