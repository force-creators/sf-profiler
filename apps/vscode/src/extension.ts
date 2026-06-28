import * as path from 'node:path';
import * as vscode from 'vscode';

type InitialLogPayload = {
  fileName: string;
  rawText: string;
};

type WebviewConfigPayload = {
  fileName: string;
};

type WebviewClientMessage =
  | {
      type: 'rendererReady';
    }
  | {
      type: 'openLine';
      lineNumber: number;
    };

type WebviewTheme = 'light' | 'dark';

const profileLogCommand = 'sfdc-profiler.profileLog';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      profileLogCommand,
      async (uri?: vscode.Uri, selectedUris?: vscode.Uri[]) => {
        await profileLog(context, getTargetUri(uri, selectedUris));
      }
    )
  );
}

export function deactivate() {}

async function profileLog(
  context: vscode.ExtensionContext,
  targetUri: vscode.Uri | undefined
) {
  if (!targetUri) {
    vscode.window.showWarningMessage(
      'Open an Apex debug log or right-click a .log file to profile it.'
    );
    return;
  }

  if (targetUri.scheme !== 'file' && targetUri.scheme !== 'vscode-remote') {
    vscode.window.showWarningMessage('SF Profiler can only profile workspace files.');
    return;
  }

  const logUri = targetUri;
  const fileName = path.basename(logUri.fsPath || logUri.path);

  const panel = vscode.window.createWebviewPanel(
    'sfdcProfilerLogProfile',
    `SF Profiler: ${fileName}`,
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  const webDistUri = await getWebDistUri(context.extensionUri);

  if (!webDistUri) {
    vscode.window.showErrorMessage(
      'SF Profiler web assets were not found. Run "npm run build -w @sfdc-profiler/vscode" from the repo root and try again.'
    );
    panel.dispose();
    return;
  }

  panel.webview.options = {
    enableScripts: true,
    localResourceRoots: [webDistUri],
  };
  panel.iconPath = vscode.Uri.joinPath(webDistUri, 'icon.png');

  let isLoadingLog = false;
  let didSendLog = false;

  async function loadAndSendLog() {
    if (isLoadingLog || didSendLog) {
      return;
    }

    isLoadingLog = true;
    await panel.webview.postMessage({ type: 'loadStarted', fileName });

    try {
      const fileBytes = await vscode.workspace.fs.readFile(logUri);
      const rawText = new TextDecoder().decode(fileBytes);
      const payload: InitialLogPayload = { fileName, rawText };

      didSendLog = true;
      await panel.webview.postMessage({ type: 'openLog', ...payload });
    } catch (error) {
      await panel.webview.postMessage({
        type: 'loadError',
        fileName,
        message: getErrorMessage(error),
      });
    } finally {
      isLoadingLog = false;
    }
  }

  panel.webview.onDidReceiveMessage((message: WebviewClientMessage) => {
    if (!isWebviewClientMessage(message)) {
      return;
    }

    if (message.type === 'rendererReady') {
      void loadAndSendLog();
      return;
    }

    if (message.type === 'openLine') {
      void revealLogLine(logUri, message.lineNumber);
    }
  });

  panel.webview.html = await getWebviewHtml(panel.webview, webDistUri, {
    fileName,
  });
}

function getTargetUri(
  uri: vscode.Uri | undefined,
  selectedUris: vscode.Uri[] | undefined
): vscode.Uri | undefined {
  if (uri) {
    return uri;
  }

  if (selectedUris?.[0]) {
    return selectedUris[0];
  }

  return vscode.window.activeTextEditor?.document.uri;
}

async function getWebDistUri(
  extensionUri: vscode.Uri
): Promise<vscode.Uri | undefined> {
  const packagedWebDistUri = vscode.Uri.joinPath(extensionUri, 'media', 'web');
  const workspaceWebDistUri = vscode.Uri.joinPath(extensionUri, '..', 'web', 'dist');

  if (await uriExists(vscode.Uri.joinPath(packagedWebDistUri, 'index.html'))) {
    return packagedWebDistUri;
  }

  if (await uriExists(vscode.Uri.joinPath(workspaceWebDistUri, 'index.html'))) {
    return workspaceWebDistUri;
  }

  return undefined;
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function getWebviewHtml(
  webview: vscode.Webview,
  webDistUri: vscode.Uri,
  payload: WebviewConfigPayload
): Promise<string> {
  const indexHtmlUri = vscode.Uri.joinPath(webDistUri, 'index.html');
  const indexHtmlBytes = await vscode.workspace.fs.readFile(indexHtmlUri);
  const indexHtml = new TextDecoder().decode(indexHtmlBytes);
  const nonce = createNonce();
  const webviewAssetBaseUri = `${webview.asWebviewUri(webDistUri).toString()}/`;
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https://img.buymeacoffee.com data:`,
    `font-src ${webview.cspSource}`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src ${webview.cspSource} 'nonce-${nonce}'`,
  ].join('; ');
  const initialConfigScript = `<script nonce="${nonce}">window.sfdcVsCode = ${serializeScriptJson(
    {
      host: true,
      initialFileName: payload.fileName,
      initialTheme: getInitialWebviewTheme(),
    }
  )};</script>`;

  return indexHtml
    .replace(
      /<head>/,
      `<head><base href="${escapeHtmlAttribute(
        webviewAssetBaseUri
      )}"><meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(
        csp
      )}">`
    )
    .replace(/<script /g, `<script nonce="${nonce}" `)
    .replace(/<\/head>/, `${initialConfigScript}</head>`)
    .replace(/\b(href|src)="([^"]+)"/g, (match, attribute: string, value: string) => {
      if (!shouldRewriteAssetUri(value)) {
        return match;
      }

      const webviewUri = webview.asWebviewUri(
        vscode.Uri.joinPath(webDistUri, normalizeAssetPath(value))
      );

      return `${attribute}="${webviewUri.toString()}"`;
    });
}

async function revealLogLine(targetUri: vscode.Uri, lineNumber: number) {
  const document = await vscode.workspace.openTextDocument(targetUri);
  const visibleEditor = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === document.uri.toString()
  );
  const editor = visibleEditor
    ? await vscode.window.showTextDocument(document, {
        viewColumn: visibleEditor.viewColumn,
        preserveFocus: false,
        preview: false,
      })
    : await vscode.window.showTextDocument(document, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: false,
        preview: false,
      });
  const targetLine = Math.min(
    Math.max(Math.trunc(lineNumber) - 1, 0),
    Math.max(document.lineCount - 1, 0)
  );
  const position = new vscode.Position(targetLine, 0);
  const range = new vscode.Range(position, position);

  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
}

function isWebviewClientMessage(
  value: unknown
): value is WebviewClientMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const message = value as Partial<WebviewClientMessage>;

  return (
    message.type === 'rendererReady' ||
    (message.type === 'openLine' && typeof message.lineNumber === 'number')
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function shouldRewriteAssetUri(value: string): boolean {
  return (
    value.startsWith('./') ||
    value.startsWith('/') ||
    (!value.includes(':') && !value.startsWith('#'))
  );
}

function normalizeAssetPath(value: string): string {
  return value.replace(/^\.?\//, '');
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function serializeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getInitialWebviewTheme(): WebviewTheme {
  if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark) {
    return 'dark';
  }

  if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light) {
    return 'light';
  }

  return 'light';
}

function createNonce(): string {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';

  for (let index = 0; index < 32; index += 1) {
    nonce += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return nonce;
}
