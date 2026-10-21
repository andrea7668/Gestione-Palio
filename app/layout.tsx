import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Il Gioco del Palio — gestionale multiplayer del Palio di Siena",
  description: "Gestionale multiplayer del Palio di Siena",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="it" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
