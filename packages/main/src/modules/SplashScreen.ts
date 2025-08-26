import { BrowserWindow } from 'electron';
import { AppModule } from '../AppModule.js';
import { ModuleContext } from '../ModuleContext.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export class SplashScreen implements AppModule {
  private splashWindow: BrowserWindow | null = null;

  async enable({ app }: ModuleContext): Promise<void> {
    await app.whenReady();
    this.createSplashWindow();
  }

  private createSplashWindow(): void {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    
    this.splashWindow = new BrowserWindow({
      width: 400,
      height: 400,
      title: 'AgentBuddy-Splash', // Used for window identification
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      center: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    // Load the splash HTML file
    const splashPath = join(__dirname, 'modules', 'splash', 'splash.html');
    this.splashWindow.loadFile(splashPath);

    // Show window once ready
    this.splashWindow.once('ready-to-show', () => {
      if (this.isValid()) {
        this.splashWindow!.show();
      }
    });

    // Prevent manual close
    this.splashWindow.on('close', (event) => {
      // Only prevent close if window hasn't started closing animation
      if (this.isValid() && this.splashWindow!.getOpacity() === 1) {
        event.preventDefault();
      }
    });
  }

  private isValid(): boolean {
    return this.splashWindow !== null && !this.splashWindow.isDestroyed();
  }

  public isVisible(): boolean {
    return this.isValid() && this.splashWindow!.isVisible();
  }

  public updateStatus(message: string): void {
    if (!this.isValid()) return;
    
    this.splashWindow!.webContents.executeJavaScript(`
      const statusElement = document.getElementById('status');
      if (statusElement) {
        statusElement.textContent = '${message.replace(/'/g, "\\'")}';
      }
    `).catch(() => {
      // Silently ignore errors during close
    });
  }

  public async close(): Promise<void> {
    if (!this.isValid()) return;

    try {
      // Fade out animation using Electron's setOpacity
      let opacity = 1.0;
      const fadeStep = 0.05;
      const fadeInterval = 20;
      
      while (opacity > 0 && this.isValid()) {
        this.splashWindow!.setOpacity(opacity);
        opacity -= fadeStep;
        await new Promise(resolve => setTimeout(resolve, fadeInterval));
      }
      
      if (this.isValid()) {
        this.splashWindow!.destroy();
      }
    } catch (error) {
      // Force close on error
      this.splashWindow?.destroy();
    } finally {
      this.splashWindow = null;
    }
  }
}

export function createSplashScreen(): SplashScreen {
  return new SplashScreen();
}