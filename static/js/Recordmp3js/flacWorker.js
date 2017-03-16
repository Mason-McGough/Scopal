importScripts('libflac.js');

var flac_encoder,
	BUFSIZE = 4096,
	CHANNELS = 1,
	SAMPLERATE = 44100,
	COMPRESSION = 5,
	BPS = 16,
	flac_ok = 1,
	flacLength = 0,
	flacBuffers = [];

self.onmessage = function (e) {

	switch (e.data.cmd) {
		case 'init':
			// using FLAC
			if (!e.data.config) {
				e.data.config = { bps: BPS, channels: CHANNELS, samplerate: SAMPLERATE, compression: COMPRESSION };
			}

			e.data.config.channels = e.data.config.channels ? e.data.config.channels : CHANNELS;
			e.data.config.samplerate = e.data.config.samplerate ? e.data.config.samplerate : SAMPLERATE;
			e.data.config.bps = e.data.config.bps ? e.data.config.bps : BPS;
			e.data.config.compression = e.data.config.compression ? e.data.config.compression : COMPRESSION;

			////
			COMPRESSION = e.data.config.compression;
			BPS = e.data.config.bps;
			SAMPLERATE = e.data.config.samplerate;
			CHANNELS = e.data.config.channels;
			////

			flac_encoder = Flac.init_libflac(SAMPLERATE, CHANNELS, BPS, COMPRESSION, 0);

			console.log('Channels: '+CHANNELS + ' / ',
			'Input Samplate: '+ SAMPLERATE + ' / ',
			'Output Samplate: '+ SAMPLERATE + ' / ',
			'BitRate :' +BPS);

			////
			if (flac_encoder != 0) {
				var status_encoder = Flac.init_encoder_stream(flac_encoder, write_callback_fn);
				flac_ok &= (status_encoder == 0);

				console.log("flac init     : " + flac_ok);//DEBUG
				console.log("status encoder: " + status_encoder);//DEBUG

				INIT = true;
			} else {
				console.error("Error initializing the encoder.");
			}

			break;
		case 'encode':
			// FLAC
			var buf_length = e.data.buf.length;
			var buffer_i32 = new Uint32Array(buf_length);
			var view = new DataView(buffer_i32.buffer);
			var volume = 1;
			var index = 0;
			console.log(" > Buffer length:",buf_length);

			for (var i = 0; i < buf_length; i++) {
				view.setInt32(index, (e.data.buf[i] * (0x7FFF * volume)), true);
				index += 4;
			}

			var flac_return = Flac.encode_buffer_pcm_as_flac(flac_encoder, buffer_i32, CHANNELS, buf_length);
			if (flac_return != true) {
				console.log(" > Error: encode_buffer_pcm_as_flac returned false. " + flac_return);
			}
			else {
				console.log("encoding success")
			}
			break;
		case 'finish':
			var data;
			flac_ok &= Flac.FLAC__stream_encoder_finish(flac_encoder);
			console.log("flac finish: " + flac_ok);//DEBUG
			data = exportFlacFile(flacBuffers, flacLength, mergeBuffersUint8);
			clear();
			self.postMessage({ cmd: 'end', buf: data , samplerate: SAMPLERATE});
			break;
	}
};

function write_callback_fn(buffer, bytes) {
	flacBuffers.push(buffer);
	flacLength += buffer.byteLength;
}

function exportFlacFile(recBuffers, recLength) {
	//convert buffers into one single buffer
	var samples = mergeBuffersUint8(recBuffers, recLength);

	//	var audioBlob = new Blob([samples], { type: type });
	var the_blob = new Blob([samples]);
	return the_blob;
}

function mergeBuffersUint8(channelBuffer, recordingLength) {
	var result = new Uint8Array(recordingLength);
	var offset = 0;
	var lng = channelBuffer.length;
	for (var i = 0; i < lng; i++) {
		var buffer = channelBuffer[i];
		result.set(buffer, offset);
		offset += buffer.length;
	}
	return result;
}

/*
 * clear recording buffers
 */
function clear() {
	flacBuffers.splice(0, flacBuffers.length);
	flacLength = 0;
	// wavBuffers.splice(0, wavBuffers.length);
	// wavLength = 0;
}
