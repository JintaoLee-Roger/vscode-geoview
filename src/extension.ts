import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';

export function activate(context: vscode.ExtensionContext) {
  console.log('GeoView extension is now active!');

  // 初始化每个文件的设置存储
  const perFileSettings: { [key: string]: { cmap?: string; dataDimensions?: string; transpose?: boolean } } = {};

  // 注册自定义只读编辑器
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

  // 注册命令以更改特定文件的cmap
  context.subscriptions.push(
    vscode.commands.registerCommand('geoview.changeCmap', async (uri?: vscode.Uri) => {
      if (!uri) {
        // 尝试从活动的自定义编辑器获取 URI
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab && activeTab.input instanceof vscode.TabInputCustom) {
          uri = activeTab.input.uri;
        } else {
          vscode.window.showErrorMessage('没有活动的GeoView编辑器。');
          return;
        }
      }

      const cmapOptions = [
        'viridis', 'gray', 'Petrel', 'jet', 'seismic', 'stratum', 'bwp', 'plasma',
      ];

      const selectedCmap = await vscode.window.showQuickPick(cmapOptions, {
        placeHolder: '请选择用于可视化的色彩映射（cmap）',
      });

      if (selectedCmap) {
        perFileSettings[uri.toString()] = perFileSettings[uri.toString()] || {};
        perFileSettings[uri.toString()].cmap = selectedCmap;

        // 获取对应的 WebviewPanel
        const panel = GeoViewEditorProvider.getPanelForUri(uri);
        if (panel) {
          // 获取对应的文档
          const document = GeoViewEditorProvider.getDocumentForUri(uri);
          if (!document) {
            vscode.window.showErrorMessage('无法找到对应的文档。');
            return;
          }

          const workspacePath = document.workspacePath;

          // 获取最新的 dataDimensions
          const fileSettings = perFileSettings[uri.toString()] || {};
          const dataDimensions = fileSettings.dataDimensions || vscode.workspace.getConfiguration('geoview').get<string>('defaultDimensions', '512,512');
          const transpose = fileSettings.transpose || vscode.workspace.getConfiguration('geoview').get<boolean>('transpose', true);

          // 重新生成可视化
          let imagePath: string;
          try {
            imagePath = await generateVisualization(uri.fsPath, workspacePath, selectedCmap, dataDimensions, transpose, context);
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

          // 发送消息给 Webview，更新图像
          panel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
        } else {
          vscode.window.showErrorMessage('无法找到对应的 GeoView 编辑器。');
        }
      }
    })
  );

  // 注册命令以切换 transpose
  context.subscriptions.push(
    vscode.commands.registerCommand('geoview.transpose', async (uri?: vscode.Uri) => {
      if (!uri) {
        // 尝试从活动的自定义编辑器获取 URI
        const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
        if (activeTab && activeTab.input instanceof vscode.TabInputCustom) {
          uri = activeTab.input.uri;
        } else {
          vscode.window.showErrorMessage('没有活动的GeoView编辑器。');
          return;
        }
      }

      // 获取文件设置
      perFileSettings[uri.toString()] = perFileSettings[uri.toString()] || {};
      const fileSettings = perFileSettings[uri.toString()];
      const defaultTranspose = vscode.workspace.getConfiguration('geoview').get<boolean>('transpose', true);

      const currentTranspose = fileSettings.transpose !== undefined ? fileSettings.transpose : defaultTranspose;

      // 切换 transpose 值
      const newTranspose = !currentTranspose;
      fileSettings.transpose = newTranspose;

      // 获取其他参数
      const cmap = fileSettings.cmap || vscode.workspace.getConfiguration('geoview').get<string>('cmap', 'gray');
      const dataDimensions = fileSettings.dataDimensions || vscode.workspace.getConfiguration('geoview').get<string>('defaultDimensions', '512,512');

      // 获取对应的文档
      const document = GeoViewEditorProvider.getDocumentForUri(uri);
      if (!document) {
        vscode.window.showErrorMessage('无法找到对应的文档。');
        return;
      }

      const workspacePath = document.workspacePath;

      // 重新生成可视化
      let imagePath: string;
      try {
        imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, newTranspose, context);
      } catch (error: any) {
        vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
        return;
      }

      // 更新 Webview
      const panel = GeoViewEditorProvider.getPanelForUri(uri);
      if (panel) {
        const tempDir = path.join(workspacePath, '.geoview_temp');
        panel.webview.options = {
          enableScripts: true,
          localResourceRoots: [vscode.Uri.file(tempDir)],
        };

        const imageUri = panel.webview.asWebviewUri(vscode.Uri.file(imagePath));

        // 发送消息给 Webview，更新图像
        panel.webview.postMessage({ command: 'updateImage', imageUri: imageUri.toString() });
      } else {
        vscode.window.showErrorMessage('无法找到对应的 GeoView 编辑器。');
      }

      vscode.window.showInformationMessage(`数据已${newTranspose ? '转置' : '恢复原始'}`);
    })
  );
}

class GeoViewEditorProvider implements vscode.CustomReadonlyEditorProvider {
  private static openPanels: Map<string, vscode.WebviewPanel> = new Map();
  private static documents: Map<string, GeoViewDocument> = new Map();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly perFileSettings: { [key: string]: { cmap?: string; dataDimensions?: string; transpose?: boolean } }
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
    // 获取工作区路径
    const workspaceFolders = vscode.workspace.workspaceFolders;
    let workspacePath: string;

    if (workspaceFolders && workspaceFolders.length > 0) {
      workspacePath = workspaceFolders[0].uri.fsPath;
    } else {
      vscode.window.showErrorMessage('No workspace folder is open.');
      throw new Error('No workspace folder is open.');
    }

    // 创建并返回自定义文档对象
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

    // 将面板添加到 openPanels
    GeoViewEditorProvider.openPanels.set(uri.toString(), webviewPanel);

    // 监听面板关闭事件，移除面板和文档
    webviewPanel.onDidDispose(() => {
      GeoViewEditorProvider.openPanels.delete(uri.toString());
      GeoViewEditorProvider.documents.delete(uri.toString());
    });

    // 获取默认配置
    const config = vscode.workspace.getConfiguration('geoview');
    const defaultCmap = config.get<string>('cmap', 'gray');
    const defaultDimensions = config.get<string>('defaultDimensions', '512,512');
    const defaultTranspose = config.get<boolean>('transpose', true);

    // 获取特定文件的设置
    const fileSettings = this.perFileSettings[uri.toString()] || {};
    const cmap = fileSettings.cmap || defaultCmap;
    let dataDimensions: string = fileSettings.dataDimensions || defaultDimensions;
    const transpose: boolean = fileSettings.transpose || defaultTranspose;

    let imagePath: string;

    try {
      // 调用 generateVisualization 生成图像
      imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, transpose, this.context);
    } catch (error: any) {
      // 如果是维度错误，提示用户输入新的维度
      if (error.message === 'DimensionError') {
        const input = await vscode.window.showInputBox({
          prompt: '请输入数据维度（例如：512,512 或 512,512,512）',
          placeHolder: '行数,列数[,深度]',
          validateInput: (value) => {
            if (!/^\d+\s*,\s*\d+(\s*,\s*\d+)?$/.test(value.trim())) {
              return '请输入有效的维度格式：行数,列数[,深度]';
            }
            return null;
          },
        });

        if (!input) {
          vscode.window.showErrorMessage('未输入数据维度，操作已取消。');
          return;
          // throw new Error('No data dimensions provided.');
        }

        dataDimensions = input;

        // 更新特定文件的维度设置
        this.perFileSettings[uri.toString()] = this.perFileSettings[uri.toString()] || {};
        this.perFileSettings[uri.toString()].dataDimensions = dataDimensions;

        // 再次尝试生成可视化
        imagePath = await generateVisualization(uri.fsPath, workspacePath, cmap, dataDimensions, transpose, this.context);
      } else if (error.message === 'FormatError') {
        vscode.window.showErrorMessage('文件格式无效或不支持。');
        return;
      } else {
        vscode.window.showErrorMessage(`GeoView Error: ${error.message}`);
        return;
      }
    }

    const tempDir = path.join(workspacePath, '.geoview_temp');

    // 将临时目录添加到 localResourceRoots
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(tempDir)],
    };

    // 将图像路径转换为 Webview URI
    const imageUri = webviewPanel.webview.asWebviewUri(vscode.Uri.file(imagePath));
    console.log(`Image URI: ${imageUri.toString()}`);

    // 生成并设置 Webview 内容
    webviewPanel.webview.html = this.getWebviewContent(imageUri);

    // 添加消息处理
    webviewPanel.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'refresh') {
        // 处理其他消息，如果有的话
      }
    });
  }

  private getWebviewContent(imageUri: vscode.Uri): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <body>
        <img id="geoview-image" src="${imageUri}" style="width: 100%; height: auto;" />
        <script>
          const vscode = acquireVsCodeApi();
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
    // 文档关闭时的清理操作
  }
}

async function generateVisualization(
  filePath: string,
  workspacePath: string,
  cmap: string,
  dataDimensions: string,
  transpose: boolean,
  context: vscode.ExtensionContext
): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    // 获取用户配置
    const config = vscode.workspace.getConfiguration('geoview');
    const pythonPath = config.get<string>('pythonPath', 'python');
    const scriptPath = config.get<string>(
      'scriptPath',
      path.join(context.extensionPath, 'python_scripts', 'visualize.py')
    );
    // 使用工作区目录作为临时文件夹
    const tempDir = config.get<string>('tempDir', path.join(workspacePath, '.geoview_temp'));
    const imageSize = config.get<any>('imageSize', { width: 800, height: 600 });

    // 确保临时目录存在
    const fs = require('fs');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`[GeoView] Created temporary directory: ${tempDir}`);
    }

    // 生成唯一的图像文件名，防止冲突
    const crypto = require('crypto');
    const imageFileName = `geoview_${crypto.randomBytes(8).toString('hex')}.png`;
    const imagePath = path.join(tempDir, imageFileName);

    // 构建命令行参数
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

    // 执行 Python 脚本
    const command = `${pythonPath} ${args.map((a) => `"${a}"`).join(' ')}`;
    console.log(`[GeoView] Executing command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`[GeoView] Error: ${error.message}`);
        console.error(`[GeoView] stderr: ${stderr}`);

        // 检查错误类型
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

  // 获取工作区路径
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    const workspacePath = workspaceFolders[0].uri.fsPath;
    const tempDir = path.join(workspacePath, '.geoview_temp');

    // 删除临时目录及其中的所有文件
    const fs = require('fs');
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      console.log(`[GeoView] Deleted temporary directory: ${tempDir}`);
    }
  }
}