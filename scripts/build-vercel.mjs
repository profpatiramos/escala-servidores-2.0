import { cp, mkdir } from 'node:fs/promises';
await mkdir('public', { recursive: true });
await cp('dist/public', 'public', { recursive: true });
