// Pings /health on the deployed API. Used by the GitHub Actions keep-warm workflow
// (see .github/workflows/keep-warm.yml) to stop Render's free tier from spinning
// down after 15 minutes of inactivity. Can also just be run manually:
//   PING_URL=https://your-app.onrender.com node scripts/ping.js

const url = (process.env.PING_URL || 'http://localhost:3000') + '/health';

fetch(url)
  .then((res) => res.json())
  .then((data) => {
    console.log(`Pinged ${url} ->`, data);
  })
  .catch((err) => {
    console.error(`Failed to ping ${url}:`, err.message);
    process.exit(1);
  });
