// WebRTC plumbing for voice calls. Media is encrypted peer-to-peer (DTLS-SRTP);
// setup messages travel end-to-end encrypted over the contact's relay queue.
//
// Network traversal servers come from the build environment:
//   VITE_STUN_URLS        comma-separated, default stun:stun.cloudflare.com:3478
//   VITE_TURN_URLS        comma-separated turn:/turns: URLs (optional)
//   VITE_TURN_USERNAME / VITE_TURN_CREDENTIAL
// With TURN configured, calls are forced through it ("relay" policy), so neither
// person learns the other's IP address. Without TURN, calls connect directly when
// the networks allow it and each side can see the other's IP.

const env = import.meta.env;
const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const TURN_URLS = list(env.VITE_TURN_URLS);
export const relayOnly = TURN_URLS.length > 0;

export function createPeerConnection(): RTCPeerConnection {
  const iceServers: RTCIceServer[] = [];
  if (relayOnly) {
    iceServers.push({ urls: TURN_URLS, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL });
  } else {
    iceServers.push({ urls: list(env.VITE_STUN_URLS).length ? list(env.VITE_STUN_URLS) : ["stun:stun.cloudflare.com:3478"] });
  }
  return new RTCPeerConnection({ iceServers, iceTransportPolicy: relayOnly ? "relay" : "all" });
}

/**
 * Wait until ICE gathering finishes, so the SDP carries every candidate and the
 * call needs one offer and one answer, not a stream of relay messages.
 */
export function waitForIceGathering(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => pc.iceGatheringState === "complete" && done();
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}
