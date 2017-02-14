$(document).ready(function() {
	const room = document.URL.substr(document.origin.length + 1).toUpperCase();
	console.log("You have entered room " + room);
	var socket = io.connect('/');

	var status = $('#status'),
		chatinput = $('#chatinput'),
		chatnick = $('#chatnick');

	const gamePanel = $('#gamePanel');
	const chatPanel = $('#chatPanel');

	socket.on('connect', function () {
		status.text(room + ': Nobody is drawing right now');
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
		chatcontent.append('<p><span style="color:' + msg.color + '">' + msg.nick + '</span>: ' + msg.text + '</p>');
		chatScrollDown();
	});

	socket.on('userJoined', function (user) {
		chatcontent.append('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> joined. You can change your name by replacing \'guest\' in the box above.</p>');
		chatScrollDown();
	});

	socket.on('userLeft', function (user) {
		chatcontent.append('<p>&raquo; <span style="color:' + user.color + '">' + user.nick + '</span> left.</p>');
		chatScrollDown();
	});

	socket.on('nickChange', function (user) {
		chatcontent.append('<p><span style="color:' + user.color + '">' + user.oldNick + '</span> changed his name to <span style="color:' + user.color + '">' + user.newNick + '</span></p>');
		chatScrollDown();
	});

	function chatScrollDown() {
		chatcontent.scrollTop(chatcontent[0].scrollHeight);
	};

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
		context.lineJoin = 'round';
		context.lineWidth = 4;
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
		console.log(myturn);
		if(myturn) {
			painting = true;
			const x = e.pageX || e.targetTouches[0].pageX;
			const y = e.pageY || e.targetTouches[0].pageY;
			var newpoint = { x: x - this.offsetLeft, y: y - this.offsetTop},
				line = { from: null, to: newpoint, color: selectedcolor };

			draw(line);
			lastpoint = newpoint;
			socket.emit('draw', line);
		}
	}

	function moveInk(e) {
		if(myturn && painting) {
			const x = e.pageX || e.targetTouches[0].pageX;
			const y = e.pageY || e.targetTouches[0].pageY;
			var newpoint = { x: x - this.offsetLeft, y: y - this.offsetTop},
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

	socket.on('drawCanvas', function(canvasToDraw) {
		if(canvasToDraw) {
			//canvas.width(canvas.width());
			context.lineJoin = 'round';
			context.lineWidth = 4;

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
		selectedcolor = '#1e88e5';
	});

	socket.on('clearCanvas', function() {
		context.clearRect ( 0 , 0 , canvas.width() , canvas.height() );
	});


	// ================================================
	//                           pictionary logic section
	// ================================================

	var readytodraw = $('#readytodraw'),
		myword = '',
		timeleft = 120,
		drawingTimer = null;

	readytodraw.click(function() {
		socket.emit('readyToDraw');
	});

	socket.on('youDraw', function(word) {
		console.log("You Draw");
		//$('#gamepanel').removeClass('hide');
		//$('#chatpanel').addClass('hide');
		myturn = true;
		canvas.css('background-color', '#f5f5f5');
		context.clearRect ( 0 , 0 , canvas.width() , canvas.height() );
		myword = word;
		status.text(room + ': ' + myword[0] + ' (difficulty: ' + myword[1] + ')');
		readytodraw.prop('value', 'Pass (' + timeleft + ')');

		// turn on drawing timer
		drawingTimer = setInterval( timerTick, 1000 );
	});

	socket.on('friendDraw', function(msg) {

		if(!myturn) {
			console.log("Not you draw");
			//$('#chatpanel').removeClass('hide');
			//$('#gamepanel').addClass('hide');
			status.text(room + ': ' + msg.nick + ' is drawing right now!');
		}

		chatcontent.append('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span> is drawing!</p>');
		chatScrollDown();
	});

	socket.on('youCanDraw', function(msg) {
		if(myturn) {
			myturn = false;
			canvas.css('background-color', '#ccc');
			status.text(room + ': Nobody is drawing right now');
		}
		chatcontent.append('<p>Press <strong>DRAW</strong> to start drawing!</p>');
		chatScrollDown();
	});

	socket.on('wordGuessed', function(msg) {
		chatcontent.append('<p>&raquo; <span style="color:' + msg.color + '">' + msg.nick + '</span> guessed the word (<strong>' + msg.text + '</strong>) !!!</p>');
		chatScrollDown();
		if(myturn = true) {
			timeleft = 120;
			clearInterval(drawingTimer);
			drawingTimer = null;
			readytodraw.prop('value', 'DRAW');
		}
	});

	socket.on('wordNotGuessed', function(msg) {
		chatcontent.append('<p>&raquo; The turn is over! The word was <strong>' + msg.text + '</strong>.</p>');
		chatScrollDown();
		if(myturn = true) {
			timeleft = 120;
			clearInterval(drawingTimer);
			drawingTimer = null;
			readytodraw.prop('value', 'DRAW');
		}
	});

	function timerTick() {
		if(timeleft > 0) {
			timeleft--;
			readytodraw.prop('value', 'Pass (' + timeleft + ')');
		} else {
			timeleft = 120;
			clearInterval(drawingTimer);
			drawingTimer = null;
			readytodraw.prop('value', 'DRAW');
		}
	}
});
