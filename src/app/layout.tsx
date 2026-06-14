import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ポチパス — 資格学習AIコーチ",
  description:
    "試験日から逆算した学習計画、弱点の可視化、AIによる週次レビューで、資格合格まで伴走するサブスク型学習コーチ。",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f9e6b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
