const { PeerServer } = require("peer");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// PeerJS sunucusu — kamera/ses WebRTC için
const peerServer = PeerServer({
  port: 9000,
  path: "/peerjs",
  allow_discovery: true,
});

peerServer.on("connection", (client) => {
  console.log("🔗 PeerJS bağlantısı:", client.getId());
});

peerServer.on("disconnect", (client) => {
  console.log("❌ PeerJS ayrıldı:", client.getId());
});

console.log("🚀 PeerJS Sunucusu port 9000 /peerjs üzerinde çalışıyor");
console.log("   Frontend: host=localhost, port=9000, path=/peerjs");
console.log("   Android : host=192.168.1.175, port=9000, path=/peerjs");
