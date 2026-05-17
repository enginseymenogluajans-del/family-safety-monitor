"use strict";

/**
 * Shared in-memory state for the WhatsApp client.
 * Both index.js and api.js import this module to read/write connection state.
 */
module.exports = {
  latestQr: null, // Raw QR string from the 'qr' event
  isConnected: false, // True after 'ready' fires, false after 'disconnected'
};
