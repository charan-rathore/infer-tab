import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "InferTab — watch inference remember",
  description:
    "A tiny visual experiment that shows why language models keep past keys and values.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
