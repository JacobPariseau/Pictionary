// ================================================
//                                 mongo DB section
// ================================================
const mongo = require('mongodb');
const fs = require('fs');

//Read db location and auth from path
fs.readFile(__dirname + '/dbpath', {'encoding': 'utf-8'}, function (err, path) {
  mongo.MongoClient.connect(path.trim(), function (err, db) {

		console.log("Connected to Dr.Ink database");
		db.collection('games', {strict: true}, function (err, col) {
      console.log('The games collection doesn\'t exist. Loading up now');
      if(!err) {
        //Reset all sessions
        col.remove({}, {multi: true});
      }
		});

    exports.checkGame = checkGame;
    exports.joinGame = joinGame;
    exports.leaveGame = leaveGame;
    exports.setCurrentPlayer = setCurrentPlayer;
    exports.setCurrentWord = setCurrentWord;
    exports.setUserName = setUserName;
    exports.saveCanvas = saveCanvas;
    exports.clearCanvas = clearCanvas;

    function checkGame(room) {
      console.log("_Check Game");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findOne({name: room}, function (err, result) {
            if (err) {
              console.log('Error: Failed to check game');
            }
            resolve(result);
          });
        });
      });
    }

    function joinGame(room, user) {
      console.log("_Join Game");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify( {name: room}, [], {'$push': {users: user}}, {new: true, upsert: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to join game');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function leaveGame(room, user) {
      console.log("_Leave Game");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room}, [], {$pull: {users: {id: user.id}}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to leave game');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function setCurrentPlayer(room, user) {
      console.log("_Set Current Player");
      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room}, [], {$set: {currentPlayer: user.id}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to set player');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function setCurrentWord(room, word) {
      console.log("_Set Current Word");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room}, [], {$set: {currentWord: word}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to set word');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function setUserName(room, user) {
      console.log("_Set User Name");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room, 'users.id': user.id}, [], {$set: {'users.$.nick': user.name}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to set user name');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function saveCanvas(room, canvas) {
      console.log("_Save Canvas");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room}, [], {$set: {canvas: canvas}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to save canvas');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }

    function clearCanvas(room) {
      console.log("_Clear Canvas");

      return new Promise( function (resolve, reject) {
        db.collection('games', function(err, collection) {
          collection.findAndModify({name: room}, [], {$set: {canvas: []}}, {new: true}, function (err, result) {
            if (err) {
              console.log('Error: Failed to clear canvas');
              reject(err);
            } else resolve(result);
          });
        });
      });
    }
  });
});
