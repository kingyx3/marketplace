export function isMissingStateAddress(output) {
  return /no instance found|does not exist in the state|invalid address to set|no state file was found/i.test(String(output));
}

export function isMissingRemoteObject(output) {
  return /cannot import non-existent remote object|remote object does not exist|not found/i.test(String(output));
}
