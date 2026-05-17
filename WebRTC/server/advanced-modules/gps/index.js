const store = require('./store');

function init(app, io) {
  // OwnTracks HTTP webhook — configure app: HTTP → POST to /advanced/gps/webhook
  app.post('/advanced/gps/webhook', (req, res) => {
    const { lat, lon, acc, batt, t, tid, _type } = req.body || {};

    if (_type && _type !== 'location') {
      return res.json({ _type: 'response' });
    }

    const deviceId = tid || 'unknown';
    const point = {
      deviceId,
      lat: parseFloat(lat) || 0,
      lon: parseFloat(lon) || 0,
      acc: acc || null,
      batt: batt || null,
      trigger: t || null,
      ts: Date.now(),
    };

    store.push(deviceId, point);
    io.emit('gps:update', point);

    // OwnTracks expects this exact response shape
    res.json({ _type: 'response' });
  });

  // History endpoint
  app.get('/advanced/gps/history/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    res.json(store.getLast(deviceId, limit));
  });

  // List all tracked device IDs
  app.get('/advanced/gps/devices', (_req, res) => {
    res.json({ devices: store.getAllDevices() });
  });

  console.log('📍 GPS/OwnTracks module ready  →  POST /advanced/gps/webhook');
}

module.exports = { init };
