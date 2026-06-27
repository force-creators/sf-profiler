import { StrictMode } from 'react';
import { loader } from '@monaco-editor/react';
import { createRoot } from 'react-dom/client';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api.js';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { App } from './App';
import './styles.css';

(self as unknown as {
  MonacoEnvironment: {
    getWorker: () => Worker;
  };
}).MonacoEnvironment = {
  getWorker() {
    return new editorWorker();
  },
};

loader.config({ monaco });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
