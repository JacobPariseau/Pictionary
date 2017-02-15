$(document).ready(function() {
	if (screenfull.enabled) {
    screenfull.request();
	}
	const room = window.location.pathname.substring(1).toUpperCase();
	console.log("You have entered room " + room);
	var socket = io.connect('/');

	var status = $('#status'),
		chatinput = $('#chatinput'),
		chatnick = $('#chatnick');

	const gamePanel = $('#gamepanel');
	const chatPanel = $('#chatpanel');

	socket.on('connect', function () {
		status.text(room);
		chatinput.removeProp('disabled');
		chatnick.removeProp('disabled');
		chatinput.focus();
	});

	// ================================================
	//                                 chat section
	// ================================================

	var chatcontent = $('#chatcontent'),
		myNick = 'guest';

	chatinput.keydown(function(e) {
		if (e.keyCode === 13) {
			sendMessage();
		}
	});

	function sendMessage()	{
		var msg = chatinput.val();
		if (!msg) {
			return;
		}
		if(msg == 'cls' | msg == 'clear') {
			chatcontent.text('');
			chatinput.val('');
			return;
		}
		if(myNick != chatnick.val()) {
			nickChange();
		}

		socket.emit('message', { text: msg });
		chatinput.val('');
	}

	chatnick.keydown(function(e)	{
		if (e.keyCode === 13) {
			nickChange();
		}
	});

	function nickChange() {
		var msg = chatnick.val();
		if (!msg || msg == myNick) {
			return;
		}

		socket.emit('nickChange', { nick: msg });
		myNick = msg;
	}

	socket.on('message', function(msg) {
		chatcontent.prepend('<p><span style="color:' + msg.color + '">' + msg.nick + '</span>: ' + msg.text + '</p>');
	});

	socket.on('userJoined', function (user) {
		chatcontent.prepend('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> joined. You can change your name by replacing \'guest\' in the Message box.</p>');
	});

	socket.on('userLeft', function (user) {
		chatcontent.prepend('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> left.</p>');
	});

	socket.on('nickChange', function (user) {
		chatcontent.prepend('<p><span style="color:' + user.color + '">' + user.oldNick + '</span> changed his name to <span style="color:' + user.color + '">' + user.newNick + '</span></p>');
	});

	// ================================================
	//                           canvas drawing section
	// ================================================

	var canvas = $('#canvas'),
		clearcanvas = $('#clearcanvas'),
		context = canvas[0].getContext('2d'),
		lastpoint = null,
		painting = false,
		myturn = false;

	const blackInk = $('#black-ink');
	const colorInk = $('#color-ink');

	let selectedcolor = '#252525';
	socket.on('draw', draw);

	function draw(line) {
		console.log(line);
		context.lineJoin = 'round';
		context.lineWidth = 5;
		context.strokeStyle = line.color;
		context.beginPath();

		if(line.from) {
			context.moveTo(line.from.x, line.from.y);
		}else{
			context.moveTo(line.to.x-1, line.to.y);
		}

		context.lineTo(line.to.x, line.to.y);
		context.closePath();
		context.stroke();
	}

	function drawInk(e) {
		if(myturn) {
			painting = true;
			const x = e.pageX || e.targetTouches[0].pageX;
			const y = e.pageY || e.targetTouches[0].pageY;
			var newpoint = { x: (x - gamePanel[0].offsetLeft) / this.offsetWidth * this.width, y: (y - gamePanel[0].offsetTop) / this.offsetHeight * this.height},
				line = { from: null, to: newpoint, color: selectedcolor };

			draw(line);
			lastpoint = newpoint;
			socket.emit('draw', line);
		}
	}

	function moveInk(e) {
		if(myturn && painting) {
			console.log(gamePanel[0]);
			console.log(gamePanel[0].offsetLeft);
			const x = e.pageX || e.targetTouches[0].pageX;
			const y = e.pageY || e.targetTouches[0].pageY;
			var newpoint = { x: (x - gamePanel[0].offsetLeft) / this.offsetWidth * this.width, y: (y - gamePanel[0].offsetTop) / this.offsetHeight * this.height},
				line = { from: lastpoint, to: newpoint, color: selectedcolor };

			draw(line);
			lastpoint = newpoint;
			socket.emit('draw', line);
		}
	}

	function stopInk(e) {
		console.log('Stop');
		painting = false;
	}

	// Disable text selection on the canvas
	canvas.mousedown(function () {
		return false;
	});

	console.log(canvas);
	canvas[0].addEventListener('mousedown', drawInk, true);
	canvas[0].addEventListener('touchstart', drawInk, true);

	canvas[0].addEventListener('mousemove', moveInk, true);
	canvas[0].addEventListener('touchmove', moveInk, true);

	canvas[0].addEventListener('mouseout', stopInk, true);
	canvas[0].addEventListener('mouseup', stopInk, true);
	canvas[0].addEventListener('touchend', stopInk, true);
	canvas[0].addEventListener('touchcancel', stopInk, true);

	socket.on('drawCanvas', function(canvasToDraw, bgcolor) {
		if(bgcolor) canvas.css('background-color',bgcolor);
		if(canvasToDraw) {
			//canvas.width(canvas.width());
			context.lineJoin = 'round';
			context.lineWidth = 5;

			for(var i=0; i < canvasToDraw.length; i++)
			{
				var line = canvasToDraw[i];
				context.strokeStyle = line.color;
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

	clearcanvas.click(function() {
		if(myturn) {
			socket.emit('clearCanvas');
		}
	});

	blackInk.click(function () {
		selectedcolor = '#252525';
	});

	colorInk.click(function () {
		selectedcolor = colorInk.css("background-color");
	});

	socket.on('clearCanvas', function() {
		context.clearRect ( 0 , 0 , canvas.width() , canvas.height() );
	});


	// ================================================
	//                           pictionary logic section
	// ================================================

	const createMessage = $('#create-message');
	const chatGuess = $('#chat-guess');
	const readytodraw = $('#readytodraw');
	const drawOptions = $('#draw-options');
	let myword = '';
	let timeleft = 120;
	let drawingTimer = null;

	readytodraw.click(function() {
		socket.emit('readyToDraw');
	});

	socket.on('youDraw', function(word, colour, bgcolor) {
		console.log("You Draw");
		myturn = true;
		canvas.css('background-color', bgcolor);
		colorInk.css('background-color', colour);
		drawOptions.removeClass('hide');
		selectedcolor = '#252525';
		context.clearRect ( 0 , 0 , canvas.width() , canvas.height() );
		myword = word;
		status.text(room + ': ' + myword[0]);
		readytodraw.text('PASS (' + timeleft + ')');
	});

	socket.on('friendDraw', function(msg) {
		canvas.css('background-color', msg.background);
		if(!myturn) {
			console.log("Not you draw");
			status.text(room + ': ' + msg.nick + '\'s drawing');
		}

		// turn on drawing timer
		drawingTimer = setInterval( timerTick, 1000 );
		chatcontent.prepend('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span>\'s drawing!</p>');
	});

	socket.on('youCanDraw', function(msg) {
		if(myturn) {
			myturn = false;
			canvas.css('background-color', '#333');
			status.text(room);
		}
		resetTimer();

		chatcontent.prepend('<p>Press <strong>DRAW</strong> to start drawing!</p>');
	});

	socket.on('wordGuessed', function(msg) {
		chatcontent.prepend('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span> guessed the word (<strong>' + msg.text + '</strong>) !!!</p>');
		drawOptions.addClass('hide');
		resetTimer();
	});

	socket.on('wordNotGuessed', function(msg) {
		chatcontent.prepend('<p>&raquo; The turn is over! The word was <strong>' + msg.text + '</strong>.</p>');
		drawOptions.addClass('hide');
		resetTimer();
	});

	createMessage.click(function () {
		chatGuess.toggleClass('hide');
	});

	document.addEventListener('keyup', function (e) {
		if(e.keyCode == 13) {
			//User has pressed the tab key
			e.preventDefault();
			chatGuess.toggleClass('hide');
		}
	});

	function timerTick() {
		if(timeleft > 0) {
			timeleft--;
			readytodraw.text('PASS (' + timeleft + ')');
		} else {
			resetTimer();
		}
	}

	function resetTimer() {
		timeleft = 120;
		clearInterval(drawingTimer);
		drawingTimer = null;

		readytodraw.text('DRAW');
	}
});
