type VsCodeInitialLogPayload = {
  fileName: string;
  rawText: string;
};

type VsCodeApi = {
  initialLog?: VsCodeInitialLogPayload;
  initialTheme?: 'light' | 'dark';
};

declare global {
  interface Window {
    sfdcVsCode?: VsCodeApi;
  }
}

export {};
