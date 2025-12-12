const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    'service-worker': './src/background/service-worker.js',
    'content-script': './src/content/content-script.js',
    'popup': './src/popup/popup.js',
    'offscreen': './src/offscreen/offscreen.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup.html' },
        { from: 'src/popup/popup.css', to: 'popup.css' },
        { from: 'src/offscreen/offscreen.html', to: 'offscreen.html' },
        { from: 'assets', to: 'assets' }
      ]
    })
  ],
  resolve: {
    extensions: ['.js']
  },
  optimization: {
    minimize: false
  }
};
