
module.exports = {
    apps: [
      {
        name: 'arbitrage-bot',
        script: './bot.js',
        watch: true,
        ignore_watch: ['node_modules'],
        env: {
          NODE_ENV: 'development',
        },
        env_production: {
          NODE_ENV: 'production',
        },
      },
    ],
  };
