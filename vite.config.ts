import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { jzmServer } from './server/api';

export default defineConfig({
  plugins: [react(), jzmServer()],
  test: { environment: 'node' },
});
