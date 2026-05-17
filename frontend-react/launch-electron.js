const { spawn } = require('child_process');
const path = require('path');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
env.NODE_ENV = process.env.NODE_ENV || 'development';

const electronExe = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

const proc = spawn(electronExe, ['.'], {
  env,
  stdio: 'inherit',
  cwd: __dirname,
});

proc.on('exit', (code) => process.exit(code || 0));
