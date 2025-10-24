#!/usr/bin/env node
/**
 * Smart Service Stopper
 * Stops only Questrade Portfolio services by port, not all Node.js processes
 */

const { execSync } = require('child_process');

// Define the ports our services use
const PORTS = {
  'Auth API': 4001,
  'Sync API': 4002,
  'Portfolio API': 4003,
  'Market API': 4004,
  'WebSocket Proxy': 4005,
  'Notification API': 4006,
  'Frontend': 5173,
  'Frontend (alt)': 5500,
  'Frontend V2': 5501
};

console.log('🛑 Stopping Questrade Portfolio Services...\n');

let stoppedCount = 0;

// Kill processes by port
for (const [serviceName, port] of Object.entries(PORTS)) {
  try {
    // Find PID using the port
    const command = `netstat -ano | findstr :${port} | findstr LISTENING`;
    const result = execSync(command, { encoding: 'utf8' });

    // Extract PID from netstat output
    const lines = result.trim().split('\n');
    const pids = new Set();

    lines.forEach(line => {
      const match = line.trim().match(/LISTENING\s+(\d+)/);
      if (match) {
        pids.add(match[1]);
      }
    });

    // Kill each PID
    for (const pid of pids) {
      try {
        execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
        console.log(`✅ Stopped ${serviceName} (port ${port}, PID ${pid})`);
        stoppedCount++;
      } catch (err) {
        // Process might already be dead
        if (!err.message.includes('not found')) {
          console.log(`⚠️  Could not stop ${serviceName} (port ${port}, PID ${pid})`);
        }
      }
    }
  } catch (err) {
    // Port not in use - that's fine
    if (!err.message.includes('The system cannot find the file specified')) {
      console.log(`ℹ️  ${serviceName} (port ${port}) - not running`);
    }
  }
}

console.log(`\n🏁 Stopped ${stoppedCount} service(s)`);

// Check if there are still zombie Node processes
try {
  const nodeProcesses = execSync('tasklist | findstr node.exe', { encoding: 'utf8' });
  const processCount = nodeProcesses.trim().split('\n').length;

  if (processCount > 5) {
    console.log(`\n⚠️  Warning: ${processCount} Node.js processes still running`);
    console.log('   Some may be other applications or zombie processes');
    console.log('   To kill ALL Node.js processes: npm run force-stop');
  } else {
    console.log(`\n✨ Clean! ${processCount} Node.js processes remaining (likely VS Code/other tools)`);
  }
} catch (err) {
  console.log('\n✨ All services stopped!');
}
