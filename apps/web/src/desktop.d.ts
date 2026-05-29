type DesktopOpenLogPayload = {
  fileName: string;
  rawText: string;
};

type DesktopApi = {
  notifyRendererReady: () => void;
  onOpenLog: (listener: (payload: DesktopOpenLogPayload) => void) => () => void;
};

declare global {
  interface Window {
    sfdcDesktop?: DesktopApi;
  }
}

export {};
