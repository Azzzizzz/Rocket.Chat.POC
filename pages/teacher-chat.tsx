import { useEffect, useState } from "react";
import ChatLayout from "../components/ChatLayout";
import * as rest from "../lib/rocketRest";
import { RC_URL } from "../lib/config";
import * as ddp from "../lib/rocketDDP";
import { useRouter } from "next/router";

export default function TeacherChat() {
  const [creds, setCreds] = useState<{
    authToken: string;
    userId: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [me, setMe] = useState<string>("");
  const router = useRouter();

  useEffect(() => {
    async function init() {
      let data: { authToken: string; userId: string } | null = null;
      const raw = localStorage.getItem("tikme.session");
      if (!raw) {
        router.push("/login");
        return;
      }
      const session = JSON.parse(raw) as {
        username: string;
        authToken: string;
        userId: string;
        isTeacher?: boolean;
      };
      if (!session.isTeacher) {
        router.push("/student-chat");
        return;
      }
      data = { authToken: session.authToken, userId: session.userId };
      setCreds(data);
      setMe(session.username);

      try {
        await ddp.connect(RC_URL);
        await ddp.loginWithToken(data.authToken);
      } catch (err) {
        console.warn("Realtime login failed", err);
      }
    }
    init();
  }, []);

  if (error) return <div style={{ color: "red", padding: 20 }}>{error}</div>;
  if (!creds) return <div style={{ padding: 20 }}>Loading Teacher view...</div>;

  return (
    <ChatLayout
      meUsername={me}
      authToken={creds.authToken}
      userId={creds.userId}
      isTeacher
    />
  );
}
