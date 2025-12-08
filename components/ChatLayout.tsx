import React, { useState, useEffect, useRef } from "react";
import * as rest from "../lib/rocketRest";
import * as ddp from "../lib/rocketDDP";
import styles from "../styles/ChatLayout.module.css";

interface ChatLayoutProps {
  userRole: "teacher" | "student";
  authToken: string;
  userId: string;
}

type Room = { rid: string; t: string; name?: string; fname?: string };
type Message = {
  _id?: string;
  u?: { username?: string };
  msg: string;
  rid?: string;
};

export default function ChatLayout({
  userRole,
  authToken,
  userId,
}: ChatLayoutProps) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState("");
  const [presence, setPresence] = useState<Record<string, string>>({});
  const [members, setMembers] = useState<
    Array<{ _id: string; username?: string; name?: string }>
  >([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  // removed polling lastUpdate in favor of DDP realtime
  const subRef = useRef<{ id: string; rid: string } | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const meUsername = userRole === "teacher" ? "teacher1" : "student1";

  useEffect(() => {
    // Load initial rooms
    rest.getSubscriptions(authToken, userId).then((data) => {
      setRooms(data);
    });

    const interval = setInterval(() => {
      const usernames = new Set<string>();
      usernames.add("teacher1");
      usernames.add("student1");
      members.forEach((m) => m.username && usernames.add(m.username));
      Array.from(usernames).forEach((u) => {
        rest.getPresence(u, authToken, userId).then((status) => {
          setPresence((prev) => ({ ...prev, [u]: status }));
        });
      });
    }, 5000);

    return () => clearInterval(interval);
  }, [authToken, userId]);

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

    rest
      .getRoomHistory(selectedRoom.rid, selectedRoom.t, authToken, userId)
      .then((msgs) => {
        if (msgs) setMessages((msgs as Message[]).reverse());
      });

    rest
      .getRoomMembers(selectedRoom.rid, selectedRoom.t, authToken, userId)
      .then((list) => {
        setMembers(list);
      });

    (async () => {
      try {
        const id = ddp.subscribeRoomMessages(selectedRoom.rid, (msg) => {
          const m = msg as unknown as Message;
          setMessages((prev) => [...prev, m]);
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
    };
  }, [selectedRoom, authToken, userId]);

  const handleSend = async () => {
    if (!inputText.trim() || !selectedRoom) return;
    const optimistic: Message = {
      _id: Math.random().toString(36).slice(2),
      u: { username: meUsername },
      msg: inputText,
      rid: selectedRoom.rid,
    };
    setMessages((prev) => [...prev, optimistic]);
    await rest.postMessage(selectedRoom.rid, inputText, authToken, userId);
    setInputText("");
  };

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const handleStartDM = async () => {
    const target = userRole === "teacher" ? "student1" : "teacher1";
    try {
      const room = await rest.createDM(target, authToken, userId);
      setRooms((prev) => {
        if (prev.find((r) => r.rid === room.rid)) return prev;
        return [...prev, room];
      });
      setSelectedRoom(room);
    } catch (_) {
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
    const username = prompt("Enter student username to add");
    if (!username) return;
    try {
      const user = await rest.getUserInfo(username, authToken, userId);
      if (!user?._id) throw new Error("User not found");
      await rest.inviteUserToRoom(
        selectedRoom.rid,
        selectedRoom.t,
        user._id,
        authToken,
        userId
      );
      const list = await rest.getRoomMembers(
        selectedRoom.rid,
        selectedRoom.t,
        authToken,
        userId
      );
      setMembers(list);
    } catch (e) {
      alert("Failed to add member");
    }
  };

  return (
    <div className={styles.container}>
      {/* Sidebar */}
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.roleLabel}>{userRole} View</div>
          <div className={styles.actionButtons}>
            <button onClick={handleStartDM} className={styles.primaryBtn}>
              Message {userRole === "teacher" ? "Student" : "Teacher"}
            </button>
            {userRole === "teacher" && (
              <button
                onClick={handleCreateChannel}
                className={styles.secondaryBtn}
              >
                + New Channel
              </button>
            )}
          </div>
        </div>

        <div className={styles.roomList}>
          <div className={styles.roomListTitle}>Channels & MKs</div>
          {rooms.map((r) => {
            const displayName = r.name || r.fname || "Unnamed";
            const isSelected = selectedRoom?.rid === r.rid;
            const isDM = r.t === "d";
            const otherUser = isDM ? r.name : null;
            const status = otherUser ? presence[otherUser] : null; // 'online' | 'offline' | ...

            return (
              <div
                key={r.rid}
                onClick={() => setSelectedRoom(r)}
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
              </div>
            );
          })}
          {!rooms.length && (
            <div style={{ padding: "8px", fontSize: "13px", color: "#6b7075" }}>
              No conversations yet
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className={styles.chatArea}>
        <div className={styles.mainHeader}>
          <div className={styles.headerIcon}>#</div>
          <div className={styles.headerTitle}>
            {selectedRoom
              ? selectedRoom.name || selectedRoom.fname
              : "Select a channel"}
          </div>
          {userRole === "teacher" && selectedRoom && selectedRoom.t !== "d" && (
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
              {messages.map((m, i) => {
                const mine = m.u?.username === meUsername;
                const label = (m.u?.username || "").toUpperCase();
                const initials = label.slice(0, 2);
                return (
                  <div
                    key={m._id || i}
                    className={`${styles.message} ${
                      mine ? styles.mine : styles.theirs
                    }`}
                  >
                    {!mine && <div className={styles.avatar}>{initials}</div>}
                    <div className={styles.messageContainer}>
                      <div className={styles.messageMeta}>
                        <span>{m.u?.username}</span>
                      </div>
                      <div className={styles.messageContent}>{m.msg}</div>
                    </div>
                    {mine && <div className={styles.avatar}>{initials}</div>}
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
                >
                  +
                </button>
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
              <div key={m._id} className={styles.participantItem}>
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
      </div>
    </div>
  );
}
