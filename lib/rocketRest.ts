import axios from "axios";

// Use local proxy to avoid CORS on REST calls
export const api = axios.create({
  baseURL: "/api/rc",
});

export const login = async (user: string, password: string) => {
  try {
    const res = await api.post("/login", { user, password });
    return res.data.data; // { authToken, userId }
  } catch (err) {
    console.error("Login failed", err);
    throw err;
  }
};

export const getSubscriptions = async (authToken: string, userId: string) => {
  const res = await api.get("/subscriptions.get", {
    headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
  });
  return res.data.update; // List of rooms
};

export const getRoomHistory = async (
  rid: string,
  type: string,
  authToken: string,
  userId: string
) => {
  let endpoint = "/channels.history";
  if (type === "d") endpoint = "/im.history";
  if (type === "p") endpoint = "/groups.history";

  try {
    const res = await api.get(endpoint, {
      params: { roomId: rid, count: 50 },
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    });
    return res.data.messages;
  } catch (err) {
    console.error("History error", err);
    return [];
  }
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

export const getRoomMembers = async (
  rid: string,
  type: string,
  authToken: string,
  userId: string
) => {
  let endpoint = "/channels.members";
  if (type === "p") endpoint = "/groups.members";
  if (type === "d") endpoint = "/im.members";
  try {
    const res = await api.get(endpoint, {
      params: { roomId: rid },
      headers: { "X-Auth-Token": authToken, "X-User-Id": userId },
    });
    const key = type === "p" ? "members" : type === "d" ? "members" : "members";
    return res.data[key] || [];
  } catch {
    return [];
  }
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
