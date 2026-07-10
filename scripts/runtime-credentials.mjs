export function formatDotenvCredential(key, value) {
  if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid credential key: ${key}`);
  const stringValue = String(value);
  if (stringValue.includes("\n")) throw new Error(`Credential ${key} must be a single line`);
  return `${key}=${stringValue}\n`;
}
