var path = require("path");
var webpack = require("../../");
module.exports = {
	plugins: [
		new webpack.DllReferencePlugin({
			context: path.join(__dirname, "..", "dll"),
			manifest: require("../dll/js/alpha-manifest.json")
		}),
		new webpack.DllReferencePlugin({
			scope: "beta",
			manifest: require("../dll/js/beta-manifest.json")
		}),

		{
			apply: function(compiler) {

				// Copied from NormalModule
				function contextify(options, request) {
					return request.split("!").map(function(r) {
						var rp = path.relative(options.context, r);
						if(path.sep === "\\")
							rp = rp.replace(/\\/g, "/");
						if(rp.indexOf("../") !== 0)
							rp = "./" + rp;
						return rp;
					}).join("!");
				}


				compiler.resolvers['normal'].apply({
					apply: function(resolver) {

						if (compiler.options.plugins) {
							var dllReferencePluginOptions = [];

							compiler.options.plugins.forEach(function(plugin) {
								if (plugin.constructor.name === 'DllReferencePlugin') {
									dllReferencePluginOptions.push(plugin.options)
								}
							});

						}

						resolver.plugin('resolve', function(request, resolveCallback) {

							for (var i = 0; i < dllReferencePluginOptions.length; i++) {
								var pluginOptions = dllReferencePluginOptions[i];
								var manifestContext = pluginOptions.context;
								var manifestContent = pluginOptions.manifest && pluginOptions.manifest.content;
								var manifestName    = pluginOptions.manifest && pluginOptions.manifest.name;

								if (manifestContext) {
									var fullRequest = path.resolve(request.path, request.request);

									// Get these from elsewhere? (the DelegatedModuleFactoryPlugin
									// has them as options to pass in with these defaults)
									var extensionsToTry = ['', '.js'];

									for (var j = 0; j < extensionsToTry.length; j++) {
										var fullRequestWithExt = fullRequest + extensionsToTry[j];

										var relativeToManifest = contextify(pluginOptions, fullRequestWithExt);

										if (relativeToManifest && manifestContent && relativeToManifest in manifestContent) {
											return resolver.doResolve('resolved', {
												request: relativeToManifest,
												resource: fullRequestWithExt,
												path: fullRequestWithExt,
											}, 'custom resolver ' + request.request, resolveCallback);
										}

									}

								}
							}

							resolveCallback();
						});

					}
				});



			}
		}
	]
};
