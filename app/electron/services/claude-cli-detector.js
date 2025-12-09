const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ClaudeCliDetector {
  /**
   * Check if Claude Code CLI is installed and accessible
   * @returns {Object} { installed: boolean, path: string|null, version: string|null, method: 'cli'|'sdk'|'none' }
   */
  static detectClaudeInstallation() {
    try {
      // Method 1: Check if 'claude' command is in PATH
      try {
        const claudePath = execSync('which claude', { encoding: 'utf-8' }).trim();
        const version = execSync('claude --version', { encoding: 'utf-8' }).trim();
        return {
          installed: true,
          path: claudePath,
          version: version,
          method: 'cli'
        };
      } catch (error) {
        // CLI not in PATH, check local installation
      }

      // Method 2: Check for local installation
      const localClaudePath = path.join(os.homedir(), '.claude', 'local', 'claude');
      if (fs.existsSync(localClaudePath)) {
        try {
          const version = execSync(`${localClaudePath} --version`, { encoding: 'utf-8' }).trim();
          return {
            installed: true,
            path: localClaudePath,
            version: version,
            method: 'cli-local'
          };
        } catch (error) {
          // Local CLI exists but may not be executable
        }
      }

      // Method 3: Check Windows path
      if (process.platform === 'win32') {
        try {
          const claudePath = execSync('where claude', { encoding: 'utf-8' }).trim();
          const version = execSync('claude --version', { encoding: 'utf-8' }).trim();
          return {
            installed: true,
            path: claudePath,
            version: version,
            method: 'cli'
          };
        } catch (error) {
          // Not found
        }
      }

      // Method 4: SDK mode (using OAuth token)
      if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
        return {
          installed: true,
          path: null,
          version: 'SDK Mode',
          method: 'sdk'
        };
      }

      return {
        installed: false,
        path: null,
        version: null,
        method: 'none'
      };
    } catch (error) {
      console.error('[ClaudeCliDetector] Error detecting Claude installation:', error);
      return {
        installed: false,
        path: null,
        version: null,
        method: 'none',
        error: error.message
      };
    }
  }

  /**
   * Get installation recommendations
   */
  static getInstallationInfo() {
    const detection = this.detectClaudeInstallation();
    
    if (detection.installed) {
      return {
        status: 'installed',
        method: detection.method,
        version: detection.version,
        path: detection.path,
        recommendation: detection.method === 'cli' 
          ? 'Using Claude Code CLI - optimal for long-running tasks'
          : 'Using SDK mode - works well but CLI may provide better performance'
      };
    }

    return {
      status: 'not_installed',
      recommendation: 'Consider installing Claude Code CLI for better performance with ultrathink',
      installCommands: {
        macos: 'curl -fsSL claude.ai/install.sh | bash',
        windows: 'irm https://claude.ai/install.ps1 | iex',
        linux: 'curl -fsSL claude.ai/install.sh | bash',
        npm: 'npm install -g @anthropic-ai/claude-code'
      }
    };
  }
}

module.exports = ClaudeCliDetector;

