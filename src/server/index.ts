import { createServer } from 'http';
import { Server } from 'socket.io';
import { PolicyHandler } from './handler';
import { spawn } from 'node-pty';
import { join } from 'path';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST']
  }
});

const policyHandler = new PolicyHandler();

io.on('connection', (socket) => {
  console.log('Client connected');

  // Policy management events
  socket.on('getPolicies', async () => {
    const policies = policyHandler.getPolicies();
    socket.emit('policies', policies);
  });

  socket.on('addPolicy', async (policy) => {
    const newPolicy = policyHandler.addPolicy(policy);
    io.emit('policyAdded', newPolicy);
  });

  socket.on('updatePolicyStatus', async ({ name, status }) => {
    const updatedPolicy = policyHandler.updatePolicyStatus(name, status);
    if (updatedPolicy) {
      io.emit('policyUpdated', updatedPolicy);
    }
  });

  socket.on('deletePolicy', async (name) => {
    const success = policyHandler.deletePolicy(name);
    if (success) {
      io.emit('policyDeleted', name);
    }
  });

  // CLI interaction events
  socket.on('startDownload', async ({ policyName, password }) => {
    const policy = policyHandler.getPolicies().find(p => p.name === policyName);
    if (!policy) {
      socket.emit('error', { message: 'Policy not found' });
      return;
    }

    const term = spawn('icloudpd', [
      '--username', policy.account,
      '--directory', policy.directory,
      '--album', policy.album
    ], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });

    term.onData(data => {
      socket.emit('terminalOutput', { policyName, data });
    });

    term.onExit(({ exitCode }) => {
      socket.emit('downloadComplete', { policyName, exitCode });
    });

    // Handle password input when prompted
    if (password) {
      term.write(password + '\n');
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.WS_SERVER_PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
}); 