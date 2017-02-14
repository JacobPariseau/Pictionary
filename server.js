var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	sanitizer = require('sanitizer'),
	port = process.env.port || 8080;

app.listen(port);
console.log('>>> Pictionary started at port ' + port + ' >>>');

// ================================================
//                           server routing section
// ================================================

function handler (req, res) {
	var reqFile = req.url;
	console.log(reqFile);
	// default file
	if (reqFile == '/') {
		reqFile = '/index.html';
	}
	else if (reqFile.split('/').length == 2) {
		reqFile = '/game.html';
	}

	// file exists?
	try {
		fs.lstatSync(__dirname + '/client' + reqFile);
	}
	catch (e) {
		reqFile = '/404.html';
	}

	// show file
	fs.readFile(__dirname + '/client' + reqFile,
		function (err, data) {
			if (err) {
				res.writeHead(200);
				return res.end('Error loading requested file ' + reqFile);
			}

			var filetype = reqFile.substr(reqFile.lastIndexOf('.'));
			switch(filetype) {
				case '.html':
					res.setHeader('Content-Type', 'text/html');
					break;
				case '.js':
					res.setHeader('Content-Type', 'application/javascript');
					break;
				case '.css':
					res.setHeader('Content-Type', 'text/css');
					break;
				case '.gif':
					res.setHeader('Content-Type', 'image/gif');
					break;
				case '.png':
					res.setHeader('Content-Type', 'image/png');
					break;
			}

			res.writeHead(200);
			res.end(data);
		}
	);
}

// ================================================
//                                app logic section
// ================================================

var users = [], canvas = [];
var dictionary, currentWord, currentPlayer, drawingTimer;

// load dictionary.txt into memory
fs.readFile(__dirname + '/dictionary.txt', function (err, data) {
	dictionary = data.toString('utf-8').split('\r\n');
});

io.sockets.on('connection', function (socket) {
	var myNick = 'guest',
		myColor = rndColor();
		myScore = 0;

	users.push({ id: socket.id, nick: myNick, color: myColor, score: myScore });
	io.sockets.emit('userJoined', { nick: myNick, color: myColor });
	io.sockets.emit('users', users);
	socket.emit('drawCanvas', canvas);

	// notify if someone is drawing
	if(currentPlayer) {
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == currentPlayer) {
				socket.emit('friendDraw', { color: users[i].color, nick: users[i].nick });
				break;
			}
		}
	}

	// =============
	// chat logic section
	// =============

	function compareWords(variable, control) {
		variable = variable.toLowerCase();

		//Remove spaces from query (allows 'base ball' to match baseball)
		variable = variable.replace(/\s/g, '');

		//Reduce to length of control
		variable = variable.substr(0, control.length);

		console.log('Comparing ' + variable + ' to ' + control);
		if(variable === control) {
			return true;
		} else return false;
	}

	socket.on('message', function (msg) {
		var sanitizedMsg = sanitizer.sanitize(msg.text);
		if(sanitizedMsg != msg.text) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + msg.text);
		}
		if(!sanitizedMsg || sanitizedMsg.length>256) {
			return;
		}

		io.sockets.emit('message', { text: sanitizedMsg, color: myColor, nick: myNick });

		// check if current word was guessed
		if(currentPlayer != null && currentPlayer != socket.id) {
			if(compareWords(sanitizedMsg, currentWord)) {
				io.sockets.emit('wordGuessed', { text: currentWord, color: myColor, nick: myNick });

				// add scores to guesser and drawer
				for(var i = 0; i<users.length; i++) {
					if(users[i].id == socket.id || users[i].id == currentPlayer) {
						users[i].score = users[i].score + 10;
					}
				}

				// comunicate new scores
				sortUsersByScore();
				io.sockets.emit('users', users);

				// turn off drawing timer
				clearTimeout(drawingTimer);
				drawingTimer = null;

				// allow new user to draw
				currentPlayer = null;
				io.sockets.emit('youCanDraw');
			}
		}
	});

	socket.on('nickChange', function (user) {
		var sanitizedNick = sanitizer.sanitize(user.nick);
		if(sanitizedNick != user.nick) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + user.nick);
		}
		if(!sanitizedNick || myNick == sanitizedNick || sanitizedNick.length>32 ) {
			return;
		}

		io.sockets.emit('nickChange', { newNick: sanitizedNick, oldNick: myNick, color: myColor });
		myNick = sanitizedNick;

		for(var i = 0; i<users.length; i++) {
			if(users[i].id == socket.id) {
				users[i].nick = myNick;
				break;
			}
		}

		io.sockets.emit('users', users);
	});

	socket.on('disconnect', function () {
		io.sockets.emit('userLeft', { nick: myNick, color: myColor });
		for(var i = 0; i<users.length; i++) {
			if(users[i].id == socket.id) {
				users.splice(i,1);
				break;
			}
		}

		io.sockets.emit('users', users);

		if(currentPlayer == socket.id) {
			// turn off drawing timer
			clearTimeout(drawingTimer);
			turnFinished();
		}
	});

	socket.on('draw', function (line) {
		if(currentPlayer == socket.id) {
			canvas.push(line);
			socket.broadcast.emit('draw', line);
		}
	});

	socket.on('clearCanvas', function () {
		if(currentPlayer == socket.id) {
			canvas.splice(0, canvas.length);
			io.sockets.emit('clearCanvas');
		}
	});

	function rndColor() {
		const colours = [
			'#d32f2f',
			'#8e24aa',
			'#1976d2',
			'#388e3c',
			'#f9a825',
			'#5d4037'
		];

		return colours[Math.floor(Math.random() * colours.length)]
	};

	function sortUsersByScore() {
		users.sort(function(a,b) { return parseFloat(b.score) - parseFloat(a.score) } );
	}

	// =================
	// pictionary logic section
	// =================

	socket.on('readyToDraw', function () {
		if (!currentPlayer) {
			currentPlayer = socket.id;
			canvas.splice(0, canvas.length);
			io.sockets.emit('clearCanvas');

			var randomLine = Math.floor(Math.random() * dictionary.length),
				line = dictionary[randomLine],
				word = line.split(',');

			currentWord = word[0];
			const colour = rndColor();
			socket.emit('youDraw', word, colour);
			io.sockets.emit('friendDraw', { color: myColor, nick: myNick });

			// set the timer for 2 minutes (120000ms)
			drawingTimer = setTimeout( turnFinished, 120000 );
		} else if (currentPlayer == socket.id) {
			// turn off drawing timer
			clearTimeout(drawingTimer);
			turnFinished();
		}
	});

	function turnFinished() {
		drawingTimer = null;
		currentPlayer = null;
		io.sockets.emit('wordNotGuessed', { text: currentWord });
		io.sockets.emit('youCanDraw');
	}
});
