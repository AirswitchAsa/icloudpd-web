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

socket.on('save_policy_failed', (data) => {
  console.log('Received save_policy_failed:', data);
});

socket.on('download_progress', (data) => {
  console.log('Received download_progress:', data);
});

socket.on('download_finished', (data) => {
  console.log('Received download_finished:', data);
});

socket.on('download_failed', (data) => {
  console.log('Received download_failed:', data);
});

socket.emit('getPolicies');

// Test updating a policy
function testUpdatePolicy() {
  const policyName = 'New Policy';
  const policyUpdate = {
    username: 'new@icloud.com',
    directory: '~/Photos/New',
    };

  socket.emit('savePolicy', policyName, policyUpdate);
  // socket.emit('getPolicies');
}
// testUpdatePolicy();

function testAuthenticate() {
  const policyName = 'Test Policy';
  const password = '114514';

  socket.emit('authenticate', policyName, password);
  // socket.emit('provideMFA', policyName, '114514');
  socket.emit('getPolicies');
}
// testAuthenticate();

function testStart() {
  testAuthenticate();
  const policyName = 'Test Policy';
  socket.emit('start', policyName);
}
testStart();
