import * as path from 'node:path';
import * as vscode from 'vscode';

type InitialLogPayload = {
  fileName: string;
  rawText: string;
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

  const fileBytes = await vscode.workspace.fs.readFile(targetUri);
  const rawText = new TextDecoder().decode(fileBytes);
  const payload: InitialLogPayload = {
    fileName: path.basename(targetUri.fsPath || targetUri.path),
    rawText,
  };

  const panel = vscode.window.createWebviewPanel(
    'sfdcProfilerLogProfile',
    `SF Profiler: ${payload.fileName}`,
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
  panel.webview.html = await getWebviewHtml(panel.webview, webDistUri, payload);
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
  payload: InitialLogPayload
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
  const initialLogScript = `<script nonce="${nonce}">window.sfdcVsCode = ${serializeScriptJson(
    {
      initialLog: payload,
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
    .replace(/<\/head>/, `${initialLogScript}</head>`)
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
