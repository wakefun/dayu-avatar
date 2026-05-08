import fs from 'node:fs';
import cors from 'cors';
import express from 'express';
import session from 'express-session';
import {
  cwebpBin,
  dataRoot,
  defaultImageModel,
  defaultImageQuality,
  defaultPromptModel,
  generatedRoot,
  openAiApiKey,
  openAiBaseUrl,
  openAiRequestTimeoutMs,
  sessionSecret,
  uploadsRoot,
  webOrigin,
} from './config';
import { getAsset, initSchema } from './database';
import { getProviderTaskReferenceAssetIds } from './mappers';
import { configureOpenAiGeneration } from './openai-generation';
import { SQLiteSessionStore } from './session-store';
import { registerApiRoutes, registerErrorHandler, registerSpaFallback, registerStaticRoutes } from './routes';

export function createApp() {
  fs.mkdirSync(uploadsRoot, { recursive: true });
  fs.mkdirSync(generatedRoot, { recursive: true });
  initSchema();
  configureOpenAiGeneration({
    apiKey: openAiApiKey,
    baseUrl: openAiBaseUrl,
    promptModel: defaultPromptModel,
    imageModel: defaultImageModel,
    imageQuality: defaultImageQuality,
    requestTimeoutMs: openAiRequestTimeoutMs,
    dataRoot,
    cwebpBin,
    getAsset,
    getTaskReferenceAssetIds: getProviderTaskReferenceAssetIds,
  });

  const app = express();
  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: webOrigin,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(
    session({
      name: 'dayu.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      store: new SQLiteSessionStore(),
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: 'auto',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  registerStaticRoutes(app);
  registerApiRoutes(app);
  registerSpaFallback(app);
  registerErrorHandler(app);

  return app;
}
