type VsCodeInitialLogPayload = {
  fileName: string;
  rawText: string;
};

type VsCodeHostMessage =
  | {
      type: 'loadStarted';
      fileName: string;
    }
  | {
      type: 'openLog';
      fileName: string;
      rawText: string;
    }
  | {
      type: 'loadError';
      fileName?: string;
      message: string;
    };

type VsCodeClientMessage =
  | {
      type: 'rendererReady';
    }
  | {
      type: 'openLine';
      lineNumber: number;
    };

type VsCodeWebviewApi = {
  postMessage: (message: VsCodeClientMessage) => void;
  getState?: () => unknown;
  setState?: (state: unknown) => void;
};

type VsCodeApi = {
  host?: boolean;
  initialFileName?: string;
  initialLog?: VsCodeInitialLogPayload;
  initialTheme?: 'light' | 'dark';
};

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeWebviewApi;
    sfdcVsCode?: VsCodeApi;
  }
}

export {};
