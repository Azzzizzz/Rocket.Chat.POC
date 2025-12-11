import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import * as rest from "../lib/rocketRest";
import * as ddp from "../lib/rocketDDP";
import { RC_URL } from "../lib/config";
import styles from "../styles/ChatLayout.module.css";

interface ChatLayoutProps {
  meUsername: string;
  authToken: string;
  userId: string;
  isTeacher?: boolean;
}

type Room = {
  rid: string;
  t: string;
  name?: string;
  fname?: string;
  ls?: string | number | Date; // last seen timestamp
  unread?: number; // unread count if provided
  unreadAlert?: boolean;
};
type Message = {
  _id?: string;
  u?: { username?: string };
  msg: string;
  rid?: string;
  ts?: string | Date;
  t?: string;
  attachments?: Array<{
    image_url?: string;
    title_link?: string;
    title?: string;
  }>;
  file?: { _id: string; name?: string; type?: string; url?: string };
  __optimistic?: boolean;
};

export default function ChatLayout({
  meUsername,
  authToken,
  userId,
  isTeacher,
}: ChatLayoutProps) {
  const router = useRouter();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [unreadMap, setUnreadMap] = useState<Record<string, boolean>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<
    Array<{ _id: string; username?: string; name?: string }>
  >([]);
  const [selectedUserInfo, setSelectedUserInfo] = useState<{
    username?: string;
    name?: string;
    lastLogin?: string;
    roles?: string[];
  } | null>(null);
  const [channelsOpen, setChannelsOpen] = useState(true);
  const [dmsOpen, setDmsOpen] = useState(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // removed polling lastUpdate in favor of DDP realtime
  const subRef = useRef<{ id: string; rid: string } | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [dmHeaderInfo, setDmHeaderInfo] = useState<{
    username?: string;
    lastLogin?: string;
  } | null>(null);

  const [addMembersOpen, setAddMembersOpen] = useState(false);
  const [availableStudents, setAvailableStudents] = useState<
    Array<{ _id: string; username: string; name?: string; roles?: string[] }>
  >([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [dmSearch, setDmSearch] = useState("");
  const [dmSelectedUser, setDmSelectedUser] = useState<string | null>(null);
  const globalRoomSubsRef = useRef<Map<string, string>>(new Map());
  const getRoomIdKey = (r: Room & { _id?: string; id?: string }): string =>
    r.rid || r._id || r.id || "";
  const messagesCacheRef = useRef<
    Map<string, { data: Message[]; lastUpdateISO: string }>
  >(new Map());
  const presenceInFlightRef = useRef<boolean>(false);
  const pollPauseUntilRef = useRef<number>(0);
  const cloudDisabled = process.env.NEXT_PUBLIC_RC_CLOUD_DISABLED === "true";
  const unreadRecalcTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingUnreadRef = useRef<Set<string>>(new Set());
  const scheduleUnreadRecalc = () => {
    if (unreadRecalcTimerRef.current) return;
    unreadRecalcTimerRef.current = setTimeout(async () => {
      try {
        const data = await rest.getSubscriptions(authToken, userId);
        setRooms(data);
        const marks: Record<string, boolean> = {};
        const counts: Record<string, number> = {};
        const list = data as Array<Room & { _id?: string; id?: string }>;
        list.forEach((r) => {
          const rid = getRoomIdKey(r);
          const flag =
            !!r.unreadAlert || (typeof r.unread === "number" && r.unread > 0);
          if (rid) {
            marks[rid] = flag;
            counts[rid] =
              typeof r.unread === "number" ? r.unread : flag ? 1 : 0;
          }
        });
        setUnreadMap((prev) => {
          const next = { ...prev };
          const keys = new Set<string>([
            ...Object.keys(prev),
            ...Object.keys(marks),
          ]);
          keys.forEach((rid) => {
            next[rid] = !!prev[rid] || !!marks[rid];
          });
          return next;
        });
        setUnreadCounts((prev) => {
          const next = { ...prev };
          const keys = new Set<string>([
            ...Object.keys(prev),
            ...Object.keys(counts),
          ]);
          keys.forEach((rid) => {
            const server = counts[rid] || 0;
            const local = prev[rid] || 0;
            next[rid] = Math.max(local, server);
          });
          return next;
        });
      } catch {
      } finally {
        if (unreadRecalcTimerRef.current) {
          clearTimeout(unreadRecalcTimerRef.current);
          unreadRecalcTimerRef.current = null;
        }
        pendingUnreadRef.current.clear();
      }
    }, 250);
  };
  useEffect(() => {
    // Load initial rooms
    rest
      .getSubscriptions(authToken, userId)
      .then((data) => {
        setRooms(data);
        const marks: Record<string, boolean> = {};
        const counts: Record<string, number> = {};
        const list = data as Array<Room & { _id?: string; id?: string }>;
        list.forEach((r) => {
          const rid = getRoomIdKey(r);
          const flag =
            !!r.unreadAlert || (typeof r.unread === "number" && r.unread > 0);
          if (rid) marks[rid] = flag;
          counts[rid] = typeof r.unread === "number" ? r.unread : flag ? 1 : 0;
        });
        setUnreadMap(marks);
        setUnreadCounts(counts);
      })
      .catch((err) => {
        if (err instanceof Error && err.message === "unauthorized") {
          router.push("/login");
        }
      });

    const fetchPresence = () => {
      if (presenceInFlightRef.current) return;
      presenceInFlightRef.current = true;
      const usernames = new Set<string>();
      usernames.add(meUsername);
      members.forEach((m) => m.username && usernames.add(m.username));
      Promise.all(
        Array.from(usernames).map((u) =>
          rest.getPresence(u, authToken, userId).then((status) => {
            setPresence((prev) => ({ ...prev, [u]: status }));
          })
        )
      ).finally(() => {
        presenceInFlightRef.current = false;
      });
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 10000);

    return () => clearInterval(interval);
  }, [authToken, userId, members, meUsername, router]);

  useEffect(() => {
    let stopped = false;
    const run = () => {
      rest
        .getSubscriptions(authToken, userId)
        .then((data) => {
          setRooms(data);
          setUnreadMap((prev) => {
            const next = { ...prev };
            const list = data as Array<Room & { _id?: string; id?: string }>;
            list.forEach((r) => {
              const rid = getRoomIdKey(r);
              const flag =
                !!r.unreadAlert ||
                (typeof r.unread === "number" && r.unread > 0);
              if (rid) next[rid] = !!prev[rid] || flag;
            });
            return next;
          });
          setUnreadCounts((prev) => {
            const next = { ...prev };
            const list = data as Array<Room & { _id?: string; id?: string }>;
            list.forEach((r) => {
              const rid = getRoomIdKey(r);
              const flag =
                !!r.unreadAlert ||
                (typeof r.unread === "number" && r.unread > 0);
              const server =
                typeof r.unread === "number" ? r.unread : flag ? 1 : 0;
              next[rid] = Math.max(prev[rid] || 0, server);
            });
            return next;
          });
        })
        .catch(() => {})
        .finally(() => {
          const base = 3000;
          const jitter = 100 + Math.floor(Math.random() * 300);
          let delay = base + jitter;
          const now = Date.now();
          if (pollPauseUntilRef.current && pollPauseUntilRef.current > now) {
            delay = pollPauseUntilRef.current - now + Math.floor(base / 2);
          }
          if (!stopped) {
            pollRef.current = setTimeout(run, delay);
          }
        });
    };
    run();
    return () => {
      stopped = true;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [authToken, userId]);

  useEffect(() => {
    const subs = globalRoomSubsRef.current;
    const want = new Set<string>(
      rooms.map((r) => r.rid).filter(Boolean) as string[]
    );
    if (selectedRoom?.rid) want.delete(selectedRoom.rid);
    for (const rid of want) {
      if (!subs.has(rid)) {
        try {
          const id = ddp.subscribeRoomMessages(rid, (msg) => {
            const m = msg as unknown as Message;
            if (selectedRoom?.rid !== rid) {
              setUnreadMap((prev) => ({ ...prev, [rid]: true }));
              if (!pendingUnreadRef.current.has(rid)) {
                pendingUnreadRef.current.add(rid);
                setUnreadCounts((prev) => ({
                  ...prev,
                  [rid]: (prev[rid] || 0) + 1,
                }));
              }
              scheduleUnreadRecalc();
            }
          });
          subs.set(rid, id);
        } catch {}
      }
    }
    for (const [rid, id] of Array.from(subs.entries())) {
      if (!want.has(rid)) {
        ddp.unsubscribe(id, rid);
        subs.delete(rid);
      }
    }
    return () => {
      for (const [rid, id] of Array.from(subs.entries())) {
        ddp.unsubscribe(id, rid);
        subs.delete(rid);
      }
      if (unreadRecalcTimerRef.current) {
        clearTimeout(unreadRecalcTimerRef.current);
        unreadRecalcTimerRef.current = null;
      }
    };
  }, [rooms, selectedRoom]);

  useEffect(() => {
    // Realtime unread updates via DDP user notifications
    let subA: string | null = null;
    let subB: string | null = null;
    (async () => {
      try {
        subA = ddp.subscribeUserEvent(
          `${userId}/subscriptions-changed`,
          (args) => {
            const [event, sub] = (args || []) as [
              string,
              Record<string, unknown>
            ];
            const rid = (sub?.rid as string) || (sub?._id as string) || "";
            const unreadVal = sub?.unread as number | undefined;
            const alert = !!sub?.alert;
            if (rid) {
              const count =
                typeof unreadVal === "number" ? unreadVal : alert ? 1 : 0;
              setUnreadCounts((prev) => ({ ...prev, [rid]: count }));
              setUnreadMap((prev) => ({ ...prev, [rid]: count > 0 }));
            }
            const evt = (event || "") as string;
            if (evt === "inserted" && rid) {
              const newRoom: Room = {
                rid,
                t:
                  (sub?.t as string) ||
                  ((sub as Record<string, unknown>)?.["type"] as string) ||
                  "c",
                name: (sub?.["name"] as string) || (sub?.["fname"] as string),
                fname: (sub?.["fname"] as string) || undefined,
              };
              setRooms((prev) => {
                if (prev.some((r) => r.rid === rid)) return prev;
                return [newRoom, ...prev];
              });
              if (selectedRoom?.rid !== rid) {
                const subs = globalRoomSubsRef.current;
                if (!subs.has(rid)) {
                  try {
                    const id = ddp.subscribeRoomMessages(rid, (msg) => {
                      const m = msg as unknown as Message;
                      if (selectedRoom?.rid !== rid) {
                        setUnreadMap((prev) => ({ ...prev, [rid]: true }));
                        if (!pendingUnreadRef.current.has(rid)) {
                          pendingUnreadRef.current.add(rid);
                          setUnreadCounts((prev) => ({
                            ...prev,
                            [rid]: (prev[rid] || 0) + 1,
                          }));
                        }
                        scheduleUnreadRecalc();
                      }
                    });
                    subs.set(rid, id);
                  } catch {}
                }
              }
            }
            if (evt === "removed" && rid) {
              setRooms((prev) => prev.filter((r) => r.rid !== rid));
            }
            if (evt === "inserted" || evt === "removed" || evt === "updated") {
              scheduleUnreadRecalc();
            }
          }
        );
        subB = ddp.subscribeUserEvent(`${userId}/rooms-changed`, (args) => {
          const [event, room] = (args || []) as [
            string,
            Record<string, unknown>
          ];
          const rid = (room?._id as string) || (room?.rid as string) || "";
          const unreadVal = room?.unread as number | undefined;
          const alert = !!room?.alert;
          if (rid) {
            const count =
              typeof unreadVal === "number" ? unreadVal : alert ? 1 : 0;
            setUnreadCounts((prev) => ({ ...prev, [rid]: count }));
            setUnreadMap((prev) => ({ ...prev, [rid]: count > 0 }));
          }
          const evt = (event || "") as string;
          if (evt === "inserted" && rid) {
            const newRoom: Room = {
              rid,
              t: (room?.["t"] as string) || "c",
              name: (room?.["name"] as string) || (room?.["fname"] as string),
              fname: (room?.["fname"] as string) || undefined,
            };
            setRooms((prev) => {
              if (prev.some((r) => r.rid === rid)) return prev;
              return [newRoom, ...prev];
            });
            if (selectedRoom?.rid !== rid) {
              const subs = globalRoomSubsRef.current;
              if (!subs.has(rid)) {
                try {
                  const id = ddp.subscribeRoomMessages(rid, (msg) => {
                    const m = msg as unknown as Message;
                    if (selectedRoom?.rid !== rid) {
                      setUnreadMap((prev) => ({ ...prev, [rid]: true }));
                      if (!pendingUnreadRef.current.has(rid)) {
                        pendingUnreadRef.current.add(rid);
                        setUnreadCounts((prev) => ({
                          ...prev,
                          [rid]: (prev[rid] || 0) + 1,
                        }));
                      }
                      scheduleUnreadRecalc();
                    }
                  });
                  subs.set(rid, id);
                } catch {}
              }
            }
          }
          if (evt === "removed" && rid) {
            setRooms((prev) => prev.filter((r) => r.rid !== rid));
          }
          if (evt === "inserted" || evt === "removed" || evt === "updated") {
            scheduleUnreadRecalc();
          }
        });
      } catch {}
    })();
    return () => {
      if (subA) ddp.unsubscribe(subA, `${userId}/subscriptions-changed`);
      if (subB) ddp.unsubscribe(subB, `${userId}/rooms-changed`);
    };
  }, [userId]);

  useEffect(() => {
    if (!selectedRoom) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (subRef.current) {
        ddp.unsubscribe(subRef.current.id, subRef.current.rid);
        subRef.current = null;
      }
      return;
    }

    const historyCtrl = new AbortController();
    const membersCtrl = new AbortController();
    const cache = messagesCacheRef.current.get(selectedRoom.rid);
    if (cache && Array.isArray(cache.data)) {
      setMessages(cache.data);
      rest
        .syncMessages(selectedRoom.rid, cache.lastUpdateISO, authToken, userId)
        .then((res) => {
          const base = cache.data.slice();
          const obj = res as Record<string, unknown>;
          const msgs = (obj["messages"] as Message[]) || [];
          const updated = (obj["updated"] as Message[]) || [];
          const add = ([] as Message[]).concat(msgs).concat(updated);
          const map = new Map<string, Message>();
          base.forEach((m) => {
            if (m._id) map.set(m._id, m);
          });
          add.forEach((m) => {
            if (m && m._id) map.set(m._id, m);
          });
          const merged = Array.from(map.values());
          setMessages(merged);
          messagesCacheRef.current.set(selectedRoom.rid, {
            data: merged,
            lastUpdateISO: new Date().toISOString(),
          });
        })
        .catch(() => {});
    } else {
      rest
        .getRoomHistory(selectedRoom.rid, selectedRoom.t, authToken, userId, {
          signal: historyCtrl.signal,
        })
        .then((msgs) => {
          if (Array.isArray(msgs)) {
            const arr = (msgs as Message[]).reverse();
            setMessages(arr);
            messagesCacheRef.current.set(selectedRoom.rid, {
              data: arr,
              lastUpdateISO: new Date().toISOString(),
            });
          }
        })
        .catch(() => {});
    }

    rest
      .getRoomMembers(selectedRoom.rid, selectedRoom.t, authToken, userId, {
        signal: membersCtrl.signal,
      })
      .then((list) => {
        setMembers(list);
      })
      .catch(() => {});

    if (selectedRoom.t === "d") {
      const otherUser = selectedRoom.name || selectedRoom.fname || undefined;
      if (otherUser) {
        rest
          .getUserInfo(otherUser, authToken, userId)
          .then((info) => {
            setDmHeaderInfo({
              username: info?.username,
              lastLogin: info?.lastLogin,
            });
          })
          .catch(() => setDmHeaderInfo(null));
      }
    } else {
      setTimeout(() => setDmHeaderInfo(null), 0);
    }

    (async () => {
      try {
        const id = ddp.subscribeRoomMessages(selectedRoom.rid, (msg) => {
          const m = msg as unknown as Message;
          setMessages((prev) => {
            if (m._id && prev.some((p) => p._id === m._id)) return prev;
            if (m.u?.username === meUsername) {
              const i = prev.findIndex(
                (p) =>
                  p.__optimistic &&
                  p.msg === m.msg &&
                  p.rid === selectedRoom.rid
              );
              if (i !== -1) {
                const next = prev.slice();
                next.splice(i, 1);
                next.push(m);
                messagesCacheRef.current.set(selectedRoom.rid, {
                  data: next,
                  lastUpdateISO: new Date().toISOString(),
                });
                return next;
              }
            }
            const next = [...prev, m];
            messagesCacheRef.current.set(selectedRoom.rid, {
              data: next,
              lastUpdateISO: new Date().toISOString(),
            });
            return next;
          });
        });
        subRef.current = { id, rid: selectedRoom.rid };
      } catch {}
    })();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (subRef.current) {
        ddp.unsubscribe(subRef.current.id, subRef.current.rid);
        subRef.current = null;
      }
      try {
        historyCtrl.abort();
      } catch {}
      try {
        membersCtrl.abort();
      } catch {}
    };
  }, [selectedRoom, authToken, userId]);

  const buildMediaUrl = (m: Message) => {
    const rawUrl =
      m.attachments?.[0]?.image_url ||
      m.attachments?.[0]?.title_link ||
      m.file?.url;
    const authQuery = `?rc_token=${encodeURIComponent(
      authToken
    )}&rc_uid=${encodeURIComponent(userId)}`;
    if (rawUrl) {
      if (rawUrl.startsWith("http")) return rawUrl;
      const full = `${RC_URL}${rawUrl}`;
      return full.includes("?")
        ? `${full}&${authQuery.slice(1)}`
        : `${full}${authQuery}`;
    }
    if (m.file?._id) {
      const name = encodeURIComponent(m.file?.name || "file");
      const full = `${RC_URL}/file-upload/${m.file._id}/${name}`;
      return `${full}${authQuery}`;
    }
    return undefined;
  };

  const formatTime = (ts?: unknown) => {
    if (!ts) return "";
    let d: Date | null = null;
    if (typeof ts === "string") d = new Date(ts);
    else if (typeof ts === "number") d = new Date(ts);
    else if (ts instanceof Date) d = ts;
    else if (typeof ts === "object" && ts) {
      const o = ts as Record<string, unknown>;
      const val = (o.$date as unknown) || (o.date as unknown);
      if (typeof val === "string" || typeof val === "number") {
        d = new Date(val as number);
      }
    }
    return d && !isNaN(d.getTime()) ? d.toLocaleTimeString() : "";
  };

  const getOtherUsername = () => {
    if (!selectedRoom || selectedRoom.t !== "d") return undefined;
    return (
      selectedRoom.name ||
      selectedRoom.fname ||
      members.find((m) => m.username && m.username !== meUsername)?.username ||
      messages.find((m) => m.u?.username && m.u.username !== meUsername)?.u
        ?.username ||
      undefined
    );
  };

  const isOnline = (s?: string) => !!s && s.toLowerCase() !== "offline";

  const toggleProfile = async () => {
    try {
      const info = await rest.getUserInfo(meUsername, authToken, userId);
      setSelectedUserInfo({
        username: info?.username,
        name: info?.name,
        lastLogin: info?.lastLogin,
        roles: info?.roles,
      });
      setShowProfile((v) => !v);
    } catch {
      setShowProfile((v) => !v);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom) return;
    const optimistic: Message = {
      _id: `optimistic:${Math.random().toString(36).slice(2)}`,
      u: { username: meUsername },
      msg: inputText,
      rid: selectedRoom.rid,
      __optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    await rest.postMessage(selectedRoom.rid, inputText, authToken, userId);
    setInputText("");
  };

  const handleLogout = async () => {
    try {
      await rest.logout(authToken, userId);
    } catch {}
    try {
      ddp.disconnect();
    } catch {}
    router.push("/login");
  };

  useEffect(() => {
    if (!selectedRoom || !messagesRef.current) return;
    const container = messagesRef.current;
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messages, selectedRoom]);

  const handleStartDM = async () => {
    if (isTeacher) {
      try {
        const users = await rest.listUsers(authToken, userId, 500, 0);
        const usersList =
          (users as Array<{
            _id: string;
            username: string;
            name?: string;
            roles?: string[];
          }>) || [];
        const students = usersList.filter((u) => {
          const roles = Array.isArray(u.roles) ? u.roles : [];
          const isOwner = roles.includes("owner");
          return !isOwner && u.username !== meUsername;
        });
        setAvailableStudents(students);
        setDmSelectedUser(null);
        setDmSearch("");
        setDmPickerOpen(true);
      } catch {
        alert("Failed to load students");
      }
      return;
    }
    const target = prompt("Enter teacher username to DM");
    try {
      if (!target) return;
      const info = await rest.getUserInfo(target, authToken, userId);
      const can = Array.isArray(info?.roles) && info.roles.includes("owner");
      if (!can) {
        alert("Students can DM teachers only");
        return;
      }
      const room = await rest.createDM(target, authToken, userId);
      setRooms((prev) => {
        if (prev.find((r) => r.rid === room.rid)) return prev;
        return [...prev, room];
      });
      setSelectedRoom(room);
    } catch {
      alert("Error creating DM");
    }
  };

  const handleConfirmDM = async () => {
    if (!dmSelectedUser) return;
    try {
      const room = await rest.createDM(dmSelectedUser, authToken, userId);
      setRooms((prev) => {
        if (prev.find((r) => r.rid === room.rid)) return prev;
        return [...prev, room];
      });
      setSelectedRoom(room);
      setDmPickerOpen(false);
    } catch {
      alert("Error creating DM");
    }
  };

  const handleCreateChannel = async () => {
    const name = prompt("Channel Name?");
    if (!name) return;
    try {
      const channel = await rest.createChannel(name, authToken, userId);
      setRooms((prev) => [...prev, channel]);
      setSelectedRoom(channel);
    } catch (_) {
      alert("Error creating channel");
    }
  };

  const handleAddMember = async () => {
    if (!selectedRoom || selectedRoom.t === "d") return;
    try {
      const users = await rest.listUsers(authToken, userId, 500, 0);
      const currentIds = new Set(members.map((m) => m._id).filter(Boolean));
      const usersList =
        (users as Array<{
          _id: string;
          username: string;
          name?: string;
          roles?: string[];
        }>) || [];
      const students = usersList.filter((u) => {
        const roles = Array.isArray(u.roles) ? u.roles : [];
        const isOwner = roles.includes("owner");
        return !isOwner && !currentIds.has(u._id);
      });
      setAvailableStudents(students);
      setSelectedStudentIds([]);
      setStudentSearch("");
      setAddMembersOpen(true);
    } catch (e) {
      alert("Failed to load users");
    }
  };

  const toggleStudentSelection = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleInviteSelected = async () => {
    if (!selectedRoom) return;
    try {
      for (const id of selectedStudentIds) {
        await rest.inviteUserToRoom(
          selectedRoom.rid,
          selectedRoom.t,
          id,
          authToken,
          userId
        );
      }
      const list = await rest.getRoomMembers(
        selectedRoom.rid,
        selectedRoom.t,
        authToken,
        userId
      );
      setMembers(list);
      setAddMembersOpen(false);
    } catch {
      alert("Failed to add selected members");
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedRoom) return;
    try {
      await rest.uploadFile(selectedRoom.rid, file, authToken, userId);
      e.target.value = "";
    } catch {
      alert("File upload failed");
    }
  };

  const openUserInfo = async (username?: string) => {
    if (!username) return;
    try {
      const info = await rest.getUserInfo(username, authToken, userId);
      setSelectedUserInfo({
        username: info?.username,
        name: info?.name,
        lastLogin: info?.lastLogin,
        roles: info?.roles,
      });
    } catch {
      setSelectedUserInfo(null);
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        {cloudDisabled && (
          <div
            style={{
              background: "#ffe8cc",
              color: "#5f3c00",
              padding: 8,
              borderRadius: 6,
              margin: "0 8px 8px",
              fontSize: 12,
            }}
          >
            Cloud connectivity disabled. Marketplace and push are unavailable.
          </div>
        )}
        <div className={styles.sidebarHeader}>
          <div className={styles.roleLabel}>
            {isTeacher ? "Teacher" : "Student"} View
          </div>
          <div className={styles.actionButtons}>
            <button onClick={handleStartDM} className={styles.primaryBtn}>
              New DM
            </button>
            {isTeacher && (
              <button
                onClick={handleCreateChannel}
                className={styles.secondaryBtn}
              >
                + New Channel
              </button>
            )}
            <button onClick={handleLogout} className={styles.secondaryBtn}>
              Log Out
            </button>
          </div>
        </div>

        <div className={styles.roomList}>
          <div className={styles.roomListTitle}>Channels & MKs</div>
          {/* Collapsible sections */}
          <div
            className={styles.sectionHeader}
            onClick={() => setChannelsOpen((v) => !v)}
          >
            <span>{channelsOpen ? "▾" : "▸"}</span>
            <span style={{ marginLeft: 6 }}>Channels</span>
          </div>
          {channelsOpen &&
            rooms
              .filter((r) => r.t !== "d")
              .map((r) => {
                const displayName = r.name || r.fname || "Unnamed";
                const isSelected = selectedRoom?.rid === r.rid;
                const isDM = r.t === "d";
                const otherUser = isDM ? r.name : null;
                const status = otherUser ? presence[otherUser] : null; // 'online' | 'offline' | ...
                const ridKey = getRoomIdKey(r);

                return (
                  <div
                    key={r.rid}
                    onClick={() => {
                      const rid = getRoomIdKey(r);
                      pollPauseUntilRef.current = Date.now() + 1200;
                      setSelectedRoom(r);
                      setUnreadMap((m) => ({ ...m, [rid]: false }));
                      setUnreadCounts((c) => ({ ...c, [rid]: 0 }));
                      rest.markAsRead(rid, authToken, userId).catch(() => {});
                    }}
                    className={`${styles.roomItem} ${
                      isSelected ? styles.selected : ""
                    }`}
                  >
                    <div className={styles.roomIcon}>
                      {isDM ? (
                        <div className={styles.avatarSmall}>
                          {displayName.slice(0, 1).toUpperCase()}
                        </div>
                      ) : (
                        "#"
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.roomName}>{displayName}</div>
                    </div>
                    {status && (
                      <div
                        className={`${styles.statusIndicator} ${
                          status === "online" ? styles.statusOnline : ""
                        }`}
                      />
                    )}
                    {!!unreadCounts[ridKey] && (
                      <span className={styles.unreadBadge}>
                        {unreadCounts[ridKey]}
                      </span>
                    )}
                  </div>
                );
              })}
          <div
            className={styles.sectionHeader}
            onClick={() => setDmsOpen((v) => !v)}
          >
            <span>{dmsOpen ? "▾" : "▸"}</span>
            <span style={{ marginLeft: 6 }}>Direct Messages</span>
          </div>
          {dmsOpen &&
            rooms
              .filter((r) => r.t === "d")
              .map((r) => {
                const displayName = r.name || r.fname || "Unnamed";
                const isSelected = selectedRoom?.rid === r.rid;
                const otherUser = displayName;
                const status = otherUser ? presence[otherUser] : null;
                const ridKey = getRoomIdKey(r);
                return (
                  <div
                    key={r.rid}
                    onClick={() => {
                      const rid = getRoomIdKey(r);
                      pollPauseUntilRef.current = Date.now() + 1200;
                      setSelectedRoom(r);
                      setUnreadMap((m) => ({ ...m, [rid]: false }));
                      setUnreadCounts((c) => ({ ...c, [rid]: 0 }));
                      rest.markAsRead(rid, authToken, userId).catch(() => {});
                    }}
                    className={`${styles.roomItem} ${
                      isSelected ? styles.selected : ""
                    }`}
                  >
                    <div className={styles.avatarSmall}>
                      {displayName.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={styles.roomName}>{displayName}</div>
                    </div>
                    {status && (
                      <div
                        className={`${styles.statusIndicator} ${
                          status === "online" ? styles.statusOnline : ""
                        }`}
                      />
                    )}
                    {!!unreadCounts[ridKey] && (
                      <span className={styles.unreadBadge}>
                        {unreadCounts[ridKey]}
                      </span>
                    )}
                  </div>
                );
              })}
          {!rooms.length && (
            <div style={{ padding: "8px", fontSize: "13px", color: "#6b7075" }}>
              No conversations yet
            </div>
          )}
        </div>
        <div className={styles.sidebarUser} onClick={toggleProfile}>
          <img
            src={`${RC_URL}/avatar/${meUsername}`}
            alt="avatar"
            className={styles.sidebarAvatar}
          />
          <div className={styles.sidebarUserInfo}>
            <div className={styles.sidebarUserName}>{meUsername}</div>
            <div className={styles.sidebarUserPresence}>
              {presence[meUsername] || "offline"}
            </div>
          </div>
        </div>
        {showProfile && selectedUserInfo && (
          <div className={styles.sidebarUserCard}>
            <div className={styles.userCardTitle}>Your Profile</div>
            <div className={styles.userCardRow}>
              <strong>Name:</strong> {selectedUserInfo.name || "-"}
            </div>
            <div className={styles.userCardRow}>
              <strong>Username:</strong> {selectedUserInfo.username}
            </div>
            <div className={styles.userCardRow}>
              <strong>Last seen:</strong>{" "}
              {selectedUserInfo.lastLogin
                ? new Date(selectedUserInfo.lastLogin).toLocaleString()
                : "-"}
            </div>
            <img
              src={`${RC_URL}/avatar/${
                selectedUserInfo.username || meUsername
              }`}
              alt="avatar"
              style={{ width: 48, height: 48, borderRadius: 8, marginTop: 8 }}
            />
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className={styles.chatArea}>
        <div className={styles.mainHeader}>
          <div className={styles.headerIcon}>#</div>
          <div className={styles.headerTitle}>
            {selectedRoom
              ? selectedRoom.name || selectedRoom.fname
              : "Select a channel"}
            {selectedRoom?.t === "d" &&
              (() => {
                const other = getOtherUsername() || "";
                const on = isOnline(presence[other]);
                return (
                  <span
                    className={`${styles.headerStatusDot} ${
                      on ? styles.statusOnline : ""
                    }`}
                    title={presence[other] || "offline"}
                  />
                );
              })()}
            {selectedRoom?.t === "d" && dmHeaderInfo?.lastLogin && (
              <span className={styles.headerLastSeen}>
                Last seen: {new Date(dmHeaderInfo.lastLogin).toLocaleString()}
              </span>
            )}
          </div>
          {isTeacher && selectedRoom && selectedRoom.t !== "d" && (
            <div className={styles.headerActions}>
              <button className={styles.actionBtn} onClick={handleAddMember}>
                Add People
              </button>
            </div>
          )}
        </div>

        {selectedRoom ? (
          <>
            <div className={styles.messageList} ref={messagesRef}>
              {messages
                .filter((mx) => !mx.t)
                .map((m, i) => {
                  const mine = m.u?.username === meUsername;
                  const label = (m.u?.username || "").toUpperCase();
                  const initials = label.slice(0, 2);
                  const mediaUrl = buildMediaUrl(m);
                  return (
                    <div
                      key={m._id || i}
                      className={`${styles.message} ${
                        mine ? styles.mine : styles.theirs
                      }`}
                    >
                      {!mine && (
                        <div
                          className={`${styles.avatar} ${styles.avatarLeft}`}
                        >
                          {initials}
                        </div>
                      )}
                      <div className={styles.messageContainer}>
                        <div className={styles.messageMeta}>
                          <span
                            onClick={() => openUserInfo(m.u?.username)}
                            style={{ cursor: "pointer" }}
                          >
                            {m.u?.username}
                          </span>
                          <span className={styles.timestamp}>
                            {formatTime(m.ts)}
                          </span>
                        </div>
                        {mediaUrl ? (
                          <div className={styles.messageContent}>
                            {mediaUrl.match(
                              /\.(png|jpg|jpeg|gif|webp)(\?|$)/i
                            ) || m.attachments?.[0]?.image_url ? (
                              <img
                                src={mediaUrl}
                                alt={
                                  m.attachments?.[0]?.title ||
                                  m.file?.name ||
                                  "attachment"
                                }
                                className={styles.messageImage}
                              />
                            ) : (
                              <a
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className={styles.messageLink}
                              >
                                {m.attachments?.[0]?.title ||
                                  m.file?.name ||
                                  mediaUrl}
                              </a>
                            )}
                            <div style={{ marginTop: 6 }}>
                              <a
                                href={mediaUrl}
                                download
                                className={styles.downloadLink}
                              >
                                Download
                              </a>
                            </div>
                            {m.msg && (
                              <div className={styles.messageText}>{m.msg}</div>
                            )}
                          </div>
                        ) : (
                          <div className={styles.messageContent}>{m.msg}</div>
                        )}
                      </div>
                      {mine && (
                        <div
                          className={`${styles.avatar} ${styles.avatarRight}`}
                        >
                          {initials}
                        </div>
                      )}
                    </div>
                  );
                })}
              {!messages.length && (
                <div className={styles.emptyState}>
                  No messages yet. Say hello!
                </div>
              )}
            </div>

            <div className={styles.inputArea}>
              <div className={styles.inputWrapper}>
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: "#b5bac1",
                    fontSize: "20px",
                    marginRight: "10px",
                    cursor: "pointer",
                  }}
                  onClick={handleUploadClick}
                >
                  +
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <input
                  className={styles.input}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder={`Message #${
                    selectedRoom.name || selectedRoom.fname
                  }`}
                />
                <button className={styles.sendButton} onClick={handleSend}>
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className={styles.emptyState}>
            {/* Illustration could go here */}
            <h3>Welcome to TikMe Chat</h3>
            <p>Select a channel or user to start chatting.</p>
          </div>
        )}
      </div>
      <div className={styles.rightPanel}>
        <div className={styles.rightHeader}>Participants</div>
        <div className={styles.participantList}>
          {members.map((m) => {
            const label = (m.name || m.username || "").toUpperCase();
            const initials = label.slice(0, 2);
            const status = m.username ? presence[m.username] : undefined;
            return (
              <div
                key={m._id}
                className={styles.participantItem}
                onClick={() => openUserInfo(m.username)}
              >
                <div className={styles.avatar}>{initials}</div>
                <div className={styles.participantInfo}>
                  <div className={styles.participantName}>
                    {m.name || m.username}
                  </div>
                  {status && (
                    <div
                      className={`${styles.statusIndicator} ${
                        status === "online" ? styles.statusOnline : ""
                      }`}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {!members.length && (
            <div style={{ padding: "8px", fontSize: "13px", color: "#6b7075" }}>
              No participants
            </div>
          )}
        </div>
        {selectedUserInfo && (
          <div className={styles.userCard}>
            <div className={styles.userCardTitle}>User Info</div>
            <div className={styles.userCardRow}>
              <strong>Name:</strong>{" "}
              {selectedUserInfo.name || selectedUserInfo.username}
            </div>
            {selectedUserInfo.lastLogin && (
              <div className={styles.userCardRow}>
                <strong>Last seen:</strong>{" "}
                {new Date(selectedUserInfo.lastLogin).toLocaleString()}
              </div>
            )}
            {selectedUserInfo.roles?.length && (
              <div className={styles.userCardRow}>
                <strong>Roles:</strong> {selectedUserInfo.roles.join(", ")}
              </div>
            )}
          </div>
        )}
      </div>

      {addMembersOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalPanel}>
            <div className={styles.modalTitle}>Add Students</div>
            <input
              className={styles.searchInput}
              placeholder="Search students"
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
            />
            <div className={styles.modalList}>
              {availableStudents
                .filter((u) => {
                  const q = studentSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    u.username.toLowerCase().includes(q) ||
                    (u.name || "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <label key={u._id} className={styles.modalItem}>
                    <input
                      type="checkbox"
                      checked={selectedStudentIds.includes(u._id)}
                      onChange={() => toggleStudentSelection(u._id)}
                    />
                    <span style={{ marginLeft: 8 }}>
                      {u.username} {u.name ? `(${u.name})` : ""}
                    </span>
                  </label>
                ))}
              {!availableStudents.length && (
                <div style={{ fontSize: 13, color: "#6b7075" }}>
                  No students found
                </div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.primaryBtn}
                onClick={handleInviteSelected}
                disabled={!selectedStudentIds.length}
              >
                Add Selected
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={() => setAddMembersOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {dmPickerOpen && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalPanel}>
            <div className={styles.modalTitle}>Start DM with Student</div>
            <input
              className={styles.searchInput}
              placeholder="Search students"
              value={dmSearch}
              onChange={(e) => setDmSearch(e.target.value)}
            />
            <div className={styles.modalList}>
              {availableStudents
                .filter((u) => {
                  const q = dmSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    u.username.toLowerCase().includes(q) ||
                    (u.name || "").toLowerCase().includes(q)
                  );
                })
                .map((u) => (
                  <label key={u._id} className={styles.modalItem}>
                    <input
                      type="radio"
                      name="dm-target"
                      checked={dmSelectedUser === u.username}
                      onChange={() => setDmSelectedUser(u.username)}
                    />
                    <span style={{ marginLeft: 8 }}>
                      {u.username} {u.name ? `(${u.name})` : ""}
                    </span>
                  </label>
                ))}
              {!availableStudents.length && (
                <div style={{ fontSize: 13, color: "#6b7075" }}>
                  No students found
                </div>
              )}
            </div>
            <div className={styles.modalActions}>
              <button
                className={styles.primaryBtn}
                onClick={handleConfirmDM}
                disabled={!dmSelectedUser}
              >
                Start DM
              </button>
              <button
                className={styles.secondaryBtn}
                onClick={() => setDmPickerOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
