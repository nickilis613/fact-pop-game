import type { Metadata } from "next";
import "../styles.css";

export const metadata: Metadata = {
  title: "Fact Pop! — A little practice. A big pop.",
  description:
    "Build multiplication confidence with short, adaptive rounds and a personal fact collection.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
