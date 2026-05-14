import "dotenv/config";
import { google } from "googleapis";
import http from "node:http";
import { URL } from "node:url";
import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";

// One-time YouTube OAuth setup.
// 1. Reads YOUTUBE_CLIENT_ID + YOUTUBE_CLIENT_SECRET from .env
// 2. Spins up a local server on port 3030 to capture the OAuth callback
// 3. Opens the browser to Google's consent page
// 4. Exchanges the returned code for an access_token + refresh_token
// 5. Writes refresh_token back to .env
//
// After this runs successfully once, the cron job can use the refresh_token
// to mint fresh access_tokens forever (until Google revokes it, or the
// app is deleted, or — in Testing mode — possibly every 7 days).

const PORT = 3030;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  // Add "https://www.googleapis.com/auth/youtube" later if we need to manage playlists/etc.
];

const ENV_PATH = join(process.cwd(), ".env");

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("❌ YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET must be in .env first.");
  console.error("   Get them from: https://console.cloud.google.com/apis/credentials");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent", // force refresh_token even on re-auth
});

console.log("\n=== YouTube OAuth Setup ===\n");
console.log(`Local callback server: ${REDIRECT_URI}`);
console.log(`Opening browser to Google consent screen...\n`);

// Open the auth URL in the default browser (macOS `open`)
try {
  execSync(`open '${authUrl}'`);
} catch {
  console.log(`(Couldn't auto-open browser. Open this URL manually:)\n${authUrl}\n`);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    if (url.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/html" });
      res.end(`<h1>❌ OAuth error</h1><pre>${error}</pre>`);
      console.error(`❌ User denied or error: ${error}`);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.writeHead(400).end("missing code");
      return;
    }

    console.log(`✅ Received OAuth code, exchanging for tokens...`);
    const { tokens } = await oauth2Client.getToken(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      throw new Error(
        "No refresh_token returned by Google. This usually means you've already authorized this app — revoke access at https://myaccount.google.com/permissions and retry."
      );
    }

    // Persist refresh_token to .env (add or update line)
    let envContent = "";
    try {
      await access(ENV_PATH);
      envContent = await readFile(ENV_PATH, "utf8");
    } catch {
      // .env doesn't exist — create it
    }

    const tokenLine = `YOUTUBE_REFRESH_TOKEN=${refreshToken}`;
    if (envContent.match(/^YOUTUBE_REFRESH_TOKEN=.*$/m)) {
      envContent = envContent.replace(/^YOUTUBE_REFRESH_TOKEN=.*$/m, tokenLine);
    } else {
      envContent = envContent.replace(/\n*$/, "\n") + tokenLine + "\n";
    }
    await writeFile(ENV_PATH, envContent);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`
      <html><body style="font-family:system-ui;padding:40px;max-width:600px;">
        <h1>✅ YouTube OAuth complete</h1>
        <p>Your refresh token has been saved to <code>.env</code>.</p>
        <p>You can close this tab and return to the terminal.</p>
      </body></html>
    `);

    console.log(`✅ refresh_token saved to .env`);
    console.log(`   The cron job can now upload videos under your account.\n`);
    server.close();
    process.exit(0);
  } catch (e: unknown) {
    console.error("❌", (e as Error).message);
    res.writeHead(500).end((e as Error).message);
    server.close();
    process.exit(1);
  }
});

server.listen(PORT, () => {
  console.log(`Waiting for Google to redirect back...`);
});
