const webpack = require('vortex-api/bin/webpack').default;

const config = webpack('modpacks', __dirname, 4);
config.externals['./build/Release/vortexmt'] = './vortexmt';

module.exports = config;
