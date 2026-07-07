module.exports = {
  apps: [{
    name: 'oil-system',
    script: 'server.js',
    max_memory_restart: '150M',
    kill_timeout: 5000,
    max_restarts: 5,
    min_uptime: '10s',
    restart_delay: 5000,
    env: {
      ADMIN_PASSWORD: 'YOUR_ADMIN_PASSWORD'
    }
  }]
};
