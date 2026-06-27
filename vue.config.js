import path from 'path';
import webpack from 'webpack';
import CopyWebpackPlugin from 'copy-webpack-plugin';
import argv from 'yargs';
import child_process from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const devServerUrl =
  process.env.AW_SERVER_URL ||
  (process.env.NODE_ENV === 'production' ? undefined : JSON.stringify(''));

// get git info from command line
const _COMMIT_HASH = child_process.execSync('git rev-parse --short HEAD').toString().trim();
console.info('Commit hash:', _COMMIT_HASH);

export default {
  pages: {
    index: {
      entry: './src/main.js',
      template: './index.html',
      templateParameters: {
        cspDefaultSrc: process.env.NODE_ENV === 'production' ? '' : '*:5600 *:5666 ws://*:27180',
      },
    },
  },
  chainWebpack: config => {
    config.plugin('define').tap(options => {
      options[0]['process.env'].VUE_APP_ON_ANDROID = argv.os == 'android';
      return options;
    });
  },
  configureWebpack: {
    // sourcemaps are not enabled when `--watch` is used https://github.com/vuejs/vue-cli/issues/1806#issuecomment-832111894
    devtool: 'source-map',
    performance: {
      maxAssetSize: 1_100_000,
      maxEntrypointSize: 1_500_000,
    },
    resolve: {
      alias: {
        '~': path.resolve(__dirname, './src'),
        src: path.resolve(__dirname, './src'),
        assets: path.resolve(__dirname, './src/assets'),
        components: path.resolve(__dirname, './src/components'),
      },
      fallback: {
        domain: import.meta.resolve('domain-browser'),
      },
    },
    plugins: [
      new webpack.IgnorePlugin({ resourceRegExp: /^\.\/locale$/, contextRegExp: /moment$/ }),
      new webpack.DefinePlugin({
        PRODUCTION: process.env.NODE_ENV === 'production',
        AW_SERVER_URL: devServerUrl,
        COMMIT_HASH: JSON.stringify(_COMMIT_HASH),
      }),
      new CopyWebpackPlugin({
        patterns: [{ from: 'static/', to: '' }],
      }),
    ],
  },
  devServer: {
    compress: true,
    port: 27180,
    proxy: {
      '/api': {
        target: process.env.AW_DEV_PROXY_TARGET || 'http://127.0.0.1:5600',
        changeOrigin: true,
      },
    },
    static: {
      directory: path.join(__dirname, 'dist'),
    },
  },
  pwa: {
    name: 'FocusFrog',
    iconPaths: {
      faviconSVG: 'focusfrog-logo.svg',
      favicon32: 'logo.png',
      favicon16: 'logo.png',
      appleTouchIcon: 'logo.png',
      //maskIcon: 'logo.png',
      msTileImage: 'logo.png',
    },
    manifestOptions: {
      icons: [
        {
          src: 'logo.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    },
  },
  pluginOptions: {},
  transpileDependencies: [
    // can be string or regex
    'vis-data',
    'vis-timeline',
  ],
};
