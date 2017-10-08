/** Simulate jQuery selector */
window.$ = function(selector) {
  'use strict';

  let selectorType = 'querySelectorAll';

  if (selector.indexOf('#') === 0) {
    selectorType = 'getElementById';
    selector = selector.substr(1, selector.length);
  }

  return document[selectorType](selector);
};

const $ = window.$;

(function() {
	'use strict';

	if (screenfull.enabled) {
    screenfull.request();
	}


	const room = window.location.pathname.substring(1).toUpperCase();
	console.log("You have entered room " + room);
	let socket = io.connect('/', {query: "room="+room});

	let status = $('#status'),
		chatinput = $('#chatinput'),
		chatnick = $('#chatnick');

	const gamePanel = $('#gamepanel');
	const modal = $('#modal');
	const modalOk = $('#modal-ok');
	const modalHeader = $('#modal-header');
	const modalText = $('#modal-text');

	let myTurn = false;

	socket.on('connect', function () {
		status.innerText = room;
		chatinput.removeAttribute('disabled');
		chatnick.removeAttribute('disabled');
		chatinput.focus();
	});

	// ================================================
	//                                 chat section
	// ================================================

	let chatcontent = $('#chatcontent'),
		myNick = 'guest';


	function nickChange() {
		let msg = chatnick.value;
		if (!msg || msg === myNick) {
			return;
		}

		socket.emit('nickChange', { nick: msg });
		myNick = msg;
	}

	function sendMessage()	{
		let msg = chatinput.value;
		if (!msg) {
			return;
		}
		if(msg === 'cls' || msg === 'clear') {
			chatcontent.innerText = '';
			chatinput.value = '';
			return;
		}
		if(myNick !== chatnick.value) {
			nickChange();
		}

		socket.emit('message', { text: msg });
		chatinput.value = '';
	}

	chatinput.addEventListener('keydown', function(e) {
		if (e.keyCode === 13) {
			sendMessage();
		}
	});
	chatnick.addEventListener('keydown', function(e)	{
		if (e.keyCode === 13) {
			nickChange();
		}
	});


	socket.on('message', function(msg) {
		chatcontent.innerHTML = '<p><span style="color:' + msg.color + '">' + msg.nick + '</span>: ' + msg.text + '</p>' + chatcontent.innerHTML;
	});

	socket.on('userJoined', function (user) {
		chatcontent.innerHTML = '<p><span style="color:' + user.color + '">' + user.nick + '</span> joined. You can change your name by replacing \'guest\' in the Message box.</p>' + chatcontent.innerHTML;
	});

	socket.on('userLeft', function (user) {
		chatcontent.innerHTML = '<p><span style="color:' + user.color + '">' + user.nick + '</span> left.</p>' + chatcontent.innerHTML;
	});

	socket.on('nickChange', function (user) {
		chatcontent.innerHTML = '<p><span style="color:' + user.color + '">' + user.oldNick + '</span> changed his name to <span style="color:' + user.color + '">' + user.newNick + '</span></p>' + chatcontent.innerHTML;
	});

	// ================================================
	//                           canvas drawing section
	// ================================================

	const drawLayer = $('#draw-layer');
  const context = drawLayer.getContext("2d");
  const overlayLayer = $('#overlay-layer');
  const overlayCtx = overlayLayer.getContext("2d");
	const blackInk = $('#black-ink');
	const colorInk = $('#color-ink');

	let oldPoint;
  let stoppedPainting;
	let painting = false;
  let points = [];
  const mouse = {
    x: 0,
    y: 0
  };

	const colours = {
		red: '#e53935',
		yellow: '#ffb300',
		green: '#43a047',
		cyan: '#1e88e5',
		blue: '#3949ab',
		magenta: '#8e24aa',
		black: '#212121',
		white: '#fafafa'
	};

	let selectedColour = colours.black;
  let thickness = 3;

	const minThickness = 1;
	const maxThickness = 20;
	const transitionLength = 30;

	const weightedPeriod = 20;

	function blit(point, velocity) {
		context.lineJoin = 'round';
		context.lineWidth = Math.max(velocity, minThickness);
		context.strokeStyle = selectedColour;
		context.beginPath();
		if(point.from && point.from.x) {
			context.moveTo(point.from.x, point.from.y);
		} else {
			context.moveTo(point.to.x-1, point.to.y);
		}
		context.lineTo(point.to.x, point.to.y);
		context.closePath();
		context.stroke();

    overlayCtx.clearRect(0, 0, overlayLayer.width, overlayLayer.height);
    if(mouse.x && mouse.y) {
      const x = (mouse.x - gamePanel.offsetLeft) * overlayLayer.width / overlayLayer.clientWidth;
      const y = (mouse.y - gamePanel.offsetTop) * overlayLayer.height / overlayLayer.clientHeight;
      overlayCtx.lineWidth = 3;
      overlayCtx.strokeStyle = '#333333';
      overlayCtx.beginPath();
      overlayCtx.moveTo(point.to.x, point.to.y);
      overlayCtx.lineTo(x, y);
      overlayCtx.closePath();
      overlayCtx.stroke();

			overlayCtx.lineWidth = 1;
			overlayCtx.beginPath();
			overlayCtx.arc(x,y,10,0,2*Math.PI);
			overlayCtx.stroke();

    }
	}

	function paint() {
		if(points.length > 1) {
			//While there are points left in the list
			//Calculate the destination. The source is == the last destination.
			let point = {
				from: points[0].from,
				to: {x: 0,y: 0}
			};

			//Sum the recent points, weighting the closest, highest.
      const bufferSize = Math.min(points.length, weightedPeriod) - 1;
			for (let i = 0; i < bufferSize; i++) {
					point.to.x += points[i].to.x * (bufferSize - i);
					point.to.y += points[i].to.y * (bufferSize - i);
			}

			//Divide the sum to get the average
			point.to.x /= (( bufferSize * ( bufferSize + 1 )) / 2 );
			point.to.y /= (( bufferSize * ( bufferSize + 1 )) / 2 );

      let dx = Math.min(Math.abs(oldPoint.x - point.to.x), maxThickness);
      let dy = Math.min(Math.abs(oldPoint.y - point.to.y), maxThickness);

      oldPoint = {
        x: point.to.x,
        y: point.to.y
      };

      let min = dx <= dy ? dx : dy;
      let max = dx > dy ? dx : dy;
			let velocity = (1007 * max + 441 * min) / 1024 + Math.random() || 1;

			thickness = thickness + (velocity - thickness) / transitionLength;

			//Set the next source to the current destination
			points[1].from = point.to;
			//Remove the last point from the list so we're only smoothing recents
			points = points.splice(1);

			blit(point, thickness);
		} else {
			clearInterval(stoppedPainting);
		}
	}

  function getPoint(x, y) {
		return { x: (x - gamePanel.offsetLeft) / drawLayer.offsetWidth * drawLayer.width, y: (y - gamePanel.offsetTop) / drawLayer.offsetHeight * drawLayer.height};
	}

	function layPaint(e, newEh) {
		if(newEh) {
			painting = true;
		}
		else if(painting === false) {
			return;
		} else if (!myTurn) {
			return;
		}

		mouse.x = e.pageX || e.targetTouches[0].pageX;
		mouse.y = e.pageY || e.targetTouches[0].pageY;
		const newPoint = getPoint(mouse.x, mouse.y);
		const line = {
		  from: newEh ? null : oldPoint,
			to: newPoint,
			color: selectedColour
		};

    clearInterval(stoppedPainting);

    if(newEh) {
      points = [line];
    } else {
      points.push(line);
    }

		if(points.length > weightedPeriod) {
			stoppedPainting = setInterval(function () {
				paint();
			}, 10);
		} else {
			stoppedPainting = setInterval(function () {
				paint();
			}, 30);
		}

		oldPoint = newPoint;
		socket.emit('draw', line, newEh);

	}

	function layNewPaint(e) {
		layPaint(e, true);
	}

	function stopPaint() {
		painting = false;
    overlayCtx.clearRect(0, 0, overlayLayer.width, overlayLayer.height);

    mouse.x = 0;
    mouse.y = 0;

		let line = {to: points[0], color: selectedColour, stop: true};
		socket.emit('draw', line);
	}


	function receiveLine(line, clearBuffer) {
		selectedColour = line.color || selectedColour;

		if(clearBuffer) {
			console.log("New Line");
			points = [line];
		} else {
			points.push(line);
		}

		clearInterval(stoppedPainting);

		if(points.length > weightedPeriod) {
			stoppedPainting = setInterval(function () {
				paint();
			}, 10);
		} else {
			stoppedPainting = setInterval(function () {
				paint();
			}, 30);
		}

		oldPoint = line.to;
	}

	socket.on('draw', receiveLine);

	// Disable text selection on the canvas
	drawLayer.addEventListener('mousedown', function () {return false;}, true);

	function addListeners() {
		drawLayer.addEventListener('mousedown', layNewPaint, true);
		drawLayer.addEventListener('touchstart', layNewPaint, true);

		drawLayer.addEventListener('mousemove', layPaint, true);
		drawLayer.addEventListener('touchmove', layPaint, true);

	  drawLayer.addEventListener('mouseout', stopPaint, true);
		drawLayer.addEventListener('mouseup', stopPaint, true);
		drawLayer.addEventListener('touchend', stopPaint, true);
		drawLayer.addEventListener('touchcancel', stopPaint, true);
	}

	addListeners();

	function removeListeners() {
		drawLayer.removeEventListener('mousedown', layNewPaint);
		drawLayer.removeEventListener('touchstart', layNewPaint);

		drawLayer.removeEventListener('mousemove', layPaint);
		drawLayer.removeEventListener('touchmove', layPaint);

		drawLayer.removeEventListener('mouseout', stopPaint);
		drawLayer.removeEventListener('mouseup', stopPaint);
		drawLayer.removeEventListener('touchend', stopPaint);
		drawLayer.removeEventListener('touchcancel', stopPaint);
	}

	socket.on('drawCanvas', function(canvasToDraw, bgcolor) {
		console.log(canvasToDraw);
		if(bgcolor) {
			drawLayer.style.backgroundColor = bgcolor;
		}
		if(canvasToDraw) {
			//drawLayer.width(drawLayer.clientWidth);
			context.lineJoin = 'round';

			for(let i=0; i < canvasToDraw.length; i++)
			{

				let line = canvasToDraw[i];
				if(line.stop) { continue; }
				context.strokeStyle = line.color;
				context.lineWidth = 10;

				context.beginPath();
				if(line.from){
					context.moveTo(line.from.x, line.from.y);
				}else{
					context.moveTo(line.to.x-1, line.to.y);
				}
				context.lineTo(line.to.x, line.to.y);
				context.closePath();
				context.stroke();
			}
		}
	});


	blackInk.addEventListener('click', function () {
		selectedColour = '#252525';
	});

	colorInk.addEventListener('click', function () {
		selectedColour = colorInk.style.backgroundColor;
	});


	// ================================================
	//                           pictionary logic section
	// ================================================

	const createMessage = $('#create-message');
	const chatGuess = $('#chat-guess');
	const readytodraw = $('#readytodraw');
	const drawOptions = $('#draw-options');
	let timeleft = 120;
	let drawingTimer = null;

	function resetTimer() {
		timeleft = 120;
		clearInterval(drawingTimer);
		drawingTimer = null;

		readytodraw.innerText = 'DRAW';
		removeListeners();
	}

	function timerTick() {
		if(timeleft > 0) {
			timeleft--;
			readytodraw.innerText = 'PASS (' + timeleft + ')';
		} else {
			resetTimer();
		}
	}

	readytodraw.addEventListener('click', function() {
		socket.emit('readyToDraw');
	});

	socket.on('youDraw', function(word, colour, bgcolor) {
		console.log("You Draw");
		myTurn = true;
		drawLayer.style.backgroundColor = bgcolor;
		colorInk.style.backgroundColor = colour;
		drawOptions.classList.remove('hide');
		selectedColour = '#252525';
		context.clearRect ( 0 , 0 , drawLayer.width , drawLayer.height );

		status.innerText = room + ': ' + word[0];
		readytodraw.innerText = 'PASS (' + timeleft + ')';
		modal.classList.remove('hide');
		modalOk.innerText = 'START DRAWING';
		modalHeader.innerText = 'It\'s your turn!';
		modalText.innerText = 'Your word is ' + word[0] + '! and the timer is already counting!';
		addListeners();
	});

	socket.on('friendDraw', function(msg) {
		drawLayer.style.backgroundColor = msg.background;
		context.clearRect ( 0 , 0 , drawLayer.clientWidth , drawLayer.clientHeight );

		if(!myTurn) {
			console.log("Not you draw");
			status.innerText = room + ': ' + msg.nick + '\'s drawing';
		}

		// turn on drawing timer
		drawingTimer = setInterval( timerTick, 1000 );
		chatcontent.innerHTML = '<p><span style="color:' + msg.color + '">' + msg.nick + '</span>\'s drawing!</p>' + chatcontent.innerHTML;
	});

	socket.on('youCanDraw', function() {
		if(myTurn) {
			myTurn = false;
			drawLayer.style.backgroundColor = '#333';
			status.innerText = room;
		}
		resetTimer();

		chatcontent.innerHTML = '<p>Press <strong>DRAW</strong> to start drawing!</p>' + chatcontent.innerHTML;
	});

	socket.on('wordGuessed', function(msg) {
		chatcontent.innerHTML = '<p><span style="color:' + msg.color + '">' + msg.nick + '</span> guessed the word (<strong>' + msg.text + '</strong>) !!!</p>' + chatcontent.innerHTML;
		drawOptions.classList.add('hide');
		resetTimer();
		modal.classList.remove('hide');
		modalOk.innerText = 'OKAY';
		modalHeader.innerText = 'Round over!)';
		modalText.innerText = msg.nick + ' guessed the word (' + msg.text + ') !!!';
	});

	socket.on('wordNotGuessed', function(msg) {
		chatcontent.innerHTML = '<p>The turn is over! The word was <strong>' + msg.text + '</strong>.</p>' + chatcontent.innerHTML;
		drawOptions.classList.add('hide');
		resetTimer();
		modal.classList.remove('hide');
		modalOk.innerText = 'AWW OKAY';
		modalHeader.innerText = 'Nobody Wins!';
		modalText.innerText = 'The turn is over! The word was ' + msg.text + '.';
	});

	createMessage.addEventListener('click', function () {
		if(chatGuess.classList.contains('hide')) {
			//Chat is hidden, show
			chatGuess.classList.remove('hide');
			chatinput.focus();
		} else {
			chatGuess.classList.add('hide');
			chatinput.blur();
		}
	});

	modalOk.addEventListener('click', function () {
		modal.classList.add('hide');
	});

	document.addEventListener('keyup', function (e) {
		if(e.keyCode === 13) {
			//User has pressed the tab key
			e.preventDefault();
			if(chatGuess.classList.contains('hide')) {
				//Chat is hidden, show
				chatGuess.classList.remove('hide');
				chatinput.focus();
			}
		}
	});

})();
