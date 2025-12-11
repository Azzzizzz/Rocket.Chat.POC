import Head from "next/head";
import Link from "next/link";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import styles from "@/styles/Home.module.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function Home() {
  return (
    <>
      <Head>
        <title>TikMe Chat Home</title>
        <meta name="description" content="TikMe Chat POC Home" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div
        className={`${styles.page} ${geistSans.variable} ${geistMono.variable}`}
      >
        <main className={styles.main}>
          <Image
            className={styles.logo}
            src="/next.svg"
            alt="Next.js logo"
            width={100}
            height={20}
            priority
          />
          <div className={styles.intro}>
            <h1>TikMe Chat</h1>
            <p>Choose a view or sign in:</p>
          </div>
          <div className={styles.ctas}>
            <Link className={styles.primary} href="/teacher-chat">
              Teacher Chat
            </Link>
            <Link className={styles.secondary} href="/student-chat">
              Student Chat
            </Link>
            <Link className={styles.secondary} href="/login">
              Login
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
