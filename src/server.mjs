import { createServer } from 'node:http';
import { handle } from './app.mjs';

const port = Number(process.env.PORT ?? 3000);
const server = createServer(handle);
server.listen(port, () => console.log(`todo-api listening on ${server.address().port}`));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
