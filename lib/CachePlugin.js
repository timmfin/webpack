/*
	MIT License http://www.opensource.org/licenses/mit-license.php
	Author Tobias Koppers @sokra
*/
var async = require("async");

function CachePlugin(cache) {
	this.cache = cache || {};
}
module.exports = CachePlugin;

CachePlugin.prototype.apply = function(compiler) {
	if(Array.isArray(compiler.compilers)) {
		compiler.compilers.forEach(function(c, idx) {
			c.apply(new CachePlugin(this.cache[idx] = this.cache[idx] || {}));
		}, this);
	} else {
		compiler.plugin("compilation", function(compilation) {
			compilation.cache = this.cache;
		}.bind(this));
		compiler.plugin("run", function(compiler, callback) {

			if (compiler._lastModuleHashes) {
				compiler.moduleHashes = compiler._lastModuleHashes;
			}
			if(!compiler._lastCompilationFileDependencies) return callback();
			var fs = compiler.inputFileSystem;
			var fileTs = compiler.fileTimestamps = {};
			async.forEach(compiler._lastCompilationFileDependencies, function(file, callback) {
				fs.stat(file, function(err, stat) {
					if(err) {
						if(err.code === "ENOENT") return callback();
						return callback(err);
					}

					fileTs[file] = stat.mtime || Infinity;
					callback();
				});
			}, callback);
		});
		compiler.plugin("after-compile", function(compilation, callback) {
			compilation.compiler._lastCompilationFileDependencies = compilation.fileDependencies;
			compilation.compiler._lastCompilationContextDependencies = compilation.contextDependencies;

			compilation.compiler._lastModuleHashes = compilation.compiler._lastModuleHashes || {};
			async.forEach(compilation.modules, function(module, callback) {
				if (module.built && module.resource) {
					hashForFile(module, compiler.inputFileSystem, function(err, hash) {
						if (err) return callback(err);

						compilation.compiler._lastModuleHashes[module.resource] = hash;
						callback();
					});
				} else {
					callback();
				}
			}, function(err) {
				if (err) return callback(err);

				callback();
			});
		});
	}
};

// A bummer that we are hashing the file's content completely separately from the
// code that already exists in NormalModule, but code (`module._cachedSource.hash`
// and `module.getSourceHash()`) seems very intertwined with the loaders having run
// and build started. So I'm not even trying to refactor that out.
function hashForFile(module, filesystem, callback) {
	var hash = require("crypto").createHash("md5");
	filesystem.readFile(module.resource, function(err, source) {
		if (err) callback(err);

		hash.update(source);
		callback(null, hash.digest("hex"));
	});

}
