import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // Main-process tests stay in node; renderer tests opt into jsdom with a
    // `@vitest-environment jsdom` docblock, so neither pays for the other.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
