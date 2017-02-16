var app = require('http').createServer(handler),
	io = require('socket.io').listen(app, { log: false }),
	fs = require('fs'),
	sanitizer = require('sanitizer'),
	port = process.env.port || 8080;

const _ = require('./lodash');
const DB = require('./mongo');

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

let dictionary;
let drawingTimer;
let saveCanvas;
// load dictionary.txt into memory
fs.readFile(__dirname + '/dictionary.txt', function (err, data) {
	dictionary = data.toString('utf-8').split('\r\n');
});

io.sockets.on('connection', function (socket) {
	// Game information
	let game = {
		name: socket.handshake.query.room,
		users: [],
		canvas: [],
		background: "",
		currentWord: "",
		currentPlayer: "",
	}

	socket.join(game.name);

	// User information
	let myNick = 'guest';
	let myColor = rndColor();
	let myScore = 0;

	const defaultUser = {
		 id: socket.id,
		 nick: myNick,
		 color: myColor,
		 score: myScore
	};

	DB.joinGame(game.name, defaultUser)
	.then(function (result) {
		game = result.value;
		console.log('Joined Game');
		io.to(game.name).emit('userJoined', { nick: myNick, color: myColor });
		io.to(game.name).emit('users', game.users);
		if(game.canvas) {
			//Send the canvas to the newly connected user if one is in progress
			socket.emit('drawCanvas', game.canvas, game.background);
		}

		// notify if someone is drawing
		if(game.currentPlayer) {
			_.each(game.users, function (user) {
				if(user.id === game.currentPlayer) {
					socket.emit('friendDraw', {
						color: user.color,
						nick: user.nick
					});
				}
			});
		}
	})
	.catch(console.log);
	// =============
	// chat logic section
	// =============

	function compareWords(variable, control) {
		variable = variable.toLowerCase();
		//Remove spaces from query (allows 'base ball' to match baseball)
		variable = variable.replace(/\s/g, '');
		//Reduce to length of control
		variable = variable.substr(0, control.length);
		return variable === control;
	}

	socket.on('message', function (msg) {
		var sanitizedMsg = sanitizer.sanitize(msg.text);
		if(sanitizedMsg != msg.text) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + msg.text);
		}
		if(!sanitizedMsg || sanitizedMsg.length>256) {
			return;
		}

		io.to(game.name).emit('message', { text: sanitizedMsg, color: myColor, nick: myNick });

		DB.checkGame(game.name)
		.then(function (result) {
			game = result;

			// check if current word was guessed
			if(game.currentPlayer != null && game.currentPlayer != socket.id) {
				console.log("IF?");
				if(compareWords(sanitizedMsg, game.currentWord)) {
					io.to(game.name).emit('wordGuessed', { text: game.currentWord, color: myColor, nick: myNick });

					_.each(game.users, function (user) {
						if(user.id === socket.id || user.id === game.currentPlayer) {
							user.score += 10; //TODO update player doc
						}
					});

					io.to(game.name).emit('users', game.users);

					// turn off drawing timer
					clearTimeout(drawingTimer);
					drawingTimer = null;

					// allow new user to draw
					DB.setCurrentPlayer(game.name, {});
					game.currentPlayer = null;
					io.to(game.name).emit('youCanDraw');
				}
			} else {console.log("ELSE");}
		})
		.catch(console.log);
	});

	socket.on('nickChange', function (user) {
		var sanitizedNick = sanitizer.sanitize(user.nick);
		if(sanitizedNick != user.nick) {
			console.log('(!) Possible attack detected from ' + socket.id + ' (' + myNick + ') : ' + user.nick);
		}
		if(!sanitizedNick || myNick == sanitizedNick || sanitizedNick.length>32 ) {
			return;
		}

		io.to(game.name).emit('nickChange', { newNick: sanitizedNick, oldNick: myNick, color: myColor });
		myNick = sanitizedNick;

		DB.setUserName(game.name, {
			id: socket.id,
			name: myNick
		})
		.then(function (result) {
			game.users = result.users;
			io.to(game.name).emit('users', game.users);
		})
		.catch(console.log);
	});

	socket.on('disconnect', function () {
		io.to(game.name).emit('userLeft', { nick: myNick, color: myColor });
		DB.leaveGame(game.name, {id: socket.id})
		.then(function (result) {
			game = result;

			io.to(game.name).emit('users', game.users);

			if(game.currentPlayer === socket.id) {
				// turn off drawing timer
				clearTimeout(drawingTimer);
				turnFinished();
			}
		})
		.catch(console.log);
	});

	socket.on('draw', function (line, clearBuffer) {
		if(game.currentPlayer == socket.id) {
			game.canvas.push(line);
			socket.broadcast.to(game.name).emit('draw', line, clearBuffer);
			clearTimeout(saveCanvas);
			saveCanvas = setTimeout(function () {
				DB.saveCanvas(game.name, game.canvas);
			}, 500);
		}
	});

	socket.on('catchUp', function () {
		if(game.currentPlayer === socket.id) {
			socket.broadcast.to(game.name).emit('catchUp');
		}
	})
	socket.on('clearCanvas', function () {
		if(game.currentPlayer === socket.id) {
			DB.clearCanvas(game.name);
			game.canvas = [];
			io.to(game.name).emit('clearCanvas');
		}
	});

	function rndColor() {
		return _.sample(['#d32f2f','#8e24aa','#1976d2','#388e3c','#f9a825','#5d4037']);
	};

	function rndBackground() {
		return _.sample(['#ffebee','#e8eaf6','#e3f2fd','#e0f2f1','#f1f8e9','#fff3e0']);
	};

	// =================
	// pictionary logic section
	// =================

	socket.on('readyToDraw', function () {
		DB.checkGame(game.name)
		.catch(console.log)
		.then(function (result) {
			game = result;

			if (!game.currentPlayer) {
				//Set Current Player
				DB.setCurrentPlayer(game.name, {id: socket.id});
				game.currentPlayer = socket.id;

				//Clear Canvas
				DB.clearCanvas(game.name);
				game.canvas = [];

				io.to(game.name).emit('clearCanvas');

				const line = _.sample(dictionary);
				const word = line.split(',');

				DB.setCurrentWord(game.name, word[0]);
				game.currentWord = word[0];
				const colour = rndColor();
				game.background = rndBackground();
				socket.emit('youDraw', word, colour, game.background);
				io.to(game.name).emit('friendDraw', { color: myColor, nick: myNick , background: game.background});

				// set the timer for 2 minutes (120000ms)
				drawingTimer = setTimeout( turnFinished, 120000 );
			} else if (game.currentPlayer == socket.id) {
				// turn off drawing timer
				clearTimeout(drawingTimer);
				turnFinished();
			}
		})
	});

	function turnFinished() {
		console.log('End Turn');
		drawingTimer = null;
		DB.setCurrentPlayer(game.name, {})
		game.currentPlayer = null;
		io.to(game.name).emit('wordNotGuessed', { text: game.currentWord });
		io.to(game.name).emit('youCanDraw');
	}
});
