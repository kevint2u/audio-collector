/*
References:
http://www.html5rocks.com/en/tutorials/getusermedia/intro/#toc-webaudio-api
http://modernizr.com/docs/
https://nusofthq.com/blog/recording-mp3-using-only-html5-and-javascript-recordmp3-js/
http://blog.groupbuddies.com/posts/39-tutorial-html-audio-capture-streaming-to-node-js-no-browser-extensions
http://www.smartjava.org/content/record-audio-using-webrtc-chrome-and-speech-recognition-websockets
utlimately most useful: https://github.com/noamtcohen/AudioStreamer
https://developer.mozilla.org/en-US/docs/Web/API/AudioContext.sampleRate
Old:
WAMI https://code.google.com/p/wami-recorder/

user selected text range: http://www.quirksmode.org/dom/range_intro.html
 
*/ 
$(function() {
	console.log("Initializing cross-browser audio capabilities");
	window.AudioContext = Modernizr.prefixed('AudioContext', window);
	navigator.getUserMedia = Modernizr.prefixed('getUserMedia', navigator);
	window.URL = Modernizr.prefixed('URL', window);
	console.log("Creating binary client");
	client = new BinaryClient('ws://sugar-bear.csail.mit.edu:9002');
	console.log("Client: ", client);
	client.on('open', function () {
		console.log("Connected open!!!!!!!");
	});
	client.on('close', function () {
		console.log("Client closed");
	});
	audioContext =  window.AudioContext;
	console.log("AudioContext set up", audioContext);
	if (navigator.getUserMedia) {
		console.log("Browser has getUserMedia");
	} else {
		console.log("Browser does not support getUserMedia");
		alert("Browser does not support getUserMedia");
	}
});

// Handle streams from the server
$(function() {
	// play any streams from the server as audio
	var context = new audioContext();

	var clearSelection = function () {
		if (window.getSelection) {
			window.getSelection().removeAllRanges();
		} else if (document.selection) {
			document.selection.empty();
		}
	};

	client.on('stream', function (stream, meta) {
		console.log("Stream from server ", meta);
		if (meta.type === 'playback-result') {
			console.log("Audio stream from server", meta);
			var audioDataArray = [];

			stream.on('data', function (data) {
				console.log("Streaming data from server ", data);
				audioDataArray.push(data);
			});

			stream.on('end', function () {
				console.log("End of streamed audio", audioDataArray);
				var totalBufferByteLength = 0;
				for (var i = 0; i < audioDataArray.length; i++) {
					totalBufferByteLength += audioDataArray[i].byteLength;
				}
				console.log("totalBufferByteLength: ", totalBufferByteLength);
				audioDataBuffer = new Uint8Array(totalBufferByteLength);
				var bufferByteOffset = 0;
				for (var j = 0; j < audioDataArray.length; j++) {
					var typedArray = new Uint8Array(audioDataArray[j]);
					audioDataBuffer.set(typedArray, bufferByteOffset);
					bufferByteOffset += typedArray.byteLength;
				}
				context.decodeAudioData(audioDataBuffer.buffer, function (buffer) {
					console.log("Concatenated buffer from streams ", buffer);
					var source = context.createBufferSource();
					source.buffer = buffer;
					source.connect(context.destination);
					source.start();
				});

			});
		} else if (meta.type === 'timing-result') {
			var frag = meta.fragment;
			console.log("Server finished processing timing results for ", frag);
			var elementsToUpdate = $("[data-fragment="+frag+"]");
			elementsToUpdate.data('enabled', true);
			$(elementsToUpdate[2]).addClass('slant');
			$(elementsToUpdate[1]).attr('disabled', false);

			var numFrags = $(".readable-fragment").length;
			if (frag == numFrags - 1) {
				// done with reading
				console.log("Finished reading and processing the story");
				console.log("Setting up new stream");
				var endedMetadata = { 
					"type": 'reading_ended'
				};
				var reading_ended_stream = client.createStream(endedMetadata);
				reading_ended_stream.end();
			}
		
		} else if (meta.type === 'mispro-result') {
			var mispronounced_words = [];
			stream.on('data', function (data) {
				console.log("Mispronounced: ", data);
				var fragment = data.utterance_id;
				var index = data.index;
				$("[data-fragment="+fragment+"][data-index="+index+"]").addClass('mispro');
			});
		}

		stream.on('end', function () {
			console.log("Stream from server ended");
		});
	});
});


// Remote
$(function() {
	console.log("Seting up context and methods");

	var context = new audioContext();

	var session = {audio: true, video: false};
	var audioInput = null;

	var getAverageVolume = function (typedArray) {
		var values = 0;
		var average;
		var length = typedArray.length;
		for (var i = 0; i < length; i++) {
			values += typedArray[i];
		}
		average = values / length;
		return average;
	};

	var setupAudioNodes= function () {
		// called whenever the 2048 frames have been sampled, approx 21 times a second
		var BASE_HEIGHT = 25;
		var MAX_HEIGHT = 100;

		javascriptNode = context.createScriptProcessor(2048, 1, 1);
		javascriptNode.connect(context.destination);
		javascriptNode.onaudioprocess = function () {
			var array = new Uint8Array(analyser.frequencyBinCount);
			analyser.getByteFrequencyData(array);
			var average = getAverageVolume(array);
			var filled_height = (BASE_HEIGHT + (1.0 * average)).toFixed();
			var gray_height = MAX_HEIGHT - Math.min(filled_height, MAX_HEIGHT);
			$(".fa-microphone.fill").css("max-height", gray_height+"%");
			$("#vol").text(average.toFixed(0));
		};

		var analyser = context.createAnalyser();
		analyser.smoothingTimeConstant = 0.3;
		analyser.fftSize = 1024;

		navigator.getUserMedia(
			session,
			function(localMediaStream) {
				audioInput = context.createMediaStreamSource(localMediaStream);

				audioInput.connect(analyser);
				analyser.connect(javascriptNode);
				javascriptNode.connect(context.destination);
			},
			function(e) { // errorCallback
				console.log("Media access rejected.", e);
			}
		);
	};
	
	var convertFloat32ToInt16 = function (buffer) {
        var l = buffer.length;
        var buf = new Int16Array(l);
        while (l--) {
            buf[l] = Math.min(1, buffer[l])*0x7FFF;
        }
        return buf.buffer;
    };

	onDisplayPrepared = function () {
		var recordButtons = $(".record-btn");
		var storyLines = $(".readable-fragment");
		addTextSelectListeners();
		for (var i=0; i < storyLines.length; i++) {
			recordButtonSetup(recordButtons[i], storyLines[i]);
		}
	};

	var clearSelection = function () {
		if (window.getSelection) {
			window.getSelection().removeAllRanges();
		} else if (document.selection) {
			document.selection.empty();
		}
	};

	var addTextSelectListeners = function () {
		console.log("Adding text selection listeners");
		var content = $("#readable-content");
		content.on('mouseup', function (e) {
			console.log("Dragging started");
			var userSelection;
			if (window.getSelection) {
				console.log("Has window.getSelection");
				userSelection = window.getSelection();
			} else if (document.selection) {
				console.log("Has document.selection");
				userSelection = document.selection.createRange();
			}
			console.log("userSelection: ", userSelection);
			if (userSelection.type !== "Range") {
				return;
			}

			range = userSelection.getRangeAt(0);
			console.log("range: ", range);
			rangeStart = $(range.startContainer.parentElement);
			if (rangeStart.data("index") === undefined) {
				rangeStart = $(range.startContainer.nextElementSibling);
			}
			rangeEnd = $(range.endContainer.parentElement);
			if (rangeEnd.data("index") === undefined) {
				rangeEnd = $(range.endContainer.previousElementSibling);
			}
			console.log("rangeStart", rangeStart);
			console.log("rangeEnd", rangeEnd);

			var playbackRequestMetadata = {
				type: 'playback-request',
				start_fragment: rangeStart.data("fragment"),
				start_index: rangeStart.data("index"),
				end_fragment: rangeEnd.data("fragment"),
				end_index: rangeEnd.data("index"),
			};

			console.log("User selected: " + range.toString(), playbackRequestMetadata);

			if (rangeStart.data("enabled") && rangeEnd.data("enabled")) {
				console.log("Playback is enabled");
				client.createStream(playbackRequestMetadata);

			} else {
				console.log("Playback is not yet ready");
			}
		});

		content.on('mousedown', function (e) {
			clearSelection();
		});
		
	};

	var recording = false;
	var currentFragment = 0;

	var recordButtonSetup = function (recordBtn, fragmentElement) {
		console.log("Setting up record button", recordBtn, fragmentElement);
		fragmentElement = $(fragmentElement);

		var recorder = null;
		var binStream = null;

		var getCurrentFragment = function () {
			return fragmentElement;
		};

		var setupStream = function () {
			if (binStream === null) {
				console.log("Setting up new stream");
				var setupMetadata = { 
					"fragment": fragmentElement.data("fragment"),
					"text": fragmentElement.data("text")
				};
				binStream = client.createStream(setupMetadata);

				binStream.on('data', function(data) {
					console.log("Client stream received data: ", data);
					if (data[0] == "utterance" && data[1] == 0){
						var phrases = document.getElementsByClassName("panel-body");
						var curObj = phrases[data[2]-1];
						curObj.style.backgroundColor = "tomato";
						alert("Recording was invalid. Please speak clearly and re-record the phrase.");
					}
					if (data[0] == "utterance" && data[1] == 1){
						var phrases = document.getElementsByClassName("panel-body");
						var curObj = phrases[data[2]-1];
						curObj.style.backgroundColor = "lightgreen";
					}

				});

				binStream.on('end', function () {
					console.log("Client stream ended.");
				});

				binStream.on('close', function () {
					console.log("Client stream closed");
				});

				binStream.on('error', function (error) {
					console.log("Client stream encountered an error: ", error);
				});
			}
			recording = true;
			console.log("Set up stream: ", binStream);
			return binStream;
		};

		var teardownStream = function () {
			if (binStream === null) {
				return;
			}
			binStream.end();
			binStream = null;
		};

		// TODO: investigate whether Socket.IO or BinaryJS is better for the binary comms
		var recorderProcess = function (audioProcessingEvent) {
			// since we are recording in mono we only need the left channel
			var left = audioProcessingEvent.inputBuffer.getChannelData(0); // PCM data samples from left channel
			var converted = convertFloat32ToInt16(left);
			binStream.write(converted);
			console.log("Writing %d length buffer to binary stream: %d ", converted.byteLength);
		};

		var startGetUserMedia = function () {
			if (audioInput !== null) {
				console.log("Audio input already created");
				var bufferSize = 2048;

				// create a javascript node for recording
				recorder = context.createScriptProcessor(bufferSize, 1, 1);

				// specify the processing function
				recorder.onaudioprocess = recorderProcess;
				// connect the stream to our recorder
				audioInput.connect(recorder);
				// connect recorder to the previous destination
				recorder.connect(context.destination);

				console.log("audioInput", audioInput);

				console.log("Connected recorder", recorder);
				return;
			}
			navigator.getUserMedia(
				session,
				function(localMediaStream) {
					// you can only have 6 instances of audioContext at a time
					// Failed to construct 'AudioContext': number of hardware contexts reached maximum (6)
					// var context = new audioContext();
					var audioInput = context.createMediaStreamSource(localMediaStream);
					console.log(audioInput);
					var bufferSize = 2048;

					// create a javascript node for recording
					recorder = context.createScriptProcessor(bufferSize, 1, 1);

					// specify the processing function
					recorder.onaudioprocess = recorderProcess;
					// connect the stream to our recorder
					audioInput.connect(recorder);
					// connect recorder to the previous destination
					recorder.connect(context.destination);

					console.log("audioInput", audioInput);

					console.log("Connected recorder", recorder);
				},
				function(e) { // errorCallback
					console.log("Media access rejected.", e);
				}
			);
		};

		/* var updateFragmentVars = function () {
		        console.log(recordBtn);
		        console.log(recordBtn.getAttribute('data-fragment'));
		        // currentFragment = Math.max(recordBtn.getAttribute('data-fragment') + 1, currentFragment);
		        currentFragment = Math.max(recordBtn.data("fragment") + 1, currentFragment);
			console.log("Updating Fragment: currentFragment ", currentFragment);
		} */

		var disableAllExcept = function (exceptBtn) {
			$(".record-btn").attr("disabled", true);
			$(exceptBtn).attr("disabled", false)
				.html('<i class="fa fa-stop"></i> Stop')
				.toggleClass("btn-primary btn-danger");
		}

		var resetButtons = function (exceptBtn){
			$(".record-btn").attr("disabled", false);
			$(exceptBtn).button('record')
				.html('<i class="fa fa-dot-circle-o"></i> Re-record')
				.toggleClass("btn-primary btn-danger");
		}

	        var hasClass = function (element, cls) {
		        return (' ' + element.className + ' ').indexOf(' ' + cls + ' ') > -1;
		}

		var toggleRecording = function (e) {
			console.log("Toggling recording state");
			console.log("binStream: ", binStream);
			console.log("recording: ", recording);

			if (recording) {
			        console.log(e);
			        // keep track of how many remaining captions are left
			        if (hasClass(recordBtn,'unfinished')) {
				    	recordBtn.className = recordBtn.className.replace(' unfinished', '');
					}
			        var remaining = $('.unfinished').length;
			        console.log('remaining unfinished', remaining);

			        // enable finished button if captions complete
			        if (remaining == 0) {
						console.log('Finished all captions!');
		    			$('#submit-button').removeClass('disabled');
		    			$('#submit-button').addClass('active');
					}
			  
				// stop recording
				console.log("Disconnecting recorder ", recorder);
				recorder.disconnect();
				teardownStream();
				recording = false;
				resetButtons(recordBtn);
				// updateFragmentVars();
				return;
			}
			// start recording
			disableAllExcept(recordBtn);

			$("[id|=word-btn]").attr('enabled', false);
			setupStream();
			startGetUserMedia();
			return;
		};

		setupAudioNodes();
		$(recordBtn).click(toggleRecording);
	};
});

$(function() {

        // variable to hold the id/key code that is used for Turk Verification
        var id_key_code = "";

        // GENERATE CONFIRMATION CODE
        var generateConfirmation = function(){
    	        var code = "";
    	        var letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
	        var numbers = "0123456789";

	        code += letters.charAt(Math.floor(Math.random() * letters.length));
	        code += numbers.charAt(Math.floor(Math.random() * numbers.length));
	        code += numbers.charAt(Math.floor(Math.random() * numbers.length));
	        code += numbers.charAt(Math.floor(Math.random() * numbers.length));
	        code += letters.charAt(Math.floor(Math.random() * letters.length));
	        code += letters.charAt(Math.floor(Math.random() * letters.length));

	        return code;
	}

        // Finished recording, submitting Audio
        $('#submit-button').click(function(){
			var phrases = document.getElementsByClassName("panel-body");
			var counter = 0;
        	for (var i = 0; i < phrases.length; ++i) {
		    	var item = phrases[i];  
		    	if (item.style.backgroundColor == "rgb(255, 99, 71)") {
		    		counter += 1;
		    	}
			}  
			console.log("incorrect: %s", counter);
			if (counter == 0) {
		        var confirmation = generateConfirmation();
		        var message = "Thank you for your submission! \n " + confirmation;
		        window.prompt("Copy to clipboard and submit in Mechanical Turkv: Ctrl+C, Enter", id_key_code.toUpperCase());
		    }
		    else {
		    	alert("Please re-record all incorrectly marked phrases.");
		    }
		});

        // GETTING IDS
        $.get('captions/IDtoKeyDict.txt', function(data) {
	        // gets id from URL parameter
	        var cur_id = location.search.split('?')[1]
	        var ids = data.split('\n');
	        var index = 0;
	        var key = '';
	        for (i = 0; i < ids.length; i++) {
		    cur = ids[i].split(' ');
		    if(cur[0] = cur_id){
			index = i;
			key = cur[1];
			break
		    }
		} 
	        id_key_code = cur_id + key;

	        // var random_id = ids[Math.floor(Math.random() * ids.length)];
                var xml_path = 'captions/xml/' + cur_id + '.xml';
	        getXML(xml_path);

	        // update image
	        var img_src = "images/" + cur_id + ".jpg";
	        $('#cur_img').attr("src",img_src);

	        // Create alert to remind user to click "allow" for microphone access.
        	var alert_prompt = 'Please be sure to click "Allow" to give the browser the ability to use your microphone. You will have to hit "Allow" five times.';
        	alert(alert_prompt);

		}, 'text');
		

        // SET UP PAGE
	console.log("Trying to read in XML file");
        var getXML = function(xml_path){
	        $.get(xml_path, function (xml_data) {
		        // xml_data is an XML Document parsed from the file
		        var $xml_data = $(xml_data);
		        var title = $xml_data.find("title").text();
		        title = $.trim(title);
		        var content = $xml_data.find("content").text();
		        content = $.trim(content).split(/\n/);
		        console.log(title, content);
		        prepareReadableDisplay({title: title, content: content});
	                console.log("success - read the file");
	        
	                completed_list = [];
	                for (var i = 0; i < content.length; i++ ) {
		                completed_list[i] = content[i];
		        }
	                console.log(completed_list);

	        });
	}

	var gen_wordButtonListener = function (btn, frag, ind) {
	        console.log('gen_wordButtonListener', btn);
		return function requestPlayback (e) {
			if (btn.data("enabled")) {
				var metadata = {
					type: 'playback-request',
					start_fragment: frag,
					start_index: ind,
					end_fragment: frag,
					end_index: ind,
				};
				console.log("Clicked word button: ", metadata);
				client.createStream(metadata);
			} else {
				console.log("Clicked disabled word button");
			}	
		};
	}

	var gen_playButtonListener = function (frag, endIndex) {
		return function requestPlayback (e) {
			var metadata = {
				type: 'playback-request',
				start_fragment: frag,
				start_index: 0,
				end_fragment: frag,
				end_index: endIndex,
			};
			console.log("Clicked playback button: ", metadata);
			client.createStream(metadata);
		};
	} 

	var prepareReadableDisplay = function (readable) {
		// expects readable {title: 't', content: ['c', 'o']}
		var title = readable.title;
		var content = readable.content;
		console.log("Preparing ", title, content);

		var titleNode = $('<h3>', {id: 'title', text: title});
		$('h1').after(titleNode);

		var storyElement = $("#story-container");
		console.log("Found story container", storyElement);

		for (var i = 0; i < content.length; i++) {
			var line = content[i];

			var lineElement = $('<span>').attr('id', 'fragment-'+i).addClass('readable-fragment big-text');
			lineElement.data('text', line);
			// this can either be set as an attr or as data, but only setting it as an attribute makes it
			// jquery selector searchable
			lineElement.attr('data-fragment', i);

			var phrases = line.split(' ');
			for (var j = 0; j < phrases.length; j++) {
				var id = 'word-btn-' + i + '-' + j;
				var wordButton = $('<span>').attr('id', id).text(phrases[j]);
				// this can either be set as an attr or as data, but only setting it as an attribute makes it
			// jquery selector searchable
				wordButton.attr("data-fragment", i);
				wordButton.data("enabled", false);
				wordButton.attr("data-index", j);
				wordButton.click(gen_wordButtonListener(wordButton, i, j));
				lineElement.append(wordButton);
				lineElement.append(" ");
			}
			console.log("building panel");
			var panelElement = $('<div class="panel panel-default"><div class="panel-body" style="background-color:#fff"><div class="row"><div class="col-lg-4 col-md-5 col-sm-6 content-buttons-container glyph">' + 
				'<div class="content-buttons btn-group-lg invisible" role="group" aria-label="...">' + 
				'<button type="button" class="btn btn-primary record-btn"><i class="fa fa-dot-circle-o"></i> Record</button>' +  
				'</div></div>' + 
				'<div class="col-lg-8 col-md-7 col-sm-6 content-container"></div>' + 
				'</div></div></div>');
		        // '       <button type="button" class="btn btn-success play-btn"><i class="fa fa-play"></i> Play</button>' +
			panelElement.find('.content-container').append(lineElement);
			panelElement.find('.record-btn').attr('data-fragment', i).data("isEnabled", (i===0));
		        panelElement.find('.record-btn').addClass('unfinished');
			panelElement.find('.play-btn')
				.attr('data-fragment', i)
				.attr("disabled", false)
				.click(gen_playButtonListener(i, phrases.length-1));
			panelElement.data('isCurrent', false);
			storyElement.append(panelElement);
		}

		$(".panel").hover(function hoverInOut(e) {
			var jqueryThis = $(this);
			if (jqueryThis.data("isCurrent")) {
				jqueryThis.find(".content-buttons").removeClass("invisible");
		        jqueryThis.find(".readable-fragment").addClass("strong");
			} else {
				jqueryThis.find(".content-buttons").toggleClass("invisible");
		        jqueryThis.find(".readable-fragment").toggleClass("strong");
			}
			
		})

		onDisplayPrepared();
	};

});
