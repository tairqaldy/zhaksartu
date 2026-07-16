import type { Metadata } from "next";
import { Geist, Geist_Mono, Lora } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const lora = Lora({
  variable: "--font-lora",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "zhaksartu",
  description:
    "Personal prompt enhancement tool. Raw idea in, personal-fit prompt out.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${lora.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Decorative spots — atmosphere only, never meaning */}
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
        >
          <div
            className="absolute -top-40 -left-40 h-[34rem] w-[34rem] rounded-full opacity-40 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, var(--color-spot-teal), transparent)",
            }}
          />
          <div
            className="absolute -bottom-48 -right-40 h-[36rem] w-[36rem] rounded-full opacity-35 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, var(--color-spot-rose), transparent)",
            }}
          />
        </div>
        {children}
      </body>
    </html>
  );
}
