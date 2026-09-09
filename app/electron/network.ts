import * as os from "os";
import { NetworkInterfaceInfo } from "./types";

export function listLocalAddresses(): NetworkInterfaceInfo[] {
  const ifaces = os.networkInterfaces();
  const result: NetworkInterfaceInfo[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const addr of addrs || []) {
      result.push({
        name,
        address: addr.address,
        family: addr.family === "IPv6" ? "IPv6" : "IPv4",
        internal: addr.internal,
      });
    }
  }
  // Prefer non-internal IPv4 first, they're what you actually type into FoxyProxy
  result.sort((a, b) => {
    if (a.internal !== b.internal) return a.internal ? 1 : -1;
    if (a.family !== b.family) return a.family === "IPv4" ? -1 : 1;
    return 0;
  });
  return result;
}

export function listCaptureInterfaceNames(): string[] {
  return Object.keys(os.networkInterfaces());
}
