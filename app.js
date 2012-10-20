function User() {
	this.uid = User.max++;
	this.password = Math.random().toFixed(6).substr(2);
	this.score = 0;
	this.connection = null;
	this.buffer = '';
	this.timeout = null;
	this.st0();
	User.broadcast('score(' + this.uid + ',' + this.score + ');');
	User.users[this.uid] = this;
}

User.max = 1;
User.users = {};

User.authenticate = function(uid, password) {
	if (!(uid in User.users) || User.users[uid].password != password) return null;
	return User.users[uid];
};

User.broadcast = function (message) {
	for (var uid in User.users) User.users[uid].send(message);
};

User.prototype.st0 = function () {
	var self = this;
	clearTimeout(this.timeout);
	this.timeout = setTimeout(function () {
		self.disconnect();
	}, 10000);
};

User.prototype.st1 = function () {
	var self = this;
	clearTimeout(this.timeout);
	this.timeout = setTimeout(function () {
		self.connection.end();
		self.connection = null;
		self.st0();
	}, 55000);
}

User.prototype.send = function (message) {
	if (this.connection) {
		this.connection.end(message);
		this.connection = null;
		this.buffer = '';
		this.st0();
	} else {
		this.buffer += message;
	}
};

User.prototype.listen = function (res) {
	res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache'});
	if (this.buffer.length) {
		res.end(this.buffer);
		this.buffer = '';
		this.st0();
	} else {
		var self = this;
		res.socket.on('close', function () {
			if (res !== self.connection) return;
			self.connection.end();
			self.connection = null;
			self.st0();
		});
		if (this.connection) this.connection.end();
		this.connection = res;
		this.st1();
	}
};

User.prototype.disconnect = function () {
	User.broadcast('disconnect(' + this.uid + ');');
	if (this.connection) this.connection.end();
	if (this.timeout) clearTimeout(this.timeout);
	delete User.users[this.uid];
}

var mines = {};
var opened = {};
var remaining = 0;

function restart() {
	mines = {};
	opened = {};
	var outgoing = 'restart();';
	var count = 0;
	while (count < 99) {
		var cell = 0 | (Math.random() * 480);
		if (mines[cell]) continue;
		mines[cell] = true;
		count++;
		outgoing += 'mine(' + cell + ');';
	}
	remaining = 480 - 99;
	for (var uid in User.users) User.users[uid].score = 0;
	User.broadcast(outgoing);
}

function open(uid, password, cells) {
	var user = User.authenticate(uid, password);
	if (!user) return false;
	cells = cells.split(',');
	var outgoing = '';
	for (var i in cells) {
		var cell = 0 | parseInt(cells[i], 10);
		if (cell < 0 || cell >= 480 || cell in opened) continue;
		opened[cell] = true;
		if (mines[cell]) {
			user.score -= 30;
		} else {
			user.score++;
			remaining--;
		}
		outgoing += 'reveal(' + cell + ');';
	}
	outgoing += 'score(' + user.uid + ',' + user.score + ');';
	if (!remaining) {
		outgoing += 'done();';
		setTimeout(restart, 5000);
	}
	User.broadcast(outgoing);
	return true;
}

function success(res) {
	res.writeHead(200, {'Content-Type': 'text/plain', 'Cache-Control': 'no-cache'});
	res.end('(:');
}

function fail(res) {
	res.writeHead(400, {'Content-Type': 'text/plain', 'Cache-Control': 'no-cache'});
	res.end('):');
}

restart();
var client = require('fs').readFileSync('index.html', 'utf8');
require('http').createServer(function (req, res) {
	var args = req.url.split('/');
	if (args[1] == 'listen') {
		var user = User.authenticate(args[2], args[3]);
		if (user) user.listen(res);
		else fail(res);
	} else if (args[1] == 'open') {
		(open(args[2], args[3], args[4]) ? success : fail)(res);
	} else if (args[1] == 'connect') {
		var user = new User();
		res.writeHead(200, {'Content-Type': 'text/javascript', 'Cache-Control': 'no-cache'});
		for (var cell in mines) res.write('mine(' + cell + ');');
		for (var cell in opened) res.write('reveal(' + cell + ');');
		for (var uid in User.users) res.write('score(' + User.users[uid].uid + ',' + User.users[uid].score + ');');
		res.write('start(' + user.uid + ',' + user.password + ');');
		if (!remaining) res.write('done();');
		res.end();
	} else if (req.url == '/') {
		res.writeHead(200, {'Content-Type': 'text/html'});
		res.end(client);
	} else {
		fail(res);
	}
}).listen(process.env.PORT || 5000);
