const path = require('path');

module.exports = {
  mode: 'production', // Fixes the mode warning ('production' or 'development')
  entry: './src/index.ts', // Points to your TypeScript entry file
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'], // Allows importing ts files without extensions
  },
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
  },
};
