import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const redirectToSistemaBase = () => ({
  name: 'redirect-to-sistema-base',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const reqUrl = req.url || '';
      if (reqUrl === '/' || reqUrl === '/index.html') {
        res.statusCode = 302;
        res.setHeader('Location', '/sistema/');
        res.end();
        return;
      }
      next();
    });
  },
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: '/sistema/',
      server: {
        port: 3001,
        host: '0.0.0.0',
      },
      plugins: [react(), redirectToSistemaBase()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
