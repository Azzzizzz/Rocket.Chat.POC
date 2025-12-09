import axios from "axios";

// Use local proxy to avoid CORS on REST calls
export const api = axios.create({
  baseURL: "/api/rc",
});

export const login = async (
  user: string,
  password: string
): Promise<{ authToken: string; userId: string } | null> => {
  const res = await api.post(
    "/login",
    { user, password },
    { validateStatus: () => true }
  );
  if (res.status >= 200 && res.status < 300 && res.data?.data) {
    return res.data.data as { authToken: string; userId: string };
  }
  return null;
};

export const resume = async (
  resumeToken: string
): Promise<{ authToken: string; userId: string } | null> => {
  const res = await api.post(
    "/login",
    { resume: resumeToken },
    { validateStatus: () => true }
  );
  if (res.status >= 200 && res.status < 300 && res.data?.data) {
    return res.data.data as { authToken: string; userId: string };
  }
  return null;
};

export const getSubscriptions = async (authToken: string, userId: string) => {
  const res = await api.get("/subscriptions.get", {
    headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    validateStatus: () => true,
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("unauthorized");
  }
  if (res.data?.success === false) {
    throw new Error("rc_failed");
  }
  return res.data.update || [];
};

export const getRoomHistory = async (
  rid: string,
  type: string,
  authToken: string,
  userId: string,
  options?: { signal?: AbortSignal }
) => {
  let endpoint = "/channels.history";
  if (type === "d") endpoint = "/im.history";
  if (type === "p") endpoint = "/groups.history";
  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await api.get(endpoint, {
        params: { roomId: rid, count: 50 },
        headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
        signal: options?.signal,
      });
      return res.data.messages;
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401 || status === 403) throw err;
      const retryable =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        status === undefined;
      if (!retryable) throw err;
      const backoff = Math.min(
        1000 * Math.pow(2, i) + Math.floor(Math.random() * 250),
        2500
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr as Error;
};

export const createDM = async (
  username: string,
  authToken: string,
  userId: string
) => {
  const res = await api.post(
    "/im.create",
    { username },
    {
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    }
  );
  return res.data.room; // { rid, ... }
};

export const createChannel = async (
  name: string,
  authToken: string,
  userId: string
) => {
  const res = await api.post(
    "/channels.create",
    { name },
    {
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    }
  );
  const ch = res.data.channel;
  return {
    rid: ch?._id,
    t: ch?.t ?? "c",
    name: ch?.name,
    fname: ch?.fname,
  } as { rid: string; t: string; name?: string; fname?: string };
};

export const getPresence = async (
  username: string,
  authToken: string,
  userId: string
) => {
  try {
    const res = await api.get("/users.presence", {
      params: { username },
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    });
    const p = res.data?.presence as string | undefined;
    if (p) return p;
    // Fallback to users.info
    const info = await api.get("/users.info", {
      params: { username },
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    });
    return (info.data?.user?.status as string | undefined) || "offline";
  } catch {
    return "offline";
  }
};

export const postMessage = async (
  rid: string,
  text: string,
  authToken: string,
  userId: string
) => {
  const res = await api.post(
    "/chat.postMessage",
    { roomId: rid, text },
    {
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    }
  );
  return res.data.message;
};

export const syncMessages = async (
  rid: string,
  lastUpdateISO: string,
  authToken: string,
  userId: string
) => {
  const res = await api.get("/chat.syncMessages", {
    params: { roomId: rid, lastUpdate: lastUpdateISO },
    headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
  });
  return res.data; // { messages, updated, deleted, success }
};

export const getUserInfo = async (
  username: string,
  authToken: string,
  userId: string
) => {
  const res = await api.get("/users.info", {
    params: { username },
    headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
  });
  return res.data.user; // { _id, username, name, ... }
};

export const listUsers = async (
  authToken: string,
  userId: string,
  count = 200,
  offset = 0
) => {
  try {
    const res = await api.get("/users.list", {
      params: { count, offset },
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    });
    return res.data.users || [];
  } catch {
    return [];
  }
};

export const getRoomMembers = async (
  rid: string,
  type: string,
  authToken: string,
  userId: string,
  options?: { signal?: AbortSignal }
) => {
  let endpoint = "/channels.members";
  if (type === "p") endpoint = "/groups.members";
  if (type === "d") endpoint = "/im.members";
  let lastErr: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await api.get(endpoint, {
        params: { roomId: rid },
        headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
        signal: options?.signal,
      });
      const key = "members";
      return res.data[key] || [];
    } catch (err: unknown) {
      lastErr = err;
      const status = (err as { response?: { status?: number } })?.response
        ?.status;
      if (status === 401 || status === 403) throw err;
      const retryable =
        status === 429 ||
        (status !== undefined && status >= 500) ||
        status === undefined;
      if (!retryable) throw err;
      const backoff = Math.min(
        1000 * Math.pow(2, i) + Math.floor(Math.random() * 250),
        2500
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr as Error;
};

export const inviteUserToRoom = async (
  rid: string,
  type: string,
  targetUserId: string,
  authToken: string,
  userId: string
) => {
  let endpoint = "/channels.invite";
  if (type === "p") endpoint = "/groups.invite";
  if (type === "d") throw new Error("Cannot invite to direct message");
  const res = await api.post(
    endpoint,
    { roomId: rid, userId: targetUserId },
    { headers: { "X-Auth-Token": authToken, "X-User-Id": userId } }
  );
  return res.data;
};

export const uploadFile = async (
  rid: string,
  file: File,
  authToken: string,
  userId: string,
  description?: string
) => {
  const form = new FormData();
  form.append("file", file);
  if (description) form.append("description", description);
  const res = await api.post(`/rooms.upload/${rid}`, form, {
    headers: {
      "X-Auth-Token": authToken,
      "X-User-Id": userId,
    },
  });
  return res.data;
};

export const logout = async (authToken: string, userId: string) => {
  try {
    const res = await api.post(
      "/logout",
      {},
      { headers: { "X-Auth-Token": authToken, "X-User-Id": userId } }
    );
    return res.data;
  } catch (err) {
    // Best-effort logout; swallow errors to allow client cleanup
    return { success: false } as Record<string, unknown>;
  }
};

export const markAsRead = async (
  rid: string,
  authToken: string,
  userId: string
) => {
  const res = await api.post(
    "/subscriptions.read",
    { rid },
    { headers: { "X-Auth-Token": authToken, "X-User-Id": userId } }
  );
  return res.data;
};
