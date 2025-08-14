/**
 * OAuth Callback Server for Electron
 * 
 * Provides a temporary HTTP server to handle OAuth callbacks
 * during the authorization flow. This server runs locally
 * and captures the authorization code from the redirect.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from "http"
import { URL } from "url"
import { BrowserWindow } from "electron"

export interface OAuthCallbackResult {
  code?: string
  state?: string
  error?: string
  error_description?: string
}

export class OAuthCallbackServer {
  private server: Server | null = null
  private port: number
  private redirectUri: string
  private resolveCallback: ((result: OAuthCallbackResult) => void) | null = null
  private rejectCallback: ((error: Error) => void) | null = null
  private timeout: NodeJS.Timeout | null = null

  constructor(port: number = 3000) {
    this.port = port
    this.redirectUri = `http://localhost:${port}/callback`
  }

  /**
   * Start the callback server and wait for OAuth callback
   */
  async waitForCallback(timeoutMs: number = 300000): Promise<OAuthCallbackResult> {
    return new Promise((resolve, reject) => {
      this.resolveCallback = resolve
      this.rejectCallback = reject

      // Set up timeout
      this.timeout = setTimeout(() => {
        this.cleanup()
        reject(new Error('OAuth callback timeout'))
      }, timeoutMs)

      // Create HTTP server
      this.server = createServer((req, res) => {
        this.handleRequest(req, res)
      })

      // Start listening
      this.server.listen(this.port, 'localhost', () => {
        console.log(`OAuth callback server listening on ${this.redirectUri}`)
      })

      this.server.on('error', (error) => {
        this.cleanup()
        reject(new Error(`Failed to start OAuth callback server: ${error.message}`))
      })
    })
  }

  /**
   * Handle incoming HTTP requests
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '', `http://localhost:${this.port}`)

    if (url.pathname === '/callback') {
      this.handleOAuthCallback(url, res)
    } else if (url.pathname === '/') {
      this.handleRootRequest(res)
    } else {
      this.handleNotFound(res)
    }
  }

  /**
   * Handle OAuth callback request
   */
  private handleOAuthCallback(url: URL, res: ServerResponse): void {
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')
    const errorDescription = url.searchParams.get('error_description')

    // Send success response to browser
    res.writeHead(200, { 'Content-Type': 'text/html' })
    
    if (error) {
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Error - SpeakMCP</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; text-align: center; }
            .error { color: #dc3545; }
            .container { max-width: 500px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>OAuth Authorization Failed</h1>
            <p class="error">Error: ${error}</p>
            ${errorDescription ? `<p class="error">Description: ${errorDescription}</p>` : ''}
            <p>You can close this window and try again.</p>
          </div>
        </body>
        </html>
      `)
    } else if (code) {
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Success - SpeakMCP</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; text-align: center; }
            .success { color: #28a745; }
            .container { max-width: 500px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authorization Successful!</h1>
            <p class="success">✓ SpeakMCP has been authorized to access the MCP server.</p>
            <p>You can close this window and return to the application.</p>
          </div>
        </body>
        </html>
      `)
    } else {
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OAuth Error - SpeakMCP</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; text-align: center; }
            .error { color: #dc3545; }
            .container { max-width: 500px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>OAuth Authorization Failed</h1>
            <p class="error">No authorization code received.</p>
            <p>You can close this window and try again.</p>
          </div>
        </body>
        </html>
      `)
    }

    // Resolve the promise with the callback result
    const result: OAuthCallbackResult = {
      code: code || undefined,
      state: state || undefined,
      error: error || undefined,
      error_description: errorDescription || undefined,
    }

    // Delay cleanup to allow browser to render response
    setTimeout(() => {
      this.cleanup()
      if (this.resolveCallback) {
        this.resolveCallback(result)
      }
    }, 1000)
  }

  /**
   * Handle root request (health check)
   */
  private handleRootRequest(res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>SpeakMCP OAuth Callback Server</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; text-align: center; }
          .container { max-width: 500px; margin: 0 auto; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>SpeakMCP OAuth Callback Server</h1>
          <p>This server is running to handle OAuth callbacks.</p>
          <p>Waiting for authorization...</p>
        </div>
      </body>
      </html>
    `)
  }

  /**
   * Handle 404 requests
   */
  private handleNotFound(res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }

  /**
   * Get the redirect URI for this server
   */
  getRedirectUri(): string {
    return this.redirectUri
  }

  /**
   * Get the port this server is configured to use
   */
  getPort(): number {
    return this.port
  }

  /**
   * Check if server is currently running
   */
  isRunning(): boolean {
    return this.server !== null && this.server.listening
  }

  /**
   * Stop the server and clean up resources
   */
  stop(): void {
    this.cleanup()
  }

  /**
   * Clean up server resources
   */
  private cleanup(): void {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (this.server) {
      this.server.close()
      this.server = null
    }

    this.resolveCallback = null
    this.rejectCallback = null
  }
}

/**
 * Singleton callback server instance
 */
let callbackServer: OAuthCallbackServer | null = null

/**
 * Get or create the OAuth callback server
 */
export function getOAuthCallbackServer(port?: number): OAuthCallbackServer {
  if (!callbackServer) {
    callbackServer = new OAuthCallbackServer(port)
  }
  return callbackServer
}

/**
 * Handle OAuth callback with automatic server management
 */
export async function handleOAuthCallback(timeoutMs?: number): Promise<OAuthCallbackResult> {
  const server = getOAuthCallbackServer()
  
  try {
    return await server.waitForCallback(timeoutMs)
  } finally {
    server.stop()
    callbackServer = null
  }
}
