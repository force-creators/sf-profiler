import { contextBridge, ipcRenderer } from 'electron';

type DesktopOpenLogPayload = {
  fileName: string;
  rawText: string;
};

type OpenLogListener = (payload: DesktopOpenLogPayload) => void;

contextBridge.exposeInMainWorld('sfdcDesktop', {
  notifyRendererReady() {
    ipcRenderer.send('sfdc-profiler:renderer-ready');
  },
  onOpenLog(listener: OpenLogListener) {
    const handleOpenLog = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      const openLogPayload = payload as DesktopOpenLogPayload;
      listener(openLogPayload);
    };

    ipcRenderer.on('sfdc-profiler:open-log', handleOpenLog);

    return () => {
      ipcRenderer.removeListener('sfdc-profiler:open-log', handleOpenLog);
    };
  },
});
