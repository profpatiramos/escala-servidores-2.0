import { writeFile } from 'node:fs/promises';
await writeFile('dist/app.js', 'import express from "express";\nimport app from "./vercel.js";\nexport default app;\n');
