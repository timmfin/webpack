var should = require("should");
var path = require("path");
var fs = require("fs");

var NodeEnvironmentPlugin = require("../lib/node/NodeEnvironmentPlugin");
var Compiler = require("../lib/Compiler");
var WebpackOptionsApply = require("../lib/WebpackOptionsApply");
var WebpackOptionsDefaulter = require("../lib/WebpackOptionsDefaulter");

describe("Compiler (caching)", function() {
	function compile(entry, options, callback) {
		new WebpackOptionsDefaulter().process(options);
		options.entry = entry;
		options.context = path.join(__dirname, "fixtures");
		options.output.pathinfo = true;
		var logs = {
			mkdirp: [],
			writeFile: [],
		};

		var c = new Compiler();
		c.options = new WebpackOptionsApply().process(options, c);
		new NodeEnvironmentPlugin().apply(c);
		var files = {};
		c.outputFileSystem = {
			join: path.join.bind(path),
			mkdirp: function(path, callback) {
				logs.mkdirp.push(path);
				callback();
			},
			writeFile: function(name, content, callback) {
				logs.writeFile.push(name, content);
				files[name] = content.toString("utf-8");
				callback();
			}
		};
		c.plugin("compilation", function(compilation) {
			compilation.bail = true;
		});

		var compilerIteration = 1;

		function runCompiler(callback) {
			c.run(function(err, stats) {
				if(err) throw err;
				should.strictEqual(typeof stats, "object");
				stats = stats.toJson({
					modules: true,
					reasons: true
				});
				should.strictEqual(typeof stats, "object");
				stats.should.have.property("errors");
				Array.isArray(stats.errors).should.be.ok;
				if(stats.errors.length > 0) {
					stats.errors[0].should.be.instanceOf(Error);
					throw stats.errors[0];
				}
				stats.logs = logs;
				console.log('calling callback for iteration', compilerIteration);
				callback(stats, files, compilerIteration++);
			});
		}

		runCompiler(callback);

		return {
			compilerInstance: c,
			runAgain: runCompiler
		};
	}

	it("should cache single file (with manual 1s wait) ", function(done) {
		this.timeout(5000);

		var options = {};

		var tempFixturePath = path.join(__dirname, "fixtures", "temp-cache-fixture");
		var aPath = path.join(tempFixturePath, 'a.js');
		var cPath = path.join(tempFixturePath, 'c.js');

		// Remove previous copy if present
		try {
			if(fs.statSync(tempFixturePath)) {
				fs.unlinkSync(aPath);
				fs.unlinkSync(cPath);
				fs.rmdirSync(tempFixturePath);
			}
		} catch(e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}

		// Copy over file since we'll be modifying some of them
		fs.mkdirSync(tempFixturePath);
		fs.createReadStream(path.join(__dirname, "fixtures", 'a.js')).pipe(fs.createWriteStream(aPath));
		fs.createReadStream(path.join(__dirname, "fixtures", 'c.js')).pipe(fs.createWriteStream(cPath));


		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Not cached the first time
			stats.assets[0].name.should.be.exactly('bundle.js');
			stats.assets[0].emitted.should.be.exactly(true);

			helper.runAgain(function(stats, files, iteration) {

				// Cached the second run
				stats.assets[0].name.should.be.exactly('bundle.js');
				stats.assets[0].emitted.should.be.exactly(false);

				var aStats = fs.statSync(aPath);

				console.log("a.js mtime before", aStats.mtime);
				var aContent = fs.readFileSync(aPath).toString().replace('This is a', 'This is a MODIFIED');

				console.log('Waiting a sec or two...')
				setTimeout(function() {
					fs.writeFileSync(aPath, aContent);

					aStats = fs.statSync(aPath);
					console.log("a.js mtime after", aStats.mtime);


					helper.runAgain(function(stats, files, iteration) {

						// Cached the second run
						stats.assets[0].name.should.be.exactly('bundle.js');
						stats.assets[0].emitted.should.be.exactly(true);

						done();
					});

				}, 1100);
			});
		});
	});

	it("should cache single file (even with no timeout) ", function(done) {
		this.timeout(5000);

		var options = {};

		var tempFixturePath = path.join(__dirname, "fixtures", "temp-cache-fixture");
		var aPath = path.join(tempFixturePath, 'a.js');
		var cPath = path.join(tempFixturePath, 'c.js');

		// Remove previous copy if present
		try {
			if(fs.statSync(tempFixturePath)) {
				fs.unlinkSync(aPath);
				fs.unlinkSync(cPath);
				fs.rmdirSync(tempFixturePath);
			}
		} catch(e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}

		// Copy over file since we'll be modifying some of them
		fs.mkdirSync(tempFixturePath);
		fs.createReadStream(path.join(__dirname, "fixtures", 'a.js')).pipe(fs.createWriteStream(aPath));
		fs.createReadStream(path.join(__dirname, "fixtures", 'c.js')).pipe(fs.createWriteStream(cPath));


		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Not cached the first time
			stats.assets[0].name.should.be.exactly('bundle.js');
			stats.assets[0].emitted.should.be.exactly(true);

			helper.runAgain(function(stats, files, iteration) {

				// Cached the second run
				stats.assets[0].name.should.be.exactly('bundle.js');
				stats.assets[0].emitted.should.be.exactly(false);

				files['bundle.js'].should.containEql('"This is a"');

				var aStats = fs.statSync(aPath);

				console.log("a.js mtime before", aStats.mtime);
				var aContent = fs.readFileSync(aPath).toString().replace('This is a', 'This is a MODIFIED');

				fs.writeFileSync(aPath, aContent);

				aStats = fs.statSync(aPath);
				console.log("a.js mtime after ", aStats.mtime);


				helper.runAgain(function(stats, files, iteration) {

					// Cached the second run
					stats.assets[0].name.should.be.exactly('bundle.js');
					stats.assets[0].emitted.should.be.exactly(true);

					files['bundle.js'].should.containEql('"This is a MODIFIED"');

					done();
				});
			});
		});
	});


});
