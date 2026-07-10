#!/usr/bin/env node
import { createSign } from "node:crypto";
import { appendFile } from "node:fs/promises";

const credentials = parseCredentials(process.env.GCP_TERRAFORM_CREDENTIALS_JSON || process.env.GOOGLE_CREDENTIALS || "");
const bucket = process.env.TF_VAR_state_bucket_name || process.env.TF_STATE_BUCKET_NAME;
if (!bucket) fail("TF_VAR_state_bucket_name or TF_STATE_BUCKET_NAME is required");

const token = await accessToken(credentials);
const response = await fetch(`https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`, {
  headers: { Authorization: `Bearer ${token}` },
});
let exists;
if (response.ok) exists = true;
else if (response.status === 404) exists = false;
else fail(`GCS bucket lookup failed with HTTP ${response.status}: ${await response.text()}`);

const value = exists ? "true" : "false";
console.log(`Terraform state bucket ${bucket}: ${exists ? "exists" : "absent"}`);
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `TF_STATE_BUCKET_EXISTS=${value}\n`, "utf8");
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `exists=${value}\n`, "utf8");

function parseCredentials(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) throw new Error("client_email/private_key missing");
    return parsed;
  } catch (error) {
    fail(`GCP_TERRAFORM_CREDENTIALS_JSON is invalid: ${error.message}`);
  }
}

async function accessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({
    iss: credentials.client_email,
    scope: "https://www.googleapis.com/auth/devstorage.read_only",
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 300,
  }, credentials.private_key);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(credentials.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) fail(`Google OAuth token exchange failed with HTTP ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  if (!payload.access_token) fail("Google OAuth token exchange returned no access token");
  return payload.access_token;
}

function signJwt(payload, privateKey) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const input = `${header}.${body}`;
  const signer = createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${signer.sign(privateKey).toString("base64url")}`;
}
function base64url(value) { return Buffer.from(value).toString("base64url"); }
function fail(message) { console.error(redact(message)); process.exit(1); }
function redact(value) {
  return String(value).replaceAll(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/g, "[redacted-private-key]");
}
