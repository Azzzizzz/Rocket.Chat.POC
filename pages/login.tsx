import { useState } from "react";
import { useRouter } from "next/router";
import ChatLayout from "../components/ChatLayout";
import * as rest from "../lib/rocketRest";
import type { AxiosError } from "axios";
import * as ddp from "../lib/rocketDDP";
import { RC_URL } from "../lib/config";

export default function Login() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [creds, setCreds] = useState<{
    authToken: string;
    userId: string;
  } | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setCreds(null);
    setMe(null);
    const data = await rest.login(username, password);
    if (!data) {
      setError("Login failed: invalid username or password");
      return;
    }
    setCreds(data);
    setMe(username);
    try {
      await ddp.connect(RC_URL);
      await ddp.loginWithToken(data.authToken);
    } catch (re) {
      console.warn("Realtime connection/login failed", re);
    }
    try {
      const info = await rest.getUserInfo(
        username,
        data.authToken,
        data.userId
      );
      const roles = Array.isArray(info?.roles) ? info.roles : [];
      const isTeacher = roles.includes("owner");
      const session = {
        username,
        authToken: data.authToken,
        userId: data.userId,
        roles,
        isTeacher,
      };
      localStorage.setItem("tikme.session", JSON.stringify(session));
      router.push(isTeacher ? "/teacher-chat" : "/student-chat");
    } catch {
      router.push("/");
    }
  };

  if (error) {
    return <div style={{ padding: 20, color: "red" }}>{error}</div>;
  }

  return (
    <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <form
        onSubmit={handleSubmit}
        style={{
          width: 320,
          padding: 24,
          border: "1px solid #e6e8ec",
          borderRadius: 8,
          background: "#ffffff",
          boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h3 style={{ marginBottom: 8 }}>Sign In</h3>
        <label style={{ fontSize: 12, color: "#667085" }}>Username</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="e.g. teacher1"
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #e6e8ec",
          }}
          required
        />
        <label style={{ fontSize: 12, color: "#667085" }}>Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="your password"
          style={{
            padding: "10px 12px",
            borderRadius: 6,
            border: "1px solid #e6e8ec",
          }}
          required
        />
        <button
          type="submit"
          style={{
            background: "#2e7cf6",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "10px 12px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Log In
        </button>
      </form>
    </div>
  );
}
