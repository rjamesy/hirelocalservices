module.exports = {
  apps: [{
    name: 'hirelocalservices',
    script: 'npm',
    args: 'start',
    cwd: '/home/ubuntu/app',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
    // Restart on failure
    max_restarts: 10,
    min_uptime: '10s',
    restart_delay: 5000,
    // Logging
    error_file: '/home/ubuntu/.pm2/logs/hirelocalservices-error.log',
    out_file: '/home/ubuntu/.pm2/logs/hirelocalservices-out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  }],
}
