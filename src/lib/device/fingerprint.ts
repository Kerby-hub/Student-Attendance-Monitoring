/**
 * Browser-only device fingerprinting. Combines stable signals (UA, platform,
 * languages, timezone, screen, hardware) and hashes them with SHA-256.
 */
export type DeviceInfo = {
  fingerprint: string;
  deviceName: string;
  userAgent: string;
  platform: string;
};

function detectDeviceName(ua: string): string {
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || "";
  let os = "Unknown OS";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (platform) os = platform;

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";

  return `${os} · ${browser}`;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (typeof window === "undefined") {
    throw new Error("getDeviceInfo must run in the browser");
  }
  const ua = navigator.userAgent;
  const platform =
    (navigator as any).userAgentData?.platform || navigator.platform || "unknown";
  const langs = (navigator.languages || [navigator.language]).join(",");
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  const screenSig = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth}`;
  const hw = `${navigator.hardwareConcurrency || 0}/${(navigator as any).deviceMemory || 0}`;
  const touch = `${navigator.maxTouchPoints || 0}`;
  const vendor = (navigator as any).vendor || "";

  const raw = [ua, platform, langs, tz, screenSig, hw, touch, vendor].join("|");
  const fingerprint = await sha256Hex(raw);

  return {
    fingerprint,
    deviceName: detectDeviceName(ua),
    userAgent: ua,
    platform,
  };
}
