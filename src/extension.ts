import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  console.log('GeoView extension is now active!');

  // Initialize settings storage for each file
  const perFileSettings: { [key: string]: { cmap?: string; dataDimensions?: string; transpose?: boolean; vscale?: number } } = {};

  // Register custom readonly editor
  const provider = new GeoViewEditorProvider(context, perFileSettings);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      'vscode-geoview.geoviewEditor',
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Register command to change cmap for a specific file
  context.subscriptions.push(
    vscode.commands.registerCommand('geoview.changeCmap', async (uri?: vscode.Uri) => {
      if (!uri) {
        // Try to get URI from the active custom editor
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab && activeTab.input instanceof vscode.TabInputCustom) {
          uri = activeTab.input.uri;
        } else {
          vscode.window.showErrorMessage('No active GeoView editor.');
          return;
        }
      }

      const cmapOptions = [
        'viridis', 'gray', 'Petrel', 'jet', 'seismic', 'stratum', 'bwp', 'plasma',
      ];

      const selectedCmap = await vscode.window.showQuickPick(cmapOptions, {
        placeHolder: 'Please select a colormap (cmap) for visualization',
      });

      if (selectedCmap) {
        perFileSettings[uri.toString()] = perFileSettings[uri.toString()] || {};
        perFileSettings[uri.toString()].cmap = selectedCmap;

        // Get the corresponding WebviewPanel
        const panel = GeoViewEditorProvider.getPanelForUri(uri);
        if (panel) {
          // Get the corresponding document
          const document = GeoViewEditorProvider.getDocumentForUri(uri);
          if (!document) {
            vscode.window.showErrorMessage('Cannot find the corresponding document.');
            return;
          }

          const workspacePath = document.workspacePath;

          // Get the latest dataDimensions
          const fileSettings = perFileSettings[uri.toString()] || {};
          const dataDimensions = fileSettings.dataDimensions || vscode.workspace.getConfiguration('geoview').get<string>('defaultDimensions', '512,512');
          const transpose = fileSettings.transpose || vscode.workspace.getConfiguration('geoview').get<boolean>('transpose', true);
          const vscale = fileSettings.vscale !== undefined ? fileSettings.vscale : vscode.workspace.getConfiguration('geoview').get<number>('vscale', 1.0);

          // Regenerate visualization
          let imagePath: string;
          try {
            imagePath = await generateVisualization(uri.fsPath, workspacePath, selectedCmap, dataDimensions, transpose, vscale, context);
          } catch (error: any) {
            vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
            return;
          }

          const tempDir = path.join(workspacePath, '.geoview_temp');
          panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.file(tempDir)],
          };

          const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(imagePath));

          // Send message to Webview to update the image
          panel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
        } else {
          vscode.window.showErrorMessage('Cannot find the corresponding GeoView editor.');
        }
      }
    })
  );

  // Register command to toggle transpose
  context.subscriptions.push(
    vscode.commands.registerCommand('geoview.transpose', async (uri?: vscode.Uri) => {
      if (!uri) {
        // Try to get URI from the active custom editor
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab && activeTab.input instanceof vscode.TabInputCustom) {
          uri = activeTab.input.uri;
        } else {
          vscode.window.showErrorMessage('No active GeoView editor.');
          return;
        }
      }

      // Get file settings
      perFileSettings[uri.toString()] = perFileSettings[uri.toString()] || {};
      const fileSettings = perFileSettings[uri.toString()];
      const defaultTranspose = vscode.workspace.getConfiguration('geoview').get<boolean>('transpose', true);

      const currentTranspose = fileSettings.transpose !== undefined ? fileSettings.transpose : defaultTranspose;

      // Toggle transpose value
      const newTranspose = !currentTranspose;
      fileSettings.transpose = newTranspose;

      // Get other parameters
      const cmap = fileSettings.cmap || vscode.workspace.getConfiguration('geoview').get<string>('cmap', 'gray');
      const dataDimensions = fileSettings.dataDimensions || vscode.workspace.getConfiguration('geoview').get<string>('defaultDimensions', '512,512');
      const vscale = fileSettings.vscale !== undefined ? fileSettings.vscale : vscode.workspace.getConfiguration('geoview').get<number>('vscale', 1.0);

      // Get the corresponding document
      const document = GeoViewEditorProvider.getDocumentForUri(uri);
      if (!document) {
        vscode.window.showErrorMessage('Cannot find the corresponding document.');
        return;
      }

      const workspacePath = document.workspacePath;

      // Regenerate visualization
      let imagePath: string;
      try {
        imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, newTranspose, vscale, context);
      } catch (error: any) {
        vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
        return;
      }

      // Update Webview
      const panel = GeoViewEditorProvider.getPanelForUri(uri);
      if (panel) {
        const tempDir = path.join(workspacePath, '.geoview_temp');
        panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(tempDir)],
        };

        const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(imagePath));

        // Send message to Webview to update the image
        panel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
      } else {
        vscode.window.showErrorMessage('Cannot find the corresponding GeoView editor.');
      }

      if (newTranspose) {
        vscode.window.showInformationMessage("Visualization data 2D: d.T, 3D: d[idx, :, :].T");
      } else {
        vscode.window.showInformationMessage("Visualization data 2D: d, 3D: d[:, :, idx]");
      }
    })
  );
}

class GeoViewEditorProvider implements vscode.CustomReadonlyEditorProvider {
  private static openPanels: Map<string, vscode.WebviewPanel> = new Map();
  private static documents: Map<string, GeoViewDocument> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly perFileSettings: { [key: string]: { cmap?: string; dataDimensions?: string; transpose?: boolean; vscale?: number } }
  ) { }

  public static getPanelForUri(uri: vscode.Uri): vscode.WebviewPanel | undefined {
    return GeoViewEditorProvider.openPanels.get(uri.toString());
  }

  public static getDocumentForUri(uri: vscode.Uri): GeoViewDocument | undefined {
    return GeoViewEditorProvider.documents.get(uri.toString());
  }

  public async openCustomDocument(
    uri: vscode.Uri,
    openContext: { backupId?: string },
    token: vscode.CancellationToken
  ): Promise<GeoViewDocument> {
    // Get workspace path
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let workspacePath: string;

    if (workspaceFolders && workspaceFolders.length > 0) {
      workspacePath = workspaceFolders[0].uri.fsPath;
    } else {
      vscode.window.showErrorMessage('No workspace folder is open.');
      throw new Error('No workspace folder is open.');
    }

    // Create and return custom document object
    const document = new GeoViewDocument(uri, workspacePath);
    GeoViewEditorProvider.documents.set(uri.toString(), document);
    return document;
  }

  public async resolveCustomEditor(
    document: GeoViewDocument,
    webviewPanel: vscode.WebviewPanel,
    token: vscode.CancellationToken
  ): Promise<void> {
    const uri = document.uri;
    const workspacePath = document.workspacePath;

    // Add panel to openPanels
    GeoViewEditorProvider.openPanels.set(uri.toString(), webviewPanel);

    // Listen for panel dispose event, remove panel and document
    webviewPanel.onDidDispose(() => {
      GeoViewEditorProvider.openPanels.delete(uri.toString());
      GeoViewEditorProvider.documents.delete(uri.toString());
    });

    // Get default configuration
    const config = vscode.workspace.getConfiguration('geoview');
    const defaultCmap = config.get<string>('cmap', 'gray');
    const defaultDimensions = config.get<string>('defaultDimensions', '512,512');
    const defaultTranspose = config.get<boolean>('transpose', true);
    const defaultVscale = config.get<number>('vscale', 1.0);

    // Get settings for the specific file
    const fileSettings = this.perFileSettings[uri.toString()] || {};
    const cmap = fileSettings.cmap || defaultCmap;
    let dataDimensions: string = fileSettings.dataDimensions || defaultDimensions;
    const transpose: boolean = fileSettings.transpose || defaultTranspose;
    const currentVscale: number = fileSettings.vscale !== undefined ? fileSettings.vscale : defaultVscale;

    let imagePath: string;

    try {
      // Call generateVisualization to generate the image
      imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, transpose, currentVscale, this.context);
    } catch (error: any) {
      // If it's a dimension error, prompt the user to input new dimensions
      if (error.message === 'DimensionError') {
        const input = await vscode.window.showInputBox({
          prompt: 'Please enter data dimensions (e.g., 512,512 or 512,512,512)',
          placeHolder: 'rows,columns[,depth]',
          validateInput: (value) => {
            if (!/^\d+\s*,\s*\d+(\s*,\s*\d+)?$/.test(value.trim())) {
              return 'Please enter a valid dimension format: rows,columns[,depth]';
            }
            return null;
          },
        });

        if (!input) {
          vscode.window.showErrorMessage('No data dimensions provided, operation cancelled.');
          return;
        }

        dataDimensions = input;

        // Update dimensions setting for the specific file
        this.perFileSettings[uri.toString()] = this.perFileSettings[uri.toString()] || {};
        this.perFileSettings[uri.toString()].dataDimensions = dataDimensions;

        // Try generating visualization again
        imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, transpose, currentVscale, this.context);
      } else if (error.message === 'FormatError') {
        vscode.window.showErrorMessage('Invalid or unsupported file format.');
        return;
      } else {
        vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
        return;
      }
    }

    const tempDir = path.join(workspacePath, '.geoview_temp');

    // Add temporary directory to localResourceRoots
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(tempDir)],
    };

    // Convert image path to Webview URI
    const imageUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(imagePath));
    console.log(`Image URI: ${imageUri.toString()}`);

    // Generate and set Webview content
    webviewPanel.webview.html = this.getWebviewContent(imageUri, cmap, currentVscale);

    // Add message handling
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'changeCmap') {
        const selectedCmap = message.cmap;

        // Update perFileSettings
        const uriString = document.uri.toString();
        this.perFileSettings[uriString] = this.perFileSettings[uriString] || {};
        this.perFileSettings[uriString].cmap = selectedCmap;

        // Get other parameters
        const fileSettings = this.perFileSettings[uriString];
        const dataDimensions = fileSettings.dataDimensions || vscode.workspace.getConfiguration('geoview').get<string>('defaultDimensions', '512,512');
        const transpose = fileSettings.transpose !== undefined ? fileSettings.transpose : vscode.workspace.getConfiguration('geoview').get<boolean>('transpose', true);
        const currentVscale = fileSettings.vscale !== undefined ? fileSettings.vscale : vscode.workspace.getConfiguration('geoview').get<number>('vscale', 1.0);

        // Regenerate visualization
        let imagePath: string;
        try {
          imagePath = await generateVisualization(document.uri.fsPath, document.workspacePath, selectedCmap, dataDimensions, transpose, currentVscale, this.context);
        } catch (error: any) {
          vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
          return;
        }

        const tempDir = path.join(document.workspacePath, '.geoview_temp');
        webviewPanel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(tempDir)],
        };

        const imageUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(imagePath));

        // Send message to Webview to update the image
        webviewPanel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
      } else if (message.command === 'changeVscale') {
        const newVscale = message.vscale;

        // Update perFileSettings
        const uriString = document.uri.toString();
        this.perFileSettings[uriString] = this.perFileSettings[uriString] || {};
        this.perFileSettings[uriString].vscale = newVscale;

        // Get other parameters
        const fileSettings = this.perFileSettings[uriString];
        const cmap = fileSettings.cmap || defaultCmap;
        const dataDimensions = fileSettings.dataDimensions || defaultDimensions;
        const transpose = fileSettings.transpose !== undefined ? fileSettings.transpose : defaultTranspose;

        // Regenerate visualization
        let imagePath: string;
        try {
          imagePath = await generateVisualization(document.uri.fsPath, document.workspacePath, cmap, dataDimensions, transpose, newVscale, this.context);
        } catch (error: any) {
          vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
          return;
        }

        const tempDir = path.join(document.workspacePath, '.geoview_temp');
        webviewPanel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(tempDir)],
        };

        const imageUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(imagePath));

        // Send message to Webview to update the image
        webviewPanel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
      }
    });
  }

  private getWebviewContent(imageUri: vscode.Uri, currentCmap: string, currentVscale: number): string {
    const cmapOptions = [
      'viridis', 'gray', 'Petrel', 'jet', 'seismic', 'stratum', 'bwp', 'plasma',
    ];

    // Generate the options for the select element
    const optionsHtml = cmapOptions.map(cmap => {
      const selected = (cmap === currentCmap) ? 'selected' : '';
      return `<option value="${cmap}" ${selected}>${cmap}</option>`;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <div>
          <label for="cmap-select">Colormap:</label>
          <select id="cmap-select">
            ${optionsHtml}
          </select>
          <label for="vscale-input">VScale:</label>
          <input type="number" id="vscale-input" min="0.0001" max="1.3" step="0.0001" value="${currentVscale}" />
        </div>
        <img id="geoview-image" src="${imageUri}" style="width: auto; height: 100%;" />
        <script>
          const vscode = acquireVsCodeApi();
  
          // Handle colormap selection change
          document.getElementById('cmap-select').addEventListener('change', (event) => {
            const selectedCmap = event.target.value;
            vscode.postMessage({ command: 'changeCmap', cmap: selectedCmap });
          });
  
          // Handle vscale input 'Enter' key event
          document.getElementById('vscale-input').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
              const vscaleValue = parseFloat(event.target.value);
              if (isNaN(vscaleValue) || vscaleValue < 0.0001 || vscaleValue > 1.3) {
                alert('Please enter a valid number between 0.0001 and 1.3 for vscale.');
                return;
              }
              vscode.postMessage({ command: 'changeVscale', vscale: vscaleValue });
            }
          });
  
          // Listen for messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateImage') {
              document.getElementById('geoview-image').src = message.imageUri;
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}

class GeoViewDocument implements vscode.CustomDocument {
  uri: vscode.Uri;
  workspacePath: string;

  constructor(uri: vscode.Uri, workspacePath: string) {
    this.uri = uri;
    this.workspacePath = workspacePath;
  }

  dispose(): void {
    // Cleanup operations when the document is closed
  }
}


async function getPythonPath(): Promise<string> {
  const pythonExtensionId = 'ms-python.python';
  const pythonExtension = vscode.extensions.getExtension(pythonExtensionId);

  if (pythonExtension && pythonExtension.isActive) {
    // // Activate the Python extension if not already activated
    // if (!pythonExtension.isActive) {
    //   await pythonExtension.activate();
    // }

    // Access the interpreter path via the Python extension's API
    const pythonApi = pythonExtension.exports;
    if (pythonApi && pythonApi.settings) {
      const executionDetails = pythonApi.settings.getExecutionDetails();
      if (executionDetails && executionDetails.execCommand && executionDetails.execCommand.length > 0) {
        const pythonPath = executionDetails.execCommand[0];
        if (pythonPath) {
          console.log(`[GeoView] Using Python interpreter from Python extension: ${pythonPath}`);
          return pythonPath;
        }
      }
    }
  }

  // If Python extension is not available or cannot provide the interpreter path
  // Use the path from configuration or default to 'python'
  const config = vscode.workspace.getConfiguration('geoview');
  const pythonPath = config.get<string>('pythonPath', 'python');
  console.log(`[GeoView] Using Python interpreter from configuration: ${pythonPath}`);
  return pythonPath;
}

async function generateVisualization(
  filePath: string,
  workspacePath: string,
  cmap: string,
  dataDimensions: string,
  transpose: boolean,
  vscale: number,
  context: vscode.ExtensionContext
): Promise<string> {
  return new Promise<string>(async (resolve, reject) => {
    // Get user configuration
    const config = vscode.workspace.getConfiguration('geoview');
    // const pythonPath = config.get<string>('pythonPath', 'python');

    let pythonPath = await getPythonPath();

    const scriptPath = config.get<string>(
      'scriptPath',
      path.join(context.extensionPath, 'python_scripts', 'visualize.py')
    );
    // Use workspace directory as temporary folder
    const tempDir = config.get<string>('tempDir', path.join(workspacePath, '.geoview_temp'));
    const imageSize = config.get<any>('imageSize', { width: 800, height: 600 });

    // Ensure temporary directory exists
    const fs = require('fs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`[GeoView] Created temporary directory: ${tempDir}`);
    }

    // Generate a unique image file name to avoid conflicts
    const crypto = require('crypto');
    const imageFileName = `geoview_${crypto.randomBytes(8).toString('hex')}.png`;
    const imagePath = path.join(tempDir, imageFileName);

    // Build command line arguments
    const args = [
      scriptPath,
      filePath,
      imagePath,
      `--cmap=${cmap}`,
      `--width=${imageSize.width}`,
      `--height=${imageSize.height}`,
    ];

    if (dataDimensions) {
      args.push(`--dims=${dataDimensions}`);
    }
    if (transpose) {
      args.push(`--transpose`);
    }
    args.push(`--vscale=${vscale}`);

    // Execute Python script
    const command = `${pythonPath} ${args.map((a) => `"${a}"`).join(' ')}`;
    console.log(`[GeoView] Executing command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[GeoView] Error: ${error.message}`);
        console.error(`[GeoView] stderr: ${stderr}`);

        // Check error type
        if (stderr.includes('cannot reshape array') || stderr.includes('ValueError')) {
          reject(new Error('DimensionError'));
        } else if (stderr.includes('Invalid file format') || stderr.includes('Exception')) {
          reject(new Error('FormatError'));
        } else {
          reject(error);
        }
      } else {
        console.log(`[GeoView] Visualization generated at: ${imagePath}`);
        resolve(imagePath);
      }
    });
  });
}

export function deactivate() {
  console.log('GeoView extension is now deactivated.');

  // Get workspace path
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const tempDir = path.join(workspacePath, '.geoview_temp');

    // Delete temporary directory and all its files
    const fs = require('fs');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[GeoView] Deleted temporary directory: ${tempDir}`);
    }
  }
}
