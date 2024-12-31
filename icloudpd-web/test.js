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

// Example of listening for a custom event
socket.on('policies', (data) => {
  console.log('Received policies:', data);
});

// Example of emitting a custom event
socket.emit('getPolicies');
