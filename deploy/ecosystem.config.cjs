module.exports = {
  apps: [
    { name: 'lrmsosmed-backend', script: '/app/apps/backend/dist/apps/backend/src/main.js', node_args: '--experimental-require-module' },
    { name: 'lrmsosmed-frontend', cwd: '/app/apps/frontend', script: '/app/node_modules/next/dist/bin/next', args: 'start -p 4200' },
    { name: 'lrmsosmed-worker', script: '/app/apps/orchestrator/dist/apps/orchestrator/src/main.js', node_args: '--experimental-require-module' },
  ].map(app => ({ ...app, autorestart: true, kill_timeout: 15000, out_file: '/dev/stdout', error_file: '/dev/stderr' })),
};
