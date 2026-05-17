const { sendCommand, listDevices, SUPPORTED } = require('./micromdm');

function init(app, io) {
  async function handleCommand(socket, { udid, command, payload = {} }) {
    if (!udid || !command) {
      const err = 'Missing required fields: udid, command';
      if (socket) socket.emit('mdm:result', { error: err });
      return { error: err };
    }
    try {
      const result = await sendCommand(udid, command, payload);
      const out = { udid, command, uuid: result.command_uuid || result.CommandUUID, ok: true };
      io.emit('mdm:result', out);
      return out;
    } catch (err) {
      const out = { udid, command, error: err.message, ok: false };
      io.emit('mdm:result', out);
      return out;
    }
  }

  // Socket.io — frontend can emit 'mdm:command' directly
  io.on('connection', (socket) => {
    socket.on('mdm:command', (data) => handleCommand(socket, data));
  });

  // HTTP — POST /advanced/mdm/command { udid, command, payload? }
  app.post('/advanced/mdm/command', async (req, res) => {
    const result = await handleCommand(null, req.body || {});
    res.status(result.ok === false ? 502 : 200).json(result);
  });

  // List enrolled devices
  app.get('/advanced/mdm/devices', async (_req, res) => {
    try {
      const data = await listDevices();
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // Available commands
  app.get('/advanced/mdm/commands', (_req, res) => {
    res.json({ commands: SUPPORTED });
  });

  console.log('📱 MDM bridge module ready  →  POST /advanced/mdm/command');
}

module.exports = { init };
