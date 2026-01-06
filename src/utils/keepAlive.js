// Keep-alive utility to ping external server every 12 minutes
// This prevents the Render server from sleeping due to inactivity

const PING_URL = 'https://aierpbackend.onrender.com';
const PING_INTERVAL = 12 * 60 * 1000; // 12 minutes in milliseconds

const pingServer = async () => {
  try {
    const response = await fetch(PING_URL);
    console.log(`[KeepAlive] Pinged ${PING_URL} - Status: ${response.status} at ${new Date().toISOString()}`);
  } catch (error) {
    console.error(`[KeepAlive] Failed to ping ${PING_URL}:`, error.message);
  }
};

const startKeepAlive = () => {
  console.log(`[KeepAlive] Starting keep-alive service - pinging ${PING_URL} every 12 minutes`);
  
  // Initial ping
  pingServer();
  
  // Set interval for subsequent pings
  setInterval(pingServer, PING_INTERVAL);
};

export { startKeepAlive };
