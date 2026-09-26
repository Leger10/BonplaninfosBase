// Configuration pm2 pour la production (Hostinger VPS).
// Lancer avec :  pm2 start ecosystem.config.cjs
// Voir les logs  :  pm2 logs bonplaninfos
module.exports = {
  apps: [
    {
      name: 'bonplaninfos',
      script: 'server/index.mjs',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '900M',
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
      },
      env_production: {
        NODE_ENV: 'production',
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      time: true,
    },
  ],
};
