const axios = require('axios');

const PYTHON_API = process.env.PYTHON_API_URL || 'http://localhost:8000';

const RESOURCE_MAP = {
  location: (id) => `/api/location/${id}`,
  photos:   (id) => `/api/photos/${id}`,
  messages: (id) => `/api/messages/${id}`,
  flagged:  (id) => `/api/messages/${id}/flagged`,
  apps:     (id) => `/api/apps/${id}`,
  browser:  (id) => `/api/browser/${id}`,
  risk:     (id) => `/api/risk/${id}/report`,
};

async function fetchResource(profileId, resource) {
  const pathFn = RESOURCE_MAP[resource];
  if (!pathFn) throw new Error(`Unknown resource: ${resource}. Valid: ${Object.keys(RESOURCE_MAP).join(', ')}`);
  const { data } = await axios.get(`${PYTHON_API}${pathFn(profileId)}`, { timeout: 15000 });
  return data;
}

function init(app, io) {
  // Socket.io — frontend emits 'icloud:fetch' to get data through the single WS connection
  io.on('connection', (socket) => {
    socket.on('icloud:fetch', async ({ profileId, resource }) => {
      try {
        const data = await fetchResource(profileId, resource);
        socket.emit('icloud:data', { profileId, resource, data });
      } catch (err) {
        socket.emit('icloud:data', { profileId, resource, error: err.message });
      }
    });
  });

  // HTTP proxy for direct REST access
  app.get('/advanced/icloud/:profileId/:resource', async (req, res) => {
    try {
      const data = await fetchResource(req.params.profileId, req.params.resource);
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  app.get('/advanced/icloud/resources', (_req, res) => {
    res.json({ resources: Object.keys(RESOURCE_MAP) });
  });

  console.log('☁️  iCloud proxy module ready  →  /advanced/icloud/:profileId/:resource');
}

module.exports = { init };
