const genId = (() => {
  let i = 0;
  return () => `${Date.now()}-${++i}`;
})();

let ws: WebSocket | null = null;
let isReady = false;
let connectPromise: Promise<void> | null = null;

type ChangeMsg = {
  msg: string;
  collection?: string;
  fields?: {
    eventName?: string;
    args?: unknown[];
  };
};

const roomListeners = new Map<string, (msg: Record<string, unknown>) => void>();
const userListeners = new Map<string, (args: unknown[]) => void>();

function urlToWS(httpUrl: string) {
  const useSsl = httpUrl.startsWith("https://");
  const host = httpUrl.replace(/^http(s)?:\/\//, "");
  return `${useSsl ? "wss" : "ws"}://${host}/websocket`;
}

export async function connect(httpUrl: string) {
  if (ws && isReady && ws.readyState === WebSocket.OPEN) return;
  if (connectPromise) return connectPromise;
  const socketUrl = urlToWS(httpUrl);
  const sock = new WebSocket(socketUrl);
  ws = sock;
  connectPromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => {
      connectPromise = null;
      reject(new Error("WS connect timeout"));
    }, 10000);
    sock.onopen = () => {
      try {
        sock.send(
          JSON.stringify({ msg: "connect", version: "1", support: ["1"] })
        );
      } catch {}
    };
    sock.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (data.msg === "connected") {
          isReady = true;
          clearTimeout(t);
          connectPromise = null;
          resolve();
        } else if (data.msg === "ping") {
          sock.send(JSON.stringify({ msg: "pong" }));
        } else if (
          data.msg === "changed" &&
          data.collection === "stream-room-messages"
        ) {
          const c = data as ChangeMsg;
          const rid = c.fields?.eventName || "";
          const payload = (c.fields?.args?.[0] || {}) as Record<
            string,
            unknown
          >;
          const fn = roomListeners.get(rid);
          if (fn && payload) fn(payload);
        } else if (
          data.msg === "changed" &&
          data.collection === "stream-notify-user"
        ) {
          const c = data as ChangeMsg;
          const event = c.fields?.eventName || "";
          const args = (c.fields?.args || []) as unknown[];
          const fn = userListeners.get(event);
          if (fn) fn(args);
        }
      } catch {}
    };
    sock.onerror = () => {
      clearTimeout(t);
      connectPromise = null;
      reject(new Error("WS error"));
    };
    sock.onclose = () => {
      isReady = false;
      connectPromise = null;
    };
  });
  return connectPromise;
}

export async function loginWithToken(resume: string) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WS not open");
  const id = genId();
  ws.send(
    JSON.stringify({ msg: "method", method: "login", id, params: [{ resume }] })
  );
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Login timeout")), 10000);
    const handler = (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data as string);
        if (data.msg === "result" && data.id === id) {
          clearTimeout(t);
          ws!.removeEventListener("message", handler);
          resolve();
        }
      } catch {}
    };
    ws!.addEventListener("message", handler);
  });
}

export function subscribeRoomMessages(
  rid: string,
  cb: (msg: Record<string, unknown>) => void
) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WS not open");
  const subId = genId();
  roomListeners.set(rid, cb);
  ws.send(
    JSON.stringify({
      msg: "sub",
      id: subId,
      name: "stream-room-messages",
      params: [rid, false],
    })
  );
  return subId;
}

export function unsubscribe(subId: string, ridOrEvent?: string) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ msg: "unsub", id: subId }));
  }
  if (ridOrEvent) {
    roomListeners.delete(ridOrEvent);
    userListeners.delete(ridOrEvent);
  }
}

export function disconnect() {
  try {
    roomListeners.clear();
    userListeners.clear();
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      ws.close();
    }
  } catch {}
  ws = null;
  isReady = false;
  connectPromise = null;
}

export function subscribeUserEvent(
  eventName: string,
  cb: (args: unknown[]) => void
) {
  if (!ws || ws.readyState !== WebSocket.OPEN) throw new Error("WS not open");
  const subId = genId();
  userListeners.set(eventName, cb);
  ws.send(
    JSON.stringify({
      msg: "sub",
      id: subId,
      name: "stream-notify-user",
      params: [eventName, false],
    })
  );
  return subId;
}
