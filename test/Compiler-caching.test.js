var should = require("should");
var path = require("path");
var fs = require("fs");

var NodeEnvironmentPlugin = require("../lib/node/NodeEnvironmentPlugin");
var Compiler = require("../lib/Compiler");
var WebpackOptionsApply = require("../lib/WebpackOptionsApply");
var WebpackOptionsDefaulter = require("../lib/WebpackOptionsDefaulter");

describe("Compiler (caching)", function() {
	this.timeout(5000000);

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
				console.log('\n\n');
			});
		}

		var postCompileCallbackStack = [];

		function addAfterCompileCallback(callback) {
			postCompileCallbackStack.push(callback);
		}

		c.plugin("after-compile", function(stats, callback) {
			console.log("--- after compile (totally?)");

			if (postCompileCallbackStack.length > 0) {
				postCompileCallbackStack.shift().apply(this, arguments);
			}

			callback()
		})

		runCompiler(callback);

		return {
			compilerInstance: c,
			runAgain: runCompiler,
			addAfterCompileCallback: addAfterCompileCallback
		};
	}

	function createTempFixture() {
		var tempFixturePath = path.join(__dirname, "fixtures", "temp-cache-fixture");
		var aFilepath = path.join(tempFixturePath, 'a.js');
		var cFilepath = path.join(tempFixturePath, 'c.js');

		// Remove previous copy if present
		try {
			if(fs.statSync(tempFixturePath)) {
				fs.unlinkSync(aFilepath);
				fs.unlinkSync(cFilepath);
				fs.rmdirSync(tempFixturePath);
			}
		} catch(e) {
			if (e.code !== 'ENOENT') {
				throw e;
			}
		}

		// Copy over file since we'll be modifying some of them
		fs.mkdirSync(tempFixturePath);
		fs.createReadStream(path.join(__dirname, "fixtures", 'a.js')).pipe(fs.createWriteStream(aFilepath));
		fs.createReadStream(path.join(__dirname, "fixtures", 'c.js')).pipe(fs.createWriteStream(cFilepath));

		return {
			rootPath:  tempFixturePath,
			aFilepath: aFilepath,
			cFilepath: cFilepath
		};
	}

	it("should cache single file (with manual 1s wait) ", function(done) {

		var options = {};
		var tempFixture = createTempFixture();

		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Not cached the first time
			stats.assets[0].name.should.be.exactly('bundle.js');
			stats.assets[0].emitted.should.be.exactly(true);
			console.log('bundle.js emitted?', stats.assets[0].emitted);

			helper.runAgain(function(stats, files, iteration) {

				// Cached the second run
				stats.assets[0].name.should.be.exactly('bundle.js');
				stats.assets[0].emitted.should.be.exactly(false);
				console.log('bundle.js emitted?', stats.assets[0].emitted);

				var aStats = fs.statSync(tempFixture.aFilepath);

				console.log("a.js mtime before", +aStats.mtime);
				var aContent = fs.readFileSync(tempFixture.aFilepath).toString().replace('This is a', 'This is a MODIFIED');

				console.log('Waiting a sec or two...')
				setTimeout(function() {
					console.log('modifying a.js');
					fs.writeFileSync(tempFixture.aFilepath, aContent);

					aStats = fs.statSync(tempFixture.aFilepath);
					console.log("a.js mtime after", +aStats.mtime);


					helper.runAgain(function(stats, files, iteration) {

						// Cached the third run
						stats.assets[0].name.should.be.exactly('bundle.js');
						stats.assets[0].emitted.should.be.exactly(true);
						console.log('bundle.js emitted?', stats.assets[0].emitted);

						// console.log("stats", stats);

						done();
					});

				}, 1100);
			});
		});
	});

	it("should cache single file (even with no timeout) ", function(done) {

		var options = {};
		var tempFixture = createTempFixture();

		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Not cached the first time
			stats.assets[0].name.should.be.exactly('bundle.js');
			stats.assets[0].emitted.should.be.exactly(true);
			console.log('bundle.js emitted?', stats.assets[0].emitted);

			helper.runAgain(function(stats, files, iteration) {

				// Cached the second run
				stats.assets[0].name.should.be.exactly('bundle.js');
				stats.assets[0].emitted.should.be.exactly(false);
				console.log('bundle.js emitted?', stats.assets[0].emitted);

				files['bundle.js'].should.containEql('"This is a"');

				var aStats = fs.statSync(tempFixture.aFilepath);

				console.log("\n\na.js mtime before", +aStats.mtime);
				var aContent = fs.readFileSync(tempFixture.aFilepath).toString().replace('This is a', 'This is a MODIFIED');

				console.log('Waiting a sec or two...')
				setTimeout(function() {
					console.log('modifying a.js');
					fs.writeFileSync(tempFixture.aFilepath, aContent);

					aStats = fs.statSync(tempFixture.aFilepath);
					console.log("a.js mtime after ", +aStats.mtime);


					helper.runAgain(function(stats, files, iteration) {

						// Cached the third run
						stats.assets[0].name.should.be.exactly('bundle.js');
						stats.assets[0].emitted.should.be.exactly(true);
						console.log('bundle.js emitted?', stats.assets[0].emitted);

						files['bundle.js'].should.containEql('"This is a MODIFIED"');


						done();
					});
				}, 1100);
			});
		});
	});

	it("should only build when modified (with manual 1s wait)", function(done) {

		var options = {};
		var tempFixture = createTempFixture();

		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Built the first time
			stats.modules[0].name.should.containEql('c.js');
			stats.modules[0].built.should.be.exactly(true, 'c.js should have been built');

			stats.modules[1].name.should.containEql('a.js');
			stats.modules[1].built.should.be.exactly(true, 'a.js should have been built');

			helper.runAgain(function(stats, files, iteration) {

				// Not built when cached the second run
				stats.modules[0].name.should.containEql('c.js');
				stats.modules[0].built.should.be.exactly(false, 'c.js should not have built');

				stats.modules[1].name.should.containEql('a.js');
				stats.modules[1].built.should.be.exactly(false, 'a.js should not have built');

				var aStats = fs.statSync(tempFixture.aFilepath);

				console.log("\n\na.js mtime before", +aStats.mtime);
				var aContent = fs.readFileSync(tempFixture.aFilepath).toString().replace('This is a', 'This is a MODIFIED');

				console.log('modifying a.js');
				fs.writeFileSync(tempFixture.aFilepath, aContent);

				aStats = fs.statSync(tempFixture.aFilepath);
				console.log("a.js mtime after ", +aStats.mtime);


				helper.runAgain(function(stats, files, iteration) {

					// And only a.js built after it was modified
					stats.modules[0].name.should.containEql('c.js');
					stats.modules[0].built.should.be.exactly(false, 'c.js should not have built');

					stats.modules[1].name.should.containEql('a.js');
					stats.modules[1].built.should.be.exactly(true, 'a.js should have been built');

					done();
				});
			});
		});
	});



	it("should only build when modified (even with no timeout)", function(done) {

		var options = {};
		var tempFixture = createTempFixture();

		var helper = compile("./temp-cache-fixture/c", options, function(stats, files) {

			// Built the first time
			stats.modules[0].name.should.containEql('c.js');
			stats.modules[0].built.should.be.exactly(true, 'c.js should have been built');

			stats.modules[1].name.should.containEql('a.js');
			stats.modules[1].built.should.be.exactly(true, 'a.js should have been built');

			helper.runAgain(function(stats, files, iteration) {

				// Not built when cached the second run
				stats.modules[0].name.should.containEql('c.js');
				stats.modules[0].built.should.be.exactly(false, 'c.js should not have built');

				stats.modules[1].name.should.containEql('a.js');
				stats.modules[1].built.should.be.exactly(false, 'a.js should not have built');

				var aStats = fs.statSync(tempFixture.aFilepath);

				console.log("\n\na.js mtime before", +aStats.mtime);
				var aContent = fs.readFileSync(tempFixture.aFilepath).toString().replace('This is a', 'This is a MODIFIED');

				console.log('modifying a.js');
				fs.writeFileSync(tempFixture.aFilepath, aContent);

				aStats = fs.statSync(tempFixture.aFilepath);
				console.log("a.js mtime after ", +aStats.mtime);


				helper.runAgain(function(stats, files, iteration) {

					// And only a.js built after it was modified
					stats.modules[0].name.should.containEql('c.js');
					stats.modules[0].built.should.be.exactly(false, 'c.js should not have built');

					stats.modules[1].name.should.containEql('a.js');
					stats.modules[1].built.should.be.exactly(true, 'a.js should have been built');

					done();
				});
			});
		});
	});

});
