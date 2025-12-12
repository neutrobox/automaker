import type { Metadata } from "next";
import { GeistSans as GeistSansFont } from "geist/font/sans";
import { GeistMono as GeistMonoFont } from "geist/font/mono";
import { Toaster } from "sonner";
import "./globals.css";

const GeistSans = GeistSansFont({ variable: "--font-geist-sans" });
const GeistMono = GeistMonoFont({ variable: "--font-geist-mono" });
export const metadata: Metadata = {
  title: "Automaker - Autonomous AI Development Studio",
  description: "Build software autonomously with intelligent orchestration",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        {children}
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
