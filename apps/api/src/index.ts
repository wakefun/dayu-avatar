import { authMode, generationMode, port } from './config';
import { createApp } from './app';

const app = createApp();

app.listen(port, () => {
  console.log(`dayu api listening on http://localhost:${port} (auth=${authMode}, generation=${generationMode})`);
});
