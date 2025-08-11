// Service simple de présence des utilisateurs
// Map<userId, Set<socketId>>
const onlineUsers = new Map();

function setOnline(userId, socketId) {
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socketId);
}

function setOffline(userId, socketId) {
  if (!onlineUsers.has(userId)) return;
  const set = onlineUsers.get(userId);
  set.delete(socketId);
  if (set.size === 0) onlineUsers.delete(userId);
}

function isOnline(userId) {
  return onlineUsers.has(userId) && onlineUsers.get(userId).size > 0;
}

function getSockets(userId) {
  return Array.from(onlineUsers.get(userId) || []);
}

module.exports = { setOnline, setOffline, isOnline, getSockets };


