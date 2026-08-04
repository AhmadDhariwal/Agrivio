import { createApp } from './app.js';

const host = process.env['HOST'] ?? 'localhost';
const port = process.env['PORT'] ? Number(process.env['PORT']) : 3000;

const app = createApp();

app.listen(port, host, () => {
  console.log(`[ ready ] http://${host}:${port}`);
});
