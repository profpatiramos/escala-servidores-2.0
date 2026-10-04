import express from "express";
import { configureApp } from "./server/_core/app";
const app = express();
app.set("trust proxy", 1);
configureApp(app);
export default app;
