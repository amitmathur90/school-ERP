// PM2 process manager config.
//
// Now that the database is PostgreSQL (not SQLite), it's safe to run
// multiple Node processes in "cluster" mode — each one gets its own
// connection pool, and Postgres handles concurrent access from all of them
// correctly. This is the real payoff of the migration: you can now use all
// of your server's CPU cores, not just one.
//
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 save
//   pm2 startup        # follow the printed instructions to auto-start on reboot
//
// Tuning note: each cluster worker opens its own connection pool (see
// db.js's `max: 20`). With N workers that's up to N*20 simultaneous
// Postgres connections — check your Postgres server's max_connections
// setting (default is usually 100) and lower either the per-pool `max` in
// db.js or the `instances` count below if you'd exceed it.

module.exports = {
  apps: [
    {
      name: "law-college-erp",
      script: "server.js",
      instances: "max",       // one worker per CPU core — remove/lower this if you're tight on Postgres connections (see note above)
      exec_mode: "cluster",
      autorestart: true,
      max_restarts: 20,
      min_uptime: "10s",       // don't count a crash-loop restart as "successful" unless it stays up this long
      restart_delay: 2000,     // wait 2s between restart attempts, so a crash loop doesn't hammer the CPU
      max_memory_restart: "500M", // restart if memory usage creeps up (guards against a slow leak taking the server down)
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
