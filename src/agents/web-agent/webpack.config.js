const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Get port from environment variable or use default
const WEBPACK_DEV_SERVER_PORT = parseInt(process.env.WEBPACK_DEV_SERVER_PORT || '3000', 10);

module.exports = {
  mode: 'development',
  entry: './app/renderer/index.tsx',
  target: 'electron-renderer',
  devtool: 'source-map',
  // Bundle Node core/polyfill deps (avoid runtime require in browser context)
  externalsPresets: { node: false },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.renderer.json'
          }
        },
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      events: require.resolve('events/'),
    },
  },
  output: {
    filename: 'renderer.js',
    path: path.resolve(__dirname, 'dist/renderer'),
    clean: true,
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './app/renderer/index.html',
    }),
  ],
  devServer: {
    port: WEBPACK_DEV_SERVER_PORT,
    hot: true,
    static: {
      directory: path.join(__dirname, 'dist/renderer'),
    },
  },
};
