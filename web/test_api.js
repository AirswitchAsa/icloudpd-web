const io = require('socket.io-client');

const socket = io('http://localhost:5000', {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on('connect', () => {
  console.log('Connected to Socket.IO server');
});

socket.on('connect_error', (error) => {
  console.error('Socket.IO connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Socket.IO connection disconnected:', reason);
});

socket.on('policies', (data) => {
  console.log('Received policies:', data);
});

socket.on('authenticated', (data) => {
  console.log('Received authenticated:', data);
});

socket.on('authentication_failed', (data) => {
  console.log('Received authentication_failed:', data);
});

socket.on('mfa_required', (data) => {
  console.log('Received mfa_required:', data);
});


socket.emit('getPolicies');

// Test updating a policy
function testUpdatePolicy() {
  const policyName = 'Favorites Backup';
  const policyUpdate = {
    username: 'fav@icloud.com',
    directory: '~/Photos/fav'
  };

  socket.emit('savePolicy', policyName, policyUpdate);
  socket.emit('getPolicies');
}
// testUpdatePolicy();

function testAuthenticate() {
  const policyName = 'Test Policy';
  const password = '114514';

  socket.emit('authenticate', policyName, password);
  socket.emit('provideMFA', policyName, '114514');
}
testAuthenticate();
