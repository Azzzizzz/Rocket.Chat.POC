import { useEffect, useState } from "react";
import ChatLayout from "../components/ChatLayout";
import * as rest from "../lib/rocketRest";
import type { AxiosError } from "axios";
import { RC_URL } from "../lib/config";
import * as ddp from "../lib/rocketDDP";

export default function TeacherChat() {
  const [creds, setCreds] = useState<{
    authToken: string;
    userId: string;
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function init() {
      let data: { authToken: string; userId: string } | null = null;
      try {
        console.log("Teacher login initiating...");
        data = await rest.login("teacher1", "1234567");
        console.log("Teacher login REST success", data);
        setCreds(data);
      } catch (err: unknown) {
        console.error(err);
        const axiosMsg = (err as AxiosError<{ message?: string }>).response
          ?.data?.message;
        const msg =
          axiosMsg || (err instanceof Error ? err.message : "Unknown error");
        setError(`REST login failed: ${msg}`);
        return;
      }

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
  if (!creds)
    return (
      <div style={{ padding: 20 }}>
        Logging in automatically as <strong>Teacher</strong>...
      </div>
    );

  return (
    <ChatLayout
      userRole="teacher"
      authToken={creds.authToken}
      userId={creds.userId}
    />
  );
}
