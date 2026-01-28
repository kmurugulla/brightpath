import { buildTreeAPIURL, buildContentsAPIURL } from './github-parser.js';
import TokenStorage from './token-storage.js';

export default class GitHubAPI {
  constructor(org, repo, branch = 'main', token = null) {
    this.org = org;
    this.repo = repo;
    this.branch = branch;
    this.token = token || TokenStorage.get();
  }

  static getHeaders(token = null) {
    const headers = {
      Accept: 'application/vnd.github.v3+json',
    };

    const authToken = token || TokenStorage.get();
    if (authToken) {
      headers.Authorization = `Bearer ${authToken}`;
    }

    return headers;
  }

  async validateAccess() {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${this.org}/${this.repo}`,
        { headers: GitHubAPI.getHeaders(this.token) },
      );

      if (!response.ok) {
        if (response.status === 404 || response.status === 403) {
          return {
            valid: false,
            rateLimit: 0,
            error: 'private',
            needsToken: !this.token,
          };
        }
        throw new Error(`GitHub API error: ${response.status}`);
      }

      const data = await response.json();
      const rateLimit = parseInt(response.headers.get('X-RateLimit-Remaining') || '0', 10);

      if (data.private && !this.token) {
        return {
          valid: false,
          rateLimit,
          error: 'private',
          needsToken: true,
        };
      }

      return {
        valid: true,
        rateLimit,
        error: null,
      };
    } catch (error) {
      return {
        valid: false,
        rateLimit: 0,
        error: error.message,
      };
    }
  }

  /**
   * Discovers blocks in the repository
   * @returns {Promise<Array<{name: string, path: string}>>}
   */
  async discoverBlocks() {
    try {
      const url = buildTreeAPIURL(this.org, this.repo, this.branch);
      const response = await fetch(url, { headers: GitHubAPI.getHeaders(this.token) });

      if (!response.ok) {
        if (response.status === 403) {
          const remaining = response.headers.get('X-RateLimit-Remaining');
          if (remaining === '0') {
            throw new Error('GitHub API rate limit exceeded. Please add a GitHub token.');
          }
        }
        throw new Error(`Failed to fetch repository tree: ${response.status}`);
      }

      const data = await response.json();

      // Filter for files in /blocks/ directory
      const blockFiles = data.tree.filter((item) => item.path.startsWith('blocks/') && item.type === 'tree');

      // Extract block names
      const blocks = blockFiles.map((item) => {
        const pathParts = item.path.split('/');
        const blockName = pathParts[1]; // blocks/{blockName}/...
        return {
          name: blockName,
          path: item.path,
        };
      });

      // Remove duplicates
      const uniqueBlocks = Array.from(
        new Map(blocks.map((block) => [block.name, block])).values(),
      );

      return uniqueBlocks;
    } catch (error) {
      throw new Error(`Failed to discover blocks: ${error.message}`);
    }
  }

  /**
   * Fetches file contents from GitHub
   * @param {string} path - File path in repository
   * @returns {Promise<string>} File contents
   */
  async fetchFileContents(path) {
    try {
      const url = buildContentsAPIURL(this.org, this.repo, path, this.branch);
      const response = await fetch(url, { headers: GitHubAPI.getHeaders(this.token) });

      if (!response.ok) {
        throw new Error(`Failed to fetch file ${path}: ${response.status}`);
      }

      const data = await response.json();

      // Decode base64 content
      if (data.content) {
        return atob(data.content);
      }

      throw new Error(`No content found for ${path}`);
    } catch (error) {
      throw new Error(`Failed to fetch file ${path}: ${error.message}`);
    }
  }

  /**
   * Fetches multiple files in parallel
   * @param {Array<string>} paths - Array of file paths
   * @returns {Promise<Array<{path: string, content: string, error: string|null}>>}
   */
  async fetchMultipleFiles(paths) {
    const results = await Promise.allSettled(
      paths.map(async (path) => {
        try {
          const content = await this.fetchFileContents(path);
          return { path, content, error: null };
        } catch (error) {
          return { path, content: null, error: error.message };
        }
      }),
    );

    return results.map((result) => (result.status === 'fulfilled' ? result.value : result.reason));
  }

  /**
   * Gets raw file URL for direct access
   * @param {string} path - File path in repository
   * @returns {string} Raw file URL
   */
  getRawFileURL(path) {
    return `https://raw.githubusercontent.com/${this.org}/${this.repo}/${this.branch}/${path}`;
  }

  /**
   * Alias for fetchFileContents to match MCP API conventions
   * @param {string} path - File path in repository
   * @returns {Promise<string|null>} File contents or null if not found
   */
  async getFileContent(path) {
    try {
      return await this.fetchFileContents(path);
    } catch (error) {
      return null;
    }
  }
}
