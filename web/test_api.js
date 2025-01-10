const io = require("socket.io-client");

const socket = io("http://localhost:5000", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

socket.on("connect", () => {
  console.log("Connected to Socket.IO server");
});

socket.on("connect_error", (error) => {
  console.error("Socket.IO connection error:", error);
});

socket.on("disconnect", (reason) => {
  console.log("Socket.IO connection disconnected:", reason);
});

socket.on("policies", (data) => {
  console.log("Received policies:", data);
});

socket.on("authenticated", (data) => {
  console.log("Received authenticated:", data);
});

socket.on("authentication_failed", (data) => {
  console.log("Received authentication_failed:", data);
});

socket.on("mfa_required", (data) => {
  console.log("Received mfa_required:", data);
});

socket.on("save_policy_failed", (data) => {
  console.log("Received save_policy_failed:", data);
});

socket.on("download_progress", (data) => {
  console.log("Received download_progress:", data);
});

socket.on("download_finished", (data) => {
  console.log("Received download_finished:", data);
});

socket.on("download_failed", (data) => {
  console.log("Received download_failed:", data);
});

socket.on("internal_error", (data) => {
  console.log("Received internal_error:", data);
});

socket.emit("get_policies");

// Test updating a policy
function testUpdatePolicy() {
  const policyName = "New Policy";
  const policyUpdate = {
    username: "new@icloud.com",
    directory: "~/Photos/New",
  };

  socket.emit("save_policy", policyName, policyUpdate);
  // socket.emit('get_policies');
}
// testUpdatePolicy();

function testAuthenticate() {
  const policyName = "Test Policy";
  const password = "Qi@nznG14";

  socket.emit("authenticate", policyName, password);
  // socket.emit('provide_mfa', policyName, '114514');
  socket.emit("get_policies");
}
testAuthenticate();

function testStart() {
  testAuthenticate();
  const policyName = "Test Policy";
  socket.emit("start", policyName);
}
// testStart();

function testInterrupt() {
  testAuthenticate();
  const policyName = "Test Policy";
  socket.emit("start", policyName);
  setTimeout(() => {
    socket.emit("interrupt", policyName);
  }, 8000);
  setTimeout(() => {
    socket.emit("start", policyName);
  }, 12000);
}
// testInterrupt();
