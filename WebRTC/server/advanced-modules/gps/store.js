const MAX = 100;
const store = new Map();

function push(deviceId, point) {
  if (!store.has(deviceId)) store.set(deviceId, []);
  const arr = store.get(deviceId);
  arr.push(point);
  if (arr.length > MAX) arr.shift();
}

function getLast(deviceId, n = MAX) {
  const arr = store.get(deviceId) || [];
  return arr.slice(-n);
}

function getAllDevices() {
  return [...store.keys()];
}

module.exports = { push, getLast, getAllDevices };
