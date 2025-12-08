import { driver } from "@rocket.chat/sdk";
import { RC_URL } from "./config";

// For browser environment, we might need to handle import differently or use a different package if @rocket.chat/sdk is Node-only.
// However, documentation says it supports browser via webpack. Next.js might complain about 'fs' imports if the SDK is not tree-shaken well.
// We'll see.

export const connect = async () => {
  const host = RC_URL.replace(/^http(s)?:\/\//, "");
  const useSsl = RC_URL.startsWith("https");
  await driver.connect({ host, useSsl });
};

export const loginWithToken = async (authToken: string, _userId: string) => {
  // driver.login with resume token
  return await driver.login({ resume: authToken } as unknown as {
    resume: string;
  });
};

export const subscribeToRoomMessages = async (
  rid: string,
  callback: (msg: { rid?: string } & Record<string, unknown>) => void
) => {
  if (
    !driver ||
    typeof (driver as unknown as { reactToMessages?: unknown })
      .reactToMessages !== "function"
  ) {
    return;
  }
  await driver.reactToMessages((err, msg) => {
    if (!err && msg && typeof msg === "object" && msg !== null) {
      const hasRid = "rid" in msg && (msg as { rid?: string }).rid === rid;
      if (hasRid) {
        callback(msg as { rid?: string } & Record<string, unknown>);
      }
    }
  });
};

export const sendMessage = async (rid: string, text: string) => {
  return await driver.sendToRoom(text, rid);
};
