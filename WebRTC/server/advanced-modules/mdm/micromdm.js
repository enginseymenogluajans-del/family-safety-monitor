const axios = require('axios');

const SUPPORTED = ['DeviceLock', 'EraseDevice', 'ClearPasscode', 'RestartDevice', 'ShutDownDevice'];

function client() {
  const base = process.env.MICROMDM_URL || 'http://localhost:9090';
  const key  = process.env.MICROMDM_API_KEY || '';
  return axios.create({
    baseURL: base,
    auth: { username: 'micromdm', password: key },
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });
}

async function sendCommand(udid, requestType, payload = {}) {
  if (!SUPPORTED.includes(requestType)) {
    throw new Error(`Unsupported command: ${requestType}. Supported: ${SUPPORTED.join(', ')}`);
  }
  const body = { udid, request_type: requestType, ...payload };
  const { data } = await client().post('/v1/commands', body);
  return data;
}

async function listDevices() {
  const { data } = await client().get('/v1/devices');
  return data;
}

module.exports = { sendCommand, listDevices, SUPPORTED };
